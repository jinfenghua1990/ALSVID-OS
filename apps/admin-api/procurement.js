const { createPool } = require('./db-pool');
const { uuidv7, isUuidv7 } = require('./uuidv7');
const { currentActor } = require('./audit-context');
const { createHash } = require('node:crypto');

const stable=value=>Array.isArray(value)?`[${value.map(stable).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`:JSON.stringify(value);
const requestHash=value=>createHash('sha256').update(stable(value)).digest('hex');
const jsonValue=value=>typeof value==='string'?JSON.parse(value):value;
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode})};
const text=(value,max=2000)=>typeof value==='string'?value.trim().slice(0,max):'';
const decimal=value=>{const v=String(value??''),match=/^(\d{1,12})(?:\.(\d{1,6}))?$/.exec(v);if(!match)return null;return `${match[1]}.${(match[2]||'').padEnd(6,'0')}`};
const decimalUnits=value=>BigInt(decimal(value).replace('.',''));
const quantity=value=>{const v=decimal(value);if(!v||!/[1-9]/.test(v))fail('数量须为正数，最多六位小数');return v};
const price=value=>{const v=decimal(value);if(!v)fail('单价须为非负数，最多六位小数');return v};
const date=value=>{if(value==null||value==='')return null;if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))fail('日期须为 YYYY-MM-DD');const parsed=new Date(`${value}T00:00:00Z`);if(Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==value)fail('日期须为 YYYY-MM-DD');return value};
function linesOf(lines){
  if(!Array.isArray(lines)||!lines.length||lines.length>500)fail('至少需要一条采购明细');
  return lines.map(line=>{
    if(!line||!isUuidv7(line.skuUuid))fail('请选择有效产品 SKU');
    const lineKind=line.lineKind||'PURCHASE',unit=text(line.unit,40)||'件',description=text(line.description,1000),supplierItemReference=text(line.supplierItemReference,200)||null;
    const unitPrice=price(line.unitPrice),qty=quantity(line.quantity);
    if(!['PURCHASE','GIFT'].includes(lineKind)||(lineKind==='GIFT'&&Number(unitPrice)!==0))fail('赠品单价必须为零');
    return{skuUuid:line.skuUuid.toLowerCase(),lineKind,unit,description,supplierItemReference,unitPrice,quantity:qty,requestedDate:date(line.requestedDate)};
  });
}
function headerOf(input){
  const currency=text(input.currency,3).toUpperCase();
  if(!isUuidv7(input.supplierPartnerId)||!/^[A-Z]{3}$/.test(currency))fail('供应商或币种无效');
  return{supplierPartnerId:input.supplierPartnerId.toLowerCase(),supplierReference:text(input.supplierReference,200)||null,currency,
    incoterm:text(input.incoterm,20).toUpperCase()||null,paymentTerms:text(input.paymentTerms,2000),depositTerms:text(input.depositTerms,2000)};
}
function createProcurementStore(url){
  const pool=createPool(url,{max:3});
  async function tx(fn){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}}
  async function saveLines(c,table,parentId,rows){
    const parent=table==='procurement_quotation_lines'?'quotation_id':'purchase_order_id';
    const qtyCol=table==='procurement_quotation_lines'?'quantity':'ordered_quantity';
    for(const [i,row] of rows.entries()){
      const sku=(await c.query('SELECT s.code FROM skus s JOIN products p ON p.id=s.product_id WHERE s.entity_uuid=$1 AND p.status=$2 AND s.disabled=false',[row.skuUuid,'启用'])).rows[0];
      if(!sku)fail('SKU 不存在或产品已停用',404);
      await c.query(`INSERT INTO ${table}(id,${parent},line_no,sku_uuid,sku_code,description,supplier_item_reference,${qtyCol},unit,unit_price,line_kind,requested_date)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,[uuidv7(),parentId,(i+1)*10,row.skuUuid,sku.code,row.description,row.supplierItemReference,row.quantity,row.unit,row.unitPrice,row.lineKind,row.requestedDate]);
    }
  }
  return{
    async list(){
      const [partners,skus,warehouses,locations,quotations,quoteLines,orders,orderLines,confirmations,confirmationLines,receipts,receiptLines]=await Promise.all([
        pool.query(`SELECT p.id,p.display_name AS "displayName",p.country,r.role FROM partners p JOIN partner_roles r ON r.partner_id=p.id WHERE p.status='ACTIVE' AND r.status='ACTIVE' AND r.role IN ('SUPPLIER','FACTORY') ORDER BY p.display_name,p.id`),
        pool.query(`SELECT s.entity_uuid AS id,s.code AS sku,p.name,p.kind FROM skus s JOIN products p ON p.id=s.product_id WHERE p.status='启用' AND s.disabled=false ORDER BY p.kind,p.name,s.code`),
        pool.query("SELECT id,entity_uuid AS \"entityUuid\",name FROM warehouses WHERE status='启用' ORDER BY name,id"),
        pool.query("SELECT id,warehouse_uuid AS \"warehouseUuid\",code,name,is_default AS \"isDefault\" FROM warehouse_locations WHERE status='启用' ORDER BY warehouse_uuid,is_default DESC,code"),
        pool.query(`SELECT q.id,q.quotation_no AS "quotationNo",q.supplier_partner_id AS "supplierPartnerId",p.display_name AS supplier,q.supplier_reference AS "supplierReference",q.currency,q.valid_until::text AS "validUntil",q.incoterm,q.payment_terms AS "paymentTerms",q.status,q.version,q.created_at AS "createdAt" FROM procurement_quotations q JOIN partners p ON p.id=q.supplier_partner_id ORDER BY q.created_at DESC LIMIT 200`),
        pool.query('SELECT id,quotation_id AS "quotationId",line_no AS "lineNo",sku_uuid AS "skuUuid",sku_code AS sku,description,supplier_item_reference AS "supplierItemReference",quantity::text,unit,unit_price::text AS "unitPrice",line_kind AS "lineKind",requested_date::text AS "requestedDate" FROM procurement_quotation_lines ORDER BY quotation_id,line_no'),
        pool.query(`SELECT o.id,o.po_number AS "poNumber",o.supplier_partner_id AS "supplierPartnerId",p.display_name AS supplier,o.source_quotation_id AS "sourceQuotationId",o.supplier_reference AS "supplierReference",o.currency,o.incoterm,o.payment_terms AS "paymentTerms",o.deposit_terms AS "depositTerms",o.status,o.version,o.issued_at AS "issuedAt",o.confirmed_at AS "confirmedAt",o.created_at AS "createdAt",COALESCE((SELECT sum(l.ordered_quantity*l.unit_price) FROM procurement_purchase_order_lines l WHERE l.purchase_order_id=o.id),0)::text AS total FROM procurement_purchase_orders o JOIN partners p ON p.id=o.supplier_partner_id ORDER BY o.created_at DESC LIMIT 200`),
        pool.query('SELECT id,purchase_order_id AS "purchaseOrderId",line_no AS "lineNo",sku_uuid AS "skuUuid",sku_code AS sku,description,supplier_item_reference AS "supplierItemReference",ordered_quantity::text AS quantity,unit,unit_price::text AS "unitPrice",line_kind AS "lineKind",requested_date::text AS "requestedDate" FROM procurement_purchase_order_lines ORDER BY purchase_order_id,line_no'),
        pool.query('SELECT id,purchase_order_id AS "purchaseOrderId",supplier_reference AS "supplierReference",note,confirmed_at AS "confirmedAt",recorded_by AS "recordedBy" FROM procurement_supplier_confirmations ORDER BY confirmed_at DESC'),
        pool.query('SELECT id,confirmation_id AS "confirmationId",purchase_order_line_id AS "purchaseOrderLineId",confirmed_quantity::text AS quantity,confirmed_date::text AS "confirmedDate",note FROM procurement_supplier_confirmation_lines ORDER BY confirmation_id'),
        pool.query('SELECT id,purchase_order_id AS "purchaseOrderId",kind,reference,occurred_on::text AS "occurredOn",note,recorded_by AS "recordedBy",created_at AS "createdAt" FROM procurement_receipts ORDER BY created_at DESC'),
        pool.query('SELECT id,receipt_id AS "receiptId",purchase_order_line_id AS "purchaseOrderLineId",quantity::text,unit,note FROM procurement_receipt_lines ORDER BY receipt_id'),
      ]);
      return{partners:partners.rows,skus:skus.rows,warehouses:warehouses.rows,locations:locations.rows,quotations:quotations.rows,quoteLines:quoteLines.rows,purchaseOrders:orders.rows,purchaseOrderLines:orderLines.rows,confirmations:confirmations.rows,confirmationLines:confirmationLines.rows,receipts:receipts.rows,receiptLines:receiptLines.rows};
    },
    async createSupplier(input){
      const name=text(input.displayName,200),country=text(input.country,2).toUpperCase();
      if(!name||!['DE','AT','CH','NL','BE','FR','IT','ES','GB','CN','OTHER'].includes(country))fail('供应商名称或国家/地区无效');
      const id=String(input.id||uuidv7()).toLowerCase();if(!isUuidv7(id))fail('供应商请求编号无效');
      const details={displayName:name,legalName:text(input.legalName,200),country,taxId:text(input.taxId,100),address:text(input.address,500),contactName:text(input.contactName,160),contactEmail:text(input.contactEmail,254),contactPhone:text(input.contactPhone,80)},hash=requestHash(details),target=`partners/${id}`,actor=currentActor();
      return tx(async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`procurement-supplier:${id}`]);
        const prior=(await c.query("SELECT before_json,after_json FROM audit_log WHERE action='partner.supplier.create' AND target=$1 ORDER BY created_at DESC LIMIT 1",[target])).rows[0];
        if(prior){if(jsonValue(prior.before_json)?.requestHash!==hash)fail('供应商请求编号已用于不同内容',409);return{...jsonValue(prior.after_json),replayed:true}}
        const partner=(await c.query(`INSERT INTO partners(id,display_name,legal_name,country,tax_id,address,contact_name,contact_email,contact_phone)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,display_name AS "displayName",country`,[id,details.displayName,details.legalName,country,details.taxId,details.address,details.contactName,details.contactEmail,details.contactPhone])).rows[0];
        await c.query("INSERT INTO partner_roles(partner_id,role) VALUES($1,'SUPPLIER')",[id]);
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)',[actor,'partner.supplier.create',target,JSON.stringify({requestHash:hash}),JSON.stringify(partner)]);return partner;});
    },
    async createQuotation(input){
      const id=String(input.id||uuidv7()).toLowerCase(),h=headerOf(input),rows=linesOf(input.lines),request={header:h,validUntil:date(input.validUntil),lines:rows},hash=requestHash(request);
      if(!isUuidv7(id))fail('询价请求编号无效');
      return tx(async c=>{
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`procurement-quotation:${id}`]);
        const target=`procurement/quotations/${id}`,prior=(await c.query("SELECT before_json,after_json FROM audit_log WHERE action='procurement.quotation.create' AND target=$1 ORDER BY created_at DESC LIMIT 1",[target])).rows[0];
        if(prior){if(jsonValue(prior.before_json)?.requestHash!==hash)fail('询价请求编号已用于不同内容',409);return{...jsonValue(prior.after_json),replayed:true}}
        const actor=currentActor();
        const q=(await c.query(`INSERT INTO procurement_quotations(id,supplier_partner_id,supplier_reference,currency,valid_until,incoterm,payment_terms,created_by,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING quotation_no AS "quotationNo"`,[id,h.supplierPartnerId,h.supplierReference,h.currency,request.validUntil,h.incoterm,h.paymentTerms,actor])).rows[0];
        await saveLines(c,'procurement_quotation_lines',id,rows);
        const result={id,...q,status:'DRAFT',version:1};
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)',[actor,'procurement.quotation.create',target,JSON.stringify({requestHash:hash}),JSON.stringify(result)]);
        return result;
      });
    },
    async quotationStatus(id,status){
      if(!isUuidv7(id)||!['RECEIVED','ACCEPTED','REJECTED','EXPIRED'].includes(status))fail('询价状态无效');
      return tx(async c=>{const row=(await c.query("UPDATE procurement_quotations SET status=$2,version=version+1,updated_by=$3,updated_at=now() WHERE id=$1 AND (status='DRAFT' OR (status='RECEIVED' AND $2 IN ('ACCEPTED','REJECTED','EXPIRED'))) RETURNING id,status,version",[id,status,currentActor()])).rows[0];if(!row)fail('询价不存在或状态已变更',409);await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',[currentActor(),'procurement.quotation.status',`procurement/quotations/${id}`,JSON.stringify(row)]);return row});
    },
    async deleteQuotation(id){
      if(!isUuidv7(id))fail('询价编号无效');
      return tx(async c=>{
        const row=(await c.query('SELECT id,quotation_no AS "quotationNo",status FROM procurement_quotations WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!row)fail('询价不存在',404);
        if(row.status!=='DRAFT')fail('只有草稿询价可以删除；已流转询价请保留记录',409);
        if((await c.query('SELECT 1 FROM procurement_purchase_orders WHERE source_quotation_id=$1 LIMIT 1',[id])).rowCount)fail('询价已关联采购单，不能删除',409);
        await c.query('DELETE FROM procurement_quotation_lines WHERE quotation_id=$1',[id]);
        await c.query('DELETE FROM procurement_quotations WHERE id=$1',[id]);
        await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',[currentActor(),'procurement.quotation.delete',`procurement/quotations/${id}`,JSON.stringify({...row,deleted:true})]);
        return{...row,deleted:true};
      });
    },
    async createPurchaseOrder(input){
      const id=String(input.id||uuidv7()).toLowerCase(),h=headerOf(input);if(!Array.isArray(input.lines)||!input.lines.length)fail('采购单至少需要一条明细');
      const rows=linesOf(input.lines),sourceQuotationId=input.sourceQuotationId?String(input.sourceQuotationId).toLowerCase():null,request={header:h,sourceQuotationId,lines:rows},hash=requestHash(request);
      if(!isUuidv7(id))fail('采购单请求编号无效');if(sourceQuotationId&&!isUuidv7(sourceQuotationId))fail('来源询价编号无效');
      return tx(async c=>{
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`procurement-order:${id}`]);
        const target=`procurement/purchase-orders/${id}`,prior=(await c.query("SELECT before_json,after_json FROM audit_log WHERE action='procurement.order.create' AND target=$1 ORDER BY created_at DESC LIMIT 1",[target])).rows[0];
        if(prior){if(jsonValue(prior.before_json)?.requestHash!==hash)fail('采购单请求编号已用于不同内容',409);return{...jsonValue(prior.after_json),replayed:true}}
        const activeSkus=Number((await c.query("SELECT count(*)::int AS n FROM skus s JOIN products p ON p.entity_uuid=s.product_uuid WHERE s.entity_uuid=ANY($1::uuid[]) AND s.disabled=false AND p.status='启用'",[rows.map(line=>line.skuUuid)])).rows[0].n);
        if(activeSkus!==rows.length)fail('采购明细包含已停用或不存在的 SKU',409);
        if(sourceQuotationId){
          const quote=(await c.query('SELECT supplier_partner_id,status,currency FROM procurement_quotations WHERE id=$1 FOR UPDATE',[sourceQuotationId])).rows[0];
          if(!quote)fail('来源询价不存在',404);if(quote.status!=='ACCEPTED'||quote.supplier_partner_id!==h.supplierPartnerId)fail('来源询价须已接受且供应商一致',409);
          if(quote.currency!==h.currency)fail('采购单币种须与来源询价一致',409);
          const quoted=(await c.query('SELECT sku_uuid,sku_code,description,supplier_item_reference,quantity::text,unit,unit_price::text,line_kind,requested_date::text AS requested_date FROM procurement_quotation_lines WHERE quotation_id=$1 ORDER BY line_no',[sourceQuotationId])).rows;
          if(rows.length!==quoted.length||rows.some((line,i)=>line.skuUuid!==quoted[i].sku_uuid||line.quantity!==quoted[i].quantity||line.unitPrice!==quoted[i].unit_price||line.lineKind!==quoted[i].line_kind||line.unit!==quoted[i].unit||line.description!==quoted[i].description||line.supplierItemReference!==(quoted[i].supplier_item_reference||'')||line.requestedDate!==quoted[i].requested_date))fail('采购单明细必须与已接受询价一致',409);
        }
        const actor=currentActor();
        const po=(await c.query(`INSERT INTO procurement_purchase_orders(id,supplier_partner_id,source_quotation_id,supplier_reference,currency,incoterm,payment_terms,deposit_terms,created_by,updated_by)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING po_number AS "poNumber"`,[id,h.supplierPartnerId,sourceQuotationId,h.supplierReference,h.currency,h.incoterm,h.paymentTerms,h.depositTerms,actor])).rows[0];
        await saveLines(c,'procurement_purchase_order_lines',id,rows);
        const result={id,...po,status:'DRAFT',version:1};
        await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)',[actor,'procurement.order.create',target,JSON.stringify({requestHash:hash}),JSON.stringify(result)]);
        return result;
      });
    },
    async deletePurchaseOrder(id){
      if(!isUuidv7(id))fail('采购单编号无效');
      return tx(async c=>{
        const row=(await c.query('SELECT id,po_number AS "poNumber",status FROM procurement_purchase_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!row)fail('采购单不存在',404);
        if(row.status!=='DRAFT')fail('只有草稿采购单可以删除；已下发采购单请取消并保留记录',409);
        const refs=await c.query(`SELECT EXISTS(SELECT 1 FROM procurement_supplier_confirmations WHERE purchase_order_id=$1)
          OR EXISTS(SELECT 1 FROM procurement_receipts WHERE purchase_order_id=$1)
          OR EXISTS(SELECT 1 FROM procurement_purchase_order_snapshots WHERE purchase_order_id=$1) AS used`,[id]);
        if(refs.rows[0].used)fail('采购单已有确认、收货或订单快照，不能删除',409);
        await c.query('DELETE FROM procurement_purchase_order_lines WHERE purchase_order_id=$1',[id]);
        await c.query('DELETE FROM procurement_purchase_orders WHERE id=$1',[id]);
        await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',[currentActor(),'procurement.order.delete',`procurement/purchase-orders/${id}`,JSON.stringify({...row,deleted:true})]);
        return{...row,deleted:true};
      });
    },
    async issue(id){
      if(!isUuidv7(id))fail('采购单编号无效');
      return tx(async c=>{
        const po=(await c.query('SELECT id,status,version FROM procurement_purchase_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!po)fail('采购单不存在',404);if(po.status!=='DRAFT')fail('只有草稿采购单可以下发',409);
        const lines=(await c.query('SELECT line_no AS "lineNo",sku_uuid AS "skuUuid",sku_code AS sku,description,supplier_item_reference AS "supplierItemReference",ordered_quantity::text AS quantity,unit,unit_price::text AS "unitPrice",line_kind AS "lineKind",requested_date::text AS "requestedDate" FROM procurement_purchase_order_lines WHERE purchase_order_id=$1 ORDER BY line_no',[id])).rows;if(!lines.length)fail('采购单没有明细',409);
        const after=(await c.query("UPDATE procurement_purchase_orders SET status='ISSUED',issued_at=now(),version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING id,po_number AS \"poNumber\",status,version,issued_at AS \"issuedAt\"",[id,currentActor()])).rows[0];
        await c.query('INSERT INTO procurement_purchase_order_snapshots(purchase_order_id,state,po_version,snapshot) VALUES($1,$2,$3,$4)',[id,after.status,after.version,JSON.stringify({purchaseOrder:after,lines})]);
        await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',[currentActor(),'procurement.order.issue',`procurement/purchase-orders/${id}`,JSON.stringify(after)]);return after;
      });
    },
    async supplierOrders(user){
      return (await pool.query(`SELECT o.id,o.po_number AS "poNumber",o.status,o.version,o.currency,o.supplier_reference AS "supplierReference",o.issued_at AS "issuedAt",p.display_name AS supplier,COALESCE((SELECT jsonb_agg(jsonb_build_object('id',l.id,'lineNo',l.line_no,'lineKind',l.line_kind,'sku',l.sku_code,'description',l.description,'quantity',l.ordered_quantity::text,'unit',l.unit,'requestedDate',l.requested_date) ORDER BY l.line_no) FROM procurement_purchase_order_lines l WHERE l.purchase_order_id=o.id),'[]'::jsonb) AS lines FROM procurement_purchase_orders o JOIN partners p ON p.id=o.supplier_partner_id AND p.status='ACTIVE' JOIN partner_roles pr ON pr.partner_id=p.id AND pr.status='ACTIVE' AND pr.role IN ('SUPPLIER','FACTORY') JOIN supplier_portal_memberships m ON m.partner_id=o.supplier_partner_id AND m.user_id=$1 AND m.status='ACTIVE' JOIN app_users u ON u.id=m.user_id AND u.enabled AND u.role='supplier' WHERE o.status<>'DRAFT' ORDER BY o.issued_at DESC`,[user.id])).rows;
    },
    async confirm(id,input,userId=null){
      if(!isUuidv7(id)||!Array.isArray(input.lines)||!input.lines.length)fail('供应商确认资料无效');
      const note=text(input.note,1000),supplierReference=text(input.supplierReference,200)||null;if(note.length<5)fail('确认说明至少需要 5 个字符');
      if(userId&&(!isUuidv7(input.clientRequestId)||!Number.isInteger(input.expectedVersion)||input.expectedVersion<1))fail('确认请求编号或采购单版本无效');
      return tx(async c=>{
        const po=(await c.query(`SELECT o.status,o.version FROM procurement_purchase_orders o WHERE o.id=$1 AND ($2::text IS NULL OR EXISTS(SELECT 1 FROM supplier_portal_memberships m JOIN app_users u ON u.id=m.user_id JOIN partners p ON p.id=m.partner_id AND p.status='ACTIVE' JOIN partner_roles pr ON pr.partner_id=p.id AND pr.status='ACTIVE' AND pr.role IN ('SUPPLIER','FACTORY') WHERE m.user_id=$2 AND m.partner_id=o.supplier_partner_id AND m.status='ACTIVE' AND u.enabled AND u.role='supplier')) FOR UPDATE`,[id,userId])).rows[0];if(!po)fail('采购单不存在或无权访问',404);
        if(userId){
          const earlier=(await c.query('SELECT id,request_payload,supplier_reference AS "supplierReference" FROM procurement_supplier_confirmations WHERE purchase_order_id=$1 AND client_request_id=$2',[id,input.clientRequestId])).rows[0];
          if(earlier){const payload={...earlier.request_payload,supplierReference:earlier.request_payload?.supplierReference??(text(earlier.supplierReference,200)||null)},requested={expectedVersion:input.expectedVersion,note,supplierReference,lines:input.lines.map(line=>({purchaseOrderLineId:String(line.purchaseOrderLineId).toLowerCase(),confirmedQuantity:quantity(line.confirmedQuantity),confirmedDate:date(line.confirmedDate)})).sort((a,b)=>a.purchaseOrderLineId.localeCompare(b.purchaseOrderLineId))};if(stable(payload)!==stable(requested))fail('确认请求编号已用于不同内容',409);return{id:earlier.id,confirmationId:earlier.id,status:'CONFIRMED',version:po.version,replayed:true};}
          if(po.status!=='ISSUED'||po.version!==input.expectedVersion)fail('采购单状态或版本已变化，请刷新后再确认',409);
        } else if(po.status!=='ISSUED')fail('只有已下发采购单可以确认',409);
        const ordered=(await c.query('SELECT id,ordered_quantity::text AS quantity,requested_date::text AS "requestedDate" FROM procurement_purchase_order_lines WHERE purchase_order_id=$1 ORDER BY line_no',[id])).rows;
        const seen=new Set(),normalized=[];for(const line of input.lines){const lineId=String(line.purchaseOrderLineId||'').toLowerCase();if(!isUuidv7(lineId)||seen.has(lineId))fail('确认明细编号无效');seen.add(lineId);const match=ordered.find(x=>x.id===lineId);if(!match||quantity(line.confirmedQuantity)!==match.quantity)fail('确认数量必须与采购单数量一致');const confirmedDate=line.confirmedDate?date(line.confirmedDate):match.requestedDate;if(confirmedDate!==match.requestedDate)fail('交付日期变更须另行审批');normalized.push({purchaseOrderLineId:lineId,confirmedQuantity:match.quantity,confirmedDate});}
        if(seen.size!==ordered.length)fail('供应商确认必须覆盖全部采购明细');
        const normalizedPayload=userId?{expectedVersion:input.expectedVersion,note,supplierReference,lines:normalized.slice().sort((a,b)=>a.purchaseOrderLineId.localeCompare(b.purchaseOrderLineId))}:null;
        const actor=currentActor(),confirmationId=uuidv7();
        await c.query('INSERT INTO procurement_supplier_confirmations(id,purchase_order_id,supplier_reference,note,recorded_by,client_request_id,expected_version,request_payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[confirmationId,id,supplierReference,note,actor,userId?input.clientRequestId:null,userId?input.expectedVersion:null,normalizedPayload?JSON.stringify(normalizedPayload):null]);
        for(const line of normalized)await c.query('INSERT INTO procurement_supplier_confirmation_lines(id,confirmation_id,purchase_order_line_id,confirmed_quantity,confirmed_date,note) VALUES($1,$2,$3,$4,$5,$6)',[uuidv7(),confirmationId,line.purchaseOrderLineId,line.confirmedQuantity,line.confirmedDate,text(input.lines.find(x=>String(x.purchaseOrderLineId).toLowerCase()===line.purchaseOrderLineId)?.note,1000)]);
        const after=(await c.query("UPDATE procurement_purchase_orders SET status='CONFIRMED',confirmed_at=now(),version=version+1,updated_by=$2,updated_at=now() WHERE id=$1 RETURNING id,status,version,confirmed_at AS \"confirmedAt\"",[id,actor])).rows[0];
        await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',[actor,userId?'procurement.supplier_po_acknowledged':'procurement.order.confirm',`procurement/purchase-orders/${id}`,JSON.stringify({ ...after,confirmationId,...(userId?{requestId:input.clientRequestId}:{}) })]);return{...after,confirmationId};
      });
    },
    async receive(id,input){
      if(!isUuidv7(id)||!isUuidv7(input.receiptId)||!['PHYSICAL_RECEIPT','FACTORY_COMMITMENT'].includes(input.kind)||!Array.isArray(input.lines)||!input.lines.length)fail('收货资料无效');
      const occurredOn=date(input.occurredOn);if(!occurredOn)fail('收货日期必填');
      return tx(async c=>{
        const receiptId=input.receiptId.toLowerCase(),actor=currentActor(),reference=text(input.reference,200)||null,note=text(input.note,2000),warehouseId=text(input.warehouseId,80),locationId=text(input.locationId,80).toLowerCase();
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[receiptId]);
        const po=(await c.query('SELECT status FROM procurement_purchase_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!po)fail('采购单不存在',404);
        const prior=(await c.query('SELECT id,purchase_order_id AS "purchaseOrderId",kind,reference,occurred_on::text AS "occurredOn",note,warehouse_uuid AS "warehouseUuid",location_uuid AS "locationId" FROM procurement_receipts WHERE id=$1',[receiptId])).rows[0];
        if(prior){
          const saved=(await c.query('SELECT purchase_order_line_id AS "purchaseOrderLineId",quantity::text,unit,note FROM procurement_receipt_lines WHERE receipt_id=$1 ORDER BY purchase_order_line_id',[receiptId])).rows;
          const requested=input.lines.map(line=>({purchaseOrderLineId:String(line.purchaseOrderLineId).toLowerCase(),quantity:quantity(line.quantity),unit:text(line.unit,40)||saved.find(row=>row.purchaseOrderLineId===String(line.purchaseOrderLineId).toLowerCase())?.unit||'',note:text(line.note,1000)})).sort((a,b)=>a.purchaseOrderLineId.localeCompare(b.purchaseOrderLineId));
          if(prior.purchaseOrderId!==id||prior.kind!==input.kind||prior.reference!==reference||String(prior.occurredOn).slice(0,10)!==occurredOn||prior.note!==note||prior.warehouseUuid!==(input.kind==='PHYSICAL_RECEIPT'?(await c.query('SELECT entity_uuid FROM warehouses WHERE id=$1',[warehouseId])).rows[0]?.entity_uuid||null:null)||prior.locationId!==(input.kind==='PHYSICAL_RECEIPT'?locationId||null:null)||stable(saved)!==stable(requested))fail('收货编号已用于不同内容',409);
          return{id:receiptId,replayed:true};
        }
        if(!['CONFIRMED','PARTIALLY_FULFILLED'].includes(po.status))fail('采购单确认后才能登记收货',409);
        let warehouse=null,location=null;
        if(input.kind==='PHYSICAL_RECEIPT'){
          warehouse=(await c.query("SELECT id,entity_uuid AS \"entityUuid\" FROM warehouses WHERE id=$1 AND status='启用' FOR SHARE",[warehouseId])).rows[0];if(!warehouse)fail('请选择启用中的收货仓库');
          location=(await c.query("SELECT id FROM warehouse_locations WHERE id=$1 AND warehouse_uuid=$2 AND status='启用' FOR SHARE",[locationId,warehouse.entityUuid])).rows[0];if(!location)fail('所选库位不属于该仓库或已停用');
        }
        await c.query('INSERT INTO procurement_receipts(id,purchase_order_id,kind,reference,occurred_on,note,recorded_by,warehouse_uuid,location_uuid) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[receiptId,id,input.kind,reference,occurredOn,note,actor,warehouse?.entityUuid||null,location?.id||null]);
        const seen=new Set();
        for(const line of input.lines){
          if(!isUuidv7(line.purchaseOrderLineId)||seen.has(line.purchaseOrderLineId.toLowerCase()))fail('收货明细编号无效');seen.add(line.purchaseOrderLineId.toLowerCase());
          const qty=quantity(line.quantity),row=(await c.query('SELECT l.id,l.sku_uuid AS "skuUuid",l.sku_code AS sku,l.ordered_quantity::text AS quantity,l.unit,p.kind AS "productKind" FROM procurement_purchase_order_lines l JOIN skus s ON s.entity_uuid=l.sku_uuid JOIN products p ON p.id=s.product_id WHERE l.id=$1 AND l.purchase_order_id=$2',[line.purchaseOrderLineId,id])).rows[0];if(!row)fail('收货明细不属于该采购单');
          const kind=input.kind,received=(await c.query(`SELECT COALESCE(sum(rl.quantity),0)::text AS quantity FROM procurement_receipt_lines rl JOIN procurement_receipts r ON r.id=rl.receipt_id WHERE rl.purchase_order_line_id=$1 AND r.kind=$2`,[row.id,kind])).rows[0].quantity;
          if(decimalUnits(received)+decimalUnits(qty)>decimalUnits(row.quantity))fail('收货或工厂承诺数量超过采购数量');
          const receiptLineId=uuidv7();
          await c.query('INSERT INTO procurement_receipt_lines(id,receipt_id,purchase_order_line_id,quantity,unit,note) VALUES($1,$2,$3,$4,$5,$6)',[receiptLineId,receiptId,row.id,qty,text(line.unit,40)||row.unit,text(line.note,1000)]);
          if(kind==='PHYSICAL_RECEIPT'){
            if(row.productKind==='vehicle')fail('整车实物收货须通过工厂交付登记 VIN 入库');
            const quantityUnits=decimalUnits(qty);
            if(quantityUnits%1000000n!==0n||quantityUnits/1000000n>2147483647n)fail('配件实物收货数量必须为有效整数');
            await c.query('INSERT INTO warehouse_stock(warehouse_id,sku_code,quantity) VALUES($1,$2,0) ON CONFLICT DO NOTHING',[warehouse.id,row.sku]);
            const stock=(await c.query('SELECT quantity FROM warehouse_stock WHERE warehouse_uuid=$1 AND sku_uuid=$2 FOR UPDATE',[warehouse.entityUuid,row.skuUuid])).rows[0];
            const ledger=Number((await c.query('SELECT COALESCE(sum(quantity_delta),0)::bigint AS quantity FROM inventory_ledger WHERE warehouse_uuid=$1 AND sku_uuid=$2',[warehouse.entityUuid,row.skuUuid])).rows[0].quantity);
            if(!stock||Number(stock.quantity)!==ledger)fail('库存账本与仓库余额不一致，不能收货',409);
            await c.query('UPDATE warehouse_stock SET quantity=quantity+$1 WHERE warehouse_uuid=$2 AND sku_uuid=$3',[Number(qty),warehouse.entityUuid,row.skuUuid]);
            await c.query("INSERT INTO stock_movements(id,kind,sku_code,quantity,to_warehouse,to_location_uuid,note,actor) VALUES($1,'入库',$2,$3,$4,$5,$6,$7)",[receiptLineId,row.sku,Number(qty),warehouse.id,location.id,`采购单 ${id} 收货 ${receiptId}${reference?` · ${reference}`:''}`,actor]);
          }
        }
        if(input.kind==='PHYSICAL_RECEIPT'){
          const f=(await c.query(`SELECT count(*)::int total,count(*) FILTER(WHERE COALESCE(x.received,0)>=l.ordered_quantity)::int fulfilled,count(*) FILTER(WHERE COALESCE(x.received,0)>0)::int partial FROM procurement_purchase_order_lines l LEFT JOIN LATERAL(SELECT sum(rl.quantity) received FROM procurement_receipt_lines rl JOIN procurement_receipts r ON r.id=rl.receipt_id WHERE rl.purchase_order_line_id=l.id AND r.kind='PHYSICAL_RECEIPT') x ON true WHERE l.purchase_order_id=$1`,[id])).rows[0];
          const next=f.total===f.fulfilled?'FULFILLED':f.partial?'PARTIALLY_FULFILLED':po.status;if(next!==po.status)await c.query('UPDATE procurement_purchase_orders SET status=$2,version=version+1,updated_by=$3,updated_at=now() WHERE id=$1',[id,next,actor]);
        }
        await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',[actor,input.kind==='PHYSICAL_RECEIPT'?'procurement.receipt.record':'procurement.factory_commitment.record',`procurement/purchase-orders/${id}`,JSON.stringify({receiptId,kind:input.kind,lineCount:input.lines.length,warehouseUuid:warehouse?.entityUuid||null,locationId:location?.id||null})]);return{id:receiptId};
      });
    },
    close:()=>pool.end(),
  };
}
function registerProcurementRoutes(app,store){
  const route=(method,url,handler)=>app.route({method,url,handler:async(req,reply)=>{
    if(req.user?.role!=='admin')return reply.code(403).send({error:'仅管理员可管理采购业务'});
    if(!store)return reply.code(503).send({error:'采购服务暂不可用'});
    try{return{data:await handler(req)}}
    catch(e){
      if(!e.statusCode)req.log.error({err:e,url:req.url},'procurement route failed');
      return reply.code(e.statusCode||503).send({error:e.statusCode?e.message:(e.message||'采购服务暂不可用')});
    }
  }});
  route('GET','/api/procurement',()=>store.list());
  route('POST','/api/procurement/suppliers',req=>store.createSupplier(req.body||{}));
  route('POST','/api/procurement/quotations',req=>store.createQuotation(req.body||{}));
  route('DELETE','/api/procurement/quotations/:id',req=>store.deleteQuotation(req.params.id));
  route('POST','/api/procurement/quotations/:id/status',req=>store.quotationStatus(req.params.id,req.body?.status));
  route('POST','/api/procurement/purchase-orders',req=>store.createPurchaseOrder(req.body||{}));
  route('DELETE','/api/procurement/purchase-orders/:id',req=>store.deletePurchaseOrder(req.params.id));
  route('POST','/api/procurement/purchase-orders/:id/issue',req=>store.issue(req.params.id));
  route('POST','/api/procurement/purchase-orders/:id/confirm',req=>store.confirm(req.params.id,req.body||{}));
  route('POST','/api/procurement/purchase-orders/:id/receipts',req=>store.receive(req.params.id,req.body||{}));
  const portalError=(e,req,reply)=>{
    if(!e.statusCode)req.log.error({err:e,url:req.url},'supplier portal procurement failed');
    return reply.code(e.statusCode||503).send({error:e.statusCode?e.message:(e.message||'采购服务暂不可用')});
  };
  app.get('/api/portal/supplier/purchase-orders',{config:{portalRoles:['supplier']},handler:async(req,reply)=>{if(!store)return reply.code(503).send({error:'采购服务暂不可用'});try{return{data:await store.supplierOrders(req.user)}}catch(e){return portalError(e,req,reply)}}});
  app.post('/api/portal/supplier/purchase-orders/:id/confirm',{config:{portalRoles:['supplier']},handler:async(req,reply)=>{if(!store)return reply.code(503).send({error:'采购服务暂不可用'});try{return{data:await store.confirm(req.params.id,req.body||{},req.user.id)}}catch(e){return portalError(e,req,reply)}}});
}
module.exports={createProcurementStore,registerProcurementRoutes};
