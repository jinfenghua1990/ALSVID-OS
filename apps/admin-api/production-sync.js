// 把已发布的官网首页版式同步到生产站（V1.0 Next.js on Cloud Run）。
//
// 生产站的首页在服务端渲染时会调用 GET /v1/public/home-layout 取版式，
// 这里负责「发布后推送」；未配置环境变量时只发布到本系统，不影响原有流程。
//
// 需要的环境变量：
//   ALSVID_PRODUCTION_API_BASE  生产 API 域名，例如 https://api.alsvidbike.com
//   ALSVID_LAYOUT_SYNC_TOKEN    与生产 API 的 ALSVID_LAYOUT_SYNC_TOKEN 一致
const TIMEOUT_MS = 8000;

const baseUrl = () => String(process.env.ALSVID_PRODUCTION_API_BASE || '').trim().replace(/\/+$/, '');
const syncToken = () => String(process.env.ALSVID_LAYOUT_SYNC_TOKEN || '').trim();

function syncConfigured() {
  return Boolean(baseUrl() && syncToken());
}

function syncStatus() {
  const base = baseUrl();
  return {
    configured: syncConfigured(),
    apiBase: base || null,
    // token 只报有没有，不回显
    tokenConfigured: Boolean(syncToken()),
  };
}

/**
 * 推送一份首页版式到生产 API。
 * 永不抛错：调用方（发布流程）只需要知道结果，失败也要让本地发布成功。
 */
async function syncHomeLayout({ html, css = '', version = null } = {}) {
  if (!syncConfigured()) {
    return { ok: false, skipped: true, reason: '未配置生产同步（ALSVID_PRODUCTION_API_BASE / ALSVID_LAYOUT_SYNC_TOKEN），本次只发布到本系统' };
  }
  if (!html || !String(html).trim()) {
    return { ok: false, skipped: true, reason: '没有可同步的页面内容' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(baseUrl() + '/v1/public/home-layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-alsvid-sync-token': syncToken() },
      body: JSON.stringify({ html, css: css || '', source: 'alsvid-8089' }),
      signal: controller.signal,
    });
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      return { ok: false, status: response.status, ms: Date.now() - startedAt, reason: `线上接口返回 ${response.status}：${text.slice(0, 200)}` };
    }
    let payload = null;
    try { payload = JSON.parse(text); } catch (_) { /* 线上返回非 JSON 时仍然算成功，版本号留空 */ }
    return { ok: true, status: response.status, ms: Date.now() - startedAt, localVersion: version, productionVersion: payload?.data?.version ?? null };
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    return { ok: false, ms: Date.now() - startedAt, reason: aborted ? `同步线上超时（>${TIMEOUT_MS / 1000}s）` : `同步线上失败：${error?.message || error}` };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { syncHomeLayout, syncConfigured, syncStatus };
