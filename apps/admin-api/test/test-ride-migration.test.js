const { test }=require('node:test');
const assert=require('node:assert/strict');
const { migrateTestRides }=require('../test-ride-migration');
const source=()=>({id:'00000000-0000-4000-8000-000000000001',name:'Example',email:'person@example.invalid',country_code:'DE',city:'Berlin',model:'A1 Ultra',colour:'Blue',locale:'en',status:'CONTACTED',notification_state:'SENT',consent_at:'2026-01-01',created_at:'2026-01-01',updated_at:'2026-01-02',assigned_location_id:'00000000-0000-4000-8000-000000000002',mapped_location:'01890f3e-7b13-7aa9-b123-123456789abc',source_snapshot:{status:'CONTACTED'},existing_target:null});
function fake(rows){const calls=[];return {calls,async query(sql,params){calls.push({sql,params});if(sql.includes('FROM partners.test_ride_enquiries'))return {rows};return {rows:[]}}}}
test('test-ride migration preserves status, timestamps, location mapping and snapshot without mail',async()=>{
 const client=fake([source()]);assert.equal((await migrateTestRides(client,'operator')).imported,1);
 const record=client.calls.find(c=>c.sql.includes('INSERT INTO alsvid_v2.test_ride_enquiries'));
 assert.equal(record.params[8],'CONTACTED');assert.equal(record.params[9],'SENT');assert.equal(record.params[10],'2026-01-01');
 const link=client.calls.find(c=>c.sql.includes('INSERT INTO alsvid_v2.test_ride_migration_sources'));
 assert.equal(link.params[2],source().assigned_location_id);assert.equal(link.params[3],source().mapped_location);
 assert.deepEqual(JSON.parse(link.params[4]),source().source_snapshot);assert.equal(client.calls.at(-1).sql,'COMMIT');
});
test('missing location mapping and changed source fail before writes',async()=>{
 for(const row of [{...source(),mapped_location:null},{...source(),existing_target:'target',snapshot_matches:false}]){
  const client=fake([row]);await assert.rejects(migrateTestRides(client,'operator'));assert.equal(client.calls.some(c=>c.sql.includes('INSERT INTO')),false);assert.equal(client.calls.at(-1).sql,'ROLLBACK');
 }
});
