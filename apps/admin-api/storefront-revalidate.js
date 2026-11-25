'use strict';
// 发布后通知独立站刷新缓存。
//
// 8091 用 Next 的 tag 缓存装修版式（tag: storefront-layout）。8089 发布成功后主动
// POST 到 8091 的 /api/revalidate 让缓存立即失效；这样「后台点发布 → 前台立刻新」，
// 不必等 TTL 过期，也不必重新部署代码。
//
// 与 production-sync.js 的区别：那份是推给旧站 V1.0（Cloud Run，PUT /v1/public/home-layout），
// 属于历史通道、默认关闭；这里是新站 8091 的缓存失效通知，两者互不替代。
const TIMEOUT_MS = 5000;

const origin = () => String(process.env.ALSVID_STOREFRONT_ORIGIN || '').trim().replace(/\/+$/, '');
const token = () => String(process.env.ALSVID_REVALIDATE_TOKEN || '').trim();
// 浏览器可见地址与「服务端调用的内部地址」必须分开：
// 后台点「新站预览」时，浏览器要打开的是对外域名（如 https://www.alsvidbike.com），
// 而发布后刷新缓存走的是内部地址（如 http://127.0.0.1:8091）。
// 若两者混用，迁到 Hetzner 后要么预览打不开，要么刷新连不上。
const publicOrigin = () => String(process.env.ALSVID_STOREFRONT_PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');

function revalidateConfigured() {
  return Boolean(origin() && token());
}

function revalidateStatus() {
  return {
    configured: revalidateConfigured(),
    storefrontOrigin: origin() || null,
    // 没单独配对外地址时，退回内部地址（本地开发两者同源，够用）
    storefrontPublicOrigin: publicOrigin() || origin() || null,
    publicOriginConfigured: Boolean(publicOrigin()),
    // token 只报有没有，绝不回显
    tokenConfigured: Boolean(token()),
  };
}

/**
 * 请求 8091 失效装修缓存。永不抛错：刷新失败不能让发布本身失败。
 * @returns {Promise<{ok: boolean, skipped?: boolean, status?: number, ms?: number, reason?: string}>}
 */
async function revalidateStorefront(tags = ['storefront-layout']) {
  if (!revalidateConfigured()) {
    return { ok: false, skipped: true, reason: '未配置前台刷新（ALSVID_STOREFRONT_ORIGIN / ALSVID_REVALIDATE_TOKEN）' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();
  try {
    const response = await fetch(origin() + '/api/revalidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-alsvid-revalidate-token': token() },
      body: JSON.stringify({ tags }),
      signal: controller.signal,
    });
    const text = await response.text().catch(() => '');
    if (!response.ok) {
      return { ok: false, status: response.status, ms: Date.now() - startedAt, reason: `前台返回 ${response.status}：${text.slice(0, 200)}` };
    }
    let result;
    try { result = JSON.parse(text); } catch (_) { result = null; }
    if (result?.revalidated !== true || !Array.isArray(result.tags) || !tags.every(tag => result.tags.includes(tag))) {
      return { ok: false, status: response.status, ms: Date.now() - startedAt, reason: '前台未确认全部缓存标签失效' };
    }
    return { ok: true, status: response.status, ms: Date.now() - startedAt, tags, pageVerified: false };
  } catch (error) {
    const aborted = error?.name === 'AbortError';
    return { ok: false, ms: Date.now() - startedAt, reason: aborted ? `刷新前台超时（>${TIMEOUT_MS / 1000}s）` : `刷新前台失败：${error?.message || error}` };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { revalidateStorefront, revalidateConfigured, revalidateStatus, storefrontPublicOrigin: publicOrigin };
