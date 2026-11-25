'use strict';
const {createHmac,randomInt,timingSafeEqual}=require('node:crypto');
const {uuidv7,isUuidv7}=require('./uuidv7');
const {passwordHash}=require('./passwords');
const {randomBytes}=require('node:crypto');
function fail(message,statusCode=400){throw Object.assign(new Error(message),{statusCode})}
function emailOf(value){const email=typeof value==='string'?value.trim().toLowerCase():'';if(email.length>254||! /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(email))fail('请输入有效邮箱');return email}
function codeHash(secret,id,email,code){return createHmac('sha256',secret).update(JSON.stringify([id,email,code])).digest('hex')}
function config(env=process.env){return env.ALSVID_CONSUMER_REGISTRATION==='1'&&env.RESEND_API_KEY&&env.ALSVID_MAIL_FROM&&String(env.ALSVID_REGISTRATION_SECRET||'').length>=32?{apiKey:env.RESEND_API_KEY,from:env.ALSVID_MAIL_FROM,secret:env.ALSVID_REGISTRATION_SECRET}:null}
const copy={de:['ALSVID – E-Mail bestätigen','Ihr Bestätigungscode lautet: ','Der Code ist 10 Minuten gültig. Wenn Sie die Registrierung nicht angefordert haben, ignorieren Sie diese Nachricht.'],en:['ALSVID – Verify your email','Your verification code is: ','This code expires in 10 minutes. Ignore this message if you did not request registration.'],zh:['ALSVID 邮箱验证','您的验证码：','验证码10分钟内有效。如果并非本人发起，请忽略此邮件。']};
async function sendCode(cfg,email,id,code,locale,fetcher=fetch){
 const t=copy[locale]||copy.de;
 const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+cfg.apiKey,'Content-Type':'application/json','Idempotency-Key':'alsvid-register/'+id},body:JSON.stringify({from:cfg.from,to:[email],subject:t[0],text:t[1]+code+'\n\n'+t[2]}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)fail('邮件服务暂不可用',503);
 const result=await response.json();if(typeof result.id!=='string'||!result.id)fail('邮件服务未确认请求',503);
}
function createConsumerRegistration(pool,{getConfig=config,deliver=sendCode}={}){
 function ready(){return !!getConfig()}
 async function start(input){
  const cfg=getConfig();if(!cfg)fail('消费者注册暂未开放',503);
  const email=emailOf(input.email),id=uuidv7(),code=String(randomInt(0,100000000)).padStart(8,'0'),c=await pool.connect();
  try{
   await c.query('BEGIN');
   await c.query('SELECT pg_advisory_xact_lock(912603322)');
   if(!(await c.query("SELECT 1 FROM app_users WHERE role='admin' AND enabled LIMIT 1")).rowCount)fail('系统尚未初始化',503);
   await c.query("DELETE FROM consumer_registration_challenges WHERE created_at<now()-interval '24 hours'");
   const counts=(await c.query("SELECT count(*) FILTER(WHERE created_at>now()-interval '1 hour')::int AS hourly,count(*) FILTER(WHERE email=$1 AND created_at>now()-interval '1 hour')::int AS email_hour,count(*) FILTER(WHERE email=$1 AND created_at>now()-interval '60 seconds')::int AS recent FROM consumer_registration_challenges",[email])).rows[0];
   if(counts.hourly>=60||counts.email_hour>=5||counts.recent>0)fail('发送次数过多，请稍后重试',429);
   await c.query("INSERT INTO consumer_registration_challenges(id,email,code_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",[id,email,codeHash(cfg.secret,id,email,code)]);
   await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
  try{await deliver(cfg,email,id,code,input.locale);await pool.query('UPDATE consumer_registration_challenges SET delivered=true WHERE id=$1',[id])}catch(_){fail('邮件服务未确认发送，请稍后重试',503)}
  return {challengeId:id,expiresIn:600};
 }
 async function verify(input){
  const cfg=getConfig();if(!cfg)fail('消费者注册暂未开放',503);
  const email=emailOf(input.email),id=input.challengeId,code=input.code,password=input.password;
  if(!isUuidv7(id)||typeof code!=='string'||!/^\d{8}$/.test(code)||typeof password!=='string'||password.length<12||password.length>20)fail('验证码或密码格式无效');
  const c=await pool.connect();
  try{
   await c.query('BEGIN');
   const row=(await c.query("SELECT email,code_hash,attempts,used_at,delivered,expires_at>now() AS valid FROM consumer_registration_challenges WHERE id=$1 FOR UPDATE",[id])).rows[0];
   if(!row||row.email!==email||row.used_at||!row.delivered||!row.valid||row.attempts>=5)fail('验证码无效或已过期');
   if(!timingSafeEqual(Buffer.from(row.code_hash,'hex'),Buffer.from(codeHash(cfg.secret,id,email,code),'hex'))){
    await c.query('UPDATE consumer_registration_challenges SET attempts=attempts+1 WHERE id=$1',[id]);await c.query('COMMIT');fail('验证码无效或已过期');
   }
   await c.query('UPDATE consumer_registration_challenges SET used_at=now() WHERE id=$1',[id]);
   const salt=randomBytes(16).toString('hex'),hash=await passwordHash(password,salt),uid=uuidv7();
   const inserted=(await c.query("INSERT INTO app_users(id,username,password_salt,password_hash,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT(username) DO NOTHING RETURNING id",[uid,email,salt,hash])).rows[0];
   if(!inserted){await c.query('COMMIT');fail('该邮箱已有账号，请登录或联系支持',409)}
   await c.query('INSERT INTO consumer_registrations(user_id) VALUES($1)',[uid]);
   await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',['self-registration','consumer.register','accounts/'+uid,JSON.stringify({role:'owner',emailVerified:true})]);
   await c.query('COMMIT');return {ok:true};
  }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
 }
 return {ready,start,verify};
}
module.exports={createConsumerRegistration,emailOf,codeHash,config,sendCode};
