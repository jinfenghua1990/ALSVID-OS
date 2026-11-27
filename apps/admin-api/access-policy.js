// Internal business APIs are accessible only to explicitly supported internal roles.
function mayAccessInternalApi(role,method,path){
 if(role==='admin')return true;
 if(role!=='viewer')return false;
 return ['GET','HEAD'].includes(method)||path==='/api/account/password';
}
function apiAccessHook(auth,sessionToken){
 // 公开路由仍然允许匿名访问，但若请求带了有效会话则解析出用户身份（供草稿预览等按角色分流的场景使用）
 const attachUser=async req=>{
  if(!auth)return;
  try{const user=await auth.user(sessionToken(req));if(user)req.user=user;}catch(_){}
 };
 return async(req,reply)=>{
  const pathname=req.raw.url.split('?')[0];
  if(pathname.startsWith('/api/'))reply.header('Cache-Control','no-store');
  if(!pathname.startsWith('/api/')||pathname==='/api/health'||pathname.startsWith('/api/auth/'))return;
  if(req.routeOptions.config.publicCatalog===true&&['GET','HEAD'].includes(req.method)){await attachUser(req);return;}
  if(req.routeOptions.config.publicLayoutReviewConfirm===true&&req.method==='POST')return;
  if(req.routeOptions.config.publicLocations===true&&['GET','HEAD'].includes(req.method)){await attachUser(req);return;}
  if(req.routeOptions.config.publicDealerApplication===true&&req.method==='POST')return;
  if(req.routeOptions.config.publicColourInterest===true&&req.method==='POST')return;
  if(req.routeOptions.config.publicTestRide===true&&req.method==='POST')return;
  if(req.routeOptions.config.publicGuestCheckout===true&&req.method==='POST'&&/^\/api\/public\/guest-checkout\/(start|verify|submit|lookup|respond|receive)$/.test(pathname))return;
  if(req.routeOptions.config.publicEcomEvent===true&&req.method==='POST')return;
  // 支付回调由服务商发起，不带后台会话；安全性依赖各适配器验签（confirmWebhook），不靠登录态
  if(req.routeOptions.config.publicPaymentWebhook===true&&req.method==='POST')return;
  const b2cToken=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
  if(pathname.startsWith('/api/v1/inventory/')&&process.env.INVENTORY_B2C_API_TOKEN&&b2cToken===process.env.INVENTORY_B2C_API_TOKEN)return;
  if(!auth)return reply.code(503).send({error:'账号服务不可用'});
  const user=await auth.user(sessionToken(req));
  if(!user)return reply.code(401).send({error:'请先登录'});
  const portalRoles=req.routeOptions.config.portalRoles;
  if(portalRoles ? !portalRoles.includes(user.role) : !mayAccessInternalApi(user.role,req.method,pathname))return reply.code(403).send({error:'没有访问权限'});
  req.user=user;
 };
}
module.exports={mayAccessInternalApi,apiAccessHook};
