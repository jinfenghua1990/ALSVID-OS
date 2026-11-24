const { createPool } = require('./db-pool');
const { uuidv7, isUuidv7 } = require('./uuidv7');
const { currentActor } = require('./audit-context');
const { createHash } = require('node:crypto');

const fail=(message,statusCode=400)=>{throw Object.assign(new Error(message),{statusCode})};
const text=(value,max=2000)=>typeof value==='string'?value.trim().slice(0,max):'';
const amount=(value,{positive=false}={})=>{const valueText=String(value??'').trim();if(!/^\d{1,14}(?:\.\d{1,6})?$/.test(valueText)||(positive&&!/[1-9]/.test(valueText)))fail(positive?'金额须为正数，最多六位小数':'金额须为非负数，最多六位小数');const [whole,fraction='']=valueText.split('.');return `${whole}.${fraction.padEnd(6,'0')}`};
const units=value=>BigInt(value.replace('.',''));
const fromUnits=value=>`${value/1000000n}.${String(value%1000000n).padStart(6,'0')}`;
const currency=value=>{const valueText=text(value,3).toUpperCase();if(!/^[A-Z]{3}$/.test(valueText))fail('币种须为三位大写代码');return valueText};
const date=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(`${value}T00:00:00Z`))||new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)!==value)fail('日期格式须为 YYYY-MM-DD');return value};
const sourceTypes=['MANUAL','PROCUREMENT_PO','COMMERCE_ORDER','LOGISTICS_SHIPMENT'];
/**
 * 账龄汇总用的折算汇率，必须与 server/sales-orders.js 的 FX_TO_CNY 完全一致。
 * 两处不一致的话，同一笔 EUR 应收会在订单中心和财务对账页显示成两个不同的人民币金额。
 */
