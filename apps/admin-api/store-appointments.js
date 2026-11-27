'use strict';
const {createHash}=require('node:crypto');
const {createPool}=require('./db-pool');
const {uuidv7,isUuidv7}=require('./uuidv7');
const {emailOf}=require('./consumer-registration');
const {currentActor}=require('./audit-context');
function fail(message,statusCode=400){throw Object.assign(Error(message),{statusCode})}
const hash=s=>createHash('sha256').update(s).digest('hex');
function tokenHash(token){if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))fail('预约凭证无效',404);return hash(token)}
function bounded(value,max,required=false){if(typeof value!=='string'||value.length>max||/[\x00-\x1f\x7f]/.test(value)||required&&!value.trim())fail('预约资料无效');return value.trim()}
function normalizeBooking(b){
 if(!isUuidv7(b.id)||!isUuidv7(b.slotId)||!['test_ride','store_visit'].includes(b.purpose)||!['zh','de','en'].includes(b.locale)||b.consent!==true)fail('预约资料无效');
 return {id:b.id.toLowerCase(),slotId:b.slotId.toLowerCase(),purpose:b.purpose,locale:b.locale,name:bounded(b.name,80,true),email:emailOf(b.email),model:bounded(b.model||'',80),tokenHash:tokenHash(b.token)};
}
function normalizeSlot(b,now=Date.now()){
 const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(x)?Date.parse(x):NaN;
 const start=date(b.startsAt),end=date(b.endsAt);
 if(!isUuidv7(b.locationId)||!Number.isSafeInteger(b.capacity)||b.capacity<1||b.capacity>20||!Number.isFinite(start)||!Number.isFinite(end)||start<=now||start>now+90*86400000||end-start<15*60000||end-start>8*3600000)fail('时段、容量或网点无效');
 return {locationId:b.locationId,startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString(),capacity:b.capacity};
}
const eligible='l.approved_for_publication AND l.authorization_active AND l.sales AND a.partner_active AND a.dealer_authorized AND a.test_ride_authorized';
const projection='b.id,b.slot_id AS "slotId",b.purpose,b.status,b.version,s.starts_at AS "startsAt",s.ends_at AS "endsAt",l.name AS "locationName",l.city,l.country_code AS country,l.address';
const joins='FROM store_appointments b JOIN test_ride_slots s ON s.id=b.slot_id JOIN public_locations l ON l.id=s.location_id';
function createStoreAppointments(url){
 const pool=createPool(url,{max:2});
 async function tx(fn){const c=await pool.connect();try{await c.query('BEGIN');const r=await fn(c);await c.query('COMMIT');return r}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}}
 async function audit(c,action,id,after,actor=currentActor()){await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',[actor,action,'store-appointments/'+id,JSON.stringify(after)])}
 async function authorized(c,id){return (await c.query(`SELECT a.dealer_company_id FROM public_locations l JOIN test_ride_location_authorizations a ON a.location_id=l.id WHERE l.id=$1 AND ${eligible} FOR UPDATE OF l,a`,[id])).rows[0]}
 return {
 async slots(){return (await pool.query(`SELECT s.id,s.location_id AS "locationId",l.name AS "locationName",l.city,l.country_code AS country,l.address,s.starts_at AS "startsAt",s.ends_at AS "endsAt",s.capacity-count(b.id)::int AS remaining FROM test_ride_slots s JOIN public_locations l ON l.id=s.location_id JOIN test_ride_location_authorizations a ON a.location_id=l.id AND a.dealer_company_id=s.dealer_company_id LEFT JOIN store_appointments b ON b.slot_id=s.id AND b.status IN ('pending','confirmed') WHERE s.active AND s.starts_at>now() AND s.starts_at<now()+interval '60 days' AND ${eligible} GROUP BY s.id,l.id HAVING count(b.id)<s.capacity ORDER BY s.starts_at LIMIT 500`)).rows},
 async adminList(){const [slots,bookings]=await Promise.all([pool.query(`SELECT s.id,s.location_id AS "locationId",l.name AS "locationName",s.starts_at AS "startsAt",s.ends_at AS "endsAt",s.capacity,s.active,COALESCE(${eligible} AND a.dealer_company_id=s.dealer_company_id,false) AS eligible FROM test_ride_slots s JOIN public_locations l ON l.id=s.location_id LEFT JOIN test_ride_location_authorizations a ON a.location_id=l.id WHERE s.ends_at>now()-interval '30 days' ORDER BY s.starts_at LIMIT 500`),pool.query(`SELECT ${projection},b.name,b.email,b.model,b.note,b.created_at AS "createdAt" ${joins} ORDER BY b.created_at DESC LIMIT 200`)]);return {slots:slots.rows,bookings:bookings.rows}},
 async createSlot(input){const b=normalizeSlot(input);return tx(async c=>{
  const a=await authorized(c,b.locationId);if(!a)fail('网点未获得试骑授权',409);
  if((await c.query('SELECT 1 FROM test_ride_slots WHERE location_id=$1 AND active AND starts_at<$3 AND ends_at>$2 LIMIT 1',[b.locationId,b.startsAt,b.endsAt])).rowCount)fail('网点时段重叠',409);
  const id=uuidv7();await c.query('INSERT INTO test_ride_slots(id,location_id,dealer_company_id,starts_at,ends_at,capacity,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,b.locationId,a.dealer_company_id,b.startsAt,b.endsAt,b.capacity,currentActor()]);await audit(c,'appointment.slot.create',id,b);return {id};
 })},
 async closeSlot(id){if(!isUuidv7(id))fail('时段无效');return tx(async c=>{
  const s=(await c.query('SELECT id FROM test_ride_slots WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!s)fail('时段不存在',404);
  await c.query('UPDATE test_ride_slots SET active=false WHERE id=$1',[id]);await audit(c,'appointment.slot.close',id,{active:false});return {id};
 })},
 async book(input){const b=normalizeBooking(input),{tokenHash:credential,...details}=b,requestHash=hash(JSON.stringify(details));return tx(async c=>{
  await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['appointment:'+b.id]);
  const prior=(await c.query('SELECT token_hash,request_hash FROM store_appointments WHERE id=$1',[b.id])).rows[0];
  if(prior){if(prior.token_hash!==credential||prior.request_hash!==requestHash)fail('预约编号已使用',409);return (await c.query(`SELECT ${projection} ${joins} WHERE b.id=$1`,[b.id])).rows[0]}
  await c.query('SELECT pg_advisory_xact_lock(912603331)');
  const counts=(await c.query("SELECT count(*)::int AS total,count(*) FILTER(WHERE email=$1)::int AS email FROM store_appointments WHERE created_at>now()-interval '1 hour'",[b.email])).rows[0];
  if(counts.total>=100||counts.email>=3)fail('申请过于频繁',429);
  const found=(await c.query('SELECT location_id FROM test_ride_slots WHERE id=$1',[b.slotId])).rows[0];if(!found)fail('时段不存在',404);
  const a=await authorized(c,found.location_id);if(!a)fail('网点暂停预约',409);
  const s=(await c.query('SELECT capacity,active,dealer_company_id,starts_at>now() AS future FROM test_ride_slots WHERE id=$1 FOR UPDATE',[b.slotId])).rows[0];
  if(!s?.active||!s.future||s.dealer_company_id!==a.dealer_company_id)fail('时段已关闭',409);
  const count=(await c.query("SELECT count(*)::int AS n FROM store_appointments WHERE slot_id=$1 AND status IN ('pending','confirmed')",[b.slotId])).rows[0].n;
  if(count>=s.capacity)fail('时段已约满',409);
  if((await c.query("SELECT 1 FROM store_appointments WHERE slot_id=$1 AND email=$2 AND status IN ('pending','confirmed')",[b.slotId,b.email])).rowCount)fail('该邮箱已预约此时段',409);
  await c.query('INSERT INTO store_appointments(id,slot_id,purpose,name,email,model,locale,token_hash,request_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[b.id,b.slotId,b.purpose,b.name,b.email,b.model,b.locale,credential,requestHash]);
  await audit(c,'appointment.request',b.id,{slotId:b.slotId,purpose:b.purpose,status:'pending'},'public applicant');
  return (await c.query(`SELECT ${projection} ${joins} WHERE b.id=$1`,[b.id])).rows[0];
 })},
 async lookup(input){if(!isUuidv7(input.id))fail('预约不存在',404);const row=(await pool.query(`SELECT ${projection} ${joins} WHERE b.id=$1 AND b.token_hash=$2`,[input.id,tokenHash(input.token)])).rows[0];if(!row)fail('预约不存在',404);return row},
 async change(id,input,guest=false){
  if(!isUuidv7(id)||!['confirmed','cancelled','completed'].includes(input.status)||guest&&input.status!=='cancelled')fail('预约状态无效');
  if(!guest&&(!Number.isSafeInteger(input.version)||input.version<1))fail('预约版本无效');
  const note=guest?'客户取消':bounded(input.note||'',1000),credential=guest?tokenHash(input.token):null;
  return tx(async c=>{
   const found=(await c.query('SELECT b.slot_id,s.location_id FROM store_appointments b JOIN test_ride_slots s ON s.id=b.slot_id WHERE b.id=$1',[id])).rows[0];if(!found)fail('预约不存在',404);
   const a=input.status==='confirmed'?await authorized(c,found.location_id):null;
   const s=(await c.query('SELECT dealer_company_id,active,starts_at>now() AS future,starts_at<=now() AS started FROM test_ride_slots WHERE id=$1 FOR UPDATE',[found.slot_id])).rows[0];
   const b=(await c.query('SELECT status,version,token_hash FROM store_appointments WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(guest&&b.token_hash!==credential)fail('预约不存在',404);
   if(b.status===input.status)return {id,status:b.status,version:b.version};
   if(!guest&&b.version!==input.version)fail('记录已更新',409);
   const allowed={pending:['confirmed','cancelled'],confirmed:['cancelled','completed'],cancelled:[],completed:[]};
   if(!allowed[b.status].includes(input.status)||guest&&!s.future)fail('当前状态不能执行此操作',409);
   if(input.status==='confirmed'&&(!a||!s.active||!s.future||a.dealer_company_id!==s.dealer_company_id))fail('网点授权或时段已失效',409);
   if(input.status==='completed'&&!s.started)fail('预约尚未开始',409);
   const result=(await c.query('UPDATE store_appointments SET status=$2,note=$3,version=version+1,updated_at=now() WHERE id=$1 RETURNING id,status,version',[id,input.status,note])).rows[0];
   await audit(c,'appointment.status',id,{previous:b.status,status:result.status},guest?'public applicant':currentActor());return result;
  })
 },close:()=>pool.end()};
}
function registerStoreAppointmentRoutes(app,store){
 const route=(method,url,publicRoute,handler)=>app.route({method,url,config:publicRoute?{publicStoreAppointment:true}:{},bodyLimit:4096,handler:async(req,reply)=>{
  reply.header('Cache-Control','no-store');if(!publicRoute&&req.user?.role!=='admin')return reply.code(403).send({error:'仅管理员可管理预约'});
  if(!store)return reply.code(503).send({error:'预约服务暂不可用'});
  try{return {data:await handler(req)}}catch(e){return reply.code(e.statusCode||503).send({error:e.statusCode?e.message:'预约服务暂不可用'})}
 }});
 route('GET','/api/public/store-appointments/slots',true,()=>store.slots());
 route('POST','/api/public/store-appointments/book',true,r=>store.book(r.body||{}));
 route('POST','/api/public/store-appointments/lookup',true,r=>store.lookup(r.body||{}));
 route('POST','/api/public/store-appointments/cancel',true,r=>store.change(r.body?.id,{...r.body,status:'cancelled'},true));
 route('GET','/api/store-appointments',false,()=>store.adminList());
 route('POST','/api/store-appointments/slots',false,r=>store.createSlot(r.body||{}));
 route('POST','/api/store-appointments/slots/:id/close',false,r=>store.closeSlot(r.params.id));
 route('POST','/api/store-appointments/:id/status',false,r=>store.change(r.params.id,r.body||{}));
}
module.exports={createStoreAppointments,registerStoreAppointmentRoutes,normalizeBooking,normalizeSlot};
