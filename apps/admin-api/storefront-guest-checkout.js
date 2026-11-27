'use strict';
const {createHash,createHmac,randomBytes,randomInt,timingSafeEqual}=require('node:crypto');
const {createPool}=require('./db-pool');
const {uuidv7,isUuidv7}=require('./uuidv7');
const {emailOf}=require('./consumer-registration');

function fail(message,statusCode=400){throw Object.assign(Error(message),{statusCode})}
const digest=value=>createHash('sha256').update(value).digest('hex');
const codeHash=(secret,id,email,code)=>createHmac('sha256',secret).update(JSON.stringify([id,email,code])).digest('hex');
function config(env=process.env){
  return env.ALSVID_GUEST_CHECKOUT==='1'&&env.RESEND_API_KEY&&env.ALSVID_MAIL_FROM&&String(env.ALSVID_GUEST_CHECKOUT_SECRET||'').length>=32
    ? {secret:env.ALSVID_GUEST_CHECKOUT_SECRET,apiKey:env.RESEND_API_KEY,from:env.ALSVID_MAIL_FROM}:null;
}
const copy={
  zh:['ALSVID 访客下单验证','您的验证码：','验证码10分钟内有效。非本人操作请忽略。'],
  en:['ALSVID guest checkout','Your verification code: ','The code expires in 10 minutes. Ignore this email if you did not request it.'],
  de:['ALSVID Gastbestellung','Ihr Bestätigungscode: ','Der Code ist 10 Minuten gültig. Ignorieren Sie diese Nachricht, wenn Sie ihn nicht angefordert haben.']
};
async function send(cfg,email,id,code,locale,fetcher=fetch){
  const t=copy[locale]||copy.de;
  const response=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+cfg.apiKey,'Content-Type':'application/json','Idempotency-Key':'alsvid-guest/'+id},body:JSON.stringify({from:cfg.from,to:[email],subject:t[0],text:t[1]+code+'\n\n'+t[2]}),signal:AbortSignal.timeout(10000)});
  if(!response.ok||!((await response.json()).id))fail('邮件服务暂不可用',503);
}
function createGuestCheckout(url,{getConfig=config,deliver=send}={}){
  const pool=createPool(url,{max:2,connectionTimeoutMillis:10000});
  const requireConfig=()=>{const cfg=getConfig();if(!cfg)fail('访客下单暂未开放',503);return cfg};
  return {
    async start(input){
      const cfg=requireConfig(),email=emailOf(input.email),id=uuidv7(),code=String(randomInt(0,100000000)).padStart(8,'0'),c=await pool.connect();
      try{
        await c.query('BEGIN');
        await c.query('SELECT pg_advisory_xact_lock(912603323)');
        await c.query("DELETE FROM storefront_guest_challenges WHERE created_at<now()-interval '24 hours'");
        const n=(await c.query("SELECT count(*) FILTER(WHERE created_at>now()-interval '1 hour')::int AS hourly,count(*) FILTER(WHERE email=$1 AND created_at>now()-interval '1 hour')::int AS per_email,count(*) FILTER(WHERE email=$1 AND created_at>now()-interval '60 seconds')::int AS recent FROM storefront_guest_challenges",[email])).rows[0];
        if(n.hourly>=60||n.per_email>=5||n.recent)fail('发送次数过多，请稍后重试',429);
        await c.query("INSERT INTO storefront_guest_challenges(id,email,code_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",[id,email,codeHash(cfg.secret,id,email,code)]);
        await c.query('COMMIT');
      }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
      try{await deliver(cfg,email,id,code,input.locale);await pool.query('UPDATE storefront_guest_challenges SET delivered=true WHERE id=$1',[id])}catch(_){fail('邮件服务未确认发送',503)}
      return {challengeId:id,expiresIn:600};
    },
    async verify(input){
      const cfg=requireConfig(),email=emailOf(input.email),id=input.challengeId,code=input.code;
      if(!isUuidv7(id)||typeof code!=='string'||!/^\d{8}$/.test(code))fail('验证码无效');
      const c=await pool.connect();
      try{
        await c.query('BEGIN');
        const row=(await c.query("SELECT email,code_hash,attempts,delivered,used_at,expires_at>now() AS valid FROM storefront_guest_challenges WHERE id=$1 FOR UPDATE",[id])).rows[0];
        if(!row||row.email!==email||row.used_at||!row.delivered||!row.valid||row.attempts>=5)fail('验证码无效或已过期');
        const actual=Buffer.from(row.code_hash,'hex'),expected=Buffer.from(codeHash(cfg.secret,id,email,code),'hex');
        if(actual.length!==expected.length||!timingSafeEqual(actual,expected)){
          await c.query('UPDATE storefront_guest_challenges SET attempts=attempts+1 WHERE id=$1',[id]);
          await c.query('COMMIT');fail('验证码无效或已过期');
        }
        const token=randomBytes(32).toString('base64url');
        await c.query("UPDATE storefront_guest_challenges SET used_at=now(),token_hash=$2,token_expires_at=now()+interval '30 minutes' WHERE id=$1",[id,digest(token)]);
        await c.query('COMMIT');return {accessToken:token,expiresIn:1800};
      }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
    },
    async authenticate(header){
      requireConfig();
      const token=typeof header==='string'?header.replace(/^Bearer /,''):'';
      if(!/^[A-Za-z0-9_-]{43}$/.test(token))fail('访客验证无效或已过期',401);
      const row=(await pool.query('SELECT email FROM storefront_guest_challenges WHERE token_hash=$1 AND token_expires_at>now() AND used_at IS NOT NULL',[digest(token)])).rows[0];
      if(!row)fail('访客验证无效或已过期',401);
      return row.email;
    },
    close:()=>pool.end()
  };
}
function registerGuestCheckoutRoutes(app,guest,orders){
  function route(path,handler,limit=8192){
    app.post('/api/public/guest-checkout/'+path,{config:{publicGuestCheckout:true},bodyLimit:limit},async(req,reply)=>{
      reply.header('Cache-Control','no-store');
      if(!guest||!orders)return reply.code(503).send({error:'访客下单暂未开放'});
      try{return await handler(req,req.body||{})}catch(e){return reply.code(e.statusCode||500).send({error:e.statusCode?e.message:'访客下单服务暂不可用'})}
    });
  }
  route('start',(_req,b)=>guest.start(b));
  route('verify',(_req,b)=>guest.verify(b));
  route('submit',async(req,b)=>orders.submitGuest(await guest.authenticate(req.headers.authorization),b),32768);
  route('lookup',async(req,b)=>orders.getGuest(await guest.authenticate(req.headers.authorization),b.orderId));
  app.post('/api/portal/storefront/guest-claim',{config:{portalRoles:['owner']},bodyLimit:4096},async(req,reply)=>{
    reply.header('Cache-Control','no-store');
    if(!guest||!orders)return reply.code(503).send({error:'访客下单暂未开放'});
    try{return await orders.claimGuest(req.user,await guest.authenticate(req.headers['x-guest-authorization']),(req.body||{}).orderId)}
    catch(e){return reply.code(e.statusCode||500).send({error:e.statusCode?e.message:'订单认领失败'})}
  });
}
module.exports={createGuestCheckout,registerGuestCheckoutRoutes,config,codeHash};
