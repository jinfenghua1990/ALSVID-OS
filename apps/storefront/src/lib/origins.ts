// 站点与后端来源的唯一读取点。
//
// 为什么集中：8089 / 8091 是本地端口，不能出现在业务逻辑里。迁移到 Hetzner（或任何
// 其他环境）时，只应改部署配置与环境变量，不该再动源码。
//
// 规则：
// - 开发环境：允许 localhost 兜底，并在控制台明确提示「用的是兜底值」。
// - 生产环境（NODE_ENV=production）：不兜底。缺配置就报出缺哪个变量，
//   而不是悄悄把请求打到 127.0.0.1 —— 那会让线上故障看起来像「后端挂了」。
// - 后端内部地址（server→server）与浏览器可见地址是两件事：
//   ALSVID_API_ORIGIN 是 8091 服务端访问 8089 的内部地址；
//   SITE_ORIGINS 是浏览器实际访问 8091 的来源，用于 Cookie Secure 判定与同源校验。

const DEV_API_ORIGIN = 'http://127.0.0.1:8089';
const DEV_SITE_ORIGINS = ['http://localhost:8091', 'http://127.0.0.1:8091'];

function isProduction() {
  return process.env.NODE_ENV === 'production';
}

function warnOnce(key: string, message: string) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[alsvid:config] ${message}`);
}
const warned = new Set<string>();
// 构建期与运行期都会执行到，避免 Next 多次调用 generateMetadata 刷屏
let apiOriginWarned = false;

/** 8091 服务端访问 8089 的内部地址。缺少配置时返回空串，由调用方给出可诊断的错误。 */
export function apiOrigin(): string {
  const configured = String(process.env.ALSVID_API_ORIGIN || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (isProduction()) {
    warnOnce('api-origin', '生产环境未设置 ALSVID_API_ORIGIN，后端请求将无法发起。请在部署配置中指定 8089 的内部地址。');
    return '';
  }
  if (!apiOriginWarned) {
    apiOriginWarned = true;
    console.warn(`[alsvid:config] 未设置 ALSVID_API_ORIGIN，开发环境使用兜底 ${DEV_API_ORIGIN}`);
  }
  return DEV_API_ORIGIN;
}

/** 组装后端 URL。apiOrigin 为空时直接抛出可读错误，避免请求发到错误的默认地址。 */
export function apiUrl(path: string): URL {
  const origin = apiOrigin();
  if (!origin) throw new Error('站点未配置后端地址（ALSVID_API_ORIGIN），请联系运维检查部署配置');
  return new URL(path, origin);
}

/** 浏览器可见的站点来源列表，用于 Secure Cookie 判定与同源校验。 */
export function siteOrigins(): string[] {
  const raw = String(process.env.SITE_ORIGINS || process.env.SITE_URL || '').trim();
  if (raw) return raw.split(',').map((value) => value.trim().replace(/\/+$/, '')).filter(Boolean);
  if (isProduction()) {
    warnOnce('site-origins', '生产环境未设置 SITE_ORIGINS，Secure Cookie 与同源校验会按开发规则处理。');
    return [];
  }
  return DEV_SITE_ORIGINS;
}

/** 站点是否走 HTTPS —— 决定会话 Cookie 是否加 Secure。 */
export function siteIsHttps(): boolean {
  return siteOrigins().some((origin) => origin.startsWith('https://'));
}

/** 供页面 metadata / canonical 使用的站点绝对地址（不含末尾斜杠）。 */
export function siteUrl(): string {
  const first = siteOrigins()[0] || '';
  return first.replace(/\/+$/, '');
}
