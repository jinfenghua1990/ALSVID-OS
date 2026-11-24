const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Pool}=require('pg');
const {createServiceStore}=require('../postgres-service');
const {uuidv7}=require('../uuidv7');

test('repair quotes require acceptance for capped, auditable manual payments',async()=>{
 const url=process.env.TEST_DATABASE_URL;assert(url,'isolated database required');
 const pool=new Pool({connectionString:url,options:'-c search_path=alsvid_v2'}),service=createServiceStore(url);
 try{
  await pool.query("INSERT INTO vins(id,vin,model,factory,batch) VALUES('finance-vin','LTEST123456789011','Test','F','B')");
  const repair=(await pool.query("INSERT INTO repairs(id,work_order_no,vin,type,fault,status) VALUES('finance-repair','WO-FINANCE','LTEST123456789011','收费维修','Test fault','待收货') RETURNING entity_uuid")).rows[0];
  const q=await service.createRepairQuote('finance-repair',{currency:'EUR',laborMinor:1000,partsMinor:2500,otherMinor:500,note:'Initial'});
  const q2=await service.createRepairQuote('finance-repair',{currency:'EUR',laborMinor:1200,partsMinor:2500,otherMinor:500,note:'Revised'});
  assert.equal(q.revision,1);assert.equal(q2.revision,2);
  const pay={id:uuidv7(),amountMinor:2000,method:'bank_transfer',reference:'FIN-REF-1',receivedOn:'2026-11-08',note:'Paid',verified:true};
  await assert.rejects(service.recordRepairPayment('finance-repair',q.id,pay),/接受报价后/);
  await service.decideRepairQuote('finance-repair',q.id,{decision:'accepted',note:'Confirmed'});
  await assert.rejects(service.recordRepairPayment('finance-repair',q.id,{...pay,amountMinor:5000}),/超过报价总额/);
  await service.recordRepairPayment('finance-repair',q.id,pay);
  await service.recordRepairPayment('finance-repair',q.id,pay);
  await assert.rejects(service.recordRepairPayment('finance-repair',q.id,{...pay,amountMinor:1999}),/收款编号已用于其他内容/);
  await assert.rejects(service.recordRepairPayment('finance-repair',q.id,{...pay,id:uuidv7()}),{code:'23505'});
  await assert.rejects(service.recordRepairPayment('finance-repair',q.id,{...pay,id:uuidv7(),amountMinor:2501,reference:'FIN-REF-2'}),/超过报价总额/);
  const history=await service.repairFinance('finance-repair');assert.equal(history.length,2);const accepted=history.find(x=>x.id===q.id);assert.equal(accepted.decision.decision,'accepted');assert.equal(accepted.payments.length,1);assert.equal(accepted.totalMinor,'4000');
  await assert.rejects(pool.query('UPDATE repair_quotes SET note=$1 WHERE id=$2',['changed',q.id]),{code:'23514'});
  await assert.rejects(pool.query('DELETE FROM repair_payments WHERE id=$1',[pay.id]),{code:'23514'});
  await assert.rejects(service.createRepairQuote('missing',{currency:'EUR',laborMinor:0,partsMinor:0,otherMinor:0}),/工单不存在/);
 }finally{await service.close();await pool.end()}
});
