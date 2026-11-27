'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {uuidv7}=require('../uuidv7');
const {normalizeSlot,normalizeBooking,registerStoreAppointmentRoutes}=require('../store-appointments');
const {apiAccessHook}=require('../access-policy');
const Fastify=require('fastify');
test('slot times require explicit offset, future duration and bounded capacity',()=>{
 const b={locationId:uuidv7(),startsAt:'2026-12-01T10:00+01:00',endsAt:'2026-12-01T10:30+01:00',capacity:2},now=Date.parse('2026-11-27T00:00Z');
 assert.equal(normalizeSlot(b,now).startsAt,'2026-12-01T09:00:00.000Z');
 assert.throws(()=>normalizeSlot({...b,startsAt:'2026-12-01T10:00'},now));
 assert.throws(()=>normalizeSlot({...b,capacity:21},now));
});
test('booking requires consent and independent token',()=>{
 const b={id:uuidv7(),slotId:uuidv7(),name:'Customer',email:'USER@example.com',locale:'de',purpose:'test_ride',consent:true,token:'ab'.repeat(32)};
 assert.equal(normalizeBooking(b).email,'user@example.com');
 assert.notEqual(normalizeBooking(b).tokenHash,b.token);
 assert.throws(()=>normalizeBooking({...b,consent:false}));
 assert.throws(()=>normalizeBooking({...b,token:'short'}));
});
test('anonymous booking routes do not grant admin scheduling permissions',async t=>{
 const app=Fastify();t.after(()=>app.close());
 app.addHook('onRequest',apiAccessHook({user:async role=>role?{role}:null},r=>r.headers['test-role']));
 registerStoreAppointmentRoutes(app,{slots:async()=>[],book:async()=>({id:'test'}),adminList:async()=>({}),createSlot:async()=>({id:'test'})});
 assert.equal((await app.inject('/api/public/store-appointments/slots')).statusCode,200);
 assert.equal((await app.inject({method:'POST',url:'/api/public/store-appointments/book',payload:{}})).statusCode,200);
 assert.equal((await app.inject({method:'POST',url:'/api/store-appointments/slots',payload:{}})).statusCode,401);
 assert.equal((await app.inject({method:'POST',url:'/api/store-appointments/slots',headers:{'test-role':'viewer'},payload:{}})).statusCode,403);
 assert.equal((await app.inject({method:'POST',url:'/api/store-appointments/slots',headers:{'test-role':'admin'},payload:{}})).statusCode,200);
});

test('dealer appointment routes are restricted to dealer identity and forward no admin authority',async t=>{
 const app=Fastify(),calls=[];t.after(()=>app.close());
 app.addHook('onRequest',apiAccessHook({user:async role=>role?{role,id:'test-'+role}:null},r=>r.headers['test-role']));
 registerStoreAppointmentRoutes(app,{dealerList:async user=>({id:user.id}),createSlot:async(body,user)=>{calls.push([body,user]);return {id:'slot'}},change:async(id,body,guest,user)=>{calls.push([id,body,guest,user]);return {id}}});
 const path='/api/portal/dealer/center/store-appointments';
 assert.equal((await app.inject(path)).statusCode,401);
 for(const role of ['owner','admin','viewer','supplier'])assert.equal((await app.inject({url:path,headers:{'test-role':role}})).statusCode,403);
 assert.equal((await app.inject({url:path,headers:{'test-role':'dealer'}})).statusCode,200);
 assert.equal((await app.inject({method:'POST',url:path+'/slots',headers:{'test-role':'dealer'},payload:{membershipId:uuidv7()}})).statusCode,200);
 assert.equal(calls[0][1].role,'dealer');
 assert.equal((await app.inject({method:'POST',url:path+'/'+uuidv7()+'/status',headers:{'test-role':'dealer'},payload:{membershipId:uuidv7(),status:'confirmed'}})).statusCode,200);
 assert.equal(calls[1][2],false);assert.equal(calls[1][3].role,'dealer');
 assert.equal((await app.inject({method:'POST',url:'/api/store-appointments/slots',headers:{'test-role':'dealer'},payload:{}})).statusCode,403);
});
