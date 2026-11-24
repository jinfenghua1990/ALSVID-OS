const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

test('missing optional migrations are reported without hiding checksum errors', async t => {
  const dbPath = require.resolve('../db-pool'), servicePath = require.resolve('../postgres-service');
  const db = require(dbPath), original = db.createPool;
  const directory = path.join(__dirname, '../migrations');
  const migrations = fs.readdirSync(directory).filter(name => /^\d+_[a-z0-9_]+\.sql$/.test(name)).sort().map(name => ({ name, sha256: createHash('sha256').update(fs.readFileSync(path.join(directory, name))).digest('hex') }));
  const optional = ['117_product_colour_preferences.sql', '118_test_ride_enquiries.sql', '119_public_locations.sql', '120_public_location_source_links.sql', '121_dealer_application_source_archive.sql', '122_dealer_application_metadata.sql', '123_migration_source_immutability.sql', '124_test_ride_source_links.sql', '125_test_ride_location_authorization.sql'];
  let applied = migrations.filter(row => !optional.includes(row.name));
  db.createPool = () => ({
    async query(sql) {
      if (sql.includes("to_regclass('alsvid_v2.schema_migrations')")) return { rows: [{ ready: true }] };
      if (sql.includes('SELECT name,sha256 FROM alsvid_v2.schema_migrations')) return { rows: applied };
      if (sql.includes('SELECT 1 FROM alsvid_v2.products')) return { rows: [] };
      throw Error(`Unexpected query: ${sql}`);
    },
  });
  delete require.cache[servicePath];
  t.after(() => { db.createPool = original; delete require.cache[servicePath]; });
  const { createServiceStore } = require('../postgres-service');
  // 关闭 health 缓存：本用例要在同一实例上连续改变迁移状态并断言每次都实时反映。
  const store = createServiceStore('synthetic-only', { healthCacheTtlMs: 0 });
  assert.deepEqual((await store.health()).pendingOptionalMigrations, optional);
  applied = [...applied, { name: '117_product_colour_preferences.sql', sha256: 'incorrect' }];
  await assert.rejects(store.health(), error => error.code === 'ALSVID_MIGRATIONS_PENDING');
  applied = [...migrations.filter(row => row.name !== '120_public_location_source_links.sql'), { name: '120_public_location_source_links.sql', sha256: 'incorrect' }];
  await assert.rejects(store.health(), error => error.code === 'ALSVID_MIGRATIONS_PENDING');
  applied = migrations.filter(row => row.name !== '116_media_asset_folder.sql');
  await assert.rejects(store.health(), error => error.code === 'ALSVID_MIGRATIONS_PENDING');
});
