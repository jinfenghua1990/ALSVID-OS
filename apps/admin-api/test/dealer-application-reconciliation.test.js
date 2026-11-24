const { test } = require('node:test');
const assert = require('node:assert/strict');
const { reconcileDealerApplications } = require('../dealer-application-reconciliation');

test('application reconciliation reports missing or changed sources in a read-only transaction', async () => {
  const queries=[];
  const client={async query(sql){queries.push(sql);if(sql.includes('FROM partners.dealer_applications'))return {rows:[{total:3,unarchived:1,source_changed:1}]};if(sql.includes('FROM alsvid_v2.dealer_application_source_archive'))return {rows:[{total:2,source_missing:1}]};return {rows:[]}}};
  const result=await reconcileDealerApplications(client);
  assert.deepEqual(result,{source:{total:3,unarchived:1,source_changed:1},archive:{total:2,source_missing:1}});
  assert.equal(queries[0],'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(queries.at(-1),'ROLLBACK');
  assert.ok(!queries.some(sql=>/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)));
});
