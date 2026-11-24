const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reconcilePublicLocations } = require('../public-location-reconciliation');

test('reconciliation reports missing and changed source relationships without writes', async () => {
  const queries=[];
  const client={async query(sql){queries.push(sql);if(sql.includes('FROM partners.public_locations'))return {rows:[{total:3,unmapped:1,source_changed:1,missing_target:0,partner_changed:1,test_ride_authorization_changed:0}]};if(sql.includes('FROM alsvid_v2.public_location_migration_sources'))return {rows:[{total:2,source_missing:0,target_missing:0}]};return {rows:[]}}};
  const result=await reconcilePublicLocations(client);
  assert.equal(result.source.unmapped,1);
  assert.equal(result.source.partner_changed,1);
  assert.equal(result.mapping.total,2);
  assert.equal(queries[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(queries.at(-1),'ROLLBACK');
  assert.ok(!queries.some(query=>/^\s*(INSERT|UPDATE|DELETE)/i.test(query)));
});
