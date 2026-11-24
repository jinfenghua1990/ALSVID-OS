// ALSVID V2.0 内部管理系统 - 业务 API + 前端静态托管（端口 5010）
const path = require('path');
const fs = require('fs');
const os = require('node:os');
const { createHash, randomBytes } = require('node:crypto');
const { assertApplicationDatabase } = require('./db-pool');
assertApplicationDatabase(process.env.DATABASE_URL);
const Fastify = require('fastify');
const fastifyStatic = require('@fastify/static');
const store = require('./db');
const { createDictionaryStore } = require('./postgres-dictionaries');
const { createProductStore } = require('./postgres-products');
const { createCustomers } = require('./customers');
const { registerPublicCatalog } = require('./public-catalog');
const { registerCustomerInteractionRoutes } = require('./customer-interaction-routes');
const { createServiceStore } = require('./postgres-service');
const { createFinanceStore, registerFinanceRoutes } = require('./finance');
const { createSalesOrderStore, registerSalesOrderRoutes } = require('./sales-orders');
const { createInventory8090 } = require('./inventory-8090');
const { createObjectStorage } = require('./object-storage');
const { createMediaAssetStore, registerMediaAssetRoutes } = require('./media-assets');
const { createAssetLibraryStore, registerAssetLibraryRoutes } = require('./asset-library');
const { createAuth } = require('./auth');
const { createInventory } = require('./inventory');
const { createCompleteProductStore } = require('./create-complete');
const { runAsActor, currentActor } = require('./audit-context');
const { apiAccessHook } = require('./access-policy');
const { createCatalogStore, registerCatalogRoutes } = require('./catalog');
const { createCmsStore, registerCmsRoutes } = require('./cms');
const { createStorefrontListingStore, registerStorefrontListingRoutes } = require('./storefront-listings');
const { createStorefrontCart, registerStorefrontCartRoutes } = require('./storefront-cart');
const { createStorefrontOrders, registerStorefrontOrderRoutes } = require('./storefront-orders');
const { createStorefrontReviews, registerStorefrontReviewRoutes } = require('./storefront-reviews');
const { createPortalStore, registerPortalRoutes } = require('./portal');
const { createDealerReturns, registerDealerReturnRoutes } = require('./dealer-returns');
const { createDeliveryParcelStore, registerDeliveryParcelRoutes } = require('./delivery-parcels');
const { createDealerApplications } = require('./dealer-applications');
const { createDealerApplicationArchive, registerDealerApplicationArchiveRoutes } = require('./dealer-application-archive');
const { createProductDrafts, registerProductDraftRoutes } = require('./product-drafts');
const { createNetworkPolicy } = require('./network-policy');
const { registerProductLinkRoutes } = require('./product-links');
const { createColourInterestStore, registerColourInterestRoutes } = require('./colour-interest');
const { createPublicLocationsStore, registerPublicLocationRoutes } = require('./public-locations');
const { createTestRideStore, registerTestRideRoutes } = require('./test-rides');
const { createTestRideAssignments, registerTestRideAssignmentRoutes } = require('./test-ride-assignments');
const { createProcurementStore, registerProcurementRoutes } = require('./procurement');

