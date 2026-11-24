const {spawn,spawnSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const {Pool}=require('pg');
const {loadRuntimeEnvironment}=require('./secret-bootstrap');
const {assertSharedCloudDatabase}=require('./db-pool');
const {S3Client,CreateMultipartUploadCommand,UploadPartCommand,CompleteMultipartUploadCommand,AbortMultipartUploadCommand,HeadObjectCommand}=require('@aws-sdk/client-s3');

const DATABASE_NAME='ALSVID Production';
const BACKUP_PREFIX='alsvid-database-backups/';
const PART_SIZE=8*1024*1024;

async function serverMajor(connectionString){
  assertSharedCloudDatabase(connectionString);
  const pool=new Pool({connectionString,max:1,connectionTimeoutMillis:10000});
  try{
    const version=Number((await pool.query('SHOW server_version_num')).rows[0].server_version_num);
    return Math.floor(version/10000);
  }finally{await pool.end()}
}

function pgDumpPath(expectedMajor){
  const candidates=[process.env.PG_DUMP_BIN,`/opt/homebrew/opt/postgresql@${expectedMajor}/bin/pg_dump`,`/usr/local/opt/postgresql@${expectedMajor}/bin/pg_dump`,'/opt/homebrew/bin/pg_dump','/usr/local/bin/pg_dump','/usr/bin/pg_dump','pg_dump'].filter(Boolean);
  for(const candidate of candidates){
    const result=spawnSync(candidate,['--version'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
    const major=Number(result.stdout?.match(/pg_dump \(PostgreSQL\) (\d+)/)?.[1]);
    if(result.status===0&&major===expectedMajor)return candidate;
  }
  throw Object.assign(Error(),{code:'pg_dump_matching_major_missing'});
}

function databaseConfig(connectionString){
  assertSharedCloudDatabase(connectionString);
  const url=new URL(connectionString);
  let host=url.hostname.toLowerCase();
  if(host.endsWith('.neon.tech'))host=host.replace('-pooler.','.');
  let database;
  try{database=decodeURIComponent(url.pathname.replace(/^\/+/,''))}catch{throw Error('database target invalid')}
  if(database!==DATABASE_NAME)throw Error('database target rejected');
  const sslmode=url.searchParams.get('sslmode')||'verify-full';
  if(sslmode!=='verify-full')throw Error('database TLS verification required');
  return{host,port:url.port||'5432',user:decodeURIComponent(url.username),password:decodeURIComponent(url.password),database,sslmode};
}

function classifyDumpError(text){
  if(/password authentication failed/i.test(text))return'authentication_failed';
  if(/timeout|timed out/i.test(text))return'connection_timeout';
  if(/could not translate host name|name or service not known/i.test(text))return'dns_failed';
  if(/server version.*does not match|aborting because of server version mismatch/i.test(text))return'version_mismatch';
  if(/permission denied|must be owner|does not exist/i.test(text))return'database_permission_or_object';
  if(/ssl|certificate/i.test(text))return'tls_failed';
  if(/could not connect|connection refused|no route to host/i.test(text))return'connection_failed';
  return'pg_dump_failed';
}

async function run(){
  let stage='load_configuration';
  const env=loadRuntimeEnvironment();
  stage='validate_database_target';
  const secureConnectionString=new URL(env.DATABASE_URL);
  secureConnectionString.searchParams.set('sslmode','verify-full');
  const database=databaseConfig(secureConnectionString.toString());
  stage='read_database_version';
  const major=await serverMajor(secureConnectionString.toString());
  const dumpBinary=pgDumpPath(major);
  const endpoint=new URL(env.OBJECT_STORAGE_ENDPOINT);
  if(endpoint.protocol!=='https:'||endpoint.pathname!=='/'||endpoint.search||endpoint.hash)throw Error('object storage endpoint invalid');
  const client=new S3Client({region:env.OBJECT_STORAGE_REGION||'auto',endpoint:endpoint.origin,credentials:{accessKeyId:env.OBJECT_STORAGE_ACCESS_KEY,secretAccessKey:env.OBJECT_STORAGE_SECRET_KEY}});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const key=`${BACKUP_PREFIX}alsvid-production-${stamp}-${randomUUID()}.dump`;
  let uploadId,child,dumpTimeout,bytes=0,partNumber=0;
  try{
    stage='start_object_upload';
    ({UploadId:uploadId}=await client.send(new CreateMultipartUploadCommand({Bucket:env.OBJECT_STORAGE_BUCKET,Key:key,ContentType:'application/vnd.postgresql.custom'})));
    if(!uploadId)throw Error('multipart upload not created');
    stage='dump_production_database';
    child=spawn(dumpBinary,['--no-password','--format=custom','--compress=6','--no-owner','--no-privileges','--host',database.host,'--port',database.port,'--username',database.user,'--dbname',database.database],{env:{...process.env,PGPASSWORD:database.password,PGSSLMODE:database.sslmode,PGSSLROOTCERT:'system'},stdio:['ignore','pipe','pipe'],windowsHide:true});
    dumpTimeout=setTimeout(()=>{if(child.exitCode===null)child.kill('SIGTERM')},30*60*1000);
    dumpTimeout.unref();
    let pgDumpStderr='';
    child.stderr.on('data',chunk=>{if(pgDumpStderr.length<4096)pgDumpStderr+=chunk.toString('utf8').slice(0,4096-pgDumpStderr.length)});
    const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}))});
    const parts=[];
    let chunks=[],chunkBytes=0;
    async function sendPart(body){
      if(++partNumber>10000)throw Error('multipart limit exceeded');
      const result=await client.send(new UploadPartCommand({Bucket:env.OBJECT_STORAGE_BUCKET,Key:key,UploadId:uploadId,PartNumber:partNumber,Body:body,ContentLength:body.length}));
      if(!result.ETag)throw Error('multipart part missing etag');
      parts.push({PartNumber:partNumber,ETag:result.ETag});
      bytes+=body.length;
    }
    for await(let chunk of child.stdout){
      chunk=Buffer.from(chunk);
      while(chunk.length){
        const take=Math.min(PART_SIZE-chunkBytes,chunk.length);
        chunks.push(chunk.subarray(0,take));
        chunkBytes+=take;
        chunk=chunk.subarray(take);
        if(chunkBytes===PART_SIZE){await sendPart(Buffer.concat(chunks,chunkBytes));chunks=[];chunkBytes=0}
      }
    }
    const outcome=await exit;
    clearTimeout(dumpTimeout);
    if(outcome.code!==0)throw Object.assign(Error(),{code:`pg_dump_${classifyDumpError(pgDumpStderr)}_${outcome.code??outcome.signal??'unknown'}`});
    if(chunkBytes)await sendPart(Buffer.concat(chunks,chunkBytes));
    if(!parts.length)throw Error('empty database dump');
    stage='complete_object_upload';
    await client.send(new CompleteMultipartUploadCommand({Bucket:env.OBJECT_STORAGE_BUCKET,Key:key,UploadId:uploadId,MultipartUpload:{Parts:parts}}));
    uploadId=null;
    stage='verify_object_upload';
    const stored=await client.send(new HeadObjectCommand({Bucket:env.OBJECT_STORAGE_BUCKET,Key:key}));
    if(Number(stored.ContentLength)!==bytes)throw Error('uploaded backup size mismatch');
    console.log(JSON.stringify({ok:true,key,bytes,parts:parts.length,completedAt:new Date().toISOString()}));
  }catch(error){
    clearTimeout(dumpTimeout);
    if(child&&child.exitCode===null)child.kill('SIGTERM');
    if(uploadId)await client.send(new AbortMultipartUploadCommand({Bucket:env.OBJECT_STORAGE_BUCKET,Key:key,UploadId:uploadId})).catch(()=>{});
    console.error(JSON.stringify({ok:false,stage,error:error.code||error.name||'backup_failed'}));
    process.exitCode=1;
  }finally{client.destroy()}
}

run().catch(error=>{console.error(JSON.stringify({ok:false,stage:'preflight',error:error.code||error.name||'backup_failed'}));process.exitCode=1});
