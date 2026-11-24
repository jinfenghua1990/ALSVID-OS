const {test}=require('node:test');
const assert=require('node:assert/strict');
const {reconcileTestRides}=require('../test-ride-reconciliation');
test('test-ride reconciliation reports missing mappings and changed source without writing',async()=>{
 const calls=[];const client={async query(sql){calls.push(sql);if(sql.includes('FROM partners.test_ride_enquiries'))return {rows:[{total:2,unmapped:1,source_changed:0,location_unmapped:1,target_location_mismatch:0}]};if(sql.includes('FROM alsvid_v2.test_ride_migration_sources'))return {rows:[{total:1,source_missing:0,target_missing:0}]};return {rows:[]}}};
 const result=await reconcileTestRides(client);
 assert.equal(result.source.unmapped,1);assert.equal(result.source.location_unmapped,1);assert.equal(result.mapping.total,1);
 assert.equal(calls[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');assert.equal(calls.at(-1),'ROLLBACK');
 assert.ok(!calls.some(sql=>/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)));
});