const PORT = Number(process.env.PORT || 8089);
const app = Fastify({ logger: false, bodyLimit: 30 * 1024 * 1024 });
const logServerError = (code, detail) => console.error(JSON.stringify({ level: 'error', code, ...(detail || {}) }));
// 统一错误出口：所有 /api/* 错误都返回 { error: '中文提示' } 契约。
// 此前 4xx 直接 reply.send(error)，Fastify 会序列化成 { statusCode, error: 'Bad Request', message: '英文内部报错' }，
// 既破坏前端 data.error 取值契约（界面显示英文 Bad Request），又把 JSON 解析器等内部细节泄露给客户端。
const STATUS_FALLBACK = {
  400: '请求参数不正确',
  401: '请先登录',
  403: '没有访问权限',
  404: '请求的资源不存在',
  405: '请求方式不被支持',
  413: '请求内容过大',
  415: '不支持的内容类型',
  429: '请求过于频繁，请稍后再试',
};
app.setErrorHandler((error, req, reply) => {
  const url = String(req.raw.url || '');
  if (!url.startsWith('/api/')) return reply.send(error);
  const rawStatus = Number(error.statusCode);
  const statusCode = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
  if (statusCode >= 500) {
    logServerError(error.code || 'UNHANDLED_API_ERROR', { method: req.method, url: url.slice(0, 200), message: String(error.message || '').slice(0, 300) });
    return reply.code(500).send({ error: '服务暂时不可用，请稍后重试' });
  }
  // 4xx：业务 fail() 抛出的中文提示原样保留；Fastify/PG 的英文内部错误统一换成中文兜底，避免泄露内部细节
  const rawMessage = typeof error.message === 'string' ? error.message : '';
  const message = /[\u4e00-\u9fa5]/.test(rawMessage) ? rawMessage : (STATUS_FALLBACK[statusCode] || '请求无效');
  return reply.code(statusCode).send({ error: message });
});
// 路由内 catch 的统一出口：与 setErrorHandler 同策略。
// 优先信任服务层显式抛出的 statusCode（如 B2C 幂等冲突 409），其次 PG 23505→409，其余走 defaultStatus；
// 中文业务错误原样透传，英文内部错误（SQL/PG/JSON 解析细节）换成中文兜底，避免泄露内部实现。
function sendApiError(reply, e, fallback, defaultStatus = 400, logCode = 'API_ERROR') {
  const rawStatus = Number(e && e.statusCode);
  const statusCode = rawStatus >= 400 && rawStatus < 600 ? rawStatus : (e && e.code === '23505' ? 409 : defaultStatus);
  const msg = e && typeof e.message === 'string' ? e.message : '';
  if (statusCode >= 500) logServerError(logCode, { message: msg.slice(0, 300) });
  return reply.code(statusCode).send({ error: /[\u4e00-\u9fa5]/.test(msg) ? msg : (fallback || STATUS_FALLBACK[statusCode] || '请求无效') });
}
// 大 JSON 响应 gzip：审计等大响应在局域网/公网访问时能省带宽；localhost 主链路影响小。
// 审计页的主瓶颈（Neon 跨境拉取）由 listAudit 轻量化 + /api/audit/:id 按需详情解决。
// 只压 >=4KB 的字符串响应；静态文件/图片走流，天然跳过。
const zlib = require('node:zlib');
app.addHook('onSend', async (request, reply, payload) => {
  if (typeof payload !== 'string' || payload.length < 4096) return payload;
  if (reply.getHeader('content-encoding')) return payload;
  if (!/\bgzip\b/.test(String(request.headers['accept-encoding'] || ''))) return payload;
  const buf = zlib.gzipSync(Buffer.from(payload), { level: 6 });
  reply.header('Content-Encoding', 'gzip');
  reply.header('Vary', 'Accept-Encoding');
  reply.header('Content-Length', buf.length);
  return buf;
});
const networkPolicy = createNetworkPolicy({ port: PORT, bindHost: process.env.ALSVID_BIND_HOST || '127.0.0.1', publicOrigins: process.env.ALSVID_PUBLIC_ORIGINS || '', lanOrigins: process.env.ALSVID_LAN_ORIGINS || '' });
app.addHook('onRequest', async (req, reply) => {
  // /api/public/* 是对官网开放的只读商品数据，允许任意来源跨域读取。
  if (req.url.startsWith('/api/public/')) return;
  if (!networkPolicy.allows(req.headers.host, req.headers.origin, req.method)) return reply.code(403).send({ error: '请求来源不受信任' });
});
const cookieSecurity = req => networkPolicy.isPublicHost(req.headers.host) ? '; Secure' : '';
const postgres = process.env.DATABASE_URL ? createDictionaryStore(process.env.DATABASE_URL) : null;
const auth = process.env.DATABASE_URL ? createAuth(process.env.DATABASE_URL) : null;
const authAttempts = new Map();
const authAttemptsCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, attempt] of authAttempts) if (now > attempt.until) authAttempts.delete(key);
}, 60_000);
authAttemptsCleanup.unref();
function sessionToken(req) { const match=String(req.headers.cookie||'').match(/(?:^|;\s*)alsvid_session=([A-Za-z0-9_-]{43})(?:;|$)/); return match?.[1]||''; }
app.addHook('onRequest',apiAccessHook(auth,sessionToken));
app.addHook('onRequest',(req,reply,done)=>runAsActor(req.user?.username||'system',done));
app.get('/api/auth/status',async req=>({initialized:auth?await auth.hasUsers():false,user:auth?await auth.user(sessionToken(req)):null}));
app.post('/api/auth/setup',async(req,reply)=>{if(!auth)return reply.code(503).send({error:'账号服务不可用'});try{await auth.setup(req.body?.username,req.body?.password);return reply.code(201).send({ok:true});}catch(e){const allowed=['管理员已设置','请输入有效邮箱或 3–64 位字母、数字、. _ - 账号','密码须为 8–20 个字符'];return reply.code(400).send({error:allowed.includes(e.message)?e.message:'管理员设置失败'});}});
app.post('/api/auth/login',async(req,reply)=>{
  if(!auth)return reply.code(503).send({error:'账号服务不可用'});
  const username=String(req.body?.username||'').trim().toLowerCase().slice(0,254),key=createHash('sha256').update(`${req.ip}\0${username}`).digest('hex'),now=Date.now();
  let attempt=authAttempts.get(key);
  if(!attempt||now>attempt.until)attempt={count:0,until:now+15*60*1000};
  if(attempt.count>=10)return reply.code(429).send({error:'尝试次数过多，请稍后重试'});
  attempt.count++;
  authAttempts.set(key,attempt);
  let result;
  try{result=await auth.login(req.body?.username,req.body?.password)}catch(error){if(authAttempts.get(key)===attempt){attempt.count--;if(attempt.count<=0)authAttempts.delete(key)}throw error}
  if(!result)return reply.code(401).send({error:'账号或密码错误'});
  if(authAttempts.get(key)===attempt)authAttempts.delete(key);
  reply.header('Set-Cookie',`alsvid_session=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${cookieSecurity(req)}`);
  return{user:result.user};
});
app.post('/api/auth/logout',async(req,reply)=>{if(auth)await auth.logout(sessionToken(req));reply.header('Set-Cookie',`alsvid_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecurity(req)}`);return{ok:true};});
app.get('/api/accounts',async(req,reply)=>req.user.role==='admin'?auth.listUsers():reply.code(403).send({error:'仅管理员可管理账号'}));
app.post('/api/accounts',async(req,reply)=>{try{return reply.code(201).send(await auth.createUser(req.body||{},req.user.username))}catch(e){const allowed=['请输入有效邮箱或 3–64 位字母、数字、. _ - 账号','密码须为 8–20 个字符','角色无效'];return reply.code(e.code==='23505'?409:400).send({error:e.code==='23505'?'账号已存在':allowed.includes(e.message)?e.message:'创建账号失败'});}});
app.patch('/api/accounts/:id',async(req,reply)=>{try{return await auth.updateUser(req.params.id,req.body||{},req.user.username)}catch(e){const allowed=['角色无效','状态无效','账号不存在','至少保留一个启用的管理员'];return reply.code(e.message==='账号不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'更新账号失败'});}});
app.post('/api/account/password',async(req,reply)=>{try{if(typeof req.body?.oldPassword!=='string')return reply.code(400).send({error:'请输入原密码'});await auth.setPassword(req.user.id,req.body?.newPassword,req.user.username,req.body.oldPassword);reply.header('Set-Cookie',`alsvid_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${cookieSecurity(req)}`);return{ok:true};}catch(e){const allowed=['原密码不正确','密码须为 8–20 个字符'];return reply.code(400).send({error:allowed.includes(e.message)?e.message:'修改密码失败'});}});
app.post('/api/accounts/:id/password',async(req,reply)=>{if(req.params.id===req.user.id)return reply.code(400).send({error:'请使用修改自己密码功能'});try{await auth.setPassword(req.params.id,req.body?.newPassword,req.user.username);return{ok:true};}catch(e){const allowed=['账号不存在','密码须为 8–20 个字符'];return reply.code(e.message==='账号不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'重置密码失败'});}});
const pgProducts = process.env.DATABASE_URL ? createProductStore(process.env.DATABASE_URL) : null;
const customers = process.env.DATABASE_URL ? createCustomers(process.env.DATABASE_URL) : null;
const dealerApplications = process.env.DATABASE_URL ? createDealerApplications(process.env.DATABASE_URL) : null;
registerDealerApplicationArchiveRoutes(app, process.env.DATABASE_URL ? createDealerApplicationArchive(process.env.DATABASE_URL) : null);
const productDrafts = process.env.DATABASE_URL ? createProductDrafts(process.env.DATABASE_URL) : null;
const pgService = process.env.DATABASE_URL ? createServiceStore(process.env.DATABASE_URL) : null;
registerFinanceRoutes(app, process.env.DATABASE_URL ? createFinanceStore(process.env.DATABASE_URL) : null);
registerSalesOrderRoutes(app, process.env.DATABASE_URL ? createSalesOrderStore(process.env.DATABASE_URL) : null);
// 8090 口径库存台账（均价成本 / 流水金额 / 仓库健康度），只读迁移列，不影响 8089 原生库存核算。
const inventory8090 = process.env.DATABASE_URL ? createInventory8090(process.env.DATABASE_URL) : null;
app.get('/api/inventory-8090/snapshot', async (req, reply) => {
  if (!inventory8090) return reply.code(503).send({ error: '库存台账服务不可用' });
  try { return await inventory8090.snapshot(); }
  catch (e) { req.log.error({ err: e }, 'inventory 8090 snapshot failed'); return reply.code(500).send({ error: '库存台账读取失败' }); }
});
const inventory = process.env.DATABASE_URL ? createInventory(process.env.DATABASE_URL) : null;
const completeProducts = process.env.DATABASE_URL ? createCompleteProductStore(process.env.DATABASE_URL) : null;
registerProductDraftRoutes(app,productDrafts);
registerProductLinkRoutes(app, pgProducts);
registerColourInterestRoutes(app, process.env.DATABASE_URL ? createColourInterestStore(process.env.DATABASE_URL) : null);
registerPublicLocationRoutes(app, process.env.DATABASE_URL ? createPublicLocationsStore(process.env.DATABASE_URL) : null);
registerTestRideRoutes(app, process.env.DATABASE_URL ? createTestRideStore(process.env.DATABASE_URL) : null);
registerTestRideAssignmentRoutes(app, process.env.DATABASE_URL ? createTestRideAssignments(process.env.DATABASE_URL) : null);
registerProcurementRoutes(app, process.env.DATABASE_URL ? createProcurementStore(process.env.DATABASE_URL) : null);
const objectStorage = createObjectStorage();
const traffic = require('./traffic');
const payments = require('./payments');
const trafficReady = Boolean(process.env.DATABASE_URL);

// ── 线上支付统一适配层（骨架）──
// 管理端：查看 6 种支付方式状态（NOT_IMPLEMENTED / NOT_CONFIGURED / READY）、保存配置、测试连通性。
// 凭据只存服务端 payment_providers.config，接口只回末 4 位提示，绝不回显密钥。
app.get('/api/payment/providers', async (req, reply) => {
  if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可查看支付方式' });
  if (!trafficReady) return reply.code(503).send({ error: '支付服务暂不可用' });
  try { return await payments.listProviders(); }
  catch (error) { return reply.code(500).send({ error: '支付方式读取失败' }); }
});
app.put('/api/payment/providers/:provider', async (req, reply) => {
  if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可配置支付方式' });
  if (!trafficReady) return reply.code(503).send({ error: '支付服务暂不可用' });
  try { return await payments.saveProvider(req.params.provider, req.body || {}); }
  catch (error) { return reply.code(error.statusCode || 500).send({ error: error.statusCode ? error.message : '支付方式保存失败' }); }
});
app.post('/api/payment/providers/:provider/test', async (req, reply) => {
  if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可测试支付方式' });
  if (!trafficReady) return reply.code(503).send({ error: '支付服务暂不可用' });
  try { return await payments.testProvider(req.params.provider); }
  catch (error) { return reply.code(error.statusCode || 500).send({ error: error.statusCode ? error.message : '支付连通性测试失败' }); }
});
app.post('/api/payment/intent', async (req, reply) => {
  if (!req.user) return reply.code(401).send({ error: '请先登录' });
  if (!trafficReady) return reply.code(503).send({ error: '支付服务暂不可用' });
  try { return await payments.createIntent(req.body?.provider, req.body || {}); }
  catch (error) { return reply.code(error.statusCode || 500).send({ error: error.statusCode ? error.message : '发起支付失败' }); }
});
// 服务商回调：白名单放行匿名 POST，安全性由适配器验签保证
app.post('/api/public/payment/webhook/:provider', { config: { publicPaymentWebhook: true }, bodyLimit: 1048576 }, async (req, reply) => {
  if (!trafficReady) return reply.code(503).send({ error: '支付服务暂不可用' });
  try { return await payments.handleWebhook(req.params.provider, req.body || {}, req.headers); }
  catch (error) { return reply.code(error.statusCode || 500).send({ error: error.statusCode ? error.message : '回调处理失败' }); }
});

// ── 电商转化事件采集（公开端点，面向 8091 商城前端）──
// 事件规范：只允许 ViewProduct / AddToCart / BeginCheckout；Purchase 一律由服务端
// 在支付确认后写入，浏览器上报 Purchase 会被拒绝（见 traffic.recordEvent 的白名单）。
// 严禁上报邮箱、用户 ID、订单号等个人识别信息（recordEvent 不接受这些字段）。
const visitorCookie = 'alsvid_visitor';
function ensureVisitorToken(req, reply) {
  // 本服务没有注册 cookie 插件，沿用会话 cookie 的手工解析方式
  const existing = String(req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${visitorCookie}=([A-Za-z0-9_-]{16,64})(?:;|$)`))?.[1];
  if (existing) return existing;
  const token = randomBytes(16).toString('hex');
  // HttpOnly + SameSite=Lax：这是分析用随机标识，不与任何账号关联
  reply.header('Set-Cookie', `${visitorCookie}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=15552000${cookieSecurity(req)}`);
  return token;
}
app.post('/api/public/ecom-event', { config: { publicEcomEvent: true }, bodyLimit: 2048 }, async (req, reply) => {
  if (!trafficReady) return reply.code(503).send({ error: '转化分析服务暂不可用' });
  if (req.headers.origin) {
    let valid = false;
    try { valid = new URL(req.headers.origin).origin === `${req.protocol}://${req.headers.host}`; } catch (_) {}
    if (!valid) return reply.code(403).send({ error: '请求来源不受信任' });
  }
  try {
    const result = await traffic.recordEvent(req.body || {}, { visitorToken: ensureVisitorToken(req, reply) });
    return reply.code(201).send(result);
  } catch (error) {
    return reply.code(error.statusCode || 400).send({ error: error.statusCode ? error.message : '事件上报失败' });
  }
});
app.get('/api/system/connections',async(req,reply)=>{
  if(req.user?.role!=='admin')return reply.code(403).send({error:'仅管理员可查看连接信息'});
  const parseTarget=value=>{try{const url=new URL(value);return {host:url.host,database:decodeURIComponent(url.pathname.replace(/^\/+/,''))}}catch{return null}};
  const database=parseTarget(process.env.DATABASE_URL||'');
  let databaseStatus='unavailable';
  if(pgService){try{await pgService.health();databaseStatus='connected'}catch{databaseStatus='error'}}
  let storageStatus=objectStorage?'configured':'unconfigured';
  if(objectStorage){try{await objectStorage.check();storageStatus='connected'}catch{storageStatus='error'}}
  let endpointHost='';
  try{endpointHost=new URL(process.env.OBJECT_STORAGE_ENDPOINT||'').host}catch{}
  const storageProvider=/r2\.cloudflarestorage\.com$/i.test(endpointHost)?'Cloudflare R2':/\.storage\.c-[^.]+\.aws\.neon\.tech$/i.test(endpointHost)?'Neon Object Storage':endpointHost?'S3 兼容对象存储':'未配置';
  return {connections:[
    {id:'database',name:'业务数据库',purpose:'订单、产品、库存与素材元数据',provider:'Neon PostgreSQL',target:database?`${database.host} · ${database.database}`:'未配置',status:databaseStatus},
    {id:'object-storage',name:'对象存储',purpose:'图片、视频、文档文件本体',provider:storageProvider,endpoint:endpointHost||'未配置',target:process.env.OBJECT_STORAGE_BUCKET||'未配置',status:storageStatus},
    {id:'asset-library',name:'素材库索引与分类',purpose:'文件类型、产品/营销/页面分类及关联关系',provider:'业务数据库 · media_assets / asset_links',target:'对象文件通过 object_key 关联',status:databaseStatus},
  ]};
});
const mediaAssets = process.env.DATABASE_URL ? createMediaAssetStore(process.env.DATABASE_URL, objectStorage) : null;
registerMediaAssetRoutes(app, mediaAssets);
registerAssetLibraryRoutes(app, process.env.DATABASE_URL ? createAssetLibraryStore(process.env.DATABASE_URL, objectStorage) : null);
const catalog = process.env.DATABASE_URL ? createCatalogStore(process.env.DATABASE_URL) : null;
registerCatalogRoutes(app, { catalog, objectStorage });
const cms = process.env.DATABASE_URL ? createCmsStore(process.env.DATABASE_URL) : null;
registerCmsRoutes(app, cms);
registerStorefrontListingRoutes(app, process.env.DATABASE_URL ? createStorefrontListingStore(process.env.DATABASE_URL) : null);
registerStorefrontCartRoutes(app,process.env.DATABASE_URL ? createStorefrontCart(process.env.DATABASE_URL) : null);
const orderStore = process.env.DATABASE_URL ? createStorefrontOrders(process.env.DATABASE_URL) : null;
registerStorefrontOrderRoutes(app, orderStore);
// 支付回调确认后复用订单收款口径（recordPayment）推进状态并触发 Purchase 事件
if (orderStore) payments.setOrderStore(orderStore);
registerStorefrontReviewRoutes(app,process.env.DATABASE_URL ? createStorefrontReviews(process.env.DATABASE_URL) : null);
const portal = process.env.DATABASE_URL ? createPortalStore(process.env.DATABASE_URL) : null;
registerPortalRoutes(app, { portal, auth });
registerDealerReturnRoutes(app, process.env.DATABASE_URL ? createDealerReturns(process.env.DATABASE_URL) : null);
registerDeliveryParcelRoutes(app, process.env.DATABASE_URL ? createDeliveryParcelStore(process.env.DATABASE_URL) : null);
const dealerApplicationAttempts=new Map();
app.post('/api/dealer-applications',{config:{publicDealerApplication:true},bodyLimit:16384},async(req,reply)=>{
  if(!dealerApplications)return reply.code(503).send({error:'招商申请服务不可用'});
  const now=Date.now(),key=createHash('sha256').update(String(req.body?.contactEmail||'').trim().toLowerCase()).digest('hex');let attempt=dealerApplicationAttempts.get(key);
  if(!attempt||now>attempt.until)attempt={count:0,until:now+15*60*1000};
  if(attempt.count>=5){dealerApplicationAttempts.set(key,attempt);return reply.code(429).send({error:'提交次数过多，请 15 分钟后再试'});}
  attempt.count++;dealerApplicationAttempts.set(key,attempt);
  try{return reply.code(201).send(await dealerApplications.submit(req.body||{}))}catch(e){const allowed=['招商申请编号无效','招商申请资料无效','企业网站地址无效','申请编号已用于其他内容'];return reply.code(e.code==='VERSION_CONFLICT'?409:400).send({error:allowed.includes(e.message)?e.message:'招商申请提交失败'})}
});
app.get('/api/dealer-applications',async(req,reply)=>{if(req.user.role!=='admin')return reply.code(403).send({error:'仅管理员可审核招商申请'});return dealerApplications?dealerApplications.list():reply.code(503).send({error:'招商申请服务不可用'});});
app.get('/api/dealer-applications/:id/metadata',async(req,reply)=>{if(req.user?.role!=='admin')return reply.code(403).send({error:'仅管理员可查看申请信息'});if(!dealerApplications)return reply.code(503).send({error:'申请信息暂不可用'});try{return {data:await dealerApplications.metadata(req.params.id)}}catch(_){return reply.code(503).send({error:'申请信息暂不可用'})}});
app.post('/api/dealer-applications/:id/review',async(req,reply)=>{if(req.user.role!=='admin')return reply.code(403).send({error:'仅管理员可审核招商申请'});if(!dealerApplications)return reply.code(503).send({error:'招商申请服务不可用'});try{return await dealerApplications.review(req.params.id,req.body||{})}catch(e){const allowed=['招商申请审核资料无效','招商申请不存在','招商申请已审核'];return reply.code(e.code==='VERSION_CONFLICT'?409:e.message==='招商申请不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'招商申请审核失败'})}});
const db = postgres ? null : store.load();
const persist = () => store.save(db);
function audit(action, target, before, after) {
  db.auditLog ||= [];
  db.auditLog.push({ id: `audit-${Date.now()}-${db.auditLog.length + 1}`, actor: currentActor(), at: new Date().toISOString(), action, target, before: before ?? null, after: after ?? null });
  if (db.auditLog.length > 2000) db.auditLog.splice(0, db.auditLog.length - 2000);
}

registerPublicCatalog(app, process.env.DATABASE_URL);
app.get('/api/health', async (req,reply) => {
  if(!pgService)return reply.code(503).send({ok:false,service:'alsvid-v2',error:'数据库未配置'});
  try { const schema=await pgService.health(); return {ok:true,service:'alsvid-v2',port:PORT,storage:'postgres',objectStorageConfigured:!!objectStorage,pendingOptionalMigrations:schema.pendingOptionalMigrations,timestamp:new Date().toISOString()}; }
  catch (error) { return reply.code(503).send({ok:false,service:'alsvid-v2',error:error.code==='ALSVID_MIGRATIONS_PENDING'?'数据库迁移未完成':'数据库连接不可用'}); }
});
app.get('/api/audit', async (req, reply) => {
  if (req.user.role !== 'admin') return reply.code(403).send({ error: '仅管理员可查看操作审计' });
  return postgres ? postgres.listAudit() : (db.auditLog || []);
});
app.get('/api/audit/:id', async (req, reply) => {
  if (req.user.role !== 'admin') return reply.code(403).send({ error: '仅管理员可查看操作审计' });
  if (!postgres) return reply.code(503).send({ error: '审计详情不可用' });
  const row = await postgres.getAudit(req.params.id);
  if (!row) return reply.code(404).send({ error: '审计记录不存在' });
  return row;
});
app.addContentTypeParser(['image/jpeg','image/png','image/webp','image/avif','application/pdf'], { parseAs: 'buffer', bodyLimit: 10 * 1024 * 1024 }, (req, body, done) => done(null, body));
app.addContentTypeParser(['video/mp4','video/webm'], { parseAs: 'buffer', bodyLimit: 30 * 1024 * 1024 }, (req, body, done) => done(null, body));
app.post('/api/products/:id/media', async (req,reply)=>{
  if(!objectStorage)return reply.code(503).send({error:'对象存储尚未配置'});
  const type=(req.headers['content-type']||'').split(';')[0].trim();
  if(!/^image\/(jpeg|png|webp|avif)$/.test(type)||!Buffer.isBuffer(req.body)||!req.body.length)return reply.code(400).send({error:'请选择有效的图片'});
  const product=pgProducts?await pgProducts.get(req.params.id):db.products.find(p=>p.id===req.params.id);
  if(!product)return reply.code(404).send({error:'产品不存在'});
  const key=`products/${req.params.id}/${require('crypto').randomUUID()}`;
  let label=''; try { label=decodeURIComponent(String(req.headers['x-file-name']||'')).slice(0,200); } catch (_) { return reply.code(400).send({error:'文件名无效'}); }
  let uploaded=false;
  try {
    await objectStorage.put({key,contentType:type,body:req.body});
    uploaded=true;
    const media=pgProducts?await pgProducts.addMedia(req.params.id,{key,contentType:type,label}):{id:key,key,contentType:type,label};
    if(!pgProducts){product.images||=[];product.images.push(media);persist();}
    return reply.code(201).send(media);
  } catch (_) { if(uploaded) await objectStorage.remove(key).catch(()=>{}); return reply.code(502).send({error:'图片保存失败'}); }
});
app.get('/api/products/:id/media/:mediaId', async (req,reply)=>{
  if(!objectStorage)return reply.code(503).send({error:'对象存储尚未配置'});
  const product=pgProducts?await pgProducts.get(req.params.id):db.products.find(p=>p.id===req.params.id);
  const media=product?.images?.find(x=>x.id===req.params.mediaId);
  if(!media)return reply.code(404).send({error:'图片不存在'});
  try{const obj=await objectStorage.get(media.key);return reply.type(media.contentType).send(obj.Body);}catch(error){if(error.name==='NoSuchKey'||error.$metadata?.httpStatusCode===404)return reply.code(404).send({error:'图片文件不存在'});return reply.code(502).send({error:'对象存储暂时不可用'});}
});

// ---------- 静态前端 ----------
const DIST = path.join(__dirname, '..', 'client', 'dist');
app.register(fastifyStatic, { root: DIST });

const publicSiteOrigin='https://www.alsvidbike.com';
const seoLabels={
  zh:{home:'让每一次出发，都更从容。',homeDescription:'探索 ALSVID 已发布的电动出行产品与服务。',catalog:'探索 ALSVID',subtitle:'产品目录',missing:'产品暂不可用',cart:'购物车',orders:'我的订单申请'},
  en:{home:'Move with confidence.',homeDescription:'Explore ALSVID electric mobility products and support.',catalog:'Explore ALSVID',subtitle:'Product catalogue',missing:'Product unavailable',cart:'Cart',orders:'My requests'},
  de:{home:'Mit Vertrauen unterwegs.',homeDescription:'Entdecken Sie ALSVID Produkte und Services für elektrische Mobilität.',catalog:'ALSVID entdecken',subtitle:'Produktkatalog',missing:'Produkt nicht verfügbar',cart:'Warenkorb',orders:'Meine Anfragen'},
};
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}
function injectSeo(html,meta){
  const title=`${meta.title} · ALSVID`,description=String(meta.description||'').trim().slice(0,320),tags=[`<meta name="robots" content="${escapeHtml(meta.robots||'index,follow')}">`];
  if(!meta.private){const canonical=new URL(meta.path,publicSiteOrigin).toString();tags.push(`<meta property="og:site_name" content="ALSVID">`,`<meta property="og:type" content="website">`,`<meta property="og:title" content="${escapeHtml(title)}">`,`<meta property="og:description" content="${escapeHtml(description)}">`,`<meta property="og:url" content="${escapeHtml(canonical)}">`,`<meta name="twitter:card" content="${meta.image?'summary_large_image':'summary'}">`,`<link rel="canonical" href="${escapeHtml(canonical)}">`);if(meta.image)tags.push(`<meta property="og:image" content="${escapeHtml(new URL(meta.image,publicSiteOrigin).toString())}">`);for(const alternate of meta.alternates||[])tags.push(`<link rel="alternate" hreflang="${escapeHtml(alternate.lang)}" href="${escapeHtml(new URL(alternate.path,publicSiteOrigin).toString())}">`)}
  return html.replace(/<html[^>]*>/,`<html lang="${escapeHtml(meta.lang||'en')}">`).replace(/<title>[\s\S]*?<\/title>/,`<title>${escapeHtml(title)}</title>`).replace(/<meta\s+name="description"[^>]*>/,`<meta name="description" content="${escapeHtml(description)}">`).replace('</head>',`${tags.join('')}\n  </head>`);
}
async function seoForRequest(req){
  const url=new URL(req.raw.url,`http://${req.headers.host||'localhost'}`),path=url.pathname,host=url.hostname.toLowerCase();
  const language=()=>{const accept=String(req.headers['accept-language']||'').toLowerCase();return accept.startsWith('zh')?'zh':accept.startsWith('de')?'de':'en'};
  const referenceProduct=path.match(/^\/(zh|en|de)\/explore\/(l7|l1|l8|fc1|fc2|accessory-cup-holder)\/?$/);
  if(referenceProduct){const lang=referenceProduct[1],slug=referenceProduct[2]==='l8'?'l1':referenceProduct[2];return {lang,title:slug==='l7'?'ALSVID A1':slug==='fc1'?'ALSVID A1 Ultra':slug==='fc2'?'ALSVID L1 Pro':slug==='accessory-cup-holder'?'ALSVID Cup Holder':'ALSVID L1',description:'',path:`/${lang}/explore/${slug}`,robots:'noindex,nofollow'};}
  const legacyPublic=path.match(/^\/(zh|en|de)\/.+$/);
  if(legacyPublic)return {lang:legacyPublic[1],title:'ALSVID',description:'',path,robots:'noindex,nofollow'};
  const route=path.match(/^\/www\/(zh|en|de)\/products(?:\/([^/]+))?\/?$/);
  if(route){
    const lang=route[1],labels=seoLabels[lang],productId=route[2]?decodeURIComponent(route[2]):null,showCart=url.searchParams.get('cart')==='1',showOrders=url.searchParams.get('orders')==='1',kind=['vehicle','part'].includes(url.searchParams.get('kind'))?url.searchParams.get('kind'):null,search=(url.searchParams.get('q')||'').trim().slice(0,120);
    if(showCart||showOrders)return {lang,title:showCart?labels.cart:labels.orders,description:labels.subtitle,path:`/www/${lang}/products`,robots:'noindex,nofollow'};
    if(productId){const product=await catalog?.get(productId,lang);if(!product)return {lang,title:labels.missing,description:labels.missing,path:`/www/${lang}/products/${encodeURIComponent(productId)}`,robots:'noindex,nofollow'};return {lang,title:product.title,description:product.description,path:`/www/${lang}/products/${encodeURIComponent(productId)}`,image:product.images?.[0]?.url};}
    const pageValue=Number(url.searchParams.get('page')||1),page=Number.isSafeInteger(pageValue)&&pageValue>0&&pageValue<=10000?pageValue:1,content=await catalog?.list(lang,page,kind,search);
    return {lang,title:labels.catalog,description:labels.subtitle,path:`/www/${lang}/products${page>1?`?page=${page}`:''}`,robots:!kind&&!search&&content?.items?.length?'index,follow':'noindex,nofollow'};
  }
  const explicitHome=path==='/www'||path==='/www/zh'||path==='/www/en'||path==='/www/de';
  if(explicitHome||((path==='/'||path==='/www/')&&host.startsWith('www.'))){
    const lang=path==='/www/zh'?'zh':path==='/www/de'?'de':path==='/www/en'?'en':language();
    const homeMeta={zh:{title:'为自由而生',description:'探索 ALSVID 自行车平台、A1 Ultra、配件设计概念与车主服务。'},en:{title:'Engineered for freedom',description:'Explore ALSVID bicycle platform concepts, A1 Ultra, accessories and owner support.'},de:{title:'Für Freiheit entwickelt',description:'Entdecke ALSVID Fahrradplattformkonzepte, A1 Ultra, Zubehör und Service.'}};
    return {lang,...homeMeta[lang],path:`/www/${lang}`,alternates:['zh','en','de'].map(language=>({lang:language,path:`/www/${language}`}))};
  }
  const cmsPublic=path.match(/^\/www\/(zh|en|de)\/([a-z0-9][a-z0-9/-]*?)\/?$/);
  if(cmsPublic){
    const lang=cmsPublic[1],pagePath='/'+cmsPublic[2],page=await cms?.publicPage(lang,pagePath).catch(()=>null);
    if(page)return {lang,title:page.seo?.title||page.name||seoLabels[lang].home,description:page.seo?.description||'',path:`/www/${lang}${pagePath}`};
    return {lang,title:seoLabels[lang].missing,description:'',path:`/www/${lang}${pagePath}`,robots:'noindex,nofollow'};
  }
  const title=(path==='/my'||path.startsWith('/my/')||host.startsWith('my.'))?'ALSVID 车主中心':(path==='/dealer'||path.startsWith('/dealer/')||host.startsWith('dealer.'))?'ALSVID 经销商中心':(path==='/supplier'||path.startsWith('/supplier/')||host.startsWith('supplier.'))?'ALSVID 供应商门户':'ALSVID 管理系统';
  return {lang:'zh-CN',title,description:'',robots:'noindex,nofollow',private:true};
}
app.get('/',async(req,reply)=>{
  // 入口 HTML 永远不强缓存：它引用的是带内容哈希的 JS，一旦被浏览器/代理缓存住旧版本，
  // 就会出现「代码明明更新了，界面上看不到新菜单」这种假故障。
  reply.header('Cache-Control','no-cache, must-revalidate');
  const index=path.join(DIST,'index.html');
  if(!fs.existsSync(index))return reply.code(503).send('前端尚未构建：请先执行 npm run build（client 目录）');
  const html=fs.readFileSync(index,'utf8');
  try{return reply.type('text/html').send(injectSeo(html,await seoForRequest(req)))}
  catch(_){return reply.type('text/html').send(injectSeo(html,{lang:'en',title:'ALSVID',description:'',path:'/',robots:'noindex,nofollow'}))}
});
app.setNotFoundHandler(async(req, reply) => {
  reply.header('Cache-Control','no-cache, must-revalidate');
  if (req.raw.url.startsWith('/api/')) {
    reply.code(404).send({ error: '未找到对应接口' });
    return;
  }
  if (/^\/(?:catalog(?:\/|$)|mall\/?$)/.test(req.url) || /^\/(?:zh|en|de)\/?(?:\?|#|$)/.test(req.url) || /^\/(?:zh|en|de)\/(?:bikes|accessories|cart|checkout)\/?(?:\?|#|$)/.test(req.url)) {
    return reply.code(404).type('text/plain; charset=utf-8').send('页面不存在');
  }
  const index = path.join(DIST, 'index.html');
  if (fs.existsSync(index)) {const html=fs.readFileSync(index,'utf8');try{return reply.type('text/html').send(injectSeo(html,await seoForRequest(req)))}catch(_){return reply.type('text/html').send(injectSeo(html,{lang:'en',title:'ALSVID',description:'',path:'/',robots:'noindex,nofollow'}))}}
  else reply.code(503).send('前端尚未构建：请先执行 npm run build（client 目录）');
});

// ---------- 元数据 ----------
// /api/meta 是纯只读字典（字段标准库 / SKU 模板 / 平台 / 配置包），只有新增或编辑字段才会变。
// 但它是每次进系统的第一屏依赖，跨境取一次要 1–5s（链路抖动大）。
// 缓存 60s + 写接口主动失效：首屏只慢第一次，之后基本即时。
const META_CACHE_TTL_MS = 60_000;
let metaCache = null;
let metaPending = null;
function invalidateMetaCache() { metaCache = null; }
async function loadMetaSnapshot() {
  if (!postgres) return { fields: db.fields, platforms: [], configKits: [] };
  if (typeof postgres.metaSnapshot === 'function') return postgres.metaSnapshot();
  const [fields, platforms, configKits] = await Promise.all([postgres.listFields(), postgres.listPlatforms(), postgres.listConfigKits()]);
  return { fields, platforms, configKits };
}
async function metaSnapshotCached() {
  if (metaCache && Date.now() - metaCache.at < META_CACHE_TTL_MS) return metaCache.snapshot;
  // 并发请求合并成一次查询，避免同时进多个页面时把池子打满、每个各付一次跨境往返
  if (metaPending) return metaPending;
  metaPending = loadMetaSnapshot()
    .then(snapshot => { metaCache = { at: Date.now(), snapshot }; return snapshot; })
    .finally(() => { metaPending = null; });
  return metaPending;
}
app.get('/api/meta', async () => {
  const snapshot = await metaSnapshotCached();
  return ({
  ownership: store.OWNERSHIP,
  templates: store.TEMPLATES,
  specOptions: Object.fromEntries(store.TEMPLATES.map(t => [t.code, skuSpecOptions(t.code, snapshot.fields)])),
  bomSections: store.BOM_SECTIONS,
  platforms: snapshot.platforms,
  configKits: snapshot.configKits,
}); });
app.get('/api/dictionaries', async () => { const fields = postgres ? await postgres.listFields() : db.fields; return ({ ownership: store.OWNERSHIP, templates: store.TEMPLATES, specOptions: Object.fromEntries(store.TEMPLATES.map(t => [t.code, skuSpecOptions(t.code, fields)])), bomSections: store.BOM_SECTIONS, colors: postgres ? await postgres.listColors() : db.colors }); });

// ---------- 字段标准库 ----------
app.get('/api/fields', async () => postgres ? await postgres.listFields() : db.fields);

app.post('/api/fields', async (req, reply) => {
  const f = req.body || {};
  if (!f.code || !f.nameZh) { reply.code(400).send({ error: '字段编码和中文名称必填' }); return; }
  if (!validSkuField(f, store.TEMPLATES)) return reply.code(400).send({error:'参与 SKU 生成的字段配置无效'});
  if (postgres) { try { const row = await postgres.createField(f); invalidateMetaCache(); reply.code(201).send(row); } catch (e) { reply.code(e.code === '23505' ? 409 : 400).send({ error: e.code === '23505' ? '字段编码已存在' : '字段写入失败' }); } return; }
  if (db.fields.some(x => x.code === f.code)) { reply.code(400).send({ error: '字段编码已存在：' + f.code }); return; }
  const field = {
    code: f.code, nameZh: f.nameZh, nameEn: f.nameEn || '', nameDe: f.nameDe || '',
    type: f.type || 'text', unit: f.unit || '', options: f.options || [],
    level: f.level || 'product', templates: f.templates || [],
    required: !!f.required, searchable: f.searchable !== false, skuGen: !!f.skuGen,
    shopVisible: !!f.shopVisible, enabled: true, version: 1,
  };
  db.fields.push(field);
  audit('field.create', `fields/${field.code}`, null, field);
  persist();
  reply.send(field);
});

app.put('/api/fields/:code', async (req, reply) => {
  if (postgres) { try { const updated = await postgres.updateField(req.params.code, req.body || {}); invalidateMetaCache(); reply.send(updated); } catch (e) { reply.code(e.message === '字段不存在' ? 404 : 400).send({ error: ['字段不存在','参与 SKU 生成的字段配置无效'].includes(e.message) ? e.message : '字段更新失败' }); } return; }
  const f = db.fields.find(x => x.code === req.params.code);
  if (!f) { reply.code(404).send({ error: '字段不存在' }); return; }
  const b = req.body || {};
  // 字段编码创建后不随意更改：只允许更新元数据
  const next = {
    nameZh: b.nameZh ?? f.nameZh, nameEn: b.nameEn ?? f.nameEn, nameDe: b.nameDe ?? f.nameDe,
    unit: b.unit ?? f.unit, options: b.options ?? f.options, level: b.level ?? f.level,
    templates: b.templates ?? f.templates, required: b.required ?? f.required,
    searchable: b.searchable ?? f.searchable, skuGen: b.skuGen ?? f.skuGen,
    shopVisible: b.shopVisible ?? f.shopVisible, enabled: b.enabled ?? f.enabled,
  };
  if (!validSkuField({...f,...next}, store.TEMPLATES)) return reply.code(400).send({error:'参与 SKU 生成的字段配置无效'});
  Object.assign(f,next);
  audit('field.update', `fields/${f.code}`, null, f);
  persist();
  reply.send(f);
});

// ---------- 颜色字典（全局唯一一份，两个入口共用） ----------
app.get('/api/colors', async () => postgres ? await postgres.listColors() : db.colors);

app.post('/api/colors', async (req, reply) => {
  const c = req.body || {};
  const code = (c.code || '').toUpperCase();
  if (!/^[A-Z0-9]{3}$/.test(code)) { reply.code(400).send({ error: '颜色代码必须为 3 位大写字母/数字，如 BLK' }); return; }
  if (postgres) { try { reply.code(201).send(await postgres.createColor({ ...c, code })); } catch (e) { reply.code(e.code === '23505' ? 409 : 400).send({ error: e.code === '23505' ? '颜色代码已存在' : '颜色写入失败' }); } return; }
  if (db.colors.some(x => x.code === code)) { reply.code(400).send({ error: '颜色代码已存在：' + code }); return; }
  const color = { code, zh: c.zh || '', en: c.en || '', de: c.de || '', hex: c.hex || '#cccccc', sort: c.sort || 50, enabled: true };
  db.colors.push(color);
  db.colors.sort((a, b) => a.sort - b.sort);
  audit('color.create', `colors/${color.code}`, null, color);
  persist();
  reply.send(color);
});

app.put('/api/colors/:code', async (req, reply) => {
  if (postgres) { try { reply.send(await postgres.updateColor(req.params.code, req.body || {})); } catch (e) { reply.code(e.message === '颜色不存在' ? 404 : 400).send({ error: e.message === '颜色不存在' ? e.message : '颜色更新失败' }); } return; }
  const c = db.colors.find(x => x.code === req.params.code);
  if (!c) { reply.code(404).send({ error: '颜色不存在' }); return; }
  const b = req.body || {};
  // 已被 SKU 使用的颜色代码不能改义，仅允许维护翻译与状态
  Object.assign(c, { zh: b.zh ?? c.zh, en: b.en ?? c.en, de: b.de ?? c.de, hex: b.hex ?? c.hex, sort: b.sort ?? c.sort, enabled: b.enabled ?? c.enabled });
  db.colors.sort((a, b) => a.sort - b.sort);
  audit('color.update', `colors/${c.code}`, null, c);
  persist();
  reply.send(c);
});

// ---------- SKU 编码 ----------
const { buildSku, buildVehicleSku, skuSpecOptions, validSkuField, validProductSkuBase } = require('./sku-code');
const { normalizeSkuAttributes } = require('./sku-attributes');

app.post('/api/sku/preview', async (req, reply) => {
  const { ownership, productType, spec, color, region } = req.body || {};
  if (!ownership || !productType || !spec || !color) { reply.code(400).send({ error: '四段信息不完整' }); return; }
  const fields = postgres ? await postgres.listFields() : db.fields;
  const colors = postgres ? await postgres.listColors() : db.colors;
  const vehicle = productType === 'EBI';
  if ((!vehicle && !skuSpecOptions(productType, fields).includes(spec)) || !colors.some(c => c.enabled && c.code === color)) return reply.code(400).send({ error: '规格或颜色不可用' });
  let sku;
  try { sku = vehicle ? buildVehicleSku(ownership, spec, color, region || 'EUR') : buildSku(ownership, productType, spec, color); }
  catch (e) { return sendApiError(reply, e, 'SKU 生成失败'); }
  if (pgProducts) { const all = await pgProducts.list(); const dupOwner=all.find(p=>p.skus.some(s=>s.sku===sku)); return reply.send({sku,duplicated:!!dupOwner,owner:dupOwner?{id:dupOwner.id,name:dupOwner.name}:null}); }
  const dupOwner = db.products.find(p => p.skus.some(s => s.sku === sku));
  reply.send({ sku, duplicated: !!dupOwner, owner: dupOwner ? { id: dupOwner.id, name: dupOwner.name } : null });
});

app.post('/api/products/:id/skus', async (req, reply) => {
  if (pgProducts) { try { return reply.send(await pgProducts.addSkus(req.params.id, Array.isArray(req.body) ? req.body : [])); } catch (e) { return reply.code(e.message === '产品不存在' ? 404 : 400).send({ error: ['产品不存在','停用产品不能新增 SKU','整车售价请在商城运营中维护'].includes(e.message) ? e.message : 'SKU 写入失败' }); } }
  const p = db.products.find(x => x.id === req.params.id);
  if (!p) { reply.code(404).send({ error: '产品不存在' }); return; }
  const items = req.body || []; // [{spec,color,price}]
  const added = [], skipped = [];
  for (const it of items) {
    if ((p.productType!=='EBI' && !skuSpecOptions(p.productType, db.fields).includes(it?.spec)) || !db.colors.some(c => c.enabled && c.code === it?.color)) { skipped.push({ reason:'配置版本或颜色不可用' }); continue; }
    if (!it?.spec || !it?.color) { skipped.push({ reason:'SKU 四段编码无效' }); continue; }
    let sku;
    try { sku = p.productType==='EBI' ? buildVehicleSku(p.model,it.spec,it.color,it.region||'EUR') : buildSku(p.ownership, p.productType, it.spec, it.color); }
    catch { skipped.push({ reason:'SKU 四段编码无效' }); continue; }
    if (db.products.some(x => x.skus.some(s => s.sku === sku))) { skipped.push({ sku, reason: '编码已存在' }); continue; }
    if (p.skus.some(s => s.sku === sku)) { skipped.push({ sku, reason: '本产品已包含' }); continue; }
    const row = { sku, spec: it.spec, color: it.color, price: it.price || '', note: it.note || '' };
    p.skus.push(row);
    added.push(row);
  }
  if (added.length) audit('sku.create', `products/${p.id}/skus`, null, added);
  persist();
  reply.send({ added, skipped, skus: p.skus });
});

app.put('/api/products/:id/skus/:sku/attributes', async (req, reply) => {
  if (pgProducts) {
    try { return reply.send(await pgProducts.updateSkuAttributes(req.params.id, req.params.sku, req.body || {})); }
    catch (e) {
      if (e.code === 'SKU_ATTRIBUTES_INVALID') return reply.code(400).send({error:e.message});
      if (e.message === '产品不存在' || e.message === 'SKU 不存在') return reply.code(404).send({error:e.message});
      if (e.message.includes('迁移 074')) return reply.code(503).send({error:e.message});
      logServerError(e.code || 'SKU_ATTRIBUTES_PERSISTENCE_ERROR');
      return reply.code(500).send({error:'SKU 参数保存失败，请稍后重试'});
    }
  }
  const p=db.products.find(x=>x.id===req.params.id);
  if(!p)return reply.code(404).send({error:'产品不存在'});
  const sku=p.skus.find(x=>x.sku===req.params.sku);
  if(!sku)return reply.code(404).send({error:'SKU 不存在'});
  try {
    const before={...(sku.attributes||{})};
    sku.attributes=normalizeSkuAttributes(req.body?.attributes,db.fields,p.productType,sku.attributes||{});
    audit('sku.attributes.update',`products/${p.id}/skus/${sku.sku}/attributes`,before,sku.attributes);
    persist();
    return reply.send({sku:sku.sku,attributes:sku.attributes});
  } catch(e) { return sendApiError(reply, e, 'SKU 属性格式无效'); }
});

app.patch('/api/products/:id/skus/:sku/detail', async (req, reply) => {
  if (!pgProducts) return reply.code(409).send({ error: '该模式暂不支持就地修改，请进入编辑页保存' });
  try { const r = await pgProducts.updateSkuDetail(req.params.id, req.params.sku, req.body || {}); return reply.send({ ok: true, sku: r.after }); }
  catch (e) {
    if (e.code === '23505') return reply.code(409).send({ error: '该 EAN-13 已被其他 SKU 占用' });
    if (['产品不存在', 'SKU 不存在', '价格格式无效', 'EAN-13 条码无效'].includes(e.message)) return reply.code(e.message === '产品不存在' || e.message === 'SKU 不存在' ? 404 : 400).send({ error: e.message });
    logServerError(e.code || 'SKU_DETAIL_PERSISTENCE_ERROR'); return reply.code(500).send({ error: 'SKU 更新失败，请稍后重试' });
  }
});

let fxCache = { at: 0, rate: null };
app.get('/api/fx', async (_req, reply) => {
  if (fxCache.rate && Date.now() - fxCache.at < 6 * 3600 * 1000) return reply.send({ base: 'EUR', quote: 'CNY', rate: fxCache.rate, cached: true });
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=CNY', { signal: AbortSignal.timeout(4000) });
    const j = await r.json();
    const rate = Number(j?.rates?.CNY);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error('invalid rate');
    fxCache = { at: Date.now(), rate };
    return reply.send({ base: 'EUR', quote: 'CNY', rate, cached: false });
  } catch (e) {
    return reply.send({ base: 'EUR', quote: 'CNY', rate: fxCache.rate || 7.8, cached: Boolean(fxCache.rate), fallback: true });
  }
});

app.patch('/api/products/:id/skus/:sku', async (req, reply) => {
  const disabled = req.body?.disabled;
  if (typeof disabled !== 'boolean') return reply.code(400).send({ error: 'disabled 必须为布尔值' });
  if (pgProducts) { try { const r = await pgProducts.setSkuDisabled(req.params.id, req.params.sku, disabled); return reply.send({ ok: true, sku: r.after }); } catch (e) { if(e.message==='SKU 不存在')return reply.code(404).send({error:e.message});logServerError(e.code||'SKU_STATUS_PERSISTENCE_ERROR');return reply.code(500).send({error:'SKU 状态更新失败，请稍后重试'}); } }
  const p = db.products.find(x => x.id === req.params.id);
  const s = p?.skus.find(x => x.sku === req.params.sku);
  if (!s) return reply.code(404).send({ error: 'SKU 不存在' });
  s.disabled = disabled;
  audit(disabled ? 'sku.disable' : 'sku.enable', `products/${p.id}/skus/${s.sku}`, null, { disabled });
  persist();
  reply.send({ ok: true, sku: { sku: s.sku, disabled } });
});

app.patch('/api/products/:id/status', async (req, reply) => {
  const status = String(req.body?.status || '').trim();
  if (!['启用', '停用', '草稿'].includes(status)) return reply.code(400).send({ error: '状态只能是 启用 / 停用 / 草稿' });
  if (pgProducts) { try { const r = await pgProducts.setStatus(req.params.id, status); catalog?.clearProductCardCache?.(); return reply.send({ ok: true, product: r.after }); } catch (e) { if(e.message==='产品不存在')return reply.code(404).send({error:e.message});if(e.code==='PRODUCT_DELETED')return reply.code(409).send({code:e.code,error:e.message});logServerError(e.code||'PRODUCT_STATUS_PERSISTENCE_ERROR');return reply.code(500).send({error:'产品状态更新失败，请稍后重试'}); } }
  const p = db.products.find(x => x.id === req.params.id);
  if (!p) return reply.code(404).send({ error: '产品不存在' });
  if (p.deletedAt) return reply.code(409).send({ code: 'PRODUCT_DELETED', error: '已删除商品请先恢复，再启用' });
  p.status = status;
  audit('product.status', `products/${p.id}`, null, { status });
  persist();
  reply.send({ ok: true, product: { id: p.id, status } });
});

app.delete('/api/products/:id/skus/:sku', async (req, reply) => {
  if (pgProducts) { try { await pgProducts.deleteSku(req.params.id, req.params.sku); return reply.send({ ok: true }); } catch (e) { if(e.code==='ENTITY_REFERENCED')return reply.code(409).send({code:e.code,error:e.message,references:e.references||[]});if(e.message==='产品不存在'||e.message==='SKU 不存在')return reply.code(404).send({error:e.message});logServerError(e.code||'SKU_DELETE_PERSISTENCE_ERROR');return reply.code(500).send({error:'SKU 删除失败，请稍后重试'}); } }
  const p = db.products.find(x => x.id === req.params.id);
  if (!p) { reply.code(404).send({ error: '产品不存在' }); return; }
  const removed = p.skus.find(s => s.sku === req.params.sku);
  const referenced = db.products.some(x => (x.bom?.items || []).some(it => it.sku === req.params.sku)) || db.vins.some(x => x.sku === req.params.sku) || db.repairs.some(x => x.sku === req.params.sku) || db.substitutes.some(x => x.originalSku === req.params.sku || x.replacementSku === req.params.sku);
  if (referenced) { reply.code(409).send({ error: '该 SKU 已被业务记录引用，不能删除' }); return; }
  const before = p.skus.length;
  p.skus = p.skus.filter(s => s.sku !== req.params.sku);
  if (p.skus.length === before) { reply.code(400).send({ error: 'SKU 不存在' }); return; }
  audit('sku.delete', `products/${p.id}/skus/${req.params.sku}`, removed, null);
  persist();
  reply.send({ ok: true, skus: p.skus });
});

// ---------- 产品 CRUD ----------
const KINDS = ['vehicle', 'part'];

app.get('/api/products', async (req) => {
  if (pgProducts) return pgProducts.list(req.query.kind, req.query.includeDeleted === 'true');
  const kind = req.query.kind;
  let list = db.products.filter(p => req.query.includeDeleted === 'true' || !p.deletedAt);
  if (kind && KINDS.includes(kind)) list = list.filter(p => p.kind === kind);
  return list.map(publicProduct);
});

app.post('/api/products/complete', async (req,reply)=>{
  if(!completeProducts)return reply.code(503).send({error:'数据库不可用'});
  const b=req.body||{},images=Array.isArray(b.images)?b.images:[];
  if(b.status==='停用'&&Array.isArray(b.skus)&&b.skus.length)return reply.code(400).send({error:'停用产品不能新增 SKU'});
  const tpl=store.TEMPLATES.find(t=>t.code===b.productType&&t.kind===b.kind);
  const idText=String(b.id||'');
  const idOk=/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idText)||/^p-[A-Za-z0-9:._-]{3,80}$/.test(idText);
  if(!idOk||!tpl||!String(b.name||'').trim()||(b.kind==='vehicle'&&(b.productType!=='EBI'))||!validProductSkuBase(b.kind,b.ownership,b.productType,b.model,store.TEMPLATES,store.OWNERSHIP))return reply.code(400).send({error:'请填写有效的名称、型号、品类和归属'});
  if(images.length>10||!Array.isArray(b.skus)||!Array.isArray(b.fitments)||!Array.isArray(b.bom?.items))return reply.code(400).send({error:'产品数据格式无效'});
  try { for (const sku of b.skus) { if (b.kind === 'vehicle') buildVehicleSku(b.model, sku?.spec, sku?.color, sku?.region || 'EUR'); else buildSku(b.ownership, b.productType, sku?.spec, sku?.color); } }
  catch (e) { return reply.code(400).send({error:e.message}); }
  if(images.length&&!objectStorage)return reply.code(503).send({error:'对象存储未配置'});
  if(!b.editing&&await completeProducts.exists(b.id)&&await completeProducts.skuCount(b.id))return reply.code(409).send({error:'此暂存已保存为产品，请返回列表查看'});
  const media=[],uploaded=[];let total=0;
  try{
    for(const img of images){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(img.id||'')||!/^image\/(jpeg|png|webp|avif)$/.test(img.contentType||'')||typeof img.data!=='string'||!/^[A-Za-z0-9+/]*={0,2}$/.test(img.data))throw Error('图片格式无效');const bytes=Buffer.from(img.data,'base64');total+=bytes.length;if(!bytes.length||bytes.length>10*1024*1024||total>20*1024*1024)throw Error('图片单张不能超过 10 MB，总计不能超过 20 MB');const m={id:img.id,key:`products/${b.id}/${img.id}`,contentType:img.contentType,label:String(img.label||'').slice(0,200)};await objectStorage.put({...m,body:bytes});uploaded.push(m.key);media.push(m);}
    const result=await completeProducts.create(b,media);return reply.code(201).send(result);
  }catch(e){logServerError('PRODUCT_COMPLETE_SAVE_FAILED',{productId:b.id,kind:b.kind,model:b.model,message:String(e&&e.message||'').slice(0,500),stack:String(e&&e.stack||'').slice(0,1200)});let committed=true;try{committed=await completeProducts.exists(b.id)}catch(_){}if(!committed)await Promise.allSettled(uploaded.map(key=>objectStorage.remove(key)));const known=['图片格式无效','图片单张不能超过 10 MB，总计不能超过 20 MB','SKU 规格或颜色编码无效','SKU 配置版本、颜色或法规编码无效','SKU 配置版本或颜色编码无效','整车 SKU 必须为 14/15 位编码','历史 SKU 价格格式无效','整车档案状态无效','商城资料请在商城运营中维护','历史商城资料格式无效','产品型号或归属编码无效','请填写产品必填参数','产品参数格式无效','产品参数选项无效','产品参数必须为数字','整车不支持配件适配','适配整车不存在','适配整车编号无效','适配整车不存在或编号不匹配','请填写 BOM 版本','BOM 物料层级引用无效','BOM 物料层级存在循环','BOM 物料、图纸编号和数量必填','BOM 配件 SKU 不存在','BOM 图纸标记无效','SKU 已被业务资料引用，无法替换删除'];return reply.code(e.code==='23505'||e.code==='ENTITY_REFERENCED'?409:400).send({error:e.code==='23505'?'产品或 SKU 已存在':known.includes(e.message)||/^欧盟 EN 15194 合规校验未通过/.test(e.message)||/^该车型代际下的配置版本已被其他车型占用/.test(e.message)?e.message:'保存失败，请检查网络和输入后重试',...(e.code==='ENTITY_REFERENCED'?{code:e.code,references:e.references}: {})});}
});

app.post('/api/products', async (req, reply) => {
  const b = req.body || {};
  if (!b.kind || !KINDS.includes(b.kind)) { reply.code(400).send({ error: 'kind 必须是 vehicle 或 part' }); return; }
  if (!b.name) { reply.code(400).send({ error: '产品名称必填' }); return; }
  const tpl = store.TEMPLATES.find(t => t.code === b.productType);
  if (!tpl) { reply.code(400).send({ error: '产品类型/品类必选' }); return; }
  if (tpl.kind !== b.kind) { reply.code(400).send({ error: '产品类型与业务类型不匹配' }); return; }
  const ownership = b.ownership || (b.kind === 'vehicle' ? (b.model || '').toUpperCase() : 'UN');
  if ((b.kind==='vehicle'&&(b.productType!=='EBI'))||!validProductSkuBase(b.kind,ownership,b.productType,b.model,store.TEMPLATES,store.OWNERSHIP)) return reply.code(400).send({error:'产品型号或归属编码无效'});
  if (pgProducts) { try { const product = await pgProducts.create({ ...b, ownership: b.ownership || (b.kind === 'vehicle' ? (b.model || '').toUpperCase() : 'UN') }); reply.code(201).send(product); } catch (e) { const known=['请填写产品必填参数','产品参数格式无效','产品参数选项无效','产品参数必须为数字'];reply.code(400).send({ error: known.includes(e.message)||/^欧盟 EN 15194 合规校验未通过/.test(e.message)||/^该车型代际下的配置版本已被其他车型占用/.test(e.message)?e.message:'产品写入失败，请检查品类、归属和字段' }); } return; }
  const p = {
    id: 'p-' + (++db.counters.product) + '-' + Date.now().toString(36),
    kind: b.kind,
    name: b.name,
    model: b.model || (b.kind === 'vehicle' ? '' : ''),
    productType: b.productType,
    status: b.status || '启用',
    ownership: b.ownership || (b.kind === 'vehicle' ? (b.model || '').toUpperCase() : 'UN'),
    uses: b.uses || (b.kind === 'part' ? ['生产使用'] : []),
    specs: b.specs || {},
    skus: [],
    fitments: [],
    bom: b.kind === 'vehicle' ? { version: '', items: [] } : undefined,
    images: [],
    version: 1,
  };
  db.products.push(p);
  audit('product.create', `products/${p.id}`, null, p);
  persist();
  reply.code(201).send(publicProduct(p));
});

app.get('/api/products/:id', async (req, reply) => {
  if (pgProducts) { const product = await pgProducts.get(req.params.id); if (!product) return reply.code(404).send({ error: '产品不存在' }); return reply.send(product); }
  const p = db.products.find(x => x.id === req.params.id);
  if (!p) { reply.code(404).send({ error: '产品不存在' }); return; }
  reply.send(publicProduct(p));
});

app.get('/api/products/:id/history', async (req,reply) => {
  if(req.user.role!=='admin')return reply.code(403).send({error:'仅管理员可查看产品变更记录'});
  if(!pgProducts)return reply.code(503).send({error:'产品变更记录需要数据库存储'});
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id))return reply.code(400).send({error:'产品编号无效'});
  const beforeId=req.query.beforeId;
  if(beforeId!==undefined&&(!/^[1-9][0-9]{0,18}$/.test(beforeId)||BigInt(beforeId)>9223372036854775807n))return reply.code(400).send({error:'变更记录游标无效'});
  const history=await pgProducts.listProductHistory(req.params.id,beforeId);
  return history===null?reply.code(404).send({error:'产品不存在'}):history;
});

app.get('/api/products/:id/versions', async (req,reply) => {
  if(!pgProducts)return reply.code(503).send({error:'产品版本需要数据库存储'});
  const rows=await pgProducts.listProductVersions(req.params.id);
  return rows===null?reply.code(404).send({error:'产品不存在'}):rows;
});
app.post('/api/products/:id/versions', async (req,reply) => {
  if(req.user.role!=='admin')return reply.code(403).send({error:'仅管理员可创建产品版本'});
  if(!pgProducts)return reply.code(503).send({error:'产品版本需要数据库存储'});
  try{return reply.code(201).send(await pgProducts.createProductVersion(req.params.id,req.body||{}));}
  catch(e){return reply.code(e.code==='23505'||e.code==='VERSION_CONFLICT'?409:e.message==='产品不存在'?404:400).send({error:e.code==='23505'?'版本名称已存在':e.message});}
});

app.route({ method: ['PUT', 'PATCH'], url: '/api/products/:id', handler: async (req, reply) => {
  if (pgProducts) { try { return reply.send(await pgProducts.update(req.params.id, req.body || {})); } catch (e) { return reply.code(e.code === 'VERSION_CONFLICT' || e.code === 'PRODUCT_DELETED' ? 409 : e.message === '产品不存在' ? 404 : 400).send({ error: ['产品不存在','产品型号或归属编码无效','请填写产品必填参数','产品参数格式无效','产品参数选项无效','产品参数必须为数字','已存在 SKU 的产品不能修改归属、型号或品类','已建立业务关联的产品不能修改车型代号','适配整车编号无效','请选择适配整车','适配整车不存在','车型对应多辆整车，请明确选择整车产品','适配整车重复','只有零配件可以设置车型适配','已删除商品请先恢复，再编辑'].includes(e.message) || e.code === 'VERSION_CONFLICT' ? e.message : '产品更新失败' }); } }
  const p = db.products.find(x => x.id === req.params.id);
  if (!p) { reply.code(404).send({ error: '产品不存在' }); return; }
  if (p.deletedAt) return reply.code(409).send({ code: 'PRODUCT_DELETED', error: '已删除商品请先恢复，再编辑' });
  const b = req.body || {};
  if (b.version !== undefined && Number(b.version) !== Number(p.version || 1)) { reply.code(409).send({ error: '数据已被其他操作更新，请刷新后重试', currentVersion: p.version || 1 }); return; }
  const before = JSON.parse(JSON.stringify(p));
  // SKU 一旦建立，编码含义不改写：不允许通过 PUT 修改 ownership/productType 使既有 SKU 失义
  const renameBlocked = (p.skus.length > 0) && (
    (b.ownership && b.ownership !== p.ownership) ||
    (b.productType && b.productType !== p.productType) ||
    (p.kind === 'vehicle' && b.model !== undefined && b.model !== p.model));
  if (renameBlocked) { reply.code(400).send({ error: '已存在 SKU 的产品不能修改归属/品类编码，否则 SKU 含义会失效' }); return; }
  if (['model','productType','ownership'].some(k => b[k] !== undefined && b[k] !== p[k]) && !validProductSkuBase(p.kind,b.ownership ?? p.ownership,b.productType ?? p.productType,b.model ?? p.model,store.TEMPLATES,store.OWNERSHIP)) return reply.code(400).send({error:'产品型号或归属编码无效'});
  ['name', 'model', 'productType', 'status', 'ownership', 'uses', 'specs', 'fitments', 'images'].forEach(k => {
    if (b[k] !== undefined) p[k] = b[k];
  });
  if (b.bom && p.kind === 'vehicle') p.bom = b.bom;
  p.version = Number(p.version || 1) + 1;
  audit('product.update', `products/${p.id}`, before, p);
  persist();
  reply.send(publicProduct(p));
}});

app.delete('/api/products/:id', async (req, reply) => {
  if (pgProducts) {
    try {
      const result = await pgProducts.deleteProduct(req.params.id);
      reply.send({ ok: true, deleted: result.before });
    } catch (e) {
      if (e.message === '产品不存在') return reply.code(404).send({ error: '产品不存在' });
      if (e.code === 'PRODUCT_NOT_DELISTED' || e.code === 'PRODUCT_STILL_PUBLISHED') return reply.code(409).send({ code: e.code, error: e.message });
      if (e.code === 'ENTITY_REFERENCED') return reply.code(409).send({ code: e.code, error: e.message, references: e.references || [] });
      if (e.code === '23503') return reply.code(409).send({ code: 'ENTITY_REFERENCED', error: '商品仍有未列出的业务引用，无法物理删除' });
      return sendApiError(reply, e, '删除失败', 400, 'PRODUCT_DELETE_PERSISTENCE_ERROR');
    }
    return;
  }
  const i = db.products.findIndex(x => x.id === req.params.id);
  if (i < 0) { reply.code(404).send({ error: '产品不存在' }); return; }
  const p = db.products[i];
  if (p.status !== '停用') { reply.code(409).send({ code: 'PRODUCT_NOT_DELISTED', error: '请先下架商品，再删除' }); return; }
  db.products.splice(i, 1);
  audit('product.delete', `products/${p.id}`, p, null);
  persist();
  reply.send({ ok: true, deleted: { id: p.id, name: p.name } });
});

app.post('/api/products/:id/restore', async (req, reply) => {
  if (pgProducts) {
    try { return reply.send({ ok: true, product: await pgProducts.restoreProduct(req.params.id) }); }
    catch (e) { return sendApiError(reply, e, '商品恢复失败', e.message === '已删除商品不存在' ? 404 : 400, 'PRODUCT_RESTORE_PERSISTENCE_ERROR'); }
  }
  const p = db.products.find(x => x.id === req.params.id && x.deletedAt);
  if (!p) return reply.code(404).send({ error: '已删除商品不存在' });
  const before = p.deletedAt;
  delete p.deletedAt;
  p.status = '停用';
  audit('product.restore', `products/${p.id}`, { deletedAt: before }, { status: p.status });
  persist();
  return reply.send({ ok: true, product: { id: p.id, status: p.status } });
});

function publicProduct(p) {
  const out = { ...p };
  out.skuCount = p.skus.length;
  out.colorCount = new Set(p.skus.map(s => s.color)).size;
  return out;
}

const customerError=(e,reply)=>{const known=['客户资料无效','客户不存在','车辆不存在','客户或当前归属无效','该客户已经是当前归属人','客户资料已更新，请重新载入','车辆归属已更新，请重新载入','查询日期无效','保修资料无效','撤销原因无效','保修记录不存在','保修记录已撤销','保修判定资料无效','维修工单不存在','保修记录不属于该车辆','沟通记录无效','车辆未关联该客户','记录编号已用于其他内容','回访完成说明无效','沟通记录不存在','该记录没有安排回访','回访已完成','回访变更资料无效','回访计划已更新，请重新载入','回访已结束'];return reply.code(e.code==='VERSION_CONFLICT'?409:known.includes(e.message)?400:500).send({error:known.includes(e.message)?e.message:'客户资料处理失败'});};
app.get('/api/customers',async(req,reply)=>customers?customers.list():reply.code(503).send({error:'客户服务不可用'}));
app.get('/api/customers/:id/vehicles',async(req,reply)=>customers?customers.vehicles(req.params.id).catch(e=>customerError(e,reply)):reply.code(503).send({error:'客户服务不可用'}));
app.post('/api/customers',async(req,reply)=>{if(!customers)return reply.code(503).send({error:'客户服务不可用'});try{return reply.code(201).send(await customers.create(req.body||{}))}catch(e){return customerError(e,reply)}});
app.put('/api/customers/:id',async(req,reply)=>{if(!customers)return reply.code(503).send({error:'客户服务不可用'});try{return await customers.update(req.params.id,req.body||{})}catch(e){return customerError(e,reply)}});
registerCustomerInteractionRoutes(app,customers,customerError);
app.route({method:'GET',url:'/api/service-centers',config:{portalRoles:['admin','viewer','owner','dealer']},handler:async(req,reply)=>pgService?pgService.listServiceCenters(req.user.role!=='admin'):reply.code(503).send({error:'服务网点暂不可用'})});
app.post('/api/service-centers',async(req,reply)=>{if(req.user.role!=='admin')return reply.code(403).send({error:'仅管理员可维护服务网点'});if(!pgService)return reply.code(503).send({error:'服务网点暂不可用'});try{return reply.code(201).send(await pgService.createServiceCenter(req.body||{}))}catch(e){const allowed=['服务网点资料无效'];return reply.code(e.code==='23505'?409:400).send({error:e.code==='23505'?'服务网点编号已存在':allowed.includes(e.message)?e.message:'创建服务网点失败'})}});
app.patch('/api/service-centers/:id',async(req,reply)=>{if(req.user.role!=='admin')return reply.code(403).send({error:'仅管理员可维护服务网点'});if(!pgService)return reply.code(503).send({error:'服务网点暂不可用'});try{return await pgService.updateServiceCenter(req.params.id,req.body||{})}catch(e){const allowed=['服务网点不存在','服务网点资料无效','服务网点资料已被其他操作更新，请重新载入'];return reply.code(e.code==='VERSION_CONFLICT'?409:e.code==='23505'?409:allowed.includes(e.message)&&e.message==='服务网点不存在'?404:400).send({error:e.code==='23505'?'服务网点编号已存在':allowed.includes(e.message)?e.message:'更新服务网点失败'})}});
app.get('/api/repairs/:id/warranty-assessments',async(req,reply)=>{if(!customers)return reply.code(503).send({error:'客户服务不可用'});try{return await customers.assessments(req.params.id)}catch(e){return customerError(e,reply)}});
app.post('/api/repairs/:id/warranty-assessments',async(req,reply)=>{if(!customers)return reply.code(503).send({error:'客户服务不可用'});try{return reply.code(201).send(await customers.addAssessment(req.params.id,req.body||{}))}catch(e){return customerError(e,reply)}});
app.get('/api/vins/:id/warranties',async(req,reply)=>{if(!customers)return reply.code(503).send({error:'客户服务不可用'});try{return await customers.warranties(req.params.id,req.query.asOf)}catch(e){return customerError(e,reply)}});
app.post('/api/vins/:id/warranties',async(req,reply)=>{if(!customers)return reply.code(503).send({error:'客户服务不可用'});try{return reply.code(201).send(await customers.addWarranty(req.params.id,req.body||{}))}catch(e){return customerError(e,reply)}});
app.post('/api/vins/:id/warranties/:warrantyId/revoke',async(req,reply)=>{if(!customers)return reply.code(503).send({error:'客户服务不可用'});try{return await customers.revokeWarranty(req.params.id,req.params.warrantyId,req.body||{})}catch(e){return customerError(e,reply)}});
app.get('/api/vins/:id/customer-history',async(req,reply)=>customers?customers.history(req.params.id):reply.code(503).send({error:'客户服务不可用'}));
app.post('/api/vins/:id/customer-history',async(req,reply)=>{if(!customers)return reply.code(503).send({error:'客户服务不可用'});try{return reply.code(201).send(await customers.assign(req.params.id,req.body||{}))}catch(e){return customerError(e,reply)}});

// ---------- BOM（第一阶段简化版：物料行 + 图纸编号，第二阶段做图文联动） ----------
app.get('/api/products/:id/bom/versions', async (req,reply) => {
  if(!pgProducts)return reply.code(503).send({error:'历史版本需要数据库存储'});
  const versions=await pgProducts.listBomVersions(req.params.id);
  return versions===null?reply.code(404).send({error:'整车产品不存在'}):versions;
});
app.get('/api/products/:id/bom/versions/:version', async (req,reply) => {
  if(!pgProducts)return reply.code(503).send({error:'历史版本需要数据库存储'});
  const version=await pgProducts.getBomVersion(req.params.id,req.params.version);
  return version||reply.code(404).send({error:'BOM 版本不存在'});
});
app.post('/api/products/:id/bom/versions/:version/publish', async (req,reply) => {
  if (!pgProducts) return reply.code(503).send({error:'BOM 发布需要数据库存储'});
  try { return await pgProducts.publishBom(req.params.id,req.params.version,objectStorage ? key=>objectStorage.head(key) : null,req.body?.draftRevision); }
  catch(e) { const allowed=['BOM 版本不存在','只有草稿可以发布','BOM 须包含有效配件、正数用量、单位和图纸编号','BOM 中有配件未设置为适配该整车','BOM 中有物料缺少该整车的图纸或有效位置','BOM 中有图纸文件不存在','图纸存储不可用，无法验证文件','请重新载入 BOM 草稿后发布','BOM 草稿已被其他操作更新，请重新载入']; return reply.code(e.code==='VERSION_CONFLICT'?409:e.message==='BOM 版本不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'BOM 发布失败'}); }
});
app.put('/api/products/:id/bom', async (req, reply) => {
  if (pgProducts) { try { return reply.send(await pgProducts.saveBom(req.params.id,req.body||{})); } catch(e) { const known=e.message.includes('不存在')||e.message.startsWith('BOM 物料')||e.message.startsWith('BOM 图纸')||e.message==='只有草稿可以修改'||e.message==='BOM 草稿版本无效'||e.code==='VERSION_CONFLICT'; return reply.code(e.code==='VERSION_CONFLICT'?409:known?400:409).send({error:known?e.message:'BOM 版本已存在或保存失败'}); } }
  const p = db.products.find(x => x.id === req.params.id);
  if (!p || p.kind !== 'vehicle') { reply.code(404).send({ error: '整车产品不存在' }); return; }
  const b = req.body || {};
  // 校验：BOM 物料必须引用零配件库中真实存在的 SKU
  const allPartSkus = new Set();
  db.products.filter(x => x.kind === 'part').forEach(x => x.skus.forEach(s => allPartSkus.add(s.sku)));
  const bad = (b.items || []).filter(it => !allPartSkus.has(it.sku));
  if (bad.length) {
    reply.code(400).send({ error: '以下物料 SKU 在零配件库中不存在：' + bad.map(x => x.sku).join(', ') });
    return;
  }
  p.bom = { version: b.version || p.bom.version || 'V1.0', items: b.items || [] };
  audit('bom.update', `products/${p.id}/bom`, null, p.bom);
  persist();
  reply.send(p.bom);
});

// ---------- 服务与追溯资源：VIN / 维修 / 适配 / 替代 ----------
app.get('/api/summary', async () => pgService ? pgService.summary() : ({
  vehicles: db.products.filter(p => p.kind === 'vehicle').length,
  parts: db.products.filter(p => p.kind === 'part').length,
  skus: db.products.reduce((n, p) => n + p.skus.length, 0),
  vins: db.vins.length,
  repairsOpen: db.repairs.filter(r => !['已关闭', '已完成'].includes(r.status)).length,
  repairs: db.repairs.length,
  fitments: db.products.reduce((n, p) => n + (p.fitments || []).length, 0),
  substitutes: db.substitutes.length,
  audits: (db.auditLog || []).length,
}));

app.get('/api/factories',async(req,reply)=>postgres?postgres.listFactories():reply.code(503).send({error:'工厂服务不可用'}));
app.post('/api/factories',async(req,reply)=>{if(!postgres)return reply.code(503).send({error:'工厂服务不可用'});try{return reply.code(201).send(await postgres.createFactory(req.body||{}))}catch(e){return reply.code(e.code==='23505'?409:400).send({error:e.code==='23505'?'工厂名称已存在':e.message==='工厂名称必填且不能超过 120 个字符'?e.message:'创建工厂失败'})}});
app.patch('/api/factories/:id',async(req,reply)=>{if(!postgres)return reply.code(503).send({error:'工厂服务不可用'});try{return await postgres.updateFactory(req.params.id,req.body||{})}catch(e){return reply.code(e.code==='23505'?409:e.message==='工厂不存在'?404:400).send({error:e.code==='23505'?'工厂名称已存在':e.message==='工厂不存在'||e.message==='工厂资料无效'?e.message:'更新工厂失败'})}});
app.get('/api/warehouses',async(req,reply)=>inventory?inventory.listWarehouses():reply.code(503).send({error:'库存服务不可用'}));
app.get('/api/warehouse-locations',async(req,reply)=>inventory?inventory.listLocations(String(req.query.warehouseId||'')||null):reply.code(503).send({error:'库位服务不可用'}));
const inventoryStocktakeRoute=fn=>async(req,reply)=>{if(req.user?.role!=='admin')return reply.code(403).send({error:'仅管理员可操作库存'});if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return await fn(req)}catch(e){const status=e.statusCode|| (e.code==='INVENTORY_STOCKTAKE_PENDING'||e.code==='INVENTORY_LEDGER_PENDING'||e.code==='42P01'?503:e.code==='23505'||e.code==='23514'?409:e.message?.includes('不存在')?404:400);return reply.code(status).send({error:status===503?'库存服务或迁移不可用':e.message||'库存操作失败'})}};
app.get('/api/stocktakes',inventoryStocktakeRoute(()=>inventory.listStocktakes()));
app.get('/api/stocktakes/items',inventoryStocktakeRoute(()=>inventory.listStocktakeItems()));
app.get('/api/inventory/non-sku-reservations',inventoryStocktakeRoute(()=>inventory.listNonSkuReservations()));
app.post('/api/inventory/non-sku-reservations',inventoryStocktakeRoute(req=>inventory.createNonSkuReservation(req.body||{})));
app.post('/api/inventory/non-sku-reservations/:id/release',inventoryStocktakeRoute(req=>inventory.releaseNonSkuReservation(req.params.id)));
app.post('/api/inventory/non-sku-movements',inventoryStocktakeRoute(req=>inventory.postNonSkuMovement(req.body||{})));
app.post('/api/stocktakes',inventoryStocktakeRoute(req=>inventory.openStocktake(req.body||{})));
app.post('/api/stocktakes/:id/counts',inventoryStocktakeRoute(req=>inventory.recordStocktakeCount(req.params.id,req.body||{})));
app.post('/api/stocktakes/:id/close',inventoryStocktakeRoute(req=>inventory.closeStocktake(req.params.id)));
app.post('/api/stocktakes/:id/cancel',inventoryStocktakeRoute(req=>inventory.cancelStocktake(req.params.id)));
app.post('/api/warehouses/:id/locations',async(req,reply)=>{if(!inventory)return reply.code(503).send({error:'库位服务不可用'});try{return reply.code(201).send(await inventory.createLocation({...req.body,warehouseId:req.params.id}))}catch(e){const allowed=['仓库、库位编号和名称必填','请选择已启用仓库'];return reply.code(e.code==='23505'?409:400).send({error:e.code==='23505'?'该仓库已存在相同库位编号':allowed.includes(e.message)?e.message:'创建库位失败'})}});
app.patch('/api/warehouse-locations/:id',async(req,reply)=>{if(!inventory)return reply.code(503).send({error:'库位服务不可用'});try{return await inventory.updateLocation(req.params.id,req.body||{})}catch(e){const allowed=['库位资料无效','库位不存在','默认库位不能停用、改号或设置上级库位','库位不能设置自己为上级库位','上级库位必须属于同一仓库'];return reply.code(e.code==='23505'?409:e.message==='库位不存在'?404:400).send({error:e.code==='23505'?'该仓库已存在相同库位编号':allowed.includes(e.message)?e.message:'更新库位失败'})}});
app.delete('/api/warehouse-locations/:id',async(req,reply)=>{if(!inventory)return reply.code(503).send({error:'库位服务不可用'});try{return await inventory.deleteLocation(req.params.id)}catch(e){const allowed=['库位不存在','默认库位不能删除','库位存在库存流水或关联业务记录，不能删除，请先处理关联单据或停用'];return reply.code(e.message==='库位不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'删除库位失败'})}});
app.get('/api/stock',async(req,reply)=>inventory?inventory.listStock():reply.code(503).send({error:'库存服务不可用'}));
// 库存货值：最近采购单价优先，缺失回退产品主档成本。实时库存页顶部与每行「货值」列都读它。
app.get('/api/stock/valuation',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'库存服务不可用'});try{return await pgService.stockValuation()}catch(e){req.log.error({err:e},'stock valuation failed');return reply.code(500).send({error:'库存货值读取失败'})}});
app.get('/api/stock/in-transit',async(req,reply)=>inventory?inventory.listInTransitBySku():reply.code(503).send({error:'库存服务不可用'}));
const b2cInventoryAuth=(req,reply)=>{const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');return process.env.INVENTORY_B2C_API_TOKEN&&token===process.env.INVENTORY_B2C_API_TOKEN||req.user?.role==='admin'?true:(reply.code(401).send({error:'库存接口未授权'}),false)};
// 对外 B2C 库存接口：错误经 sendApiError 脱敏，并尊重服务层显式 statusCode（如幂等冲突 409）。
app.get('/api/v1/inventory/availability',async(req,reply)=>{if(!b2cInventoryAuth(req,reply))return;if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return await inventory.b2cAvailability(String(req.query.warehouseId||''),String(req.query.sku||''))}catch(e){return sendApiError(reply,e,'库存查询失败')}});
app.post('/api/v1/inventory/reservations',async(req,reply)=>{if(!b2cInventoryAuth(req,reply))return;if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return reply.code(201).send(await inventory.createB2cReservation(req.body||{}))}catch(e){return sendApiError(reply,e,'库存预留失败')}});
app.get('/api/v1/inventory/reservations/:id',async(req,reply)=>{if(!b2cInventoryAuth(req,reply))return;if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return await inventory.getB2cReservation(req.params.id)}catch(e){return sendApiError(reply,e,'预留记录不存在',404)}});
app.post('/api/v1/inventory/reservations/:id/release',async(req,reply)=>{if(!b2cInventoryAuth(req,reply))return;if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return await inventory.releaseB2cReservation(req.params.id)}catch(e){return sendApiError(reply,e,'预留释放失败')}});
app.post('/api/v1/inventory/reservations/:id/ship',async(req,reply)=>{if(!b2cInventoryAuth(req,reply))return;if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return await inventory.shipB2cReservation(req.params.id)}catch(e){return sendApiError(reply,e,'预留发货失败')}});
app.get('/api/stock/by-location',async(req,reply)=>{if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return await inventory.listStockByLocation()}catch(e){if(e.code==='INVENTORY_LEDGER_PENDING')return reply.code(503).send({error:e.message});throw e}});
app.get('/api/stock/conditions',async(req,reply)=>{if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return await inventory.listConditionBalances()}catch(e){if(e.code==='INVENTORY_LEDGER_PENDING')return reply.code(503).send({error:e.message});throw e}});
app.post('/api/stock/conditions',async(req,reply)=>{if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return reply.code(201).send(await inventory.changeCondition(req.body||{}))}catch(e){const allowed=['库存状态变更资料无效','库位或 SKU 不可用','该 SKU 在所选仓库没有库存记录','库存账本与仓库余额不一致，不能变更库存状态','操作编号已用于其他库存状态变更'];return reply.code(e.code==='23505'?409:e.code==='23514'?409:400).send({error:e.code==='23514'?'该状态库存不足或已有数量被预占':allowed.includes(e.message)?e.message:'库存状态变更失败'})}});
app.get('/api/stock/movements',async(req,reply)=>inventory?inventory.listMovements():reply.code(503).send({error:'库存服务不可用'}));
app.get('/api/inventory/outbound-orders',async(req,reply)=>inventory?inventory.listOutboundOrders():reply.code(503).send({error:'库存服务不可用'}));
app.post('/api/inventory/outbound-orders',inventoryStocktakeRoute(req=>inventory.createOutboundOrder(req.body||{})));
app.post('/api/inventory/outbound-orders/:id/confirm',inventoryStocktakeRoute(req=>inventory.confirmOutboundOrder(req.params.id)));
app.post('/api/inventory/outbound-orders/:id/cancel',inventoryStocktakeRoute(req=>inventory.cancelOutboundOrder(req.params.id,req.body||{})));
app.post('/api/inventory/outbound-orders/:id/return',inventoryStocktakeRoute(req=>inventory.returnOutboundOrder(req.params.id,req.body||{})));
app.get('/api/stock/ledger',async(req,reply)=>{if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return await inventory.listLedger()}catch(e){if(e.code==='INVENTORY_LEDGER_PENDING')return reply.code(503).send({error:e.message});throw e}});
app.get('/api/stock/reconciliation',async(req,reply)=>{if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return await inventory.listReconciliation()}catch(e){if(e.code==='INVENTORY_LEDGER_PENDING')return reply.code(503).send({error:e.message});throw e}});
app.patch('/api/warehouses/:id',async(req,reply)=>{if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return await inventory.updateWarehouse(req.params.id,req.body||{})}catch(e){const allowed=['仓库资料无效','仓库不存在'];return reply.code(e.code==='23505'?409:e.message==='仓库不存在'?404:400).send({error:e.code==='23505'?'仓库编号或名称已存在':allowed.includes(e.message)?e.message:'更新仓库失败'})}});
app.delete('/api/warehouses/:id',async(req,reply)=>{if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return await inventory.deleteWarehouse(req.params.id)}catch(e){return reply.code(e.message==='仓库不存在'?404:400).send({error:e.code==='23503'?'仓库存在库存或关联业务记录，不能删除':['仓库不存在','仓库存在库存或关联业务记录，不能删除'].includes(e.message)?e.message:'删除仓库失败'})}});
app.post('/api/warehouses',async(req,reply)=>{if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return reply.code(201).send(await inventory.createWarehouse(req.body||{}))}catch(e){return reply.code(e.code==='23505'?409:400).send({error:e.code==='23505'?'仓库名称已存在':e.message==='仓库名称和类型无效'?e.message:'创建仓库失败'})}});
app.post('/api/stock/movements',async(req,reply)=>{if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return reply.code(201).send(await inventory.move(req.body||{}))}catch(e){const allowed=['请填写有效的物料、数量和业务说明','调拨来源和目标仓库无效','调拨来源库位与目标库位不能相同','操作编号已用于其他库存变动','配件 SKU 不存在','仓库不存在','来源仓库库存不足','可用库存不足，部分库存已预占或处于质检/不合格状态','库存账本与仓库余额不一致，已暂停出库','库存账本与仓库余额不一致，不能变更库存','库存记录不存在'];return reply.code(e.statusCode|| (e.code==='23505'||e.message==='库存账本与仓库余额不一致，不能变更库存'?409:400)).send({error:e.code==='23505'?'该库存操作正在处理，请重试':allowed.includes(e.message)?e.message:'库存变动失败'})}});
app.post('/api/stock/adjustments',async(req,reply)=>{if(req.user?.role!=='admin')return reply.code(403).send({error:'仅管理员可调整库存'});if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return reply.code(201).send(await inventory.adjust(req.body||{}))}catch(e){const allowed=['库存调整资料无效','请选择已启用仓库和有效配件 SKU','调整编号已用于其他库存变动','库存账本与仓库余额不一致，不能调整','库存不足，不能出库','可用库存不足，部分库存已预占或处于质检/不合格状态'];return reply.code(e.code==='23505'||e.code==='23514'?409:400).send({error:allowed.includes(e.message)?e.message:'库存调整失败'})}});
app.get('/api/production-orders/:id/attachments',async(req,reply)=>pgService?pgService.listProductionAttachments(req.params.id):reply.code(503).send({error:'生产服务不可用'}));
app.post('/api/production-orders/:id/attachments',async(req,reply)=>{if(!pgService||!objectStorage)return reply.code(503).send({error:'附件存储不可用'});const type=String(req.headers['content-type']||'').split(';')[0].trim();if(!['image/jpeg','image/png','image/webp','image/avif','application/pdf'].includes(type)||!Buffer.isBuffer(req.body)||!req.body.length||req.body.length>10*1024*1024)return reply.code(400).send({error:'仅支持 10MB 以内的 PDF 或图片附件'});let fileName='';try{fileName=decodeURIComponent(String(req.headers['x-file-name']||'')).slice(0,200)}catch(_){return reply.code(400).send({error:'文件名无效'})}if(!fileName)return reply.code(400).send({error:'文件名必填'});let category='其他';try{category=decodeURIComponent(String(req.headers['x-file-category']||'')).trim().slice(0,40)||'其他'}catch(_){category='其他'}const refId=String(req.headers['x-ref-id']||'').trim().toLowerCase();const key=`production-orders/${req.params.id}/${require('crypto').randomUUID()}`;try{await objectStorage.put({key,contentType:type,body:req.body});const row=await pgService.addProductionAttachment(req.params.id,{key,fileName,contentType:type,fileSize:req.body.length,category,refId});return reply.code(201).send(row)}catch(e){await objectStorage.remove(key).catch(()=>{});const status=e.message==='生产订单不存在'?404:e.message==='付款或发票记录编号无效'||e.message==='付款或发票记录不存在'?400:502;return reply.code(status).send({error:status===502?'附件保存失败':e.message})}});
app.get('/api/production-orders/:id/attachments/:attachmentId',async(req,reply)=>{if(!pgService||!objectStorage)return reply.code(503).send({error:'附件存储不可用'});const record=await pgService.getProductionAttachment(req.params.id,req.params.attachmentId);if(!record)return reply.code(404).send({error:'附件不存在'});try{const obj=await objectStorage.get(record.key);return reply.header('Content-Disposition',`attachment; filename*=UTF-8''${encodeURIComponent(record.fileName)}`).type(record.contentType).send(obj.Body)}catch(_){return reply.code(502).send({error:'附件读取失败'})}});
app.get('/api/production-orders/:id/materials',async(req,reply)=>pgService?pgService.listOrderMaterials(req.params.id):reply.code(503).send({error:'生产服务不可用'}));
app.patch('/api/production-orders/:id/materials/:materialId',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return await pgService.updateMaterialSupplier(req.params.id,req.params.materialId,req.body?.supplyParty,req.body?.warehouseId)}catch(e){const allowed=['供料方无效','生产物料不存在','请选择已启用的出料仓和有效配件','生产物料计划总量必须为正整数','库存预占迁移尚未执行','出料仓库存不足','库存账本与仓库余额不一致，已暂停预占','可用库存不足，无法预占生产物料','ALSVID 供料必须选择出料仓','已完成或取消的订单不能修改供料责任'];return reply.code(e.message==='生产物料不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'更新物料供料方失败'})}});
app.patch('/api/production-orders/:id/progress',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return await pgService.updateProductionProgressV3(req.params.id,req.body||{})}catch(e){const allowed=['完成数量必须为非负整数','生产订单不存在','完成数量不能超过计划数量','请先确认工厂，再更新生产进度','已完成或取消的订单不能更新生产进度'];return reply.code(e.message==='生产订单不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'更新生产进度失败'})}});
app.post('/api/production-orders/:id/factory-confirm',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return reply.send(await pgService.confirmProductionFactory(req.params.id))}catch(e){const allowed=['生产订单不存在','已取消订单不能确认工厂'];return reply.code(e.message==='生产订单不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'确认工厂失败'})}});
app.get('/api/production-orders/:id/progress-events',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return reply.send(await pgService.listProductionOrderEvents(req.params.id))}catch(e){return reply.code(e.message==='生产订单不存在'?404:500).send({error:e.message==='生产订单不存在'?e.message:'读取生产进度记录失败'})}});
app.patch('/api/production-orders/:id/quality',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return await pgService.updateProductionQuality(req.params.id,req.body||{})}catch(e){const allowed=['请选择质检结果并填写质检说明','生产订单不存在','当前状态不能登记质检'];return reply.code(e.message==='生产订单不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'更新质检记录失败'})}});
app.get('/api/production-orders/:id/vin-quality',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});return pgService.listProductionVinQuality(req.params.id)});
app.get('/api/production-deliveries/in-transit',async(req,reply)=>pgService?pgService.listDeliveries('',true):reply.code(503).send({error:'生产服务不可用'}));
// 全量发运单（默认全部状态）。物流跟踪页要看历史（含已签收/已入库），只给「在途」会把已完结的票藏死。
app.get('/api/production-deliveries',async(req,reply)=>{
  if(!pgService)return reply.code(503).send({error:'生产服务不可用'});
  try{return await pgService.listDeliveries('',false,String(req.query.status||''))}
  catch(e){req.log.error({err:e},'list deliveries failed');return reply.code(500).send({error:'发运单读取失败'})}
});
app.get('/api/production-orders/:id/deliveries',async(req,reply)=>pgService?pgService.listDeliveries(req.params.id):reply.code(503).send({error:'生产服务不可用'}));
app.post('/api/production-orders/:id/deliveries',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return reply.code(201).send(await pgService.createDelivery(req.params.id,req.body||{}))}catch(e){const allowed=['发运编号无效','发运单号、目标仓库和正整数发运数量必填','生产订单不存在','已取消订单不能创建发运','请先登记已完成的生产数量后再发运','累计发运数量不能超过已完成生产数量','请选择已启用的国内仓或海外仓','发运数量超过生产订单计划数量','发运编号已用于其他内容'];return reply.code(e.code==='23505'||e.code==='IDEMPOTENCY_CONFLICT'?409:400).send({error:e.code==='23505'?'发运单号已存在':allowed.includes(e.message)?e.message:'创建发运记录失败'})}});
app.post('/api/production-deliveries/:id/cancel',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return await pgService.cancelDelivery(req.params.id,req.body||{})}catch(e){const allowed=['取消原因无效','发运记录不存在','发运记录已取消','只有待发运记录可以取消'];return reply.code(e.message==='发运记录不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'取消发运记录失败'})}});
app.post('/api/production-deliveries/:id/dispatch',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return await pgService.dispatchDelivery(req.params.id)}catch(e){const allowed=['发运记录不存在','只有待发运记录可以标记发出','发运前须为批次分配完整 VIN','多车型发运批次必须先保存车型明细','车型发运数量不能超过订单计划数量'];return reply.code(e.message==='发运记录不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'更新发运状态失败'})}});
app.patch('/api/production-deliveries/:id/logistics',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return await pgService.updateDeliveryLogistics(req.params.id,req.body||{})}catch(e){const allowed=['物流信息无效','发运记录不存在','已入库批次不能修改物流信息','已取消批次不能修改物流信息'];return reply.code(e.message==='发运记录不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'更新物流信息失败'})}});
app.patch('/api/production-deliveries/:id/customs',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return await pgService.updateDeliveryCustoms(req.params.id,req.body||{})}catch(e){const allowed=['清关状态或记录无效','发运记录不存在','只有在途发运记录可以更新清关状态','国内仓发运不能登记海关清关状态'];return reply.code(e.message==='发运记录不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'更新清关记录失败'})}});
app.get('/api/production-deliveries/:id/customs-history',async(req,reply)=>{if(req.user?.role!=='admin')return reply.code(403).send({error:'仅管理员可查看清关变更历史'});if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return await pgService.deliveryCustomsHistory(req.params.id)}catch(e){return reply.code(e.message==='发运记录不存在'?404:500).send({error:e.message==='发运记录不存在'?e.message:'读取清关历史失败'})}});
app.get('/api/production-deliveries/:id/vins',async(req,reply)=>pgService?pgService.listDeliveryVins(req.params.id):reply.code(503).send({error:'生产服务不可用'}));
app.get('/api/production-deliveries/:id/items',async(req,reply)=>pgService?pgService.listDeliveryItems(req.params.id):reply.code(503).send({error:'生产服务不可用'}));
app.put('/api/production-deliveries/:id/items',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return reply.send(await pgService.saveDeliveryItems(req.params.id,req.body||{}))}catch(e){const allowed=['车型明细无效','发运记录不存在','只有待发运批次可以修改车型明细','车型 SKU 不属于该生产订单','车型明细合计必须等于批次发运数量','车型发运数量不能超过订单计划数量','车型跨批次累计发运数量不能超过订单计划数量'];return reply.code(e.message==='发运记录不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'保存发货车型明细失败'})}});
app.put('/api/production-deliveries/:id/vins',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return await pgService.assignDeliveryVins(req.params.id,req.body||{})}catch(e){const a=['VIN 列表无效','发运记录不存在','只有待发运批次可以分配 VIN','VIN 数量不能超过批次发运数量','VIN 不属于该生产订单','VIN 已分配给其他发运批次'];return reply.code(e.message==='发运记录不存在'?404:e.code==='23505'?409:400).send({error:a.includes(e.message)?e.message:e.code==='23505'?'VIN 已分配给其他发运批次':'分配发运 VIN 失败'})}});
app.get('/api/production-deliveries/:id/receipts',async(req,reply)=>pgService?pgService.listDeliveryReceipts(req.params.id):reply.code(503).send({error:'生产服务不可用'}));
app.post('/api/production-deliveries/:id/receive',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return await pgService.receiveDelivery(req.params.id,req.body||{})}catch(e){const allowed=['签收编号、数量或 VIN 列表无效','发运记录不存在','只有在途发运记录可以签收','海外仓签收入库前须完成清关或确认无需清关','该发运记录已全部签收入库','该发运记录已签收入库','签收数量不能超过本批发运数量','本次签收后仍有未到数量，必须填写差异说明','签收数量超过本批剩余发运数量','签收数量超过该车型本批剩余分配数量','签收编号已用于其他记录','签收 VIN 未分配给该发运批次','签收 VIN 已登记到货','收货库位无效或已停用','库存账本与仓库余额不一致，不能入库'];return reply.code(e.statusCode||(e.message==='库存账本与仓库余额不一致，不能入库'?409:400)).send({error:allowed.includes(e.message)?e.message:'签收入库失败'})}});
app.get('/api/finance/production-costs',async(req,reply)=>pgService?pgService.listProductionCosts():reply.code(503).send({error:'生产成本服务不可用'}));
app.get('/api/production-orders/:id/finance',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return await pgService.listProductionFinance(req.params.id)}catch(e){return reply.code(e.message==='生产订单不存在'?404:500).send({error:e.message==='生产订单不存在'?e.message:'读取付款与发票失败'})}});
app.post('/api/production-orders/:id/payments',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return reply.code(201).send(await pgService.addProductionPayment(req.params.id,req.body||{}))}catch(e){const allowed=['生产订单不存在','请填写有效的付款日期、付款主体、收款方和付款金额','付款请求编号已用于不同内容'];return reply.code(e.statusCode|| (e.message==='生产订单不存在'?404:400)).send({error:allowed.includes(e.message)?e.message:'登记付款失败'})}});
app.post('/api/production-orders/:id/invoices',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return reply.code(201).send(await pgService.addProductionInvoice(req.params.id,req.body||{}))}catch(e){const allowed=['生产订单不存在','发票状态、发票号码或备注无效','开票日期无效','请填写有效的开票日期、发票号码和发票金额','发票金额无效','发票请求编号已用于不同内容'];return reply.code(e.statusCode|| (e.message==='生产订单不存在'?404:400)).send({error:allowed.includes(e.message)?e.message:'登记发票失败'})}});
app.get('/api/production-orders',async(req,reply)=>pgService?pgService.listProductionOrdersV3():reply.code(503).send({error:'生产订单需要数据库存储'}));
// 生产总览的两个外部口径（现货在库 / 应付未结）。前端一次拿完，不用为两个数字去拉整个库存页。
app.get('/api/production-orders/overview-extras',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产服务不可用'});try{return await pgService.productionOverviewExtras()}catch(e){req.log.error({err:e},'production overview extras failed');return reply.code(500).send({error:'生产总览补充数据读取失败'})}});
app.get('/api/production-orders/:id/bom-snapshot',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产订单服务不可用'});const row=await pgService.getProductionBomSnapshot(req.params.id);return row||reply.code(404).send({error:'生产订单不存在'});});
app.post('/api/production-orders',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产订单需要数据库存储'});try{return reply.code(201).send(await pgService.createProductionOrderV3(req.body||{}));}catch(e){const allowed=['请完整填写订单信息、车型明细、金额、币种、汇率和日期，且同一 SKU 不能重复','请选择已启用的合作工厂','车型明细中包含未启用或不存在的整车 SKU','生产订单幂等编号已用于不同内容'];return reply.code(e.statusCode||(e.code==='23505'?409:400)).send({error:e.code==='23505'?'生产订单号已存在':allowed.includes(e.message)?e.message:'生产订单创建失败'});}});
app.patch('/api/production-orders/:id',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产订单需要数据库存储'});try{return reply.send(await pgService.updateProductionOrderV3(req.params.id,req.body||{}));}catch(e){const allowed=['请完整填写订单信息、车型明细、金额、币种、汇率和日期，且同一 SKU 不能重复','生产订单不存在','已有生产进度、交货或发货记录的订单不能修改车型和数量','请选择已启用的合作工厂','车型明细中包含未启用或不存在的整车 SKU'];return reply.code(e.code==='23505'?409:e.message==='生产订单不存在'?404:400).send({error:e.code==='23505'?'生产订单号已存在':allowed.includes(e.message)?e.message:'生产订单保存失败'});}});
app.patch('/api/production-orders/:id/status',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'生产订单需要数据库存储'});try{return await pgService.transitionProductionOrder(req.params.id,req.body?.status)}catch(e){const allowed=['生产订单不存在','订单状态流转无效','生产进度须为 100%，实际完成数量须等于计划数量才能完成生产订单','全部计划数量确认入库后才能完成生产订单','已有 VIN 关联的订单不能取消','已有在途或已入库发运的订单不能取消','生产物料预占数量无效','ALSVID 供料物料尚未按计划完成库存预占','生产物料出料仓库存不足','库存账本与仓库余额不一致，已暂停生产完工','库存账本与库位余额不一致，已暂停生产完工','生产物料出料仓缺少启用的默认库位','生产物料缺少足够的可用库位库存，无法完成领料','生产物料预占已超过当前库存'];return reply.code(e.message==='生产订单不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'更新订单状态失败'});}});
app.get('/api/vins', async (req) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (pgService) return pgService.listVins(q);
  return db.vins.filter(v => !q || [v.vin, v.model, v.sku, v.batch, v.factory].some(x => String(x || '').toLowerCase().includes(q)));
});
app.get('/api/vins/:id/trace', async (req,reply) => { if (pgService) { const trace=await pgService.getVinTrace(req.params.id); return trace ? reply.send(trace) : reply.code(404).send({error:'VIN 档案不存在'}); } const v=db.vins.find(x=>x.id===req.params.id); return v ? reply.send({...v,repairs:db.repairs.filter(r=>r.vin===v.vin)}) : reply.code(404).send({error:'VIN 档案不存在'}); });
app.put('/api/vins/:id/installed', async (req,reply) => { if (!pgService) return reply.code(501).send({error:'实际装车明细需要数据库存储'}); try { return reply.send(await pgService.replaceInstalled(req.params.id,req.body?.items)); } catch(e) { const allowed=['装车明细格式无效','VIN 档案不存在','装车数量必须大于零','生产偏差必须记录批准人','装车配件 SKU 不存在'];if(e.message==='VIN 档案不存在')return reply.code(404).send({error:e.message});if(allowed.includes(e.message))return reply.code(400).send({error:e.message});if(e.code==='23505')return reply.code(409).send({error:'装车明细与现有记录冲突'});logServerError(e.code||'VIN_INSTALLED_PERSISTENCE_ERROR');return reply.code(500).send({error:'装车明细保存失败，请稍后重试'}); } });
app.post('/api/vins', async (req, reply) => {
  const b = req.body || {};
  if (pgService) { try { return reply.code(201).send(await pgService.createVin(b)); } catch(e) { const allowed=['VIN 格式无效','整车 SKU 不存在','选择 BOM 版本前请先选择整车 SKU','BOM 版本不属于所选整车','生产订单不存在','VIN 的整车 SKU、BOM 版本、工厂和批次须与生产订单一致','仅生产中或待发货的订单可以关联新 VIN','订单关联 VIN 数量已达到计划数量','已关联生产订单的 VIN 不能变更订单']; return reply.code(e.code === '23505' ? 409 : 400).send({error:e.code === '23505' ? 'VIN 已存在' : allowed.includes(e.message) ? e.message : 'VIN 档案写入失败'}); } }
  const vin = String(b.vin || '').trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{11,20}$/.test(vin)) { reply.code(400).send({ error: 'VIN 必须为 11–20 位有效字符' }); return; }
  if (db.vins.some(v => String(v.vin).toUpperCase() === vin)) { reply.code(409).send({ error: 'VIN 已存在' }); return; }
  if (b.sku && !db.products.some(p => p.kind === 'vehicle' && p.skus.some(s => s.sku === b.sku))) { reply.code(400).send({ error: '整车 SKU 不存在' }); return; }
  const v = { id: `vin-${++db.counters.vin}`, vin, model: b.model || '', sku: b.sku || '', orderNo: b.orderNo || '', factory: b.factory || '', batch: b.batch || '', bomVersion: b.bomVersion || '', installed: b.installed || '', serials: b.serials || '', producedAt: b.producedAt || '', status: b.status || '在用', createdAt: new Date().toISOString() };
  db.vins.push(v); audit('vin.create', `vins/${v.id}`, null, v); persist(); reply.code(201).send(v);
});
app.patch('/api/vins/:id', async (req, reply) => {
  if (pgService) { try { return reply.send(await pgService.updateVin(req.params.id,req.body||{})); } catch(e) { const allowed=['VIN 档案不存在','VIN 格式无效','整车 SKU 不存在','选择 BOM 版本前请先选择整车 SKU','BOM 版本不属于所选整车','生产订单不存在','VIN 的整车 SKU、BOM 版本、工厂和批次须与生产订单一致','仅生产中或待发货的订单可以关联新 VIN','订单关联 VIN 数量已达到计划数量','已关联生产订单的 VIN 不能变更订单']; return reply.code(e.message === 'VIN 档案不存在' ? 404 : e.code === '23505' ? 409 : 400).send({error:e.code === '23505' ? 'VIN 已存在' : allowed.includes(e.message) ? e.message : 'VIN 档案更新失败'}); } }
  const v = db.vins.find(x => x.id === req.params.id); if (!v) { reply.code(404).send({ error: 'VIN 档案不存在' }); return; }
  const b = req.body || {}; const vin = String(b.vin ?? v.vin).trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{11,20}$/.test(vin)) { reply.code(400).send({ error: 'VIN 必须为 11–20 位有效字符' }); return; }
  if (db.vins.some(x => x.id !== v.id && String(x.vin).toUpperCase() === vin)) { reply.code(409).send({ error: 'VIN 已存在' }); return; }
  if (vin !== v.vin && db.repairs.some(r => r.vin === v.vin)) { reply.code(409).send({ error: 'VIN 已关联维修工单，不能更改' }); return; }
  if (b.sku && !db.products.some(p => p.kind === 'vehicle' && p.skus.some(s => s.sku === b.sku))) { reply.code(400).send({ error: '整车 SKU 不存在' }); return; }
  const before = { ...v }; for (const k of ['model','sku','orderNo','factory','batch','bomVersion','installed','serials','producedAt','status']) if (b[k] !== undefined) v[k] = b[k]; v.vin = vin; audit('vin.update', `vins/${v.id}`, before, v); persist(); reply.send(v);
});

app.get('/api/repairs', async (req) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  if (pgService) return pgService.listRepairs(q);
  return db.repairs.filter(r => !q || [r.no, r.vin, r.type, r.fault, r.store, r.status].some(x => String(x || '').toLowerCase().includes(q)));
});
app.post('/api/repairs', async (req, reply) => {
  const b = req.body || {};
  if (pgService) { if (!b.vin || !b.fault) return reply.code(400).send({error:'VIN 和故障描述必填'}); try { return reply.code(201).send(await pgService.createRepair(b)); } catch(e) { const known=['服务网点编号无效','服务网点不存在','只能将维修工单分配给已启用的服务网点','维修配件 SKU 不存在','新工单不能直接完成或关闭','工单状态无效','工单类型无效','VIN 档案不存在','故障描述必填','维修数量必须为正整数'];return reply.code(400).send({error:known.includes(e.message)?e.message:e.code==='23503'?'VIN 或配件 SKU 不存在':'维修工单写入失败'}); } }
  if (!b.vin || !b.fault) { reply.code(400).send({ error: 'VIN 和故障描述必填' }); return; }
  if (!db.vins.some(v => v.vin === b.vin)) { reply.code(400).send({ error: 'VIN 不存在，请先建立车辆档案' }); return; }
  if (b.sku && !db.products.some(p => p.kind === 'part' && p.skus.some(s => s.sku === b.sku))) { reply.code(400).send({ error: '维修配件 SKU 不存在' }); return; }
  if (b.qty !== undefined && (!Number.isInteger(Number(b.qty)) || Number(b.qty) < 1)) { reply.code(400).send({ error: '数量必须为正整数' }); return; }
  if (['已完成', '已关闭'].includes(b.status)) { reply.code(400).send({ error: '新工单不能直接设为完成或关闭' }); return; }
  const r = { id: `repair-${++db.counters.repair}`, no: `WO-${String(db.counters.repair).padStart(5, '0')}`, vin: b.vin, type: b.type || '质保维修', fault: b.fault, sku: b.sku || '', qty: Number(b.qty || 0), store: b.store || '', status: b.status || '待收货', oldPart: b.oldPart || '', createdAt: new Date().toISOString().slice(0, 10) };
  db.repairs.push(r); audit('repair.create', `repairs/${r.id}`, null, r); persist(); reply.code(201).send(r);
});
app.get('/api/repairs/:id/finance',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'维修服务不可用'});try{return await pgService.repairFinance(req.params.id)}catch(e){return reply.code(e.message==='维修工单不存在'?404:500).send({error:e.message==='维修工单不存在'?e.message:'读取维修报价失败'})}});
app.post('/api/repairs/:id/quotes',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'维修服务不可用'});try{return reply.code(201).send(await pgService.createRepairQuote(req.params.id,req.body||{}))}catch(e){const a=['维修工单不存在','维修报价资料无效','已完成或关闭的工单不能报价','已有维修收款，不能新建报价版本','报价编号已用于其他内容'];return reply.code(e.message==='维修工单不存在'?404:e.code==='VERSION_CONFLICT'?409:400).send({error:a.includes(e.message)?e.message:'创建维修报价失败'})}});
app.post('/api/repairs/:id/quotes/:quoteId/decision',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'维修服务不可用'});try{return reply.code(201).send(await pgService.decideRepairQuote(req.params.id,req.params.quoteId,req.body||{}))}catch(e){const a=['维修工单不存在','维修报价不存在','该报价已由不同内容确认','只能确认最新报价版本','报价确认资料无效'];return reply.code(e.message==='维修工单不存在'||e.message==='维修报价不存在'?404:e.code==='VERSION_CONFLICT'?409:400).send({error:a.includes(e.message)?e.message:'保存报价确认失败'})}});
app.post('/api/repairs/:id/quotes/:quoteId/payments',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'维修服务不可用'});try{return reply.code(201).send(await pgService.recordRepairPayment(req.params.id,req.params.quoteId,req.body||{}))}catch(e){const a=['维修工单不存在','维修报价不存在','请确认实际到账并填写有效收款资料','客户接受报价后才能登记收款','只能为最新报价版本登记收款','收款金额超过报价总额'];return reply.code(e.message==='维修工单不存在'||e.message==='维修报价不存在'?404:e.code==='23505'?409:400).send({error:a.includes(e.message)?e.message:e.code==='23505'?'该收款凭据已登记':'登记维修收款失败'})}});
app.post('/api/repairs/:id/complete',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'维修服务不可用'});try{return await pgService.completeRepair(req.params.id,req.body||{})}catch(e){const allowed=['维修工单不存在','只有维修中的工单可以完成更换','工单未指定更换配件','工单数量无效','净领用数量须等于工单数量','VIN 档案不存在','所选原装配件不存在或数量不足','记录序列号时更换数量必须为一','有序列号的原配件只能逐件更换'];return reply.code(e.message==='维修工单不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'完成维修失败'});}});
app.post('/api/repairs/:id/complete-service',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'维修服务不可用'});try{return await pgService.completeRepairService(req.params.id,req.body||{})}catch(e){const allowed=['维修工单不存在','只有维修中的工单可以完成服务','已指定更换配件的工单应记录配件更换','已有领退料记录的工单不能按无配件服务完成','服务完成说明必填'];return reply.code(e.message==='维修工单不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'完成售后服务失败'});}});
app.get('/api/repairs/:id/old-part',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'维修服务不可用'});const record=await pgService.getRecovery(req.params.id);return record||reply.code(404).send({error:'旧件回收记录不存在'});});
app.post('/api/repairs/:id/old-part',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'维修服务不可用'});try{return await pgService.transitionRecovery(req.params.id,req.body||{})}catch(e){const allowed=['请填写旧件处理说明','旧件回收记录不存在','旧件状态流转无效','请选择旧件退回仓库','已有入库申请，不能更改旧件状态'];return reply.code(e.message==='旧件回收记录不存在'?404:400).send({error:allowed.includes(e.message)?e.message:'更新旧件状态失败'});}});
app.post('/api/repairs/:id/old-part/restock/:action',async(req,reply)=>{if(!pgService)return reply.code(503).send({error:'维修服务不可用'});try{const actions={request:()=>pgService.requestOldPartRestock(req.params.id,req.body||{}),approve:()=>pgService.approveOldPartRestock(req.params.id),cancel:()=>pgService.cancelOldPartRestock(req.params.id)};if(!Object.hasOwn(actions,req.params.action))return reply.code(404).send({error:'操作不存在'});return await actions[req.params.action]()}catch(e){const allowed=['请填写翻新与检测说明','旧件回收记录不存在','旧件须先退回并经过检测或返修','旧件已有入库申请','旧件尚未申请入库','旧件已经批准入库','旧件状态不允许入库','旧件 SKU 不存在','没有可撤销的入库申请','库存账本与仓库余额不一致，不能入库','旧件入库仓库缺少启用的默认库位'];return reply.code(e.message==='旧件回收记录不存在'?404:(e.message==='库存账本与仓库余额不一致，不能入库'||e.message==='旧件入库仓库缺少启用的默认库位')?409:400).send({error:allowed.includes(e.message)?e.message:'旧件入库操作失败'});}});
app.get('/api/repairs/:id/stock',async(req,reply)=>inventory?inventory.listRepairMoves(req.params.id):reply.code(503).send({error:'库存服务不可用'}));
app.post('/api/repairs/:id/stock',async(req,reply)=>{if(!inventory)return reply.code(503).send({error:'库存服务不可用'});try{return reply.code(201).send(await inventory.repairMove(req.params.id,req.body||{}));}catch(e){const allowed=['领用或退回数量无效','维修工单不存在','工单未指定更换配件','操作编号已用于其他领退料','已完成或关闭的工单不能领退料','领用数量超过工单数量','退回数量超过该仓库未退回的领用数量','请选择维修店仓','维修店仓库存不足','可用库存不足，部分库存已预占生产物料','库存账本与仓库余额不一致，已暂停出库','库存账本与仓库余额不一致，不能变更库存','库存记录不存在','所选来源库位的可用库存不足'];return reply.code(e.message==='维修工单不存在'?404:e.code==='23505'||e.message==='库存账本与仓库余额不一致，不能变更库存'?409:400).send({error:e.code==='23505'?'该操作正在处理，请重试':allowed.includes(e.message)?e.message:'工单领退料失败'});}});
app.patch('/api/repairs/:id', async (req, reply) => {
  if (pgService) { try { return reply.send(await pgService.updateRepair(req.params.id,req.body||{})); } catch(e) { const allowed=['维修工单不存在','VIN 档案不存在','工单状态无效','工单类型无效','故障描述必填','维修数量必须为正整数','维修配件 SKU 不存在','已有领退料记录的工单不能更改车辆、配件或数量','请通过完成更换记录工单','已完成或关闭的工单不能重新打开','工单完成后才能关闭','已完成或关闭的工单不能更改业务信息','已完成的工单不能更改车辆、配件或数量','服务网点编号无效','服务网点不存在','只能将维修工单分配给已启用的服务网点'];return reply.code(e.message === '维修工单不存在' ? 404 : 400).send({error:allowed.includes(e.message)?e.message:'维修工单更新失败'}); } }
  const r = db.repairs.find(x => x.id === req.params.id); if (!r) { reply.code(404).send({ error: '维修工单不存在' }); return; }
  const b = req.body || {}; const nextVin = b.vin ?? r.vin; const nextSku = b.sku ?? r.sku;
  if (!db.vins.some(v => v.vin === nextVin)) { reply.code(400).send({ error: 'VIN 档案不存在' }); return; }
  if (nextSku && !db.products.some(p => p.kind === 'part' && p.skus.some(s => s.sku === nextSku))) { reply.code(400).send({ error: '维修配件 SKU 不存在' }); return; }
  if (b.qty !== undefined && (!Number.isInteger(Number(b.qty)) || Number(b.qty) < 1)) { reply.code(400).send({ error: '数量必须为正整数' }); return; }
  if (b.fault !== undefined && !String(b.fault).trim()) { reply.code(400).send({ error: '故障描述必填' }); return; }
  if (b.status !== undefined && !['待收货','维修中','待配件','已完成','已关闭'].includes(b.status)) { reply.code(400).send({ error: '工单状态无效' }); return; }
  const before = { ...r }; for (const k of ['vin','type','fault','sku','qty','store','status','oldPart','result','newSerial','oldSerial']) if (b[k] !== undefined) r[k] = k === 'qty' ? Number(b[k]) : b[k]; audit('repair.update', `repairs/${r.id}`, before, r); persist(); reply.send(r);
});

