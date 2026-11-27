'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {Pool}=require('pg');const {createAuth}=require('../auth');const {createPortalStore}=require('../portal');const {createStoreAppointments}=require('../store-appointments');const {uuidv7}=require('../uuidv7');const {assertIsolatedTestDatabase}=require('./test-database');
test('dealer slots and appointments stay within current authorized company and customer sharing consent',async()=>{
 const url=assertIsolatedTestDatabase().toString(),pool=new Pool({connectionString:url,options:'-c search_path=alsvid_v2'}),auth=createAuth(url),portal=createPortalStore(url),store=createStoreAppointments(url);
 try{
  const u=await auth.createPortalUser({username:'slot-center-a',password:'password123',role:'dealer',reviewNote:'checked'},'test');
  const v=await auth.createPortalUser({username:'slot-center-b',password:'password123',role:'dealer',reviewNote:'checked'},'test');
  const a=(await portal.saveCompany({name:'Slot company A'})).after,b=(await portal.saveCompany({name:'Slot company B'})).after;
  await portal.assignCompany(u.id,{companyId:a.id,expectedCompanyId:null,reason:'verified'});await portal.assignCompany(v.id,{companyId:b.id,expectedCompanyId:null,reason:'verified'});
  const m=await portal.dealerCenterProfile(u),n=await portal.dealerCenterProfile(v),location=uuidv7();
  await pool.query("INSERT INTO public_locations(id,name,country_code,city,address,sales,approved_for_publication,authorization_active) VALUES($1,'Slot test','DE','Berlin','Street 1',true,true,true)",[location]);
  await pool.query('INSERT INTO test_ride_location_authorizations(location_id,dealer_company_id,partner_active,dealer_authorized,test_ride_authorized) VALUES($1,$2,true,true,true)',[location,a.id]);
  const input={locationId:location,startsAt:new Date(Date.now()+86400000).toISOString(),endsAt:new Date(Date.now()+88200000).toISOString(),capacity:2,membershipId:m.id};
  await assert.rejects(store.createSlot({...input,membershipId:n.id},v),{statusCode:404});
  const slot=await store.createSlot(input,u);assert.equal((await store.dealerList(v)).slots.length,0);
  const booking=(email,share)=>({id:uuidv7(),slotId:slot.id,purpose:'test_ride',name:'Test guest',email,locale:'de',model:'A1',consent:true,dealerContactConsent:share,token:'ab'.repeat(32)});
  const x=await store.book(booking('slot-a@example.test',true)),y=await store.book(booking('slot-b@example.test',false));
  assert.equal((await store.dealerList(u)).bookings[0].id,x.id);assert.equal((await store.dealerList(u)).bookings.length,1);
  assert.equal((await store.dealerList(u)).slots[0].booked,2);assert.equal((await store.dealerList(v)).bookings.length,0);
  await assert.rejects(store.change(y.id,{status:'confirmed',version:y.version,membershipId:m.id},false,u),{statusCode:404});
  await assert.rejects(store.change(x.id,{status:'confirmed',version:x.version,membershipId:n.id},false,v),{statusCode:404});
  assert.equal((await store.change(x.id,{status:'confirmed',version:x.version,membershipId:m.id},false,u)).status,'confirmed');
  await assert.rejects(store.closeSlot(slot.id,v,{membershipId:n.id}),{statusCode:404});
  await pool.query('UPDATE test_ride_location_authorizations SET dealer_company_id=$2 WHERE location_id=$1',[location,b.id]);
  assert.equal((await store.dealerList(u)).bookings.length,0);assert.equal((await store.dealerList(v)).bookings.length,0);
  await assert.rejects(store.closeSlot(slot.id,u,{membershipId:m.id}),{statusCode:404});
 }finally{await Promise.all([pool.end(),auth.close(),portal.close(),store.close()])}
});
