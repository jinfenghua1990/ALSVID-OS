// 线上支付统一适配层（骨架版）
//
// 目标：业务代码只调用 createIntent / handleWebhook / refund / status 四个统一方法，
// 具体服务商（Stripe / PayPal / Apple Pay / Google Pay / Klarna / SEPA）只是适配器实现。
// 本文件先把接口、配置存储、状态机、回调幂等与订单联动全部搭好；适配器未接入时返回
// 明确的 NOT_IMPLEMENTED，绝不伪造支付成功，也不改变现有手动收款（bank_transfer/cash）流程。
//
// 安全约束：
// - 密钥只存服务端 payment_providers.config，接口层永不回显（只回 credential_hint 末 4 位）
// - Purchase 事件只能由服务端在回调确认后写入（沿用 traffic.recordPurchase）
// - webhook 按 provider + event_id 幂等，重复回调不重复入账
// - 订单状态推进沿用 storefront-orders 的 recordPayment（订单付清 → paid → Purchase 事件）

'use strict';

const { createPool } = require('./db-pool.js');

let pool = null;
function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) { const error = new Error('数据库未配置'); error.statusCode = 503; throw error; }
    pool = createPool(url, { max: 2, connectionTimeoutMillis: 10000 });
  }
  return pool;
}

// 订单 store 由 index.js 创建后注入，避免循环依赖（storefront-orders 导出工厂而非实例）
let orderStore = null;
function setOrderStore(store) { orderStore = store; }

function fail(message, status = 400) { const error = new Error(message); error.statusCode = status; throw error; }

// 支付方式元数据：优先级对齐需求文档（P0 信用卡+PayPal / P1 Apple Pay+Google Pay / P2 Klarna+SEPA）
const PROVIDERS = [
  { provider: 'stripe', displayName: '信用卡 / 借记卡（Visa · Mastercard）', priority: 'P0', required: ['secretKey', 'webhookSecret'], docs: 'Stripe 统一接入 Visa/Mastercard，Card Element 前端收集卡号不落本系统（PCI 合规）。' },
  { provider: 'paypal', displayName: 'PayPal', priority: 'P0', required: ['clientId', 'clientSecret'], docs: 'PayPal Checkout，回调以 IPN / Webhook 确认，支付成功以 PayPal 通知为准。' },
  { provider: 'apple_pay', displayName: 'Apple Pay', priority: 'P1', required: ['merchantId', 'paymentProcessingCertificate'], docs: '通常经 Stripe 等网关转发，需 Apple 商户注册与域名验证。' },
  { provider: 'google_pay', displayName: 'Google Pay', priority: 'P1', required: ['merchantId', 'gateway'], docs: '通常经 Stripe 等网关转发，需 Google Pay 商户配置。' },
  { provider: 'klarna', displayName: 'Klarna（先买后付）', priority: 'P2', required: ['username', 'password', 'region'], docs: '德国市场先买后付，需 Klarna 商户签约；接口按其 REST API 适配。' },
  { provider: 'sepa', displayName: 'SEPA 直接借记', priority: 'P2', required: ['creditorId', 'iban'], docs: '欧元区银行直接借记，需债权人标识（Creditor ID）与 mandat 授权流程。' },
];

const SECRET_KEYS = new Set(['secretKey', 'webhookSecret', 'clientSecret', 'password', 'apiKey', 'token']);
const PROVIDER_IDS = new Set(PROVIDERS.map(item => item.provider));

// 适配器注册表：目前全部未实现。接入时在 adapters/ 下实现并以同一签名注册。
// 签名：createIntent({ orderId, amountMinor, currency, metadata, config }) -> { providerIntentId, clientSecret, status }
//       confirmWebhook({ payload, headers, config }) -> { eventId, eventType, providerIntentId, status, amountMinor, currency }
//       refund({ providerIntentId, amountMinor, currency, reason, config }) -> { refundId, status }
const ADAPTERS = Object.create(null); // provider -> { createIntent, confirmWebhook, refund }
function registerAdapter(provider, impl) {
  if (!PROVIDER_IDS.has(provider)) fail('未知支付方式', 404);
  if (!impl || typeof impl.createIntent !== 'function' || typeof impl.confirmWebhook !== 'function') fail('适配器接口不完整');
  ADAPTERS[provider] = impl;
}

