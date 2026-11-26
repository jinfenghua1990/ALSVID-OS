'use strict';

// Fail closed until the six real draft-preview receipts can be verified by the server.
// Never trust an approval flag, checkbox list or revision sent by the browser.
// Withdrawal and draft/history operations remain available.
const LOCKED_POST_ROUTES = new Set([
  '/api/site/layout-draft/publish',
  '/api/site/layout-draft/publish-locale',
  '/api/site/layout-draft/rollback',
  '/api/site/homepage/publish',
  '/api/products/:id/publication/publish',
  '/api/cms/pages/:id/publish',
  '/api/cms/pages/:id/rollback',
  '/api/storefront/listings/:id/publish',
  '/api/storefront/listings/:id/rollback',
]);

function isReleaseLocked(method, route, body) {
  if (method === 'POST' && LOCKED_POST_ROUTES.has(route)) return true;
  // Re-enabling an inactive CMS page can expose a previously published snapshot.
  if (method === 'PATCH' && route === '/api/cms/pages/:id/status' && body?.status === 'active') return true;
  return false;
}

async function storefrontReleaseGate(req, reply) {
  // Use Fastify's matched route template rather than raw URLs, so URL encoding,
  // query strings and parameter values cannot evade the guard.
  if (!isReleaseLocked(req.method, req.routeOptions.url, req.body)) return;
  return reply.code(409).header('Cache-Control','no-store').send({
    code:'STOREFRONT_RELEASE_REVIEW_REQUIRED',
    error:'装修发布暂时锁定：三种语言 × 两种设备的真实草稿预览及服务端核验尚未接通。可保存草稿、查看历史或撤回，不能直接发布或回滚上线。',
  });
}

module.exports = {storefrontReleaseGate,isReleaseLocked};
