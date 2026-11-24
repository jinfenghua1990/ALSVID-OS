const { test } = require('node:test');
const assert = require('node:assert/strict');
const { migratePublicLocations } = require('../public-location-migration');

const source = () => ({ source_id: '00000000-0000-4000-8000-000000000001', partner_id: '00000000-0000-4000-8000-000000000002', test_ride_authorized: true, display_name: 'Example', country_code: 'DE', city: 'Berlin', address: 'Example street', sales_authorized: true, service_authorized: false, source_snapshot: { id: 'source' }, target_id: null });
function fake(rows) {
  const calls = [];
  return { calls, async query(sql, params) { calls.push({ sql, params }); if (sql.includes('FROM partners.public_locations')) return { rows }; return { rows: [] }; } };
}

test('migration retains source mapping and never auto-publishes', async () => {
  const client = fake([source()]);
  assert.deepEqual(await migratePublicLocations(client, 'operator'), { sourceCount: 1, imported: 1, alreadyMapped: 0 });
  const insert = client.calls.find(call => call.sql.includes('INSERT INTO alsvid_v2.public_locations'));
  assert.match(insert.sql, /false,false/);
  const mapping = client.calls.find(call => call.sql.includes('INSERT INTO alsvid_v2.public_location_migration_sources'));
  assert.equal(mapping.params[0], source().source_id);
  assert.equal(mapping.params[2], source().partner_id);
  assert.equal(mapping.params[3], true);
  assert.deepEqual(JSON.parse(mapping.params[4]), source().source_snapshot);
  assert.equal(client.calls.at(-1).sql, 'COMMIT');
});

test('migration detects source changes before inserting and skips matching mappings', async () => {
  const mapped = { ...source(), target_id: '01890f3e-7b13-7aa9-b123-123456789abc', snapshot_matches: true };
  const replay = fake([mapped]);
  assert.equal((await migratePublicLocations(replay, 'operator')).alreadyMapped, 1);
  assert.equal(replay.calls.some(call => call.sql.includes('INSERT INTO')), false);
  const changed = fake([source(), { ...mapped, snapshot_matches: false }]);
  await assert.rejects(migratePublicLocations(changed, 'operator'), /changed/);
  assert.equal(changed.calls.some(call => call.sql.includes('INSERT INTO')), false);
  assert.equal(changed.calls.at(-1).sql, 'ROLLBACK');
});
