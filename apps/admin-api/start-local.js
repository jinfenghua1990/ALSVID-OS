'use strict';
const {spawn}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs'),path=require('node:path');
try {
  const file=path.join(__dirname,'.env.test.local');
  if (!process.env.TEST_DATABASE_URL && fs.existsSync(file)) process.loadEnvFile(file);
  const url=process.env.TEST_DATABASE_URL;
  process.env.ALSVID_TEST_MODE='1';
  require('./db-pool').assertApplicationDatabase(url);
  if(!fs.existsSync(path.join(__dirname,'../admin-web/dist/index.html'))) throw new Error('请先构建管理后台');
  const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|HOME|USERPROFILE|SYSTEMROOT|WINDIR|TEMP|TMP|TMPDIR|LANG|LC_ALL)$/i.test(k)));
  Object.assign(env,{NODE_ENV:'test',ALSVID_TEST_MODE:'1',DATABASE_URL:url,TEST_DATABASE_URL:url,PORT:'18089',ALSVID_BIND_HOST:'127.0.0.1',ALSVID_STOREFRONT_ORIGIN:'http://127.0.0.1:18091',ALSVID_STOREFRONT_PUBLIC_ORIGIN:'http://127.0.0.1:18091',ALSVID_PREVIEW_SECRET:process.env.ALSVID_PREVIEW_SECRET||randomBytes(32).toString('hex'),ALSVID_REVALIDATE_TOKEN:process.env.ALSVID_REVALIDATE_TOKEN||randomBytes(32).toString('hex')});
  const child=spawn(process.execPath,['index.js'],{cwd:__dirname,env,stdio:'inherit'});
  for(const sig of ['SIGINT','SIGTERM']) process.on(sig,()=>child.kill(sig));
  child.on('error',e=>{console.error(e.message);process.exitCode=1});
  child.on('exit',code=>{process.exitCode=code??1});
} catch(e){console.error(e.message);process.exitCode=1}
