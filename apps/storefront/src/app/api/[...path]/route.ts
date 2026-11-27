import { NextRequest, NextResponse } from 'next/server';
import { apiOrigin, siteIsHttps, siteOrigins } from '@/lib/origins';

// 8091 → 8089 的受控同域代理。
// 设计原则（对齐 access-policy.js）：默认拒绝、显式放行。
// - 只代理白名单内的「方法 + 路径」，其余一律 404，绝不按前缀全量转发。
// - 不透传客户端 Origin/Host/X-Forwarded-*，避免越权与地址欺骗。
// - 公开表单接口在 8089 侧有同源校验，故此处显式改写 Origin 为后端源。
// - 后端与站点来源统一从 lib/origins.ts 读，不在此硬编码端口。

const API_ORIGIN = apiOrigin();

// 本站可信来源：用于校验浏览器带来的 Origin/Referer。
// 必须显式配置，绝不从 Host 头推导（Host 可被伪造）。
const SITE_ORIGINS = new Set(siteOrigins());

// 会话 Cookie 的 Secure 属性必须与本站实际协议一致：
// 全站 HTTPS 时补上 Secure；纯 HTTP（本地开发）时去掉，否则浏览器直接丢弃 Cookie。
// 依据显式配置判断，绝不从可伪造的 Host / X-Forwarded-Proto 推导。
const SITE_IS_HTTPS = siteIsHttps();

function hardenSessionCookie(cookie: string) {
  const parts = cookie.split(';').map((part) => part.trim()).filter(Boolean);
  const kept = parts.filter((part) => part.toLowerCase() !== 'secure');
  if (SITE_IS_HTTPS) kept.push('Secure');
  return kept.join('; ');
}

type Rule = { method: string; pattern: RegExp };

// 匿名可访问：与 8089 的 publicCatalog / publicLocations / publicDealerApplication /
// publicColourInterest / publicTestRide 配置一一对应。
const PUBLIC_RULES: Rule[] = [
  {method:'GET',pattern:/^\/api\/public\/store-appointments\/slots$/},
  {method:'POST',pattern:/^\/api\/public\/store-appointments\/(book|lookup|cancel)$/},
  { method: 'POST', pattern: /^\/api\/guest\/storefront\/orders\/(submit|lookup|respond|receive)$/ },
  { method: 'GET', pattern: /^\/api\/catalog\/homepage$/ },
  { method: 'GET', pattern: /^\/api\/catalog\/products$/ },
  { method: 'GET', pattern: /^\/api\/catalog\/products\/[^/]+$/ },
  { method: 'GET', pattern: /^\/api\/catalog\/products\/[^/]+\/offers$/ },
  { method: 'GET', pattern: /^\/api\/catalog\/products\/[^/]+\/availability$/ },
  { method: 'GET', pattern: /^\/api\/catalog\/products\/[^/]+\/images\/[^/]+$/ },
  { method: 'GET', pattern: /^\/api\/public\/catalog$/ },
  { method: 'GET', pattern: /^\/api\/public\/products\/[^/]+$/ },
  { method: 'GET', pattern: /^\/api\/public\/home-media\/[^/]+$/ },
  { method: 'GET', pattern: /^\/api\/public\/cms-media\/[^/]+$/ },
  { method: 'GET', pattern: /^\/api\/public\/sku-media\/[^/]+$/ },
  { method: 'GET', pattern: /^\/api\/public\/dealer-locations$/ },
  { method: 'GET', pattern: /^\/api\/cms\/pages\/public$/ },
  { method: 'GET', pattern: /^\/api\/cms\/pages\/sitemap$/ },
  { method: 'GET', pattern: /^\/api\/cms\/product-template$/ },
  { method: 'GET', pattern: /^\/api\/site\/reviews$/ },
  { method: 'GET', pattern: /^\/api\/site\/layout$/ },
  { method: 'GET', pattern: /^\/api\/site\/layout-draft\/release-review-preview$/ },
  { method: 'POST', pattern: /^\/api\/site\/layout-draft\/release-review-confirm$/ },
  { method: 'POST', pattern: /^\/api\/dealer-applications$/ },
  { method: 'POST', pattern: /^\/api\/public\/fc1-reservation$/ },
  { method: 'POST', pattern: /^\/api\/public\/fc1-colour-interest$/ },
];