app.get('/api/substitutes', async () => pgService ? pgService.listSubs() : db.substitutes);
app.post('/api/substitutes', async (req, reply) => {
  const b = req.body || {};
  if (pgService) { if (!b.originalSku || !b.replacementSku || !b.reason) return reply.code(400).send({error:'原 SKU、替代 SKU 和变更原因必填'}); try { return reply.code(201).send(await pgService.createSub(b)); } catch(e) { return reply.code(e.code === '23503' ? 400 : 400).send({error:e.code === '23503' ? 'SKU 不存在' : e.message === '替代前后 SKU 不能相同' ? e.message : '替代关系写入失败'}); } }
  if (!b.originalSku || !b.replacementSku || !b.reason) { reply.code(400).send({ error: '原 SKU、替代 SKU 和变更原因必填' }); return; }
  if (b.originalSku === b.replacementSku) { reply.code(400).send({ error: '替代前后 SKU 不能相同' }); return; }
  const all = new Set(db.products.filter(p => p.kind === 'part').flatMap(p => p.skus.map(s => s.sku)));
  if (!all.has(b.originalSku) || !all.has(b.replacementSku)) { reply.code(400).send({ error: '原 SKU 和替代 SKU 都必须来自零配件库' }); return; }
  const s = { id: `sub-${++db.counters.substitute}`, originalSku: b.originalSku, replacementSku: b.replacementSku, reason: b.reason, effectiveAt: b.effectiveAt || new Date().toISOString().slice(0, 10), status: b.status || '启用', note: b.note || '' };
  db.substitutes.push(s); audit('substitute.create', `substitutes/${s.id}`, null, s); persist(); reply.code(201).send(s);
});
app.patch('/api/substitutes/:id', async (req, reply) => {
  if (pgService) { try { return reply.send(await pgService.updateSub(req.params.id,req.body||{})); } catch(e) { return reply.code(e.message === '替代关系不存在' ? 404 : 400).send({error:e.message === '替代关系不存在' ? e.message : '替代关系更新失败'}); } }
  const s = db.substitutes.find(x => x.id === req.params.id); if (!s) { reply.code(404).send({ error: '替代关系不存在' }); return; }
  const before = { ...s }; Object.assign(s, req.body || {}); audit('substitute.update', `substitutes/${s.id}`, before, s); persist(); reply.send(s);
});

