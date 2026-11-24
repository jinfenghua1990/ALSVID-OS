const { test } = require('node:test');
const assert = require('node:assert/strict');
const { previewDealerApplications } = require('../dealer-application-migration-preview');

test('dealer application preview is read-only and does not return contact details', async () => {
  const queries = [];
  const client = { async query(sql) { queries.push(sql); if (sql.includes('partners.dealer_applications')) return { rows: [{ total: 3, new: 1, reviewing: 1, contacted: 0, closed: 1, non_v7_ids: 3 }] }; if (sql.includes('alsvid_v2.dealer_applications')) return { rows: [{ total: 2 }] }; return { rows: [] }; } };
  const result = await previewDealerApplications(client);
  assert.equal(result.source.total, 3);
  assert.equal(result.target.total, 2);
  assert.ok(result.warnings.includes('source_has_no_phone'));
  assert.equal(queries[0], 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.equal(queries.at(-1), 'ROLLBACK');
  assert.ok(!queries.some(sql => /^\s*(INSERT|UPDATE|DELETE)/i.test(sql)));
});