// 消费者（owner）接口：用户身份与数据归属由 8089 侧的 portalRoles:['owner'] 再校验。
// 这里只做「入口收敛」——不放行任何 dealer / supplier / 后台运营端点，
// 也不放行 /api/storefront/*（同前缀的管理端订单操作）与 /api/auth/setup（管理员初始化）。
const CONSUMER_RULES: Rule[] = [
  { method: 'GET', pattern: /^\/api\/auth\/status$/ },
  { method: 'POST', pattern: /^\/api\/auth\/login$/ },
  { method: 'GET', pattern: /^\/api\/auth\/registration$/ },
  { method: 'POST', pattern: /^\/api\/auth\/registration\/(start|verify)$/ },
  { method: 'POST', pattern: /^\/api\/auth\/logout$/ },
  { method: 'GET', pattern: /^\/api\/portal\/storefront\/cart$/ },
  { method: 'PUT', pattern: /^\/api\/portal\/storefront\/cart$/ },
  { method: 'GET', pattern: /^\/api\/portal\/storefront\/orders$/ },
  { method: 'GET', pattern: /^\/api\/portal\/storefront\/orders\/[0-9a-fA-F-]{36}$/ },
  { method: 'POST', pattern: /^\/api\/portal\/storefront\/orders$/ },
  { method: 'POST', pattern: /^\/api\/portal\/storefront\/orders\/[^/]+\/(respond|receive|returns|reviews)$/ },
  { method: 'GET', pattern: /^\/api\/portal\/vehicles$/ },
  { method: 'GET', pattern: /^\/api\/portal\/vehicle-requests$/ },
  { method: 'POST', pattern: /^\/api\/portal\/vehicle-requests$/ },
  { method: 'GET', pattern: /^\/api\/portal\/service-requests$/ },
  { method: 'POST', pattern: /^\/api\/portal\/service-requests$/ },
  { method: 'GET', pattern: /^\/api\/portal\/repair-history$/ },
  { method: 'POST', pattern: /^\/api\/portal\/repairs\/[^/]+\/quotes\/[^/]+\/decision$/ },
  { method: 'POST', pattern: /^\/api\/portal\/password$/ },
  { method: 'GET', pattern: /^\/api\/service-centers$/ },
];

// Dedicated dealer workspace. Never proxy management or legacy dealer routes.
const DEALER_RULES: Rule[] = [
 {method:'GET',pattern:/^\/api\/portal\/dealer\/center\/(profile|catalog|orders|vehicles|vehicle-requests|service-requests)$/},
 {method:'POST',pattern:/^\/api\/portal\/dealer\/center\/(orders|vehicle-requests|service-requests)$/},
 {method:'POST',pattern:/^\/api\/portal\/dealer\/center\/orders\/[0-9a-fA-F-]{36}\/(respond|receive)$/},
];
const RULES: Rule[] = [...PUBLIC_RULES, ...CONSUMER_RULES, ...DEALER_RULES];

const ALLOWED_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT']);

function isAllowed(method: string, pathname: string) {
  if (!ALLOWED_METHODS.has(method)) return false;
  // 防路径穿越与编码绕过
  if (pathname.includes('..') || pathname.includes('%2e') || pathname.includes('%2E')) return false;
  if (pathname.includes('//')) return false;
  return RULES.some((rule) => rule.method === (method === 'HEAD' ? 'GET' : method) && rule.pattern.test(pathname));
}

function reject(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
}

function originOf(value: string | null): string {
  if (!value) return '';
  try {
    return new URL(value).origin;
  } catch {
    return '';
  }
}

