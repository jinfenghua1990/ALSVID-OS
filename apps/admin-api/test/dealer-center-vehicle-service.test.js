'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg');const {createAuth}=require('../auth');const {createPortalStore}=require('../portal');const {uuidv7}=require('../uuidv7');const {assertIsolatedTestDatabase}=require('./test-database');
test('dealer VIN and service authorization follow exact current membership',async()=>{
 const url=assertIsolatedTestDatabase().toString(),pool=new Pool({connectionString:url,options:'-c search_path=alsvid_v2'}),auth=createAuth(url),portal=createPortalStore(url);
 try{
  const dealer=await auth.createPortalUser({username:'vin-center-a',password:'password123',role:'dealer',reviewNote:'checked'},'test');
  const other=await auth.createPortalUser({username:'vin-center-b',password:'password123',role:'dealer',reviewNote:'checked'},'test');
  const a=(await portal.saveCompany({name:'VIN center A'})).after,b=(await portal.saveCompany({name:'VIN center B'})).after;
  await portal.assignCompany(dealer.id,{companyId:a.id,expectedCompanyId:null,reason:'verified'});await portal.assignCompany(other.id,{companyId:b.id,expectedCompanyId:null,reason:'verified'});
  const m=await portal.dealerCenterProfile(dealer),actor={...dealer,centerMembershipId:m.id};
  const vinId=uuidv7(),vin='LVNCENTER123456789';
  await pool.query('INSERT INTO vins(id,vin,model,factory,batch) VALUES($1,$2,$3,$4,$5)',[vinId,vin,'Test model','test','test']);
  const claim=await portal.requestVehicle(actor,{vin,note:'Delivery proof'},true);
  assert.equal((await portal.dealerCenterVehicles(actor)).length,0);
  assert.equal((await portal.dealerCenterVehicleRequests(other)).length,0);
  await portal.review(claim.id,{decision:'approve',note:'Verified'});
  assert.equal((await portal.dealerCenterVehicles(actor))[0].vin,vin);
  assert.equal((await portal.dealerCenterVehicles(other)).length,0);
  await assert.rejects(portal.requestService(other,{id:uuidv7(),vinId,description:'Brakes'},true),/尚未获得授权/);
  const s=await portal.requestService(actor,{id:uuidv7(),vinId,description:'Brakes'},true);
  assert.equal((await portal.dealerCenterServices(actor))[0].id,s.id);
  assert.equal((await portal.dealerCenterServices(other)).length,0);
  await portal.assignCompany(dealer.id,{companyId:b.id,expectedCompanyId:a.id,reason:'transfer'});
  assert.equal((await portal.dealerCenterVehicles(dealer)).length,0);
  assert.equal((await portal.dealerCenterServices(dealer)).length,0);
  await assert.rejects(portal.reviewService(s.id,{decision:'accept',note:'Reviewed'}),/企业关联已变化/);
 }finally{await Promise.all([portal.close(),auth.close(),pool.end()])}
});
