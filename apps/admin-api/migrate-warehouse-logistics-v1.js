'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Client}=require('pg');
const {assertSharedCloudDatabase}=require('./db-pool');
const {loadRuntimeEnvironment}=require('./secret-bootstrap');
async function run(){const env=loadRuntimeEnvironment(),url=new URL(env.DATABASE_URL_UNPOOLED||env.DIRECT_DATABASE_URL||env.DATABASE_URL);url.hostname=url.hostname.replace('-pooler.','.');url.searchParams.set('sslmode','verify-full');assertSharedCloudDatabase(url.toString());const c=new Client({connectionString:url.toString(),connectionTimeoutMillis:180000});await c.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(874366106)');const name='138_warehouse_logistics_v1.sql',sql=fs.readFileSync(path.join(__dirname,'migrations',name),'utf8'),sha=crypto.createHash('sha256').update(sql).digest('hex'),prior=(await c.query('SELECT sha256 FROM alsvid_v2.schema_migrations WHERE name=$1',[name])).rows[0];if(prior&&prior.sha256!==sha)throw Error('已执行的迁移文件不一致');if(!prior){await c.query(sql.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,''));await c.query('INSERT INTO alsvid_v2.schema_migrations(name,sha256) VALUES($1,$2)',[name,sha]);}await c.query('COMMIT');console.log(prior?'仓储物流结构已存在':'仓储物流结构已提交');}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{await c.end()}}
if(require.main===module)run().catch(e=>{console.error(`仓储物流迁移失败：${e.message}`);process.exitCode=1});
module.exports={run};
