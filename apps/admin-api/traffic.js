'use strict';
// SEO 与流量中心：数据源适配层 + 转化分析 + 技术 SEO 巡检。
//
// 职责边界（对齐需求文档第五章「重要技术约束」）：
// 1. 不建第二套分析数据库：这里只做「连接配置、同步状态、异常记录、汇总展示」。
// 2. 未配置的数据源必须明确返回 {configured:false}，前端显示「未接入」，
//    绝不返回虚构的 0 —— 那会让运营把「没接上」当成「没流量」。
// 3. Plausible CE 的 API 能力有限（无漏斗、无收入归因），所以转化漏斗与销售额
//    一律以 ALSVID 自己的订单/支付数据为准，Plausible 只提供访问量。
// 4. 密钥只写不读：对外接口里的 config 永远剥掉 secret 字段。
const { createPool } = require('./db-pool.js');

// 连接池按 DATABASE_URL 惰性创建（与其他模块同模式：模块加载时不连库，首个查询前建池）
let pool = null;
function getPool() {
  if (!pool) {
    const url = process.env.DATABASE_URL;
    if (!url) { const error = new Error('数据库未配置'); error.statusCode = 503; throw error; }
    pool = createPool(url, { max: 2, connectionTimeoutMillis: 10000 });
  }
  return pool;
}

const SOURCES = [
  { source: 'plausible', displayName: 'Plausible Analytics（网站访问统计）', required: ['baseUrl', 'siteId', 'apiToken'], docs: '自托管 Plausible 的站点访问数据，提供 UV/PV/来源/设备/落地页。' },
  { source: 'gsc', displayName: 'Google Search Console（Google 搜索表现）', required: ['serviceAccountEmail', 'propertyUrl'], docs: '官方搜索表现数据：点击量、展现量、点击率、平均排名。只读服务账号。' },
  { source: 'serpbear', displayName: 'SerpBear（关键词排名监控）', required: ['baseUrl', 'apiKey'], docs: '德国 Google 关键词排名与历史趋势。第三方排名 API 费用另计。' },
  { source: 'goaccess', displayName: 'GoAccess（服务器访问日志分析）', required: ['reportUrl'], docs: '爬虫访问、状态码分布。死链巡检由本系统独立完成。' },
  { source: 'cloudflare', displayName: 'Cloudflare（CDN 流量与安全）', required: ['apiToken', 'zoneId'], docs: '只读 Token：请求量、缓存命中率、安全拦截。' },
  { source: 'lighthouse', displayName: 'Lighthouse（页面性能检测）', required: [], docs: '实验室性能测试（LCP/INP/CLS）。' },
  { source: 'crux', displayName: 'CrUX（真实用户体验数据）', required: ['apiKey'], docs: 'Chrome 真实用户性能数据。与 Lighthouse 实验室数据必须区分展示。' },
];

const SECRET_KEYS = new Set(['apiToken', 'apiKey', 'serviceAccountKey', 'token', 'secret', 'password']);

// ---------- 数据源拉取适配器（统一契约） ----------
// 每个外部数据源只需实现一个 fetch 方法，签名统一，业务代码（各 TAB）不感知具体数据源：
//   fetch({ config, range }) -> { rows, metrics, windowStart, windowEnd }
// 未接入适配器时明确返回 NOT_IMPLEMENTED（HTTP 501），前端显示「拉取适配器未接入」，
// 绝不用 0 或示例数据填充——这与支付适配层同一口径。
const SYNC_ADAPTERS = Object.create(null);
// 每个数据源最终要产出哪些指标，作为适配器实现的验收清单
const SYNC_METRICS = {
  plausible: ['uv', 'pv', 'sources', 'devices', 'landingPages'],
  gsc: ['clicks', 'impressions', 'ctr', 'position', 'queries', 'pages', 'countries', 'devices'],
  serpbear: ['keywords', 'rank', 'trend'],
  goaccess: ['requests', 'statusCodes', 'crawlers'],
  cloudflare: ['requests', 'cacheHitRate', 'blocked'],
  lighthouse: ['lcp', 'inp', 'cls'],
  crux: ['lcp', 'inp', 'cls'],
};
function registerSyncAdapter(source, impl) {
  if (!SOURCES.some((item) => item.source === source)) fail('数据源不存在', 404);
  if (!impl || typeof impl.fetch !== 'function') fail('拉取适配器接口不完整（需要 fetch 方法）');
  SYNC_ADAPTERS[source] = impl;
}