// ---------- 统一搜索（第 14 章：基于主档 + SKU + 字段值 + 适配关系） ----------
app.get('/api/search', async (req) => {
  const q = (req.query.q || '').trim().toLowerCase();
  if (!q) return [];
  const hit = (...vals) => vals.filter(Boolean).some(v => String(v).toLowerCase().includes(q));
  const results = [];
  if (pgProducts) {
    const all=await pgProducts.list(); const fields=await postgres.listFields(); const colors=await postgres.listColors();
    const hit=(...vals)=>vals.filter(Boolean).some(v=>String(v).toLowerCase().includes(q));
    return all.filter(p=>hit(p.name,p.model,p.productType,p.ownership)||Object.entries(p.specs||{}).some(([code,value])=>{const f=fields.find(x=>x.code===code);return hit(value,code,f?.nameZh,f?.nameEn,f?.nameDe);})||p.skus.some(s=>hit(s.sku,s.color)||Object.entries(s.attributes||{}).some(([code,value])=>{const f=fields.find(x=>x.code===code);return !!f?.searchable&&hit(value,code,f.nameZh,f.nameEn,f.nameDe)}))||p.fitments.some(f=>hit(f.vehicleModel,f.note))||colors.some(c=>hit(c.code,c.zh,c.en,c.de)&&p.skus.some(s=>s.color===c.code))).map(p=>({id:p.id,kind:p.kind,name:p.name,model:p.model,productType:p.productType,status:p.status,skuCount:p.skuCount}));
  }
  for (const p of db.products) {
    const fieldHit = Object.entries(p.specs || {}).some(([code, v]) => {
      const f = db.fields.find(x => x.code === code);
      return hit(v, code, f ? f.nameZh : '', f ? f.nameEn : '', f ? f.nameDe : '');
    });
    const skuHit = p.skus.some(s => hit(s.sku, s.color) || Object.entries(s.attributes || {}).some(([code,value]) => { const f=db.fields.find(x=>x.code===code); return !!f?.searchable&&hit(value,code,f.nameZh,f.nameEn,f.nameDe); }));
    const fitHit = (p.fitments || []).some(f => hit(f.vehicleModel, f.note));
    const colorHit = db.colors.some(c => c.code && hit(c.zh, c.en, c.de, c.code) && p.skus.some(s => s.color === c.code));
    if (hit(p.name, p.model, p.productType, p.ownership) || fieldHit || skuHit || fitHit || colorHit) {
      results.push({ id: p.id, kind: p.kind, name: p.name, model: p.model, productType: p.productType, status: p.status, skuCount: p.skus.length });
    }
  }
  return results;
});

