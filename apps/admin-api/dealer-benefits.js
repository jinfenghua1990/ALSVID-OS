'use strict';
const {createPool}=require('./db-pool');
const {uuidv7,isUuidv7}=require('./uuidv7');
const {currentActor}=require('./audit-context');
function fail(message,statusCode=400){throw Object.assign(Error(message),{statusCode})}
function textOf(value,max=2000){if(typeof value!=='string'||!value.trim()||value.length>max)fail('资料无效');return value.trim()}
function day(v){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail('日期无效');return v}
function amountOf(v){const s=String(v??'');if(!/^\d{1,12}(?:\.\d{1,2})?$/.test(s)||Number(s)<=0)fail('金额无效');return s}
function rateOf(v){const s=String(v??'');if(!/^\d{1,3}(?:\.\d{1,2})?$/.test(s))fail('返利比例无效');const [whole,frac='']=s.split('.'),n=Number(whole)*100+Number(frac.padEnd(2,'0'));if(n<0||n>10000)fail('返利比例无效');return n}
const orderBasis=`SELECT o.id,m.company_id AS "companyId",o.currency,(dr.received_at AT TIME ZONE 'Europe/Berlin')::date AS "receivedOn",
 GREATEST(0,COALESCE((SELECT sum(i.quantity*i.quoted_unit_price) FROM dealer_order_items i WHERE i.order_id=o.id),0)-COALESCE((SELECT sum(ri.received_quantity*oi.quoted_unit_price) FROM dealer_order_return_receipt_items ri JOIN dealer_order_return_receipts rc ON rc.id=ri.receipt_id JOIN dealer_order_return_requests rr ON rr.id=rc.request_id JOIN dealer_order_return_items di ON di.id=ri.return_item_id JOIN dealer_order_items oi ON oi.id=di.order_item_id WHERE rr.order_id=o.id AND ri.disposition IN ('restocked','not_restocked')),0))::numeric(18,2) AS basis,
 EXISTS(SELECT 1 FROM dealer_order_return_requests rr WHERE rr.order_id=o.id AND rr.status IN ('pending','approved')) AS "openReturn"
 FROM dealer_orders o JOIN dealer_order_receipts dr ON dr.order_id=o.id JOIN dealer_company_memberships m ON m.dealer_user_uuid=o.dealer_user_uuid AND m.started_at<=o.created_at AND (m.ended_at IS NULL OR o.created_at<m.ended_at)
 WHERE o.status='delivered' AND o.currency IN ('EUR','CNY') AND NOT EXISTS(SELECT 1 FROM dealer_order_items i WHERE i.order_id=o.id AND i.quoted_unit_price IS NULL)`;
