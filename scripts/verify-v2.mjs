import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const npm=process.platform==='win32'?'npm.cmd':'npm';
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>/^(PATH|HOME|USERPROFILE|SYSTEMROOT|WINDIR|TEMP|TMP|TMPDIR|LANG|LC_ALL|CI|APPDATA|LOCALAPPDATA|NPM_CONFIG_CACHE)$/i.test(k)));
Object.assign(env,{ALSVID_API_ORIGIN:'http://127.0.0.1:18089',SITE_ORIGINS:'http://127.0.0.1:18091',SITE_URL:'http://127.0.0.1:18091',NEXT_TELEMETRY_DISABLED:'1'});
function run(label,cmd,args,cwd){
 console.log('=== '+label+' ===');
 const p=spawnSync(cmd,args,{cwd,env,stdio:'inherit',shell:process.platform==='win32'&&cmd===npm});
 if(p.error||p.status!==0){console.error('FAIL '+label);process.exit(1)}
 console.log('PASS '+label);
}
const api=path.join(root,'apps/admin-api'),web=path.join(root,'apps/admin-web'),shop=path.join(root,'apps/storefront');
if(process.argv.includes('--install')) for(const dir of [api,web,shop]) run('安装 '+path.basename(dir),npm,['ci','--no-audit','--no-fund'],dir);
for(const f of readdirSync(api).filter(f=>f.endsWith('.js')).sort()) run('语法 '+f,process.execPath,['--check',f],api);
run('管理后台构建',npm,['run','build'],web);
run('商城 TypeScript',process.execPath,['node_modules/typescript/bin/tsc','--noEmit'],shop);
run('商城构建',npm,['run','build'],shop);
// WEB-017 validates actual build artifacts; build before running the acceptance suite.
run('API 无数据库单测',npm,['test'],api);
run('管理后台单测',process.execPath,['--test',...readdirSync(path.join(web,'test')).filter(f=>f.endsWith('.test.js')).map(f=>path.join('test',f))],web);
console.log('静态/单元/构建检查通过；未执行数据库或真实页面验收。');