// 崩溃留痕：后台进程被终止或异常退出时，至少能查到原因
const ERR_LOG = path.join(__dirname, '..', 'data', 'server-error.log');
function logFatal(tag, e) {
  try {
    fs.appendFileSync(ERR_LOG, `[${new Date().toISOString()}] ${tag}: ${e && e.stack ? e.stack : e}\n`, 'utf8');
  } catch (_) { /* 日志写入失败不影响主流程 */ }
}
process.on('uncaughtException', (e) => { logFatal('uncaughtException', e); process.exit(1); });
process.on('unhandledRejection', (e) => logFatal('unhandledRejection', e));

app.listen({ port: PORT, host: networkPolicy.bindHost }).then(() => {
  console.log(`ALSVID V2.0 内部管理系统已启动: http://localhost:${PORT}`);
  console.log(`官网商品目录: http://localhost:${PORT}/www/zh/products`);
  // 后台预热首屏字典缓存：冷连接 + 跨境查询可能要 5s，
  // 提前跑掉这一次，用户第一次进系统就不用等（失败不影响服务，等用户请求时再取）。
  setTimeout(() => { metaSnapshotCached().catch(e => console.warn('元数据预热失败（不影响服务）：', e.message)); }, 800);
}).catch((e) => {
  logFatal('listenFailed', e);
  console.error(e);
  process.exit(1);
});
