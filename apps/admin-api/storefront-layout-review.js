'use strict';
const {createHmac,timingSafeEqual,randomBytes}=require('node:crypto');
const locales=['zh','en','de'],devices=['desktop','mobile'];
const slots=locales.flatMap(locale=>devices.map(device=>({locale,device})));
const sessions=new Map();
const secret=()=>String(process.env.ALSVID_PREVIEW_SECRET||'').trim();
function fail(message,statusCode=409){throw Object.assign(new Error(message),{statusCode})}
function signature(body){if(Buffer.byteLength(secret())<32)fail('预览密钥尚未配置',503);return createHmac('sha256',secret()).update('storefront-layout-review:'+body).digest('base64url')}
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
function same(a,b){return ['session','revision','actor','scope','locale','device','draft'].every(k=>a[k]===b[k])}
function start({revision,actor,scope,candidate,published}){
 if(!Number.isSafeInteger(revision)||revision<0||!actor||!['all','zh','en','de'].includes(scope)||!candidate?.html)fail('首页草稿或发布范围无效');
 if(Buffer.byteLength(secret())<32)fail('预览密钥尚未配置',503);
 const session=randomBytes(16).toString('hex'),exp=Date.now()+30*60*1000;
 const draftLocales=scope==='all'?['zh',...Object.keys(candidate.locales)]:[scope];
 const stored={revision,actor:String(actor),scope,exp,candidate,published};
 sessions.set(session,stored);
 for(const [id,value] of sessions)if(Date.now()>=value.exp)sessions.delete(id);
 return {session,revision,scope,slots:slots.map(slot=>{const draft=draftLocales.includes(slot.locale);return {...slot,draft,token:sign({...slot,draft,session,revision,actor:String(actor),scope,exp,type:'preview'})}})};
}
function read(token){const ticket=verify(token,'preview');if(!slots.some(s=>s.locale===ticket.locale&&s.device===ticket.device))fail('预览类型无效');const session=sessions.get(ticket.session);if(!session||session.revision!==ticket.revision||session.actor!==ticket.actor||session.scope!==ticket.scope||session.exp!==ticket.exp)fail('预览会话失效，请重新开始');return {ticket,session}}
function content(token){const {ticket,session}=read(token);const data=ticket.draft?session.candidate:session.published;const locale=ticket.locale==='zh'?null:data?.locales?.[ticket.locale];const html=ticket.locale==='zh'||!locale?data?.html:locale.html;const css=ticket.locale==='zh'||!locale?data?.css:locale.css;if(!html)return fail('该语言没有可预览的内容');return {html,css,confirmationToken:token,session:ticket.session,locale:ticket.locale,device:ticket.device,draft:ticket.draft,scope:ticket.scope,revision:ticket.revision}}
function confirm(token){const {ticket}=read(token);return {receipt:sign({...ticket,type:'rendered'}),session:ticket.session,locale:ticket.locale,device:ticket.device}}
function approve({revision,actor,scope,candidate,session,receipts}){
 const current=sessions.get(session);if(!current||current.revision!==revision||current.actor!==String(actor)||current.scope!==scope)fail('审核会话与当前草稿或账号不匹配');
 if(!Array.isArray(receipts)||receipts.length!==6)fail('必须确认全部六项预览');
 const seen=new Set();
 for(const token of receipts){const t=verify(token,'rendered');if(t.session!==session||t.revision!==revision||t.actor!==String(actor)||t.scope!==scope||!slots.some(s=>s.locale===t.locale&&s.device===t.device))fail('预览与当前草稿或账号不匹配');seen.add(t.locale+':'+t.device)}
 if(seen.size!==6)fail('必须确认六种不同预览');
 if(JSON.stringify(current.candidate)!==JSON.stringify(candidate))fail('审核后的发布内容已变化，请重新预览');
 sessions.delete(session);
 return {session,slots:[...seen]};
}
module.exports={start,read,content,confirm,approve};
