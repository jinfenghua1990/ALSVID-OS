const { test } = require('node:test');
const assert = require('node:assert/strict');

test('dealer application records consent and partnership details atomically', async t => {
  const dbPath=require.resolve('../db-pool'), modulePath=require.resolve('../dealer-applications');
  const db=require(dbPath), original=db.createPool, calls=[];
  db.createPool=()=>({async connect(){return {async query(sql,params=[]){calls.push({sql,params});if(sql.startsWith('SELECT id,company_name'))return {rows:[]};if(sql.startsWith('INSERT INTO dealer_applications('))return {rows:[{id:params[0],status:'pending',createdAt:'synthetic'}]};return {rows:[]};},release(){}}},async end(){}});
  delete require.cache[modulePath];
  t.after(()=>{db.createPool=original;delete require.cache[modulePath]});
  const store=require('../dealer-applications').createDealerApplications('synthetic-only');
  const input={id:'01890f3e-7b13-7aa9-b123-123456789abc',companyName:'Example',country:'DE',contactName:'Example',contactPhone:'123',contactEmail:'example@example.invalid',formMetadata:{partnershipType:'service',locale:'de',consent:true}};
  await assert.rejects(store.submit({...input,formMetadata:{...input.formMetadata,consent:false}}),/资料无效/);
  assert.equal(calls.length,0);
  await store.submit(input);
  const metadata=calls.find(call=>call.sql.startsWith('INSERT INTO dealer_application_metadata'));
  assert.deepEqual(metadata.params,[input.id,'service','de']);
  assert.equal(calls.at(-1).sql,'COMMIT');
});

test('application metadata lookup returns null for older applications', async t => {
  const dbPath=require.resolve('../db-pool'), modulePath=require.resolve('../dealer-applications');
  const db=require(dbPath), original=db.createPool, seen=[];
  db.createPool=()=>({async query(sql,params){seen.push({sql,params});return {rows:[]}},async end(){}});
  delete require.cache[modulePath];
  t.after(()=>{db.createPool=original;delete require.cache[modulePath]});
  const store=require('../dealer-applications').createDealerApplications('synthetic-only');
  const id='01890f3e-7b13-7aa9-b123-123456789abc';
  assert.equal(await store.metadata(id),null);
  assert.deepEqual(seen[0].params,[id]);
  await assert.rejects(store.metadata('invalid'),/编号无效/);
});

test('retry accepts matching metadata and rejects changed partnership details', async t => {
  const dbPath=require.resolve('../db-pool'), modulePath=require.resolve('../dealer-applications');
  const db=require(dbPath), original=db.createPool, calls=[];
  const id='01890f3e-7b13-7aa9-b123-123456789abc';
  const old={id,status:'pending',createdAt:'synthetic',companyName:'Example',country:'DE',taxId:'',address:'',contactName:'Example',contactPhone:'123',contactEmail:'example@example.invalid',website:'',note:''};
  db.createPool=()=>({async connect(){return {async query(sql,params=[]){calls.push({sql,params});if(sql.startsWith('SELECT id,company_name'))return {rows:[old]};if(sql.startsWith('SELECT partnership_type'))return {rows:[{partnershipType:'service',locale:'de'}]};return {rows:[]};},release(){}}},async end(){}});
  delete require.cache[modulePath];
  t.after(()=>{db.createPool=original;delete require.cache[modulePath]});
  const store=require('../dealer-applications').createDealerApplications('synthetic-only');
  const input={...old,formMetadata:{partnershipType:'service',locale:'de',consent:true}};
  assert.equal((await store.submit(input)).id,id);
  assert.equal(calls.some(call=>call.sql.startsWith('INSERT INTO dealer_application_metadata')),false);
  calls.length=0;
  await assert.rejects(store.submit({...input,formMetadata:{...input.formMetadata,partnershipType:'retail'}}),error=>error.code==='VERSION_CONFLICT');
  assert.equal(calls.at(-1).sql,'ROLLBACK');
});
