const { test } = require('node:test');
const assert = require('node:assert/strict');
const { archiveDealerApplications } = require('../dealer-application-migration');

function fake(rows) {
  const calls = [];
  return { calls, async query(sql, params) { calls.push({ sql, params }); if (sql.includes('FROM partners.dealer_applications')) return { rows }; return { rows: [] }; } };
}
const record = () => ({ source_id: '00000000-0000-4000-8000-000000000001', snapshot: { status: 'CONTACTED', consent_at: '2026-01-01', email: 'example@example.invalid' }, archived: false });

test('archive preserves original source without approving or creating V2 applications', async () => {
  const client = fake([record()]);
  assert.deepEqual(await archiveDealerApplications(client, 'operator'), { sourceCount: 1, archived: 1, alreadyArchived: 0 });
  const entry = client.calls.find(call => call.sql.includes('INSERT INTO alsvid_v2.dealer_application_source_archive'));
  assert.deepEqual(JSON.parse(entry.params[1]), record().snapshot);
  assert.equal(client.calls.some(call => /INSERT INTO alsvid_v2\.dealer_applications\b/.test(call.sql)), false);
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
});
test('matching records are skipped and changed source rolls back before writes', async () => {
  const old = { ...record(), archived: true, unchanged: true };
  const repeat = fake([old]);
  assert.equal((await archiveDealerApplications(repeat, 'operator')).alreadyArchived, 1);
  assert.equal(repeat.calls.some(call => /INSERT INTO/.test(call.sql)), false);
  const changed = fake([record(), { ...old, unchanged: false }]);
  await assert.rejects(archiveDealerApplications(changed, 'operator'), /changed/);
  assert.equal(changed.calls.some(call => /INSERT INTO/.test(call.sql)), false);
  assert.equal(changed.calls.at(-1).sql, 'ROLLBACK');
});
