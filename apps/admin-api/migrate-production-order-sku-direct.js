'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { assertSharedCloudDatabase } = require('./db-pool');
const { loadRuntimeEnvironment } = require('./secret-bootstrap');

const names = [
  '134_production_order_sku_direct.sql',
  '135_production_order_sku_direct_uuid.sql',
  '136_production_order_items.sql',
  '137_remove_production_order_bom.sql',
];

async function migrateProductionOrderSkuDirect() {
  const env = loadRuntimeEnvironment();
  const url = new URL(env.DATABASE_URL_UNPOOLED || env.DIRECT_DATABASE_URL || env.DATABASE_URL);
  url.hostname = url.hostname.replace('-pooler.', '.');
  url.searchParams.set('sslmode', 'verify-full');
  assertSharedCloudDatabase(url.toString());
  const client = new Client({ connectionString: url.toString(), connectionTimeoutMillis: 180000 });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(874366105)');
    const applied = [];
    for (const name of names) {
      const sql = fs.readFileSync(path.join(__dirname, 'migrations', name), 'utf8');
      const sha256 = crypto.createHash('sha256').update(sql).digest('hex');
      const previous = (await client.query('SELECT sha256 FROM alsvid_v2.schema_migrations WHERE name=$1', [name])).rows[0];
      if (previous && previous.sha256 !== sha256) throw Error(`已执行的迁移文件不一致：${name}`);
      if (previous) continue;
      await client.query(sql.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, ''));
      await client.query('INSERT INTO alsvid_v2.schema_migrations(name,sha256) VALUES($1,$2)', [name, sha256]);
      applied.push(name);
    }
    await client.query('COMMIT');
    console.log(applied.length ? `生产订单 SKU 直连结构已提交：${applied.join(', ')}` : '生产订单 SKU 直连结构已存在');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) migrateProductionOrderSkuDirect().catch(error => {
  console.error(`生产订单 SKU 直连迁移失败：${error.message}`);
  process.exitCode = 1;
});

module.exports = { migrateProductionOrderSkuDirect };