// ---------- 连接配置 ----------
async function listSources() {
  const rows = (await getPool().query('SELECT source, display_name AS "displayName", enabled, config, credential_hint AS "credentialHint", updated_at AS "updatedAt" FROM seo_traffic_sources')).rows;
  const map = new Map(rows.map((row) => [row.source, row]));
  return SOURCES.map((meta) => {
    const row = map.get(meta.source);
    const config = row?.config || {};
    // 密钥只报「有没有」，绝不回显内容
    const filled = Object.fromEntries(Object.keys(config).map((key) => [key, SECRET_KEYS.has(key) ? Boolean(config[key]) : config[key]]));
    const missing = meta.required.filter((key) => !filled[key]);
    return {
      source: meta.source,
      displayName: row?.displayName || meta.displayName,
      docs: meta.docs,
      required: meta.required,
      configured: meta.required.length === 0 || missing.length === 0,
      enabled: row ? Boolean(row.enabled) : false,
      missing,
      config: filled,
      credentialHint: row?.credentialHint || null,
      updatedAt: row?.updatedAt || null,
      // 连接就绪 ≠ 能出数据：拉取适配器未接入时前端必须显式标注
      syncReady: Boolean(SYNC_ADAPTERS[meta.source]),
      syncMetrics: SYNC_METRICS[meta.source] || [],
    };
  });
}

function fail(message, status = 400) { const error = new Error(message); error.statusCode = status; throw error; }

function validateConfig(meta, config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) fail('配置格式无效');
  const clean = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') { clean[key] = value.trim().slice(0, 2000); continue; }
    if (typeof value === 'boolean' || typeof value === 'number') { clean[key] = value; continue; }
    fail(`配置项 ${key} 类型无效`);
  }
  const missing = meta.required.filter((key) => !clean[key]);
  if (missing.length) fail('缺少必填配置项：' + missing.join(', '));
  return clean;
}

async function saveSource(source, input) {
  const meta = SOURCES.find((item) => item.source === source);
  if (!meta) fail('数据源不存在', 404);
  const config = validateConfig(meta, input.config || {});
  const enabled = Boolean(input.enabled);
  const secrets = Object.keys(config).filter((key) => SECRET_KEYS.has(key) && typeof config[key] === 'string');
  const hint = secrets.length ? `已配置凭据（末 4 位 ····${String(config[secrets[0]]).slice(-4)}）` : null;
  await getPool().query(
    `INSERT INTO seo_traffic_sources(source, display_name, enabled, config, credential_hint, updated_at)
     VALUES($1,$2,$3,$4,$5,now())
     ON CONFLICT (source) DO UPDATE SET display_name=$2, enabled=$3, config=$4, credential_hint=$5, updated_at=now()`,
    [source, meta.displayName, enabled, JSON.stringify(config), hint],
  );
  return { ok: true };
}