function createDealerBenefits(url){
 const pool=createPool(url,{max:2});
 async function tx(fn){const c=await pool.connect();try{await c.query('BEGIN');const out=await fn(c);await c.query('COMMIT');return out}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}}
 async function audit(c,action,id,result){await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',[currentActor(),action,'dealer-benefits/'+id,JSON.stringify(result)])}
 async function company(c,id){if(!isUuidv7(id))fail('企业无效');if(!(await c.query('SELECT id FROM dealer_companies WHERE id=$1 FOR UPDATE',[id])).rowCount)fail('企业不存在',404)}
 async function member(c,user){if(user?.role!=='dealer'||!user.id)fail('经销商账号不可用',403);const m=(await c.query(`SELECT m.id,m.company_id AS "companyId" FROM dealer_company_memberships m JOIN app_users u ON u.entity_uuid=m.dealer_user_uuid WHERE u.id=$1 AND u.role='dealer' AND u.enabled AND m.ended_at IS NULL FOR SHARE OF m,u`,[user.id])).rows[0];if(!m)fail('尚未关联企业',403);return m}
 async function basis(c,companyId,orderId){
  // Lock the order used by payment and return workflows; then recompute the live basis.
  if(!(await c.query('SELECT id FROM dealer_orders WHERE id=$1 FOR UPDATE',[orderId])).rowCount)fail('订单不存在',404);
  const row=(await c.query(`SELECT * FROM (${orderBasis}) o WHERE o."companyId"=$1 AND o.id=$2`,[companyId,orderId])).rows[0];
  if(!row||row.currency!=='EUR'||row.openReturn||Number(row.basis)<=0)fail('订单不符合 EUR 返利条件或存在未完成退货',409);return row;
 }
 async function calculate(c,p,companyId,orderId){
  const o=await basis(c,companyId,orderId);
  const amount=(await c.query('SELECT round($1::numeric*$2::integer/10000,2)::text AS amount WHERE $3::date BETWEEN $4::date AND $5::date',[o.basis,p.rateBps,o.receivedOn,p.startsOn,p.endsOn])).rows[0]?.amount;
  if(!amount||Number(amount)<=0)fail('订单不符合政策日期或返利金额为零',409);return {basis:o.basis,amount};
 }
 const policyFields='id,title,rate_bps AS "rateBps",starts_on::text AS "startsOn",ends_on::text AS "endsOn",enabled,note';
 async function read(c,id,admin=false){
  const periods=(await c.query(`SELECT currency,to_char("receivedOn",'YYYY-MM') AS month,sum(basis)::text AS amount,count(*)::int AS orders FROM (${orderBasis}) o WHERE "companyId"=$1 GROUP BY currency,month ORDER BY month DESC,currency`,[id])).rows;
  const policies=(await c.query('SELECT '+policyFields+' FROM dealer_rebate_policies WHERE company_id=$1 '+(admin?'':'AND enabled ')+'ORDER BY starts_on DESC,id',[id])).rows;
  const awards=(await c.query(`SELECT a.id,a.kind,a.order_id AS "orderId",a.policy_id AS "policyId",a.basis::text,a.amount::text,a.note,a.status,a.review_note AS "reviewNote",a.created_at AS "createdAt",
   CASE WHEN a.kind='rebate' AND a.status='approved' THEN NOT EXISTS(SELECT 1 FROM (${orderBasis}) o WHERE o.id=a.order_id AND o."companyId"=a.company_id AND o.currency='EUR' AND NOT o."openReturn" AND o.basis=a.basis) ELSE false END AS "needsReview"
   FROM dealer_benefit_awards a WHERE a.company_id=$1 ORDER BY a.created_at DESC LIMIT 500`,[id])).rows;
  const ledger=(await c.query('SELECT id,award_id AS "awardId",kind,amount::text,note,created_at AS "createdAt" FROM dealer_benefit_ledger WHERE company_id=$1 ORDER BY created_at DESC LIMIT 500',[id])).rows;
  const summary=(await c.query(`SELECT COALESCE((SELECT sum(amount) FROM dealer_benefit_awards WHERE company_id=$1 AND status='pending'),0)::text AS pending,COALESCE((SELECT sum(amount) FROM dealer_benefit_ledger WHERE company_id=$1),0)::text AS balance,
   EXISTS(SELECT 1 FROM dealer_benefit_awards a WHERE a.company_id=$1 AND a.kind='rebate' AND a.status='approved' AND NOT EXISTS(SELECT 1 FROM (${orderBasis}) o WHERE o.id=a.order_id AND o."companyId"=a.company_id AND o.currency='EUR' AND NOT o."openReturn" AND o.basis=a.basis)) AS "frozen"`,[id])).rows[0];
  const eligible=admin?(await c.query(`SELECT id,basis::text,"receivedOn"::text AS "receivedOn" FROM (${orderBasis}) o WHERE "companyId"=$1 AND currency='EUR' AND basis>0 AND NOT "openReturn" AND NOT EXISTS(SELECT 1 FROM dealer_benefit_awards a WHERE a.order_id=o.id AND a.status IN ('pending','approved')) ORDER BY "receivedOn" DESC LIMIT 500`,[id])).rows:[];
  return {periods,policies,awards,ledger,summary,eligible};
 }
 return {
 async dealer(user){return tx(async c=>{const m=await member(c,user);return {membershipId:m.id,...await read(c,m.companyId)}})},
 async admin(id){if(!isUuidv7(id))fail('企业无效');return tx(async c=>{await company(c,id);return read(c,id,true)})},
 async createPolicy(id,input){
  const title=textOf(input.title,160),rateBps=rateOf(input.rate),startsOn=day(input.startsOn),endsOn=day(input.endsOn),note=String(input.note||'').trim();if(endsOn<startsOn||note.length>2000)fail('政策资料无效');
  return tx(async c=>{await company(c,id);const p=uuidv7();await c.query('INSERT INTO dealer_rebate_policies(id,company_id,title,rate_bps,starts_on,ends_on,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[p,id,title,rateBps,startsOn,endsOn,note,currentActor()]);await audit(c,'dealer.rebate.policy.create',p,{companyId:id,rateBps,enabled:false});return {id:p}});
 },
 async policyStatus(id,pid,input){if(!isUuidv7(pid)||typeof input.enabled!=='boolean')fail('政策资料无效');return tx(async c=>{await company(c,id);const p=(await c.query('SELECT starts_on,ends_on FROM dealer_rebate_policies WHERE id=$1 AND company_id=$2 FOR UPDATE',[pid,id])).rows[0];if(!p)fail('政策不存在',404);
  if(input.enabled&&(await c.query('SELECT 1 FROM dealer_rebate_policies WHERE company_id=$1 AND id<>$2 AND enabled AND starts_on<=$4 AND ends_on>=$3',[id,pid,p.starts_on,p.ends_on])).rowCount)fail('已启用政策日期重叠',409);
  await c.query('UPDATE dealer_rebate_policies SET enabled=$3 WHERE id=$1 AND company_id=$2',[pid,id,input.enabled]);await audit(c,'dealer.rebate.policy.status',pid,input);return {id:pid,enabled:input.enabled}})},
 async propose(id,input){
  const kind=input.kind,note=textOf(input.note);if(!['rebate','demo','exhibition','marketing'].includes(kind)||!isUuidv7(input.id))fail('权益资料无效');
  return tx(async c=>{await company(c,id);const old=(await c.query('SELECT id FROM dealer_benefit_awards WHERE id=$1',[input.id])).rows[0];if(old)fail('申请编号已使用，请刷新核对',409);
   let p=null,orderId=null,base=null,amount;
   if(kind==='rebate'){
    if(!isUuidv7(input.policyId)||!isUuidv7(input.orderId))fail('请选择有效政策及订单');
    p=(await c.query('SELECT '+policyFields+' FROM dealer_rebate_policies WHERE id=$1 AND company_id=$2 AND enabled',[input.policyId,id])).rows[0];if(!p)fail('政策未启用',409);
    orderId=input.orderId;const v=await calculate(c,p,id,orderId);base=v.basis;amount=v.amount;
    if((await c.query("SELECT 1 FROM dealer_benefit_awards WHERE order_id=$1 AND status IN ('pending','approved')",[orderId])).rowCount)fail('该订单已登记返利',409);
   }else amount=amountOf(input.amount);
   await c.query('INSERT INTO dealer_benefit_awards(id,company_id,policy_id,order_id,kind,basis,amount,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[input.id,id,p?.id||null,orderId,kind,base,amount,note,currentActor()]);await audit(c,'dealer.benefit.propose',input.id,{companyId:id,kind,amount});return {id:input.id,amount,status:'pending'};
  });
 },
 async review(id,aid,input){
  const status=input.status,note=textOf(input.note);if(!isUuidv7(aid)||!['approved','rejected','void'].includes(status))fail('审核资料无效');
  return tx(async c=>{await company(c,id);const a=(await c.query('SELECT * FROM dealer_benefit_awards WHERE id=$1 AND company_id=$2 FOR UPDATE',[aid,id])).rows[0];if(!a)fail('权益记录不存在',404);
   if(a.status===status){if(a.review_note!==note)fail('已处理，请刷新',409);return {id:aid,status}}
   if(!(a.status==='pending'&&['approved','rejected'].includes(status)||a.status==='approved'&&status==='void'))fail('当前状态不能审核',409);
   if(status==='approved'&&a.kind==='rebate'){
    const p=(await c.query('SELECT '+policyFields+' FROM dealer_rebate_policies WHERE id=$1 AND company_id=$2 AND enabled',[a.policy_id,id])).rows[0];if(!p)fail('政策未启用',409);
    const v=await calculate(c,p,id,a.order_id);if(v.basis!==a.basis||v.amount!==a.amount)fail('订单金额已变化，请拒绝后重新生成',409);
   }
   await c.query('UPDATE dealer_benefit_awards SET status=$3,review_note=$4,reviewed_at=now(),reviewed_by=$5 WHERE id=$1 AND company_id=$2',[aid,id,status,note,currentActor()]);
   if(status==='approved'||status==='void')await c.query('INSERT INTO dealer_benefit_ledger(id,company_id,award_id,kind,amount,note,created_by) VALUES($1,$2,$3,$4,$5::numeric,$6,$7)',[uuidv7(),id,aid,status==='approved'?'credit':'reversal',status==='approved'?a.amount:'-'+a.amount,note,currentActor()]);
   await audit(c,'dealer.benefit.review',aid,{status,note});return {id:aid,status};
  });
 },close:()=>pool.end()};
}
function registerDealerBenefitsRoutes(app,store){
 const route=(method,url,handler,dealer=false)=>app.route({method,url,config:dealer?{portalRoles:['dealer']}:{},bodyLimit:16384,handler:async(req,reply)=>{
  reply.header('Cache-Control','no-store');if(req.user?.role!==(dealer?'dealer':'admin'))return reply.code(403).send({error:'没有访问权限'});
  if(!store)return reply.code(503).send({error:'权益服务暂不可用'});
  try{return await handler(req)}catch(e){return reply.code(e.statusCode||(e.code==='23505'?409:500)).send({error:e.statusCode?e.message:'权益操作失败，请刷新核对'})}
 }});
 const p='/api/portal-management/dealer-benefits/:companyId';
 route('GET','/api/portal/dealer/center/benefits',r=>store.dealer(r.user),true);
 route('GET',p,r=>store.admin(r.params.companyId));
 route('POST',p+'/policies',r=>store.createPolicy(r.params.companyId,r.body||{}));
 route('POST',p+'/policies/:id/status',r=>store.policyStatus(r.params.companyId,r.params.id,r.body||{}));
 route('POST',p+'/awards',r=>store.propose(r.params.companyId,r.body||{}));
 route('POST',p+'/awards/:id/review',r=>store.review(r.params.companyId,r.params.id,r.body||{}));
}
module.exports={createDealerBenefits,registerDealerBenefitsRoutes,rateOf};
