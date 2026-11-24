'use strict';

// 仅在明确授权后执行采购及其合作方、供应商门户依赖。
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { assertSharedCloudDatabase } = require('./db-pool');
const { loadRuntimeEnvironment } = require('./secret-bootstrap');

const names = ['126_shared_partners.sql', '127_procurement.sql', '128_supplier_portal.sql'];
async function migrateProcurement() {
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
    await client.query('SELECT 1 FROM alsvid_v2.schema_migrations LIMIT 0');
    for (const name of names) {
      const sql = fs.readFileSync(path.join(__dirname, 'migrations', name), 'utf8');
      const hash = crypto.createHash('sha256').update(sql).digest('hex');
      const previous = (await client.query('SELECT sha256 FROM alsvid_v2.schema_migrations WHERE name=$1', [name])).rows[0];
      if (previous) {
        if (previous.sha256 !== hash) throw Error(`已执行的迁移文件不一致：${name}`);
        continue;
      }
      await client.query(sql.replace(/^BEGIN;\s*$/m, '').replace(/^COMMIT;\s*$/m, ''));
      await client.query('INSERT INTO alsvid_v2.schema_migrations(name,sha256) VALUES($1,$2)', [name, hash]);
      console.log(`已准备 ${name}`);
    }
    await client.query('COMMIT');
    console.log('采购结构迁移已提交');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (require.main === module) migrateProcurement().catch(error => {
  console.error(`采购结构迁移失败：${error.message}`);
  process.exitCode = 1;
});
module.exports = { migrateProcurement };
