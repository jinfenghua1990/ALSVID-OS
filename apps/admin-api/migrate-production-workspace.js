'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Client}=require('pg');
const {assertSharedCloudDatabase}=require('./db-pool');
const {loadRuntimeEnvironment}=require('./secret-bootstrap');
const names=['138_production_order_pricing.sql','139_production_order_workspace_fields.sql','140_production_order_updated_at.sql','141_delivery_logistics_fields.sql'];
async function run(){const env=loadRuntimeEnvironment(),url=new URL(env.DATABASE_URL_UNPOOLED||env.DIRECT_DATABASE_URL||env.DATABASE_URL);url.hostname=url.hostname.replace('-pooler.','.');url.searchParams.set('sslmode','verify-full');assertSharedCloudDatabase(url.toString());const c=new Client({connectionString:url.toString(),connectionTimeoutMillis:180000});await c.connect();try{await c.query('BEGIN');await c.query('SET LOCAL search_path TO alsvid_v2,public');await c.query('SELECT pg_advisory_xact_lock(874366109)');const applied=[];for(const name of names){const sql=fs.readFileSync(path.join(__dirname,'migrations',name),'utf8'),sha=crypto.createHash('sha256').update(sql).digest('hex'),prior=(await c.query('SELECT sha256 FROM alsvid_v2.schema_migrations WHERE name=$1',[name])).rows[0];if(prior&&prior.sha256!==sha)throw Error(`已执行的迁移文件不一致：${name}`);if(!prior){await c.query(sql.replace(/^BEGIN;\s*$/m,'').replace(/^COMMIT;\s*$/m,''));await c.query('INSERT INTO alsvid_v2.schema_migrations(name,sha256) VALUES($1,$2)',[name,sha]);applied.push(name)}}await c.query('COMMIT');console.log(applied.length?`生产工作台结构已提交：${applied.join(', ')}`:'生产工作台结构已存在')}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{await c.end()}}
if(require.main===module)run().catch(e=>{console.error(`生产工作台迁移失败：${e.message}`);process.exitCode=1});
module.exports={run};