// 校验请求确实来自本站，用于在改写 Origin 之前建立信任。
// 写操作必须带可信 Origin（或回退 Referer）；读操作若声明了跨站来源也直接拒绝。
function verifyBrowserOrigin(
  request: NextRequest,
  method: string,
): { ok: boolean; status?: number; error?: string } {
  const fetchSite = (request.headers.get('sec-fetch-site') || '').toLowerCase();
  if (fetchSite === 'cross-site') return { ok: false, status: 403, error: '请求来源不受信任' };

  const origin = originOf(request.headers.get('origin'));
  const referer = originOf(request.headers.get('referer'));
  const claimed = origin || referer;

  // 无 Origin 也无 Referer：只允许读操作（直接输入地址、图片加载、服务端抓取）。
  if (!claimed) {
    return method === 'GET' || method === 'HEAD'
      ? { ok: true }
      : { ok: false, status: 403, error: '请求来源不受信任' };
  }

  // 声明了来源就必须能校验。允许清单为空说明 SITE_ORIGINS 没配（生产模式不会兜底），
  // 这属于部署配置缺失，不能报「来源不受信任」——那会把排查引向错误方向。
  // 历史故障：漏配 SITE_ORIGINS 时，所有带 Referer 的图片请求与登录接口都 403，
  // 页面表现为整站破图 + 无法登录，却看不到任何配置提示。
  if (SITE_ORIGINS.size === 0) {
    return {
      ok: false,
      status: 503,
      error: '站点未配置可信来源（SITE_ORIGINS），无法校验请求来源，请联系运维检查部署配置',
    };
  }

  return SITE_ORIGINS.has(claimed)
    ? { ok: true }
    : { ok: false, status: 403, error: '请求来源不受信任' };
}

async function proxy(request: NextRequest, segments: string[]) {
  // [...path] 不含 'api' 段，需显式补回前缀。
  const pathname = '/api/' + segments.map((segment) => encodeURIComponent(segment)).join('/');
  const method = request.method.toUpperCase();

  if (!isAllowed(method, pathname)) {
    return reject(404, '请求的资源不存在');
  }

  // 先确认请求来自本站，再构造可信内部请求。顺序不能颠倒。
  const trusted = verifyBrowserOrigin(request, method);
  if (!trusted.ok) {
    return reject(trusted.status || 403, trusted.error || '请求来源不受信任');
  }

  const search = request.nextUrl.search || '';
  if (!API_ORIGIN) {
    // 生产环境缺 ALSVID_API_ORIGIN 时明确报「配置缺失」，而不是发到某个默认地址
    // 让排查方向跑偏（换机器/换域名时最容易踩）。
    return reject(503, '站点未配置后端地址（ALSVID_API_ORIGIN），请联系运维检查部署配置');
  }
  const target = new URL(API_ORIGIN + pathname + search);

  const headers = new Headers();
  const accept = request.headers.get('accept');
  if (accept) headers.set('accept', accept);
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('content-type', contentType);
  const cookie = request.headers.get('cookie');
  if (cookie) headers.set('cookie', cookie);
  // 来源已校验，这里改写为后端源以通过 8089 公开表单接口的同源校验；
  // 客户端原始 Origin 不向下游透传。
  headers.set('origin', API_ORIGIN);
  headers.set('x-alsvid-via', 'storefront');
  // 告知后端本站实际协议；来源为显式配置，不接受客户端自带的值。
  headers.set('x-forwarded-proto', SITE_IS_HTTPS ? 'https' : 'http');

  const init: RequestInit = { method, headers, redirect: 'manual', cache: 'no-store' };
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch {
    return reject(502, '服务暂时不可用，请稍后重试');
  }

  const responseHeaders = new Headers();
  for (const key of ['content-type', 'cache-control', 'etag', 'content-length', 'content-disposition']) {
    const value = upstream.headers.get(key);
    if (value) responseHeaders.set(key, value);
  }
  // 订单列表的分页信号走 X-Has-More，必须透传，否则前端无法判断还有没有下一页。
  const hasMore = upstream.headers.get('x-has-more');
  if (hasMore) responseHeaders.set('x-has-more', hasMore);
  // 会话 Cookie 必须回传给浏览器。此前遗漏转发 set-cookie，导致
  // POST /api/auth/login 虽然 200 但拿不到 alsvid_session，登录链路整体失效。
  // 一条响应可能带多个 Set-Cookie（登录 + 清理并存），因此用 append 逐条转发。
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', hardenSessionCookie(cookie));
  }
  responseHeaders.set('X-Content-Type-Options', 'nosniff');

  return new NextResponse(method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

type Context = { params: Promise<{ path?: string[] }> };

async function resolve(context: Context) {
  const { path } = await context.params;
  return Array.isArray(path) ? path : [];
}

export async function GET(request: NextRequest, context: Context) {
  return proxy(request, await resolve(context));
}

export async function HEAD(request: NextRequest, context: Context) {
  return proxy(request, await resolve(context));
}

export async function POST(request: NextRequest, context: Context) {
  return proxy(request, await resolve(context));
}

export async function PUT(request: NextRequest, context: Context) {
  return proxy(request, await resolve(context));
}
