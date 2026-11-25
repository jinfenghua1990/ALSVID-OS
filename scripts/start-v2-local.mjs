import {spawn,spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),api=path.join(root,'apps/admin-api'),shop=path.join(root,'apps/storefront');
const file=path.join(api,'.env.test.local');
if(!process.env.TEST_DATABASE_URL&&existsSync(file))process.loadEnvFile(file);
if(!process.env.TEST_DATABASE_URL){console.error('请先配置隔离 Neon TEST_DATABASE_URL');process.exit(1)}
const check=spawnSync(process.execPath,[path.join(root,'scripts/verify-v2.mjs'),...process.argv.slice(2)],{stdio:'inherit',cwd:root});
if(check.status!==0)process.exit(check.status??1);
const preview=randomBytes(32).toString('hex'),refresh=randomBytes(32).toString('hex');
const sys=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|HOME|USERPROFILE|SYSTEMROOT|WINDIR|TEMP|TMP|TMPDIR|LANG|LC_ALL)$/i.test(k)));
const children=[
 spawn(process.execPath,['start-local.js'],{cwd:api,stdio:'inherit',env:{...sys,TEST_DATABASE_URL:process.env.TEST_DATABASE_URL,ALSVID_PREVIEW_SECRET:preview,ALSVID_REVALIDATE_TOKEN:refresh}}),
 spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','18091'],{cwd:shop,stdio:'inherit',env:{...sys,NODE_ENV:'production',ALSVID_API_ORIGIN:'http://127.0.0.1:18089',SITE_ORIGINS:'http://127.0.0.1:18091',SITE_URL:'http://127.0.0.1:18091',ALSVID_REVALIDATE_TOKEN:refresh,NEXT_TELEMETRY_DISABLED:'1'}})
];
let stopped=false;
function stop(code=1){if(stopped)return;stopped=true;for(const p of children)if(p.exitCode===null)p.kill();process.exitCode=code}
for(const p of children){p.on('error',e=>{console.error(e.message);stop(1)});p.on('exit',code=>stop(code??1))}
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>stop(0));
console.log('测试入口 18089 / 18091，等待实际启动日志。');