function adapterStatus(provider) {
  if (!ADAPTERS[provider]) return 'NOT_IMPLEMENTED';
  return null; // 由调用方结合配置决定 READY / NOT_CONFIGURED
}

// ---------- 配置管理（密钥只写不回显） ----------

// 迁移 180 未应用时 PostgreSQL 报 42P01（表不存在）。骨架期的价值就是「坑位可见」，
// 因此这里降级为静态元数据 + schemaReady:false，而不是让管理页整页 500 看不到任何支付方式。
function isSchemaMissing(error) {
  return Boolean(error) && (error.code === '42P01' || error.code === '3F000');
}

async function listProviders() {
  let rows = [];
  let schemaReady = true;
  try {
    rows = (await getPool().query('SELECT provider, display_name, priority, enabled, adapter_status, credential_hint, last_test_at, last_test_result, updated_at FROM payment_providers ORDER BY priority, provider')).rows;
  } catch (error) {
    if (!isSchemaMissing(error)) throw error;
    schemaReady = false;
  }
  const byProvider = new Map(rows.map(row => [row.provider, row]));
  const providers = PROVIDERS.map(meta => {
    const row = byProvider.get(meta.provider) || {};
    const registered = Boolean(ADAPTERS[meta.provider]);
    const status = registered ? (row.enabled ? 'READY' : 'NOT_CONFIGURED') : (row.adapter_status || 'NOT_IMPLEMENTED');
    return {
      provider: meta.provider, displayName: meta.displayName, priority: meta.priority,
      enabled: Boolean(row.enabled), adapterStatus: status, configured: Boolean(row.credential_hint),
      credentialHint: row.credential_hint || null, lastTestAt: row.last_test_at || null,
      lastTestResult: row.last_test_result || null, required: meta.required, docs: meta.docs,
    };
  });
  return { providers, schemaReady };
}

function validateConfig(meta, config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) fail('配置格式无效');
  const clean = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') clean[key] = value.trim().slice(0, 4000);
    else if (typeof value === 'boolean' || typeof value === 'number') clean[key] = value;
    else fail(`配置项 ${key} 类型无效`);
  }
  const missing = meta.required.filter(key => !clean[key]);
  if (missing.length) fail('缺少必填配置项：' + missing.join(', '));
  return clean;
}

async function saveProvider(provider, input) {
  const meta = PROVIDERS.find(item => item.provider === provider);
  if (!meta) fail('支付方式不存在', 404);
  const config = validateConfig(meta, input.config || {});
  const enabled = Boolean(input.enabled);
  if (enabled && !ADAPTERS[provider]) fail('该支付方式的适配器尚未接入，不能启用（避免误以为已支持线上支付）', 409);
  const secrets = Object.keys(config).filter(key => SECRET_KEYS.has(key) && typeof config[key] === 'string');
  const hint = secrets.length ? `已配置凭据（末 4 位 ····${String(config[secrets[0]]).slice(-4)}）` : null;
  const status = ADAPTERS[provider] ? (enabled ? 'READY' : 'NOT_CONFIGURED') : 'NOT_IMPLEMENTED';
  await getPool().query(
    `INSERT INTO payment_providers(provider, display_name, priority, enabled, adapter_status, config, credential_hint, updated_at)
     VALUES($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT (provider) DO UPDATE SET display_name=$2, priority=$3, enabled=$4, adapter_status=$5, config=$6, credential_hint=$7, updated_at=now()`,
    [provider, meta.displayName, meta.priority, enabled, status, JSON.stringify(config), hint],
  ).catch(error => {
    if (isSchemaMissing(error)) fail('支付配置表尚未创建（迁移 180 未应用），暂时无法保存配置', 503);
    throw error;
  });
  return { ok: true, adapterStatus: status };
}

async function testProvider(provider) {
  const meta = PROVIDERS.find(item => item.provider === provider);
  if (!meta) fail('支付方式不存在', 404);
  if (!ADAPTERS[provider]) return { ok: false, status: 'NOT_IMPLEMENTED', reason: `${meta.displayName} 适配器尚未接入，无法测试；请先实现适配器后再配置凭据` };
  const row = (await getPool().query('SELECT config, enabled FROM payment_providers WHERE provider=$1', [provider])).rows[0];
  const config = row?.config || {};
  const missing = meta.required.filter(key => !config[key]);
  if (missing.length) return { ok: false, status: 'NOT_CONFIGURED', reason: '缺少必填配置项：' + missing.join(', ') };
  // 适配器接入后：这里调用 adapter.verifyConfig(config) 做只读连通性测试
  let result;
  try {
    result = typeof ADAPTERS[provider].verifyConfig === 'function'
      ? await ADAPTERS[provider].verifyConfig(config)
      : { ok: false, reason: '适配器未提供连通性测试方法' };
  } catch (error) { result = { ok: false, reason: error?.message || String(error) }; }
  await getPool().query('UPDATE payment_providers SET last_test_at=now(), last_test_result=$2 WHERE provider=$1', [provider, JSON.stringify(result)]);
  return result;
}