const FX_TO_CNY={CNY:1,USD:7.2,EUR:7.85};
const categories=['GOODS','FREIGHT','INSURANCE','DUTY','IMPORT_VAT','ANTI_DUMPING','COUNTERVAILING','OPERATIONAL_FEE','SERVICE','OTHER'];
const stable=value=>Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`:JSON.stringify(value);
const requestHash=value=>createHash('sha256').update(stable(value)).digest('hex');
const jsonValue=value=>typeof value==='string'?JSON.parse(value):value;
function createFinanceStore(url){
 const pool=createPool(url,{max:8,connectionTimeoutMillis:15000});
 async function transaction(action,target,fn,before=null){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)',[currentActor(),action,target,before==null?null:JSON.stringify(before),JSON.stringify(result)]);await c.query('COMMIT');return result}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}}
 async function actorId(c){const row=(await c.query('SELECT id FROM app_users WHERE username=$1 AND enabled',[currentActor()])).rows[0];if(!row)fail('当前账号不可用',403);return row.id}
 async function validateSource(c,type,id){if(type==='MANUAL'){if(id)fail('手工财务单据不能绑定来源单号');return null}if(!id||!isUuidv7(id))fail('请选择有效来源单据');let query;if(type==='PROCUREMENT_PO')query='SELECT id FROM procurement_purchase_orders WHERE id=$1';else if(type==='COMMERCE_ORDER')query='SELECT id FROM storefront_orders WHERE id=$1';else query='SELECT entity_uuid AS id FROM production_deliveries WHERE entity_uuid=$1';if(!(await c.query(query,[id])).rowCount)fail('来源单据不存在或未启用',404);return id}
 async function summary(){
  const [documents,lines,obligations,payments,allocations,fxRates,landedBatches,landedComponents,landedAllocations,partnerBalances,partners,purchaseOrders,commerceOrders,shipments,cargo]=await pool.queryMany([
   // date 列必须显式转 text：pg 会把 date 解析成本地时区 Date，JSON 序列化后前端 slice(0,10) 会少一天（8090 对照时才发现）
   `SELECT d.*,p.display_name AS partner_name,d.issue_date::text AS issue_date,d.due_date::text AS due_date FROM finance_documents d JOIN partners p ON p.id=d.partner_id ORDER BY d.created_at DESC LIMIT 1000`,
   `SELECT l.*,s.code AS sku,d.shipment_no FROM finance_document_lines l LEFT JOIN skus s ON s.entity_uuid=l.sku_uuid LEFT JOIN production_deliveries d ON d.entity_uuid=l.shipment_uuid ORDER BY l.document_id,l.line_no`,
   `SELECT o.*,o.due_date::text AS due_date,p.display_name AS partner_name,d.document_number,d.external_reference,fo.legacy_ref_no AS reference_no,
      CASE WHEN o.direction='AR' THEN 'AR'
           WHEN o.source_type='LOGISTICS_SHIPMENT' OR COALESCE(o.note,'') ~* '(国际运费|运费|头程|物流费|freight)' THEN 'FREIGHT'
           ELSE 'AP' END AS category
    FROM finance_v_obligations o JOIN partners p ON p.id=o.partner_id LEFT JOIN finance_documents d ON d.id=o.document_id LEFT JOIN finance_obligations fo ON fo.id=o.id ORDER BY o.created_at DESC LIMIT 1500`,
   `SELECT p.*,p.value_date::text AS value_date,pa.display_name AS partner_name FROM finance_v_payments p LEFT JOIN partners pa ON pa.id=p.partner_id ORDER BY p.value_date DESC,p.created_at DESC LIMIT 1500`,
   `SELECT a.*,p.payment_number,p.currency AS payment_currency,o.obligation_number,o.currency AS obligation_currency,r.id AS reversal_id,r.reason AS reversal_reason FROM finance_allocations a JOIN finance_payments p ON p.id=a.payment_id JOIN finance_obligations o ON o.id=a.obligation_id LEFT JOIN finance_allocation_reversals r ON r.allocation_id=a.id ORDER BY a.allocated_at DESC LIMIT 3000`,
   'SELECT * FROM finance_fx_rates ORDER BY effective_at DESC LIMIT 1000',
   `SELECT b.*,d.shipment_no,s.status AS shipment_status FROM finance_landed_cost_batches b JOIN production_deliveries d ON d.entity_uuid=b.shipment_uuid JOIN production_orders s ON s.id=d.order_id ORDER BY b.created_at DESC LIMIT 500`,
   `SELECT c.*,d.document_number FROM finance_landed_cost_components c LEFT JOIN finance_documents d ON d.id=c.source_document_id ORDER BY c.created_at,c.id`,
   `SELECT a.*,c.batch_id,v.vin AS frame_number FROM finance_landed_cost_allocations a JOIN finance_landed_cost_components c ON c.id=a.component_id JOIN vins v ON v.entity_uuid=a.cargo_vin_uuid ORDER BY a.created_at,a.id`,
   'SELECT b.*,p.display_name AS partner_name FROM finance_v_partner_balances b JOIN partners p ON p.id=b.partner_id ORDER BY lower(p.display_name),b.currency,b.direction',
   `SELECT p.id,p.display_name,p.country,COALESCE(array_agg(r.role ORDER BY r.role) FILTER(WHERE r.status='ACTIVE'),ARRAY[]::text[]) AS roles FROM partners p LEFT JOIN partner_roles r ON r.partner_id=p.id WHERE p.status='ACTIVE' GROUP BY p.id ORDER BY lower(p.display_name)`,
   `SELECT o.id,o.po_number,p.display_name AS supplier_name,o.currency,o.status,o.payment_terms,o.deposit_terms FROM procurement_purchase_orders o JOIN partners p ON p.id=o.supplier_partner_id WHERE o.status<>'CANCELLED' ORDER BY o.created_at DESC LIMIT 500`,
   `SELECT id,id::text AS order_number,currency,status,(subtotal_minor::numeric/100)::numeric(20,2)::text AS total_amount FROM storefront_orders ORDER BY created_at DESC LIMIT 500`,
   `SELECT id,entity_uuid,shipment_no,status,planned_quantity,received_quantity FROM production_deliveries ORDER BY created_at DESC LIMIT 500`,
   `SELECT a.vin_uuid AS id,a.delivery_uuid AS shipment_uuid,1::numeric AS quantity,v.vin AS frame_number,s.code AS sku FROM production_delivery_vins a JOIN vins v ON v.entity_uuid=a.vin_uuid JOIN production_deliveries d ON d.entity_uuid=a.delivery_uuid JOIN production_orders o ON o.id=d.order_id JOIN skus s ON s.code=o.sku_code WHERE a.released_at IS NULL ORDER BY d.created_at,a.vin_uuid`,
  ]);
  return{documents:documents.rows,lines:lines.rows,obligations:obligations.rows,payments:payments.rows,allocations:allocations.rows,fxRates:fxRates.rows,landedBatches:landedBatches.rows,landedComponents:landedComponents.rows,landedAllocations:landedAllocations.rows,partnerBalances:partnerBalances.rows,references:{partners:partners.rows,purchaseOrders:purchaseOrders.rows,commerceOrders:commerceOrders.rows,shipments:shipments.rows,cargo:cargo.rows,customsLines:[]}};
 }
 return{
  summary,
  async createDocument(input){
   if(!['SUPPLIER_INVOICE','CUSTOMER_INVOICE','SUPPLIER_CREDIT_NOTE','CUSTOMER_CREDIT_NOTE','DEBIT_NOTE','OTHER'].includes(input.documentType)||!isUuidv7(input.partnerId)||!Array.isArray(input.lines)||!input.lines.length)fail('财务单据资料无效');
   const id=String(input.id||uuidv7()).toLowerCase();if(!isUuidv7(id))fail('财务单据请求编号无效');
   const curr=currency(input.currency),issue=date(input.issueDate),due=input.dueDate?date(input.dueDate):null,sourceType=input.sourceType||'MANUAL',sourceId=input.sourceId?String(input.sourceId).toLowerCase():null,externalReference=text(input.externalReference,200)||null,note=text(input.note,2000);
   if(due&&due<issue)fail('到期日不能早于开票日');if(!sourceTypes.includes(sourceType))fail('财务来源类型无效');
   const lines=input.lines.map(line=>{
    if(!categories.includes(line.category))fail('单据行类别无效');
    const normalized={category:line.category,description:text(line.description,1000),quantity:amount(line.quantity??1,{positive:true}),unit:text(line.unit,40).toUpperCase()||'EA',unitPrice:amount(line.unitPrice??0),netAmount:amount(line.netAmount),taxAmount:amount(line.taxAmount??0),skuUuid:line.skuUuid?String(line.skuUuid).toLowerCase():null,shipmentUuid:line.shipmentUuid?String(line.shipmentUuid).toLowerCase():null,metadata:line.metadata||{}};
    if(normalized.skuUuid&&!isUuidv7(normalized.skuUuid))fail('SKU 无效');if(normalized.shipmentUuid&&!isUuidv7(normalized.shipmentUuid))fail('发运批次无效');
    return normalized;
   });
   const hash=requestHash({documentType:input.documentType,partnerId:String(input.partnerId).toLowerCase(),externalReference,currency:curr,issueDate:issue,dueDate:due,sourceType,sourceId,note,lines});
   return transaction('finance.document.create','finance/documents',async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`finance-document:${id}`]);
    const prior=(await c.query("SELECT before_json,after_json FROM audit_log WHERE action='finance.document.create' AND target='finance/documents' AND after_json->>'id'=$1 ORDER BY created_at DESC LIMIT 1",[id])).rows[0];
    if(prior){if(jsonValue(prior.before_json)?.requestHash!==hash)fail('财务单据请求编号已用于不同内容',409);return{...jsonValue(prior.after_json),replayed:true}}
    const actor=await actorId(c),validatedSourceId=await validateSource(c,sourceType,sourceId);
    await c.query(`INSERT INTO finance_documents(id,document_type,partner_id,external_reference,currency,issue_date,due_date,source_type,source_id,note,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`,[id,input.documentType,input.partnerId,externalReference,curr,issue,due,sourceType,validatedSourceId,note,actor]);
    let net=0n,tax=0n;
    for(const [i,line] of lines.entries()){
     net+=units(line.netAmount);tax+=units(line.taxAmount);
     await c.query(`INSERT INTO finance_document_lines(document_id,line_no,category,description,quantity,unit,unit_price,net_amount,tax_amount,sku_uuid,shipment_uuid,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[id,i+1,line.category,line.description,line.quantity,line.unit,line.unitPrice,line.netAmount,line.taxAmount,line.skuUuid,line.shipmentUuid,JSON.stringify(line.metadata)]);
    }
    const saved=(await c.query('UPDATE finance_documents SET subtotal_amount=$2,tax_amount=$3,total_amount=$4,updated_at=now() WHERE id=$1 RETURNING *',[id,fromUnits(net),fromUnits(tax),fromUnits(net+tax)])).rows[0];
    return{...saved,issue_date:issue,due_date:due};
   },{requestHash:hash});
  },
  async documentStatus(id,input,action){if(!isUuidv7(id))fail('财务单据编号无效');const actorName=action==='post'?'finance.document.post':`finance.document.${action}`;return transaction(actorName,`finance/documents/${id}`,async c=>{const actor=await actorId(c),row=(await c.query('SELECT *,issue_date::text AS issue_date_text,due_date::text AS due_date_text FROM finance_documents WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!row)fail('财务单据不存在',404);if(!Number.isSafeInteger(input.expectedVersion)||row.version!==input.expectedVersion)fail('财务单据版本已变化，请刷新后重试',409);if(action==='verify'){if(row.status!=='DRAFT')fail('只有草稿单据可以核验',409);const saved=(await c.query("UPDATE finance_documents SET status='VERIFIED',verified_at=now(),verified_by=$2,version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING *",[id,actor])).rows[0];return{...saved,issue_date:row.issue_date_text,due_date:row.due_date_text}}if(action==='draft'){if(row.status!=='VERIFIED')fail('只有已核验单据可以退回草稿',409);const saved=(await c.query("UPDATE finance_documents SET status='DRAFT',verified_at=NULL,verified_by=NULL,version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING *",[id,actor])).rows[0];return{...saved,issue_date:row.issue_date_text,due_date:row.due_date_text}}if(action==='void'){const reason=text(input.reason,2000);if(!reason)fail('作废原因必填');if(!['DRAFT','VERIFIED'].includes(row.status))fail('已入账单据不能直接作废',409);const saved=(await c.query("UPDATE finance_documents SET status='VOIDED',voided_at=now(),voided_by=$2,void_reason=$3,version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING *",[id,actor,reason])).rows[0];return{...saved,issue_date:row.issue_date_text,due_date:row.due_date_text}}if(row.status!=='VERIFIED')fail('只有已核验单据可以入账',409);const posted=(await c.query("UPDATE finance_documents SET status='POSTED',posted_at=now(),posted_by=$2,version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING *",[id,actor])).rows[0];let obligation=null;if(['SUPPLIER_INVOICE','CUSTOMER_INVOICE'].includes(row.document_type)){obligation=(await c.query(`INSERT INTO finance_obligations(direction,partner_id,document_id,currency,original_amount,due_date,source_type,source_id,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[row.document_type==='SUPPLIER_INVOICE'?'AP':'AR',row.partner_id,row.id,row.currency,row.total_amount,row.due_date_text,row.source_type,row.source_id,`Created from ${row.document_number}`,actor])).rows[0];obligation={...obligation,due_date:row.due_date_text}}return{document:{...posted,issue_date:row.issue_date_text,due_date:row.due_date_text},obligation}})},
  async createObligation(input){
   if(!['AR','AP'].includes(input.direction)||!isUuidv7(input.partnerId))fail('应收应付资料无效');
   const id=String(input.id||uuidv7()).toLowerCase();if(!isUuidv7(id))fail('应收应付请求编号无效');
   const curr=currency(input.currency),value=amount(input.amount,{positive:true}),due=input.dueDate?date(input.dueDate):null,sourceType=input.sourceType||'MANUAL',sourceId=input.sourceId?String(input.sourceId).toLowerCase():null,note=text(input.note,2000);
   if(!sourceTypes.includes(sourceType))fail('财务来源类型无效');
   const hash=requestHash({direction:input.direction,partnerId:String(input.partnerId).toLowerCase(),currency:curr,amount:value,dueDate:due,sourceType,sourceId,note});
   return transaction('finance.obligation.create','finance/obligations',async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`finance-obligation:${id}`]);
    const prior=(await c.query("SELECT before_json,after_json FROM audit_log WHERE action='finance.obligation.create' AND target='finance/obligations' AND after_json->>'id'=$1 ORDER BY created_at DESC LIMIT 1",[id])).rows[0];
    if(prior){if(jsonValue(prior.before_json)?.requestHash!==hash)fail('应收应付请求编号已用于不同内容',409);return{...jsonValue(prior.after_json),replayed:true}}
    const actor=await actorId(c),validatedSourceId=await validateSource(c,sourceType,sourceId);
    const saved=(await c.query(`INSERT INTO finance_obligations(id,direction,partner_id,currency,original_amount,due_date,source_type,source_id,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[id,input.direction,input.partnerId,curr,value,due,sourceType,validatedSourceId,note,actor])).rows[0];
    return{...saved,due_date:due};
   },{requestHash:hash});
  },
  async voidObligation(id,input){const reason=text(input.reason,2000);if(!isUuidv7(id)||!reason)fail('作废资料无效');return transaction('finance.obligation.void',`finance/obligations/${id}`,async c=>{const actor=await actorId(c);return(await c.query('INSERT INTO finance_obligation_voids(obligation_id,reason,voided_by) VALUES($1,$2,$3) RETURNING *',[id,reason,actor])).rows[0]})},
  async createPayment(input){if(!['INBOUND','OUTBOUND'].includes(input.direction))fail('收付款方向无效');const curr=currency(input.currency),value=amount(input.amount,{positive:true}),on=date(input.valueDate),key=text(input.idempotencyKey,200);if(!key)fail('收付款幂等编号必填');if(input.partnerId&&!isUuidv7(input.partnerId))fail('合作方无效');const provider=text(input.provider,100)||'MANUAL',accountReference=text(input.accountReference,200)||null,externalReference=text(input.externalReference,200)||null,note=text(input.note,2000);return transaction('finance.payment.create','finance/payments',async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`finance-payment-key:${key}`]);const prior=(await c.query('SELECT *, value_date::text AS value_date FROM finance_payments WHERE idempotency_key=$1',[key])).rows[0];if(prior){const priorPartner=prior.partner_id==null?null:String(prior.partner_id).toLowerCase(),thisPartner=input.partnerId==null?null:String(input.partnerId).toLowerCase();if(prior.direction!==input.direction||priorPartner!==thisPartner||prior.currency!==curr||prior.amount!==value||prior.value_date!==on||prior.provider!==provider||(prior.account_reference||'')!==(accountReference||'')||(prior.external_reference||'')!==(externalReference||'')||prior.note!==note)fail('幂等编号已用于其他收付款记录',409);return{...prior,replayed:true}}const actor=await actorId(c);const saved=(await c.query(`INSERT INTO finance_payments(direction,partner_id,currency,amount,value_date,provider,account_reference,external_reference,idempotency_key,note,posted_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *,value_date::text AS value_date_text`,[input.direction,input.partnerId||null,curr,value,on,provider,accountReference,externalReference,key,note,actor])).rows[0];return{...saved,value_date:saved.value_date_text}})},
  async reversePayment(id,input){const reason=text(input.reason,2000);if(!isUuidv7(id)||!reason)fail('收付款更正资料无效');return transaction('finance.payment.reverse',`finance/payments/${id}`,async c=>{const actor=await actorId(c);return(await c.query('INSERT INTO finance_payment_reversals(payment_id,reason,reversed_by) VALUES($1,$2,$3) RETURNING *',[id,reason,actor])).rows[0]})},
  async createFx(input){const base=currency(input.baseCurrency),quote=currency(input.quoteCurrency),rateText=String(input.rate??'').trim(),rateMatch=/^\d{1,12}(?:\.\d{1,12})?$/.test(rateText);if(!rateMatch||!/[1-9]/.test(rateText))fail('汇率须为正数，最多十二位小数');const effectiveAt=text(input.effectiveAt,40),source=text(input.source,160);if(base===quote||!effectiveAt||Number.isNaN(Date.parse(effectiveAt))||!source)fail('汇率资料无效');return transaction('finance.fx.create','finance/fx-rates',async c=>{const actor=await actorId(c);return(await c.query('INSERT INTO finance_fx_rates(base_currency,quote_currency,rate,effective_at,source,external_reference,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[base,quote,rateText,effectiveAt,source,text(input.externalReference,200)||null,actor])).rows[0]})},
  async allocate(input){if(!isUuidv7(input.paymentId)||!isUuidv7(input.obligationId))fail('收付款或应收应付编号无效');const payAmount=amount(input.paymentAmount,{positive:true}),oblAmount=amount(input.obligationAmount,{positive:true}),fxRateId=input.fxRateId?String(input.fxRateId).toLowerCase():null,note=text(input.note,1000),key=text(input.idempotencyKey,200)||uuidv7();if(fxRateId&&!isUuidv7(fxRateId))fail('汇率编号无效');const request={paymentId:String(input.paymentId).toLowerCase(),obligationId:String(input.obligationId).toLowerCase(),paymentAmount:payAmount,obligationAmount:oblAmount,fxRateId,note},hash=requestHash(request);return transaction('finance.payment.allocate','finance/allocations',async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`finance-allocation:${key}`]);const prior=(await c.query("SELECT before_json,after_json FROM audit_log WHERE action='finance.payment.allocate' AND target='finance/allocations' AND after_json->>'idempotencyKey'=$1 ORDER BY created_at DESC LIMIT 1",[key])).rows[0];if(prior){if(jsonValue(prior.before_json)?.requestHash!==hash)fail('分摊请求编号已用于不同内容',409);return{...jsonValue(prior.after_json),replayed:true}}const actor=await actorId(c),allocation=(await c.query('INSERT INTO finance_allocations(payment_id,obligation_id,payment_amount,obligation_amount,fx_rate_id,note,allocated_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',[input.paymentId,input.obligationId,payAmount,oblAmount,fxRateId,note,actor])).rows[0];return{...allocation,idempotencyKey:key}}, {requestHash:hash})},
  async reverseAllocation(id,input){const reason=text(input.reason,2000);if(!isUuidv7(id)||!reason)fail('分配更正资料无效');return transaction('finance.allocation.reverse',`finance/allocations/${id}`,async c=>{const actor=await actorId(c);return(await c.query('INSERT INTO finance_allocation_reversals(allocation_id,reason,reversed_by) VALUES($1,$2,$3) RETURNING *',[id,reason,actor])).rows[0]})},
  async createLandedBatch(input){if(!isUuidv7(input.shipmentUuid)||!['QUANTITY','VALUE','WEIGHT','MANUAL'].includes(input.allocationBasis))fail('到岸成本批次资料无效');return transaction('finance.landed.create','finance/landed-cost',async c=>{const actor=await actorId(c);return(await c.query('INSERT INTO finance_landed_cost_batches(shipment_uuid,currency,allocation_basis,note,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[input.shipmentUuid,currency(input.currency),input.allocationBasis,text(input.note,1000),actor])).rows[0]})},
  async addLandedComponent(batchId,input){
   if(!isUuidv7(batchId)||!categories.filter(x=>x!=='SERVICE').includes(input.category))fail('到岸成本项目资料无效');
   const value=amount(input.amount),curr=currency(input.currency),batchValue=amount(input.batchCurrencyAmount),fxRateId=input.fxRateId?String(input.fxRateId).toLowerCase():null,sourceDocumentId=input.sourceDocumentId?String(input.sourceDocumentId).toLowerCase():null,capitalizable=input.capitalizable!==false,note=text(input.note,1000),key=text(input.idempotencyKey,200)||uuidv7();
   if(fxRateId&&!isUuidv7(fxRateId))fail('汇率编号无效');if(sourceDocumentId&&!isUuidv7(sourceDocumentId))fail('来源财务单据无效');
   const request={batchId:String(batchId).toLowerCase(),category:input.category,amount:value,currency:curr,batchCurrencyAmount:batchValue,fxRateId,sourceDocumentId,capitalizable,note},hash=requestHash(request),target=`finance/landed-cost/${batchId}`;
   return transaction('finance.landed.component',target,async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`finance-landed-component:${key}`]);
    const prior=(await c.query("SELECT before_json,after_json FROM audit_log WHERE action='finance.landed.component' AND target=$1 AND after_json->>'idempotencyKey'=$2 ORDER BY created_at DESC LIMIT 1",[target,key])).rows[0];
    if(prior){if(jsonValue(prior.before_json)?.requestHash!==hash)fail('到岸成本费用请求编号已用于不同内容',409);return{...jsonValue(prior.after_json),replayed:true}}
    const actor=await actorId(c),saved=(await c.query(`INSERT INTO finance_landed_cost_components(batch_id,category,amount,currency,batch_currency_amount,fx_rate_id,source_document_id,capitalizable,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,[batchId,input.category,value,curr,batchValue,fxRateId,sourceDocumentId,capitalizable,note,actor])).rows[0];
    return{...saved,idempotencyKey:key};
   },{requestHash:hash});
  },
  async allocateLanded(componentId,input){if(!isUuidv7(componentId)||!isUuidv7(input.cargoVinUuid))fail('到岸成本分配资料无效');const value=amount(input.allocatedAmount);const basis=input.basisValue==null?null:amount(input.basisValue),key=text(input.idempotencyKey,200)||uuidv7(),request={componentId:String(componentId).toLowerCase(),cargoVinUuid:String(input.cargoVinUuid).toLowerCase(),basisValue:basis,allocatedAmount:value},hash=requestHash(request),target=`finance/landed-cost/${componentId}`;return transaction('finance.landed.allocate',target,async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`finance-landed-allocation:${key}`]);const prior=(await c.query("SELECT before_json,after_json FROM audit_log WHERE action='finance.landed.allocate' AND target=$1 AND after_json->>'idempotencyKey'=$2 ORDER BY created_at DESC LIMIT 1",[target,key])).rows[0];if(prior){if(jsonValue(prior.before_json)?.requestHash!==hash)fail('到岸成本分配请求编号已用于不同内容',409);return{...jsonValue(prior.after_json),replayed:true}}const actor=await actorId(c),saved=(await c.query('INSERT INTO finance_landed_cost_allocations(component_id,cargo_vin_uuid,basis_value,allocated_amount,created_by) VALUES($1,$2,$3,$4,$5) RETURNING *',[componentId,input.cargoVinUuid,basis,value,actor])).rows[0];return{...saved,idempotencyKey:key}},{requestHash:hash})},
  async deleteLandedAllocation(id){if(!isUuidv7(id))fail('到岸成本分配编号无效');return transaction('finance.landed.allocation.delete',`finance/landed-cost/allocations/${id}`,async c=>{await actorId(c);const row=(await c.query('DELETE FROM finance_landed_cost_allocations WHERE id=$1 RETURNING *',[id])).rows[0];if(!row)fail('到岸成本分配不存在',404);return row})},
  async distributeLanded(batchId,input){
   if(!isUuidv7(batchId)||!categories.filter(x=>x!=='SERVICE').includes(input.category))fail('到岸成本类别无效');
   const cents=Number(input.amountCents),key=text(input.idempotencyKey,200),note=text(input.note,1000);
   if(!Number.isSafeInteger(cents)||cents<0)fail('分摊金额无效');if(!key)fail('到岸成本分摊请求编号必填');
   const request={batchId:String(batchId).toLowerCase(),category:input.category,amountCents:cents,note},hash=requestHash(request),target=`finance/landed-cost/${batchId}`;
   return transaction('finance.landed.distribute',target,async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`finance-landed-distribute:${key}`]);
    const prior=(await c.query("SELECT before_json,after_json FROM audit_log WHERE action='finance.landed.distribute' AND target=$1 AND after_json->>'idempotencyKey'=$2 ORDER BY created_at DESC LIMIT 1",[target,key])).rows[0];
    if(prior){if(jsonValue(prior.before_json)?.requestHash!==hash)fail('到岸成本分摊请求编号已用于不同内容',409);return{...jsonValue(prior.after_json),replayed:true}}
    const actor=await actorId(c),batch=(await c.query('SELECT * FROM finance_landed_cost_batches WHERE id=$1 FOR UPDATE',[batchId])).rows[0];
    if(!batch||batch.status!=='DRAFT')fail('到岸成本批次不存在或已冻结',409);
    if(batch.allocation_basis!=='QUANTITY')fail('只有“数量”基准支持自动均分，请按选定基准手工分配',409);
    const vins=(await c.query('SELECT vin_uuid AS id FROM production_delivery_vins WHERE delivery_uuid=$1 AND released_at IS NULL ORDER BY vin_uuid FOR UPDATE',[batch.shipment_uuid])).rows;
    if(!vins.length)fail('发运批次没有已分配 VIN');
    const value=(cents/100).toFixed(2),component=(await c.query(`INSERT INTO finance_landed_cost_components(batch_id,category,amount,currency,batch_currency_amount,capitalizable,note,created_by) VALUES($1,$2,$3,$4,$3,$5,$6,$7) RETURNING id`,[batchId,input.category,value,batch.currency,input.category!=='IMPORT_VAT',note,actor])).rows[0];
    let used=0;for(let i=0;i<vins.length;i++){const cumulative=Math.round(cents*(i+1)/vins.length),part=cumulative-used;used=cumulative;await c.query('INSERT INTO finance_landed_cost_allocations(component_id,cargo_vin_uuid,basis_value,allocated_amount,created_by) VALUES($1,$2,1,$3,$4)',[component.id,vins[i].id,(part/100).toFixed(2),actor])}
    return{componentId:component.id,allocationLines:vins.length,amount:value,currency:batch.currency,idempotencyKey:key};
   },{requestHash:hash});
  },
  async finalizeLanded(batchId){if(!isUuidv7(batchId))fail('到岸成本批次编号无效');return transaction('finance.landed.finalize',`finance/landed-cost/${batchId}`,async c=>{const actor=await actorId(c),row=(await c.query("UPDATE finance_landed_cost_batches SET status='FINALIZED',finalized_at=now(),finalized_by=$2 WHERE id=$1 AND status='DRAFT' RETURNING *",[batchId,actor])).rows[0];if(!row)fail('到岸成本批次不存在或已冻结',409);return row})},
  /**
   * 账龄分析（6 档分桶，口径照 8090 OMS）。
   * 关键：种子期账本大多未到期，若照常规五档（未到期/1-30/31-60/61-90/90+）页面全是 0 像坏了，
   * 所以把「30 天内到期」单列一档，健康的账本也有信息量。
   * asOf 可回溯，用来做 +30/+60/+90 天推演。
   */
  async aging(input={}){
    const bucketsDef=[
      {key:'NOT_DUE',label:'未到期（30 天以上）',short:'>30 天',tone:'ok',min:-Infinity,max:-31},
      {key:'DUE_SOON',label:'30 天内到期',short:'≤30 天',tone:'info',min:-30,max:0},
      {key:'D1_30',label:'逾期 1-30 天',short:'1-30',tone:'warn',min:1,max:30},
      {key:'D31_60',label:'逾期 31-60 天',short:'31-60',tone:'warn',min:31,max:60},
      {key:'D61_90',label:'逾期 61-90 天',short:'61-90',tone:'bad',min:61,max:90},
      {key:'D90_PLUS',label:'逾期 90 天以上',short:'90+',tone:'bad',min:91,max:Infinity},
    ];
    const asOf=input.asOf?date(input.asOf):new Date().toISOString().slice(0,10);
    const baseMs=Date.parse(`${asOf}T00:00:00Z`);
    const [rowsResult,counts] = await Promise.all([
      pool.query(
      `SELECT o.id,o.obligation_number,o.direction,o.currency,o.original_amount,o.outstanding_amount,
              o.due_date::text AS due_date,o.settlement_status,o.created_at,p.display_name AS partner_name
         FROM finance_v_obligations o JOIN partners p ON p.id=o.partner_id
        WHERE o.settlement_status <> 'VOID' AND o.outstanding_amount > 0
        ORDER BY o.due_date NULLS LAST`
      ),
      pool.query(`SELECT count(*) FILTER (WHERE settlement_status='SETTLED')::int AS closed,count(*) FILTER (WHERE settlement_status<>'VOID')::int AS total FROM finance_v_obligations`)
    ]);
    const rows=rowsResult.rows;
    const bucketOf=daysToDue=>{
      if(daysToDue===null)return 'NOT_DUE';
      if(daysToDue<=-31)return 'NOT_DUE';
      if(daysToDue<=0)return 'DUE_SOON';
      if(daysToDue<=30)return 'D1_30';
      if(daysToDue<=60)return 'D31_60';
      if(daysToDue<=90)return 'D61_90';
      return 'D90_PLUS';
    };
    // due_date 可能是 date 文本、timestamp 文本，也可能被驱动转成 Date 对象，
    // 直接 String(...).slice(0,10) 在 Date 上会拿到 "Thu Nov 18" → Date.parse=NaN → 全部掉进 90+ 档。
    const toDayMs=v=>{
      if(v===null||v===undefined||v==='')return null;
      if(v instanceof Date)return Date.UTC(v.getFullYear(),v.getMonth(),v.getDate());
      const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
      if(m)return Date.UTC(+m[1],+m[2]-1,+m[3]);
      const t=Date.parse(String(v));
      return Number.isNaN(t)?null:t;
    };
    const shape=dir=>{
      const scoped=rows.filter(r=>r.direction===dir).map(r=>{
        const dueMs=toDayMs(r.due_date);
        const delta=dueMs===null?null:Math.round((baseMs-dueMs)/86400000);
        const daysToDue=delta===null?null:delta;
        const outstanding=Number(r.outstanding_amount||0);
        const overdueDays=daysToDue!==null&&daysToDue>0?daysToDue:0;
        const daysUntilDue=daysToDue!==null&&daysToDue<0?-daysToDue:0;
        // 折成 CNY 再汇总：应收是 EUR、应付是 CNY，原币直接相加再用「¥」显示是错的（EUR 会被当成 CNY，差 7.85 倍）。
        // 汇率口径与 sales-orders.js 的 FX_TO_CNY 保持一致，否则订单中心和财务页会对同一笔应收给出不同数字。
        return {...r,daysToDue:daysUntilDue,overdueDays,outstanding,outstandingCny:Math.round(outstanding*(FX_TO_CNY[r.currency]||1)*100)/100,bucket:bucketOf(delta)};
      });
      const total=scoped.reduce((s,r)=>s+r.outstandingCny,0);
      const buckets=bucketsDef.map(b=>{
        const list=scoped.filter(r=>r.bucket===b.key);
        const amount=Math.round(list.reduce((s,r)=>s+r.outstandingCny,0)*100)/100;
        // 8090 agingReport 每个桶都带 ratio，前端图例直接显示；缺这个字段会渲染成 undefined%
        return {...b,count:list.length,amount,ratio:total?Math.round((amount/total)*1000)/10:0};
      });
      const overdue=scoped.filter(r=>r.overdueDays>0);
      const overdueAmount=overdue.reduce((s,r)=>s+r.outstandingCny,0);
      const weighted=overdueAmount?overdue.reduce((s,r)=>s+r.outstandingCny*r.overdueDays,0)/overdueAmount:0;
      const maxOverdue=overdue.length?Math.max(...overdue.map(r=>r.overdueDays)):0;
      const risk=overdueAmount===0?'LOW':(scoped.filter(r=>r.bucket==='D90_PLUS').length?'CRITICAL':maxOverdue>60?'HIGH':'MEDIUM');
      const byPartner=new Map();
      for(const r of overdue){
        const key=r.partner_name||'未命名';
        const cur=byPartner.get(key)||{partner:key,amount:0,count:0,maxDays:0,currency:r.currency};
        cur.amount+=r.outstandingCny;cur.count+=1;cur.maxDays=Math.max(cur.maxDays,r.overdueDays);
        byPartner.set(key,cur);
      }
      // 原币构成：折算后仍要看得出「这笔人民币数是哪几种货币折出来的」，方便对账时反查
      const byCurrency=new Map();
      for(const r of scoped){
        const cur=byCurrency.get(r.currency)||{currency:r.currency,count:0,amount:0,amountCny:0};
        cur.count+=1;cur.amount+=r.outstanding;cur.amountCny+=r.outstandingCny;
        byCurrency.set(r.currency,cur);
      }
      return {
        direction:dir,buckets,total:Math.round(total*100)/100,count:scoped.length,
        overdueAmount:Math.round(overdueAmount*100)/100,overdueCount:overdue.length,
        overdueRatio:total?Math.round((overdueAmount/total)*1000)/10:0,
        dueSoonAmount:buckets.find(b=>b.key==='DUE_SOON')?.amount||0,
        dueSoonCount:buckets.find(b=>b.key==='DUE_SOON')?.count||0,
        avgOverdueDays:Math.round(weighted),maxOverdueDays:maxOverdue,risk,
        // 8090 的「应收坏账风险敞口」：逾期金额按 D1_30/D31_60/D61_90/D90_PLUS 拆成低/中/高/极高四档（仅应收展示）
        riskAmounts:{
          LOW:buckets.find(b=>b.key==='D1_30')?.amount||0,
          MEDIUM:buckets.find(b=>b.key==='D31_60')?.amount||0,
          HIGH:buckets.find(b=>b.key==='D61_90')?.amount||0,
          CRITICAL:buckets.find(b=>b.key==='D90_PLUS')?.amount||0
        },
        topPartners:[...byPartner.values()].sort((a,b)=>b.amount-a.amount).slice(0,5),
        byCurrency:[...byCurrency.values()].map(c=>({...c,amount:Math.round(c.amount*100)/100,amountCny:Math.round(c.amountCny*100)/100})),
        rows:scoped,
      };
    };
    return {asOf,receivable:shape('AR'),payable:shape('AP'),bucketCount:bucketsDef.length,
      closedCount:Number(counts.rows[0]?.closed||0),totalCount:Number(counts.rows[0]?.total||0)};
  },
  /**
   * 行内「核销」：8090 财务页对未结单据提供一步核销。
   * 8089 不直接改账，而是自动生成一张收/付款并全额核销该应收应付，走完整账证链。
   */
  async settleObligation(id,input={}){
    if(!isUuidv7(id))fail('应收应付编号无效');
    return transaction('finance.obligation.settle',`finance/obligations/${id}`,async c=>{
      await c.query('SELECT 1 FROM finance_obligations WHERE id=$1 FOR UPDATE',[id]);
      const row=(await c.query('SELECT * FROM finance_v_obligations WHERE id=$1',[id])).rows[0];
      if(!row||row.settlement_status==='VOID')fail('应收应付不存在或已作废',404);
      const actor=await actorId(c),key=text(input.idempotencyKey,200)||uuidv7(),on=new Date().toISOString().slice(0,10);
      const prior=(await c.query('SELECT *,value_date::text AS value_date FROM finance_payments WHERE idempotency_key=$1',[key])).rows[0];
      if(prior){
        const allocation=(await c.query('SELECT * FROM finance_allocations WHERE payment_id=$1 AND obligation_id=$2',[prior.id,id])).rows[0];
        if(allocation)return{payment:prior,allocation,replayed:true};
        fail('幂等编号已用于其他收付款',409);
      }
      const outstanding=Number(row.outstanding_amount||0);
      if(outstanding<=0)fail('该应收应付已结清',409);
      const direction=row.direction==='AR'?'INBOUND':'OUTBOUND';
      const payment=(await c.query(`INSERT INTO finance_payments(direction,partner_id,currency,amount,value_date,provider,idempotency_key,note,posted_by) VALUES($1,$2,$3,$4,$5,'MANUAL_SETTLE',$6,'财务页一步核销',$7) RETURNING *,value_date::text AS value_date_text`,[direction,row.partner_id,row.currency,outstanding,on,key,actor])).rows[0];
      const allocation=(await c.query(`INSERT INTO finance_allocations(payment_id,obligation_id,payment_amount,obligation_amount,note,allocated_by) VALUES($1,$2,$3,$3,'财务页一步核销',$4) RETURNING *`,[payment.id,id,outstanding,actor])).rows[0];
      return{payment:{...payment,value_date:payment.value_date_text},allocation};
    });
  },
  close:()=>pool.end(),
 };
}
function registerFinanceRoutes(app,store){
 const route=(method,url,fn)=>app.route({method,url,handler:async(req,reply)=>{reply.header('Cache-Control','no-store');if(req.user?.role!=='admin')return reply.code(403).send({error:'仅管理员可管理财务工作台'});if(!store)return reply.code(503).send({error:'财务服务暂不可用'});try{return{data:await fn(req)}}catch(e){if(e.code==='23505')return reply.code(409).send({error:'编号或业务记录已存在'});if(e.code==='23503')return reply.code(400).send({error:'关联业务记录不存在'});if(e.code==='23514'||e.code==='P0001')return reply.code(409).send({error:/[\u4e00-\u9fa5]/.test(e.message||'')?e.message:'业务规则校验未通过'});return reply.code(e.statusCode||500).send({error:e.statusCode&&/[\u4e00-\u9fa5]/.test(e.message||'')?e.message:'财务操作失败'})}}});
 route('GET','/api/finance',()=>store.summary());
 route('GET','/api/finance/aging',req=>store.aging({asOf:req.query.asOf}));
 route('POST','/api/finance/documents',req=>store.createDocument(req.body||{}));
 for(const action of ['verify','draft','post','void'])route('POST',`/api/finance/documents/:id/${action}`,req=>store.documentStatus(req.params.id,req.body||{},action));
 route('POST','/api/finance/obligations',req=>store.createObligation(req.body||{}));
 route('POST','/api/finance/obligations/:id/void',req=>store.voidObligation(req.params.id,req.body||{}));
 route('POST','/api/finance/obligations/:id/settle',req=>store.settleObligation(req.params.id,req.body||{}));
 route('POST','/api/finance/payments',req=>store.createPayment(req.body||{}));
 route('POST','/api/finance/payments/:id/reverse',req=>store.reversePayment(req.params.id,req.body||{}));
 route('POST','/api/finance/fx',req=>store.createFx(req.body||{}));
 route('POST','/api/finance/allocations',req=>store.allocate(req.body||{}));
 route('POST','/api/finance/allocations/:id/reverse',req=>store.reverseAllocation(req.params.id,req.body||{}));
 route('POST','/api/finance/landed-cost',req=>store.createLandedBatch(req.body||{}));
 route('POST','/api/finance/landed-cost/:id/components',req=>store.addLandedComponent(req.params.id,req.body||{}));
 route('POST','/api/finance/landed-cost/components/:id/allocations',req=>store.allocateLanded(req.params.id,req.body||{}));
 route('DELETE','/api/finance/landed-cost/allocations/:id',req=>store.deleteLandedAllocation(req.params.id));
 route('POST','/api/finance/landed-cost/:id/distribute',req=>store.distributeLanded(req.params.id,req.body||{}));
 route('POST','/api/finance/landed-cost/:id/finalize',req=>store.finalizeLanded(req.params.id));
}
module.exports={createFinanceStore,registerFinanceRoutes};