async function testSource(source) {
  const meta = SOURCES.find((item) => item.source === source);
  if (!meta) fail('数据源不存在', 404);
  const row = (await getPool().query('SELECT config, enabled FROM seo_traffic_sources WHERE source=$1', [source])).rows[0];
  if (!row) fail('该数据源尚未配置，请先保存连接信息', 404);
  if (!meta.required.length) return { ok: true, skipped: true, reason: '该数据源无需凭据，测试接口由前端直接请求' };
  const config = row.config || {};
  const missing = meta.required.filter((key) => !config[key]);
  if (missing.length) fail('缺少必填配置项：' + missing.join(', '));
  // 真连通性测试：按数据源类型发一个最小只读请求，5 秒超时
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const startedAt = Date.now();
  try {
    let response;
    if (source === 'plausible') response = await fetch(`${config.baseUrl}/api/v1/stats/realtime/visitors?site_id=${encodeURIComponent(config.siteId)}`, { headers: { Authorization: `Bearer ${config.apiToken}` }, signal: controller.signal });
    else if (source === 'cloudflare') response = await fetch(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(config.zoneId)}`, { headers: { Authorization: `Bearer ${config.apiToken}` }, signal: controller.signal });
    else if (source === 'serpbear') response = await fetch(`${config.baseUrl}/api/keywords`, { headers: { Authorization: `Bearer ${config.apiKey}` }, signal: controller.signal });
    else if (source === 'goaccess') response = await fetch(config.reportUrl, { signal: controller.signal });
    else if (source === 'gsc') response = await fetch('https://searchconsole.googleapis.com/', { signal: controller.signal });
    else if (source === 'crux') response = await fetch('https://chromeuxreport.googleapis.com/', { signal: controller.signal });
    else return { ok: true, reason: '暂无连通性测试方法' };
    const text = await response.text().catch(() => '');
    return { ok: response.status >= 200 && response.status < 500, status: response.status, ms: Date.now() - startedAt, reason: response.ok ? '连接成功' : `返回 ${response.status}：${text.slice(0, 160)}` };
  } catch (error) {
    return { ok: false, reason: error?.name === 'AbortError' ? '连接超时（>5s）' : `连接失败：${error?.message || error}` };
  } finally {
    clearTimeout(timer);
  }
}

// 拉取一个数据源的指定时间窗口：适配器缺失 → 501；未配置/未启用 → 明确拒绝；成功失败都写同步日志。
async function syncSource(source, range = {}) {
  const meta = SOURCES.find((item) => item.source === source);
  if (!meta) fail('数据源不存在', 404);
  const adapter = SYNC_ADAPTERS[source];
  if (!adapter) fail(`${meta.displayName} 的拉取适配器尚未接入（NOT_IMPLEMENTED），暂时无法同步`, 501);
  const row = (await getPool().query('SELECT config, enabled FROM seo_traffic_sources WHERE source=$1', [source])).rows[0];
  if (!row) fail('该数据源尚未配置，请先保存连接信息', 404);
  if (!row.enabled) fail('该数据源已配置但未启用', 409);
  const config = row.config || {};
  const missing = meta.required.filter((key) => !config[key]);
  if (missing.length) fail('缺少必填配置项：' + missing.join(', '));
  const windowStart = range.start ? new Date(range.start).toISOString().slice(0, 10) : null;
  const windowEnd = range.end ? new Date(range.end).toISOString().slice(0, 10) : null;
  const startedAt = Date.now();
  try {
    const result = await adapter.fetch({ config, range: { start: range.start, end: range.end } });
    const rows = Number(result?.rows ?? 0);
    await logSync(source, 'ok', { windowStart, windowEnd, rows, message: `同步完成，耗时 ${Date.now() - startedAt}ms` });
    return { ok: true, source, rows, metrics: result?.metrics || {}, windowStart, windowEnd, ms: Date.now() - startedAt };
  } catch (error) {
    const message = `同步失败：${error?.message || error}`.slice(0, 2000);
    await logSync(source, 'error', { windowStart, windowEnd, message });
    return fail(message, 502);
  }
}

async function logSync(source, status, detail = {}) {
  await getPool().query(
    'INSERT INTO seo_traffic_sync_log(source,status,window_start,window_end,rows_synced,message) VALUES($1,$2,$3,$4,$5,$6)',
    [source, status, detail.windowStart || null, detail.windowEnd || null, detail.rows ?? null, (detail.message || '').slice(0, 2000) || null],
  ).catch(() => {});
}

async function syncStatus(limit = 60) {
  const rows = (await getPool().query('SELECT source, status, window_start AS "windowStart", window_end AS "windowEnd", rows_synced AS "rowsSynced", message, created_at AS "createdAt" FROM seo_traffic_sync_log ORDER BY created_at DESC LIMIT $1', [Math.min(limit, 200)])).rows;
  return rows;
}

// ---------- 电商转化分析（以 ALSVID 订单/支付数据为准） ----------
const COUNTRIES = [['DE', '德国'], ['FR', '法国'], ['AT', '奥地利'], ['NL', '荷兰'], ['GB', '英国']];
// 订单状态口径（与后台订单页 ORDER_BUCKETS 对齐）：
//   paid / shipped / delivered = 已付清（成交）
//   partially_paid / allocated = 未付清（不算成交金额，算「待付款」）
//   cancelled / declined       = 不计
const PAID_STATUSES = "('paid','shipped','delivered')";

function normalizeRange(query = {}) {
  const days = Number(query.days || 30);
  const span = [1, 7, 30, 90].includes(days) ? days : 30;
  const end = new Date();
  const start = new Date(end.getTime() - span * 24 * 3600 * 1000);
  return { start, end, span };
}

async function conversionOverview(range) {
  // 事件漏斗（本系统自采事件，无 PII）
  const events = (await getPool().query(
    `SELECT event, count(*)::int AS total FROM ecom_events WHERE occurred_at >= $1 AND occurred_at <= $2 GROUP BY event`,
    [range.start, range.end],
  )).rows;
  const byEvent = Object.fromEntries(events.map((row) => [row.event, row.total]));
  const views = byEvent.ViewProduct || 0, carts = byEvent.AddToCart || 0, checkouts = byEvent.BeginCheckout || 0;

  // 成交：以订单状态为准（paid/shipped/delivered = 已付清）
  const orders = (await getPool().query(
    `SELECT count(*)::int AS paid,
            count(*) FILTER (WHERE status IN ('allocated','partially_paid'))::int AS pending,
            count(*) FILTER (WHERE status='cancelled')::int AS cancelled
     FROM storefront_orders WHERE created_at >= $1 AND created_at <= $2 AND status IN ${PAID_STATUSES}`,
    [range.start, range.end],
  )).rows[0] || {};
  const paidCount = Number(orders.paid || 0);

  // 金额：实际收款（扣除更正）− 实际退款（扣除更正），按币种分列。
  // 这是财务台账口径，不是统计工具估算。
  const money = (await getPool().query(
    `SELECT o.currency,
            COALESCE(sum(p.amount_minor),0)::bigint AS received_minor,
            COALESCE(sum(r.amount_minor),0)::bigint AS refunded_minor
     FROM storefront_orders o
     LEFT JOIN LATERAL (SELECT sum(p.amount_minor) AS amount_minor FROM storefront_order_payments p WHERE p.order_id=o.id AND NOT EXISTS(SELECT 1 FROM storefront_payment_reversals z WHERE z.payment_id=p.id)) p ON true
     LEFT JOIN LATERAL (SELECT sum(f.amount_minor) AS amount_minor FROM storefront_return_refunds f WHERE f.order_id=o.id AND NOT EXISTS(SELECT 1 FROM storefront_refund_reversals z WHERE z.refund_id=f.id)) r ON true
     WHERE o.created_at >= $1 AND o.created_at <= $2 AND o.status IN ${PAID_STATUSES}
     GROUP BY o.currency`,
    [range.start, range.end],
  )).rows;
  const byCurrency = money.map((row) => {
    const received = Number(row.received_minor || 0), refunded = Number(row.refunded_minor || 0);
    const unit = row.currency === 'CNY' ? 1 : 100; // CNY 以分记，EUR 同以分记（统一 /100）
    return {
      currency: row.currency,
      received: Number((received / 100).toFixed(2)),
      refunded: Number((refunded / 100).toFixed(2)),
      net: Number(((received - refunded) / 100).toFixed(2)),
      aov: paidCount ? Number((received / 100 / paidCount).toFixed(2)) : null,
    };
  });
  const refunds = (await getPool().query(
    `SELECT count(DISTINCT o.id)::int AS refund_orders FROM storefront_orders o
     JOIN storefront_return_refunds f ON f.order_id=o.id AND NOT EXISTS(SELECT 1 FROM storefront_refund_reversals z WHERE z.refund_id=f.id)
     WHERE o.created_at >= $1 AND o.created_at <= $2`,
    [range.start, range.end],
  )).rows[0] || {};
  const refundOrders = Number(refunds.refund_orders || 0);
  const eur = byCurrency.find((row) => row.currency === 'EUR') || { received: 0, refunded: 0, net: 0, aov: null, currency: 'EUR' };
  return {
    funnel: { views, carts, checkouts, purchases: paidCount },
    rates: {
      cartRate: views ? Number(((carts / views) * 100).toFixed(2)) : null,
      checkoutRate: carts ? Number(((checkouts / carts) * 100).toFixed(2)) : null,
      paymentRate: checkouts ? Number(((paidCount / checkouts) * 100).toFixed(2)) : null,
    },
    money: {
      ...eur,
      refundOrders, refundRate: paidCount ? Number(((refundOrders / paidCount) * 100).toFixed(2)) : null,
      byCurrency,
    },
    orders: { paid: paidCount, pending: Number(orders.pending || 0), cancelled: Number(orders.cancelled || 0) },
    note: '销售额、退款额取自 ALSVID 收款与退款台账（已扣除更正记录），与统计工具估算无关。',
  };
}

async function conversionByProduct(range, limit = 20) {
  const rows = (await getPool().query(
    `SELECT product_id AS "productId", sku,
            count(*) FILTER (WHERE event='ViewProduct')::int AS views,
            count(*) FILTER (WHERE event='AddToCart')::int AS carts,
            count(*) FILTER (WHERE event='BeginCheckout')::int AS checkouts
     FROM ecom_events WHERE occurred_at >= $1 AND occurred_at <= $2 AND product_id IS NOT NULL
     GROUP BY product_id, sku ORDER BY views DESC LIMIT $3`,
    [range.start, range.end, Math.min(limit, 50)],
  )).rows;
  const ids = [...new Set(rows.map((row) => row.productId).filter(Boolean))];
  const names = new Map(ids.length ? (await getPool().query('SELECT id, name FROM products WHERE id = ANY($1::text[])', [ids])).rows.map((row) => [row.id, row.name]) : []);
  return rows.map((row) => ({ ...row, name: names.get(row.productId) || row.productId }));
}

async function conversionByCountry(range) {
  const rows = (await getPool().query(
    `SELECT coalesce(country,'XX') AS country, event, count(*)::int AS total
     FROM ecom_events WHERE occurred_at >= $1 AND occurred_at <= $2 GROUP BY country, event`,
    [range.start, range.end],
  )).rows;
  // 订单国家取收货资料里的 country 字段（订单本身没有独立国家列）
  const orderRows = (await getPool().query(
    `SELECT coalesce(nullif(delivery->>'country',''),'XX') AS country, count(*)::int AS paid
     FROM storefront_orders WHERE created_at >= $1 AND created_at <= $2 AND status IN ${PAID_STATUSES}
     GROUP BY country`,
    [range.start, range.end],
  )).rows;
  const map = new Map();
  for (const row of rows) {
    const key = row.country;
    if (!map.has(key)) map.set(key, { country: key, label: (COUNTRIES.find(([code]) => code === key) || [key, key === 'XX' ? '其他地区' : key])[1], events: {}, paidOrders: 0 });
    map.get(key).events[row.event] = row.total;
  }
  for (const row of orderRows) {
    const key = row.country;
    if (!map.has(key)) map.set(key, { country: key, label: (COUNTRIES.find(([code]) => code === key) || [key, key === 'XX' ? '其他地区' : key])[1], events: {}, paidOrders: 0 });
    map.get(key).paidOrders = Number(row.paid || 0);
  }
  return [...map.values()].sort((a, b) => b.paidOrders - a.paidOrders || (b.events.ViewProduct || 0) - (a.events.ViewProduct || 0));
}

// ---------- 技术 SEO 巡检（自爬本站，不需要外部凭据） ----------
const TECH_TARGETS = ['', 'de', 'en', 'zh', 'de/e-bikes', 'en/e-bikes', 'zh/e-bikes', 'de/legal/impressum', 'de/brand', 'de/dealers'];

async function techAudit(origin) {
  const base = String(origin || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(base)) fail('站点地址无效（需以 http/https 开头）');
  const findings = [], errors = [];
  let robotsOk = false, sitemapUrls = 0;
  for (const target of TECH_TARGETS) {
    const url = `${base}/${target}`;
    try {
      const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
      if (!response.ok) { errors.push({ url, status: response.status }); findings.push({ url, status: response.status, ok: false, problems: ['页面无法访问'] }); continue; }
      const html = await response.text();
      const problems = [];
      const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim();
      if (!title) problems.push('缺少 Title（页面标题）');
      else if (title.length > 65) problems.push(`Title 过长（${title.length} 字符，建议 ≤65）`);
      const description = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i)?.[1];
      if (!description) problems.push('缺少 Meta Description（页面搜索描述）');
      else if (description.length > 165) problems.push(`Meta Description 过长（${description.length} 字符，建议 ≤165）`);
      const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]*)"/i)?.[1];
      if (!canonical) problems.push('缺少 Canonical（规范网址）');
      const hreflang = (html.match(/hreflang=/gi) || []).length;
      if (!hreflang) problems.push('缺少 Hreflang（多语言页面关联）');
      const ldjson = (html.match(/application\/ld\+json/gi) || []).length;
      if (!ldjson) problems.push('缺少结构化数据（Schema.org JSON-LD）');
      findings.push({ url, status: response.status, ok: problems.length === 0, title, problems, hreflangCount: hreflang, structuredDataCount: ldjson });
    } catch (error) {
      errors.push({ url, reason: error?.message || String(error) });
      findings.push({ url, status: null, ok: false, problems: ['抓取失败：' + (error?.name === 'AbortError' ? '超时' : error?.message || '网络错误')] });
    }
  }
  try {
    const robots = await fetch(`${base}/robots.txt`, { signal: AbortSignal.timeout(10000) });
    robotsOk = robots.ok;
    if (!robotsOk) errors.push({ url: `${base}/robots.txt`, status: robots.status });
    const sitemapMatch = (await robots.text()).match(/Sitemap:\s*(\S+)/i);
    if (!sitemapMatch) errors.push({ url: `${base}/robots.txt`, reason: '未声明 Sitemap（网站地图）' });
    else {
      const sitemap = await fetch(sitemapMatch[1], { signal: AbortSignal.timeout(15000) });
      if (sitemap.ok) sitemapUrls = ((await sitemap.text()).match(/<loc>/g) || []).length;
      else errors.push({ url: sitemapMatch[1], status: sitemap.status });
    }
  } catch (error) {
    errors.push({ url: `${base}/robots.txt`, reason: error?.message || String(error) });
  }
  return {
    generatedAt: new Date().toISOString(), origin: base,
    robots: { ok: robotsOk }, sitemapUrls,
    summary: {
      checked: findings.length, passed: findings.filter((item) => item.ok).length,
      failed: findings.filter((item) => !item.ok).length,
    },
    findings, errors,
    note: '本巡检由 ALSVID 自行爬行完成；爬虫访问与状态码分布（GoAccess/日志）另行展示。LCP/INP/CLS 性能数据来自 Lighthouse 与 CrUX，属另一数据源。',
  };
}

// ---------- 事件采集（公开接口，服务端校验） ----------
const ALLOWED_EVENTS = new Set(['ViewProduct', 'AddToCart', 'BeginCheckout']);
function shortText(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) || null : null; }

async function recordEvent(input, context) {
  const event = shortText(input?.event, 20);
  if (!ALLOWED_EVENTS.has(event)) fail('事件类型无效', 400);
  const productId = shortText(input?.productId, 120);
  const sku = shortText(input?.sku, 120);
  // 浏览器事件不携带金额；只有服务端 Purchase 才写金额
  const hasAmount = input?.amount !== undefined && input?.amount !== null && input?.amount !== '';
  const amount = hasAmount ? Number(input.amount) : undefined;
  const currency = shortText(input?.currency, 3)?.toUpperCase();
  const country = shortText(input?.country, 2)?.toUpperCase();
  const utmSource = shortText(input?.utmSource, 100);
  const utmMedium = shortText(input?.utmMedium, 100);
  const utmCampaign = shortText(input?.utmCampaign, 100);
  if (!productId && event !== 'BeginCheckout') fail('缺少商品标识', 400);
  if (hasAmount && (!Number.isFinite(amount) || amount < 0)) fail('金额无效', 400);
  // visitor_token 由服务端签发（随机 id，不含任何个人身份信息），前端只透传
  const visitorToken = shortText(input?.visitorToken, 64) || context.visitorToken;
  await getPool().query(
    `INSERT INTO ecom_events(event, product_id, sku, visitor_token, amount, currency, country, utm_source, utm_medium, utm_campaign, source)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'browser')`,
    [event, productId, sku, visitorToken, Number.isFinite(amount) ? amount : null,
     currency && /^[A-Z]{3}$/.test(currency) ? currency : null, country && /^[A-Z]{2}$/.test(country) ? country : null,
     utmSource, utmMedium, utmCampaign],
  );
  return { ok: true };
}

// Purchase 只能由服务端写入（支付回调确认后调用），浏览器上报被拒绝
async function recordPurchase({ orderIdSafe, productId, sku, amount, currency, country, utm }) {
  if (!Number.isFinite(Number(amount))) fail('Purchase 金额无效');
  const visitorToken = orderIdSafe; // 用订单的内部 uuid 串起漏斗，不落任何可读业务号
  await getPool().query(
    `INSERT INTO ecom_events(event, product_id, sku, visitor_token, amount, currency, country, utm_source, utm_medium, utm_campaign, source)
     VALUES('Purchase',$1,$2,$3,$4,$5,$6,$7,$8,$9,'server')`,
    [shortText(productId, 120), shortText(sku, 120), visitorToken, Number(amount), currency, country, utm?.source || null, utm?.medium || null, utm?.campaign || null],
  );
  return { ok: true };
}

module.exports = {
  SOURCES, listSources, saveSource, testSource, logSync, syncStatus,
  SYNC_METRICS, registerSyncAdapter, syncSource,
  normalizeRange, conversionOverview, conversionByProduct, conversionByCountry,
  techAudit, recordEvent, recordPurchase, ALLOWED_EVENTS,
};
