'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { assertApplicationDatabase } = require('./db-pool');

async function migrate() {
  const connectionString=process.env.DATABASE_URL_UNPOOLED || process.env.DIRECT_DATABASE_URL;
  if (!connectionString) throw new Error('Set DATABASE_URL_UNPOOLED or DIRECT_DATABASE_URL to the direct PostgreSQL connection');
  assertApplicationDatabase(connectionString);
  const url=new URL(connectionString);
  if (url.hostname.includes('-pooler')) throw new Error('Migrations require a direct connection, not a pooler URL');
  const directory=path.join(__dirname,'migrations');
  const files=fs.readdirSync(directory).filter(name=>/^\d+_[a-z0-9_]+\.sql$/.test(name)).sort();
  const client=new Client({connectionString,connectionTimeoutMillis:180000});
  await client.connect();
  let inTransaction=false;
  try {
    await client.query('BEGIN');
    inTransaction=true;
    await client.query('SELECT pg_advisory_xact_lock(874366105)');
    await client.query('SELECT 1 FROM alsvid_v2.products LIMIT 0');
    await client.query('CREATE TABLE IF NOT EXISTS alsvid_v2.schema_migrations (name text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied=[];
    for (const name of files) {
      const sql=fs.readFileSync(path.join(directory,name),'utf8');
      const sha256=crypto.createHash('sha256').update(sql).digest('hex');
      const prior=(await client.query('SELECT sha256 FROM alsvid_v2.schema_migrations WHERE name=$1',[name])).rows[0];
      if (prior) {
        if (prior.sha256!==sha256) throw new Error(`Applied migration was modified: ${name}`);
        continue;
      }
      const body=sql.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,'');
      await client.query(body);
      await client.query('INSERT INTO alsvid_v2.schema_migrations(name,sha256) VALUES($1,$2)',[name,sha256]);
      applied.push(name);
    }
    await client.query('COMMIT');
    inTransaction=false;
    for (const name of applied) console.log(`Applied ${name}`);
  } catch (error) {
    if (inTransaction) await client.query('ROLLBACK').catch(()=>{});
    throw error;
  } finally { await client.end(); }
}

if (require.main===module) migrate().catch(error=>{console.error(`Migration failed: ${error.message}`);process.exitCode=1;});
module.exports={migrate};
