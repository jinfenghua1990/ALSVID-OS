const {test}=require('node:test');
const assert=require('node:assert/strict');
const Fastify=require('fastify');
const {apiAccessHook}=require('../access-policy');
const {registerTestRideAssignmentRoutes}=require('../test-ride-assignments');
const id='01890f3e-7b13-7aa9-b123-123456789abc',location='01890f3e-7b13-7aa9-b123-123456789abd';
test('only administrators may assign test-ride enquiries',async t=>{
 let calls=0;const app=Fastify();app.addHook('onRequest',apiAccessHook({user:async role=>role?{role}:null},req=>req.headers['test-role']));
 registerTestRideAssignmentRoutes(app,{async assign(){calls++;return {version:2}}});t.after(()=>app.close());
 const send=role=>app.inject({method:'PUT',url:`/api/test-rides/${id}/assignment`,headers:role?{'test-role':role}:{},payload:{locationId:location,version:1}});
 for(const role of [null,'owner','dealer','viewer'])assert.notEqual((await send(role)).statusCode,200);
 assert.equal((await send('admin')).statusCode,200);assert.equal(calls,1);
});
test('assignment checks authorization, country and version before writing',async t=>{
 const dbPath=require.resolve('../db-pool'),modulePath=require.resolve('../test-ride-assignments');const db=require(dbPath),original=db.createPool,calls=[];let country='AT';
 db.createPool=()=>({async connect(){return {async query(sql){calls.push(sql);if(sql.includes('FROM public_locations l JOIN'))return {rows:[{id:location,country_code:'DE'}]};if(sql.startsWith('SELECT country_code,status'))return {rows:[{country_code:country,status:'NEW',version:1,assigned_location_id:null}]};if(sql.startsWith('UPDATE test_ride_enquiries'))return {rows:[{version:2}]};return {rows:[]}},release(){}}},async end(){}});
 delete require.cache[modulePath];t.after(()=>{db.createPool=original;delete require.cache[modulePath]});const store=require('../test-ride-assignments').createTestRideAssignments('synthetic-only');
 await assert.rejects(store.assign(id,{locationId:location,version:1}),error=>error.statusCode===409);assert.equal(calls.some(sql=>sql.startsWith('UPDATE test_ride_enquiries')),false);
 calls.length=0;country='DE';assert.equal((await store.assign(id,{locationId:location,version:1})).version,2);assert.ok(calls.some(sql=>sql.startsWith('INSERT INTO test_ride_assignment_events')));assert.equal(calls.at(-1),'COMMIT');
});
test('changing the authorized dealer clears open assignments and records history',async t=>{
 const dbPath=require.resolve('../db-pool'),modulePath=require.resolve('../test-ride-assignments');const db=require(dbPath),original=db.createPool,calls=[];
 db.createPool=()=>({async connect(){return {async query(sql){calls.push(sql);if(sql.startsWith('SELECT approved_for_publication'))return {rows:[{approved_for_publication:true,authorization_active:true}]};if(sql.startsWith('SELECT revision,dealer_company_id'))return {rows:[{revision:1,dealer_company_id:id}]};if(sql.startsWith('SELECT 1 FROM dealer_companies'))return {rowCount:1,rows:[{}]};if(sql.startsWith('UPDATE test_ride_location_authorizations'))return {rows:[{revision:2}]};if(sql.startsWith('UPDATE test_ride_enquiries'))return {rows:[{id}]};return {rows:[]}},release(){}}},async end(){}});
 delete require.cache[modulePath];t.after(()=>{db.createPool=original;delete require.cache[modulePath]});const store=require('../test-ride-assignments').createTestRideAssignments('synthetic-only');
 await store.authorize(location,{dealerCompanyId:location,partnerActive:true,dealerAuthorized:true,testRideAuthorized:true,revision:1});
 assert.ok(calls.some(sql=>sql.startsWith('UPDATE test_ride_enquiries')));assert.ok(calls.some(sql=>sql.startsWith('INSERT INTO test_ride_assignment_events')));assert.equal(calls.at(-1),'COMMIT');
});
test('unpublished locations cannot receive test-ride authorization',async t=>{
 const dbPath=require.resolve('../db-pool'),modulePath=require.resolve('../test-ride-assignments');const db=require(dbPath),original=db.createPool,calls=[];
 db.createPool=()=>({async connect(){return {async query(sql){calls.push(sql);if(sql.startsWith('SELECT approved_for_publication'))return {rows:[{approved_for_publication:false,authorization_active:true}]};if(sql.startsWith('SELECT revision,dealer_company_id'))return {rows:[]};if(sql.startsWith('SELECT 1 FROM dealer_companies'))return {rowCount:1,rows:[{}]};return {rows:[]}},release(){}}},async end(){}});
 delete require.cache[modulePath];t.after(()=>{db.createPool=original;delete require.cache[modulePath]});const store=require('../test-ride-assignments').createTestRideAssignments('synthetic-only');
 await assert.rejects(store.authorize(location,{dealerCompanyId:id,partnerActive:true,dealerAuthorized:true,testRideAuthorized:true,revision:0}),error=>error.statusCode===409);
 assert.equal(calls.some(sql=>sql.startsWith('INSERT INTO test_ride_location_authorizations')),false);assert.equal(calls.at(-1),'ROLLBACK');
});