// ---------- 统一支付接口 ----------

async function createIntent(provider, input) {
  const meta = PROVIDERS.find(item => item.provider === provider);
  if (!meta) fail('支付方式不存在', 404);
  const adapter = ADAPTERS[provider];
  if (!adapter) fail(`${meta.displayName} 适配器尚未接入（NOT_IMPLEMENTED），暂不能发起线上支付`, 501);
  const row = (await getPool().query('SELECT enabled, config FROM payment_providers WHERE provider=$1', [provider])).rows[0];
  if (!row?.enabled) fail(`${meta.displayName} 尚未启用`, 409);
  const amountMinor = Number(input?.amountMinor);
  const currency = String(input?.currency || '').toUpperCase();
  const orderId = String(input?.orderId || '');
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !/^[A-Z]{3}$/.test(currency)) fail('支付参数无效');
  const idempotencyKey = String(input?.idempotencyKey || `${orderId}:${provider}:${amountMinor}:${currency}`);
  if (idempotencyKey.length > 200) fail('幂等键过长');
  // 幂等：同一键重复请求直接返回已有意图，不重复向服务商下单
  const existing = (await getPool().query('SELECT id, status, provider_intent_id, client_secret FROM payment_intents WHERE idempotency_key=$1', [idempotencyKey])).rows[0];
  if (existing) return { intentId: existing.id, providerIntentId: existing.provider_intent_id, status: existing.status, clientSecret: existing.client_secret, replayed: true };
  const result = await adapter.createIntent({ orderId, amountMinor, currency, metadata: input?.metadata || {}, config: row.config, idempotencyKey });
  const created = (await getPool().query(
    `INSERT INTO payment_intents(order_id, provider, provider_intent_id, amount_minor, currency, status, idempotency_key, metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [orderId, provider, result.providerIntentId || null, amountMinor, currency, result.status || 'pending', idempotencyKey, JSON.stringify(input?.metadata || {})],
  )).rows[0];
  return { intentId: created.id, providerIntentId: result.providerIntentId || null, clientSecret: result.clientSecret || null, status: result.status || 'pending', replayed: false };
}

// 回调：幂等落库 → 调用适配器验签与解析 → 只有确认成功才推进支付意图与订单
async function handleWebhook(provider, payload, headers) {
  const meta = PROVIDERS.find(item => item.provider === provider);
  if (!meta) fail('支付方式不存在', 404);
  const adapter = ADAPTERS[provider];
  if (!adapter) fail(`${meta.displayName} 适配器尚未接入（NOT_IMPLEMENTED），无法处理回调`, 501);
  const row = (await getPool().query('SELECT config FROM payment_providers WHERE provider=$1', [provider])).rows[0];
  const config = row?.config || {};
  // 适配器负责验签并提取标准字段；验签失败直接拒绝，不落库
  let parsed;
  try { parsed = await adapter.confirmWebhook({ payload, headers, config }); }
  catch (error) { fail('回调验签失败：' + (error?.message || 'unknown'), 400); }
  if (!parsed?.eventId) fail('回调缺少事件 ID，无法保证幂等', 400);
  const c = await getPool().connect();
  try {
    await c.query('BEGIN');
    const dup = (await c.query('SELECT status, intent_id FROM payment_webhook_events WHERE provider=$1 AND event_id=$2 FOR UPDATE', [provider, parsed.eventId])).rows[0];
    if (dup) { await c.query('COMMIT'); return { ok: true, replayed: true, eventStatus: dup.status }; }
    const intent = parsed.providerIntentId
      ? (await c.query('SELECT id, order_id, amount_minor, currency, status FROM payment_intents WHERE provider=$1 AND provider_intent_id=$2 FOR UPDATE', [provider, parsed.providerIntentId])).rows[0]
      : null;
    const event = (await c.query(
      `INSERT INTO payment_webhook_events(provider, event_id, event_type, intent_id, payload, status, processed_at)
       VALUES($1,$2,$3,$4,$5,$6,now()) RETURNING id`,
      [provider, parsed.eventId, parsed.eventType || 'unknown', intent?.id || null, JSON.stringify(payload || {}), 'processed'],
    )).rows[0];
    if (intent && parsed.status === 'succeeded' && intent.status !== 'succeeded') {
      // 金额与币种必须与服务端创建的意图一致，防止回调篡改
      if (Number(parsed.amountMinor) !== Number(intent.amount_minor) || String(parsed.currency || '').toUpperCase() !== intent.currency) {
        await c.query('UPDATE payment_webhook_events SET status=$2, error=$3 WHERE id=$1', [event.id, 'failed', '回调金额或币种与支付意图不一致']);
        await c.query('COMMIT');
        fail('回调金额或币种与支付意图不一致', 400);
      }
      await c.query("UPDATE payment_intents SET status='succeeded', confirmed_at=now(), updated_at=now() WHERE id=$1", [intent.id]);
    }
    await c.query('COMMIT');
    // 订单推进与 Purchase 事件在事务外做：沿用既有 recordPayment 口径，失败不吞
    if (intent && parsed.status === 'succeeded') {
      await settleOrder(intent.order_id, intent.amount_minor, intent.currency, provider, parsed.eventId);
    }
    return { ok: true, replayed: false, eventStatus: 'processed', intentStatus: intent?.status || null };
  } catch (error) {
    await c.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { c.release(); }
}

// 服务商确认收款后，复用既有订单收款口径，触发 Purchase 事件
async function settleOrder(orderId, amountMinor, currency, provider, eventId) {
  if (!orderStore || typeof orderStore.recordPayment !== 'function') {
    fail('订单服务未就绪，无法确认收款', 503);
  }
  const { uuidv7 } = require('./uuidv7.js');
  const amount = (Number(amountMinor) / 100).toFixed(2);
  const paymentInput = {
    id: uuidv7(),
    amount,
    method: 'other', // 现有收款表 method 枚举仅 bank_transfer/cash/other；线上支付归 other，reference 记录 provider+事件号
    reference: `online:${provider}:${String(eventId).slice(0, 80)}`,
    receivedOn: new Date().toISOString().slice(0, 10),
    note: `线上支付确认（${provider}）`,
    verified: true,
  };
  // recordPayment 只允许 allocated/partially_paid 订单登记，重复回调由 webhook 幂等表拦截
  await orderStore.recordPayment(orderId, paymentInput);
  // Purchase 事件已在 storefront-orders.recordPayment 内挂钩（status==='paid' 时写入），无需重复上报
}

async function refund(provider, intentId, input) {
  const meta = PROVIDERS.find(item => item.provider === provider);
  if (!meta) fail('支付方式不存在', 404);
  const adapter = ADAPTERS[provider];
  if (!adapter || typeof adapter.refund !== 'function') fail(`${meta.displayName} 退款适配器尚未接入`, 501);
  const intent = (await getPool().query('SELECT * FROM payment_intents WHERE id=$1 AND provider=$2', [intentId, provider])).rows[0];
  if (!intent) fail('支付意图不存在', 404);
  const config = (await getPool().query('SELECT config FROM payment_providers WHERE provider=$1', [provider])).rows[0]?.config || {};
  const result = await adapter.refund({ providerIntentId: intent.provider_intent_id, amountMinor: Number(input?.amountMinor || intent.amount_minor), currency: intent.currency, reason: String(input?.reason || ''), config });
  await getPool().query("UPDATE payment_intents SET status='refunded', updated_at=now() WHERE id=$1", [intentId]);
  return { ok: true, refundId: result.refundId || null, status: 'refunded' };
}

async function status(intentId) {
  const row = (await getPool().query('SELECT id, order_id, provider, amount_minor, currency, status, provider_intent_id, created_at, confirmed_at FROM payment_intents WHERE id=$1', [intentId])).rows[0];
  if (!row) fail('支付意图不存在', 404);
  return row;
}

module.exports = { PROVIDERS, ADAPTERS, registerAdapter, adapterStatus, setOrderStore, listProviders, saveProvider, testProvider, createIntent, handleWebhook, refund, status };
