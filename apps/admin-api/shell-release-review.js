'use strict';
const {createHmac,timingSafeEqual,randomBytes}=require('node:crypto');
const locales=['zh','en','de'],devices=['desktop','mobile'];
const slots=locales.flatMap(locale=>devices.map(device=>({locale,device})));
const secret=()=>String(process.env.ALSVID_PREVIEW_SECRET||'').trim();
function fail(message,statusCode=409){throw Object.assign(new Error(message),{statusCode})}
function signature(body){if(Buffer.byteLength(secret())<32)fail('预览密钥尚未配置',503);return createHmac('sha256',secret()).update('shell-review:'+body).digest('base64url')}
function sign(value){const body=Buffer.from(JSON.stringify(value)).toString('base64url');return body+'.'+signature(body)}
function verify(token,type){
 if(typeof token!=='string'||token.length>4096)fail('预览凭证无效');
 const parts=token.split('.');if(parts.length!==2)fail('预览凭证无效');
 const [body,sig]=parts,a=Buffer.from(sig),b=Buffer.from(signature(body));
 if(a.length!==b.length||!timingSafeEqual(a,b))fail('预览凭证无效');
 let value;try{value=JSON.parse(Buffer.from(body,'base64url').toString())}catch{fail('预览凭证无效')}
 if(value?.type!==type||!Number.isSafeInteger(value.exp)||Date.now()>=value.exp)fail('预览凭证失效，请重新检查');
 return value;
}
function scope(page,actor){
 if(!page||page.pageType!=='shared_module'||!['/site-shell/announcement','/site-shell/header','/site-shell/footer'].includes(page.path)||!['active','disabled'].includes(page.status)||!page.draft?.siteShell||!locales.includes(page.locale)||!Number.isSafeInteger(page.revision)||!actor)fail('该模块没有可发布的公共草稿');
 return {id:page.id,path:page.path,revision:page.revision,sourceLocale:page.locale,actor:String(actor)};
}
function same(a,b){return ['id','path','revision','sourceLocale','actor'].every(k=>a[k]===b[k])}
function start(page,actor){
 const target=scope(page,actor),session=randomBytes(16).toString('hex'),exp=Date.now()+30*60*1000;
 return {session,revision:target.revision,slots:slots.map(slot=>({...slot,token:sign({...target,...slot,session,exp,type:'preview'}),draft:slot.locale===target.sourceLocale}))};
}
function read(token){const value=verify(token,'preview');if(!slots.some(s=>s.locale===value.locale&&s.device===value.device))fail('预览类型无效');return value}
function rendered(ticket,page){
 if(!same(ticket,scope(page,ticket.actor)))fail('草稿已修改，请重新开始预览');
 return sign({...ticket,type:'rendered'});
}
function requireReviewedRelease(page,actor,input={}){
 if(['/site-shell/announcement','/site-shell/header','/site-shell/footer'].includes(page.path)&&!actor)fail('公共模块必须通过六项发布预览，不能使用旧版直接发布');
 return actor?approve(page,actor,input.session,input.receipts):null;
}
function approve(page,actor,session,receipts){
 const target=scope(page,actor);
 if(typeof session!=='string'||!Array.isArray(receipts)||receipts.length!==6)fail('必须确认全部六项预览');
 const seen=new Set();
 for(const token of receipts){const t=verify(token,'rendered');
  if(t.session!==session||!same(t,target)||!slots.some(s=>s.locale===t.locale&&s.device===t.device))fail('预览与当前草稿或账号不匹配');
  seen.add(t.locale+':'+t.device);
 }
 if(seen.size!==6)fail('必须确认六种不同预览');
 return {session,slots:[...seen]};
}
module.exports={start,read,rendered,approve,requireReviewedRelease};
