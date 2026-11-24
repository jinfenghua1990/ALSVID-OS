const { test } = require('node:test');
const assert = require('node:assert/strict');
const { previewPublicLocations } = require('../public-location-migration-preview');

test('migration preview uses a read-only snapshot and handles an unmigrated target', async () => {
  const queries = [];
  const client = { async query(sql) { queries.push(sql); if (sql.includes('FROM partners.public_locations')) return { rows: [{ total: 2, non_v7_ids: 2 }] }; if (sql.includes('to_regclass')) return { rows: [{ present: false }] }; return { rows: [] }; } };
  const result = await previewPublicLocations(client);
  assert.equal(result.source.total, 2);
  assert.equal(result.source.non_v7_ids, 2);
  assert.equal(result.target, null);
  assert.equal(result.mapping, null);
  assert.equal(queries[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.ok(!queries.some(sql => /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)));
});
