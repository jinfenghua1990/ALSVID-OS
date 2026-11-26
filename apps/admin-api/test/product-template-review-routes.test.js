'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
process.env.ALSVID_PREVIEW_SECRET = 'unit-test-product-template-review-secret-32-bytes';
const { registerCmsRoutes } = require('../cms');

function setup() {
  const routes = new Map();
  const page = { id: '01954f2a-3a7b-7d91-8c4d-123456789abc', pageType: 'product_template', locale: 'zh', path: '/products', revision: 4, status: 'active', draft: { catalogLayout: {} } };
  const calls = [];
  const cms = {
    get: async id => { assert.equal(id, page.id); return page; },
    publicProductTemplate: async (locale, productId, options) => {
      calls.push({ locale, productId, options });
      return { id: page.id, catalogLayout: { categories: [] } };
    },
  };
  registerCmsRoutes({ route: route => routes.set(`${route.method} ${route.url}`, route) }, cms);
  const invoke = (key, req, reply = {}) => {
    Object.assign(reply, {
      header(name, value) { this.headers ||= {}; this.headers[name] = value; return this; },
      code(status) { this.statusCode = status; return this; },
      send(body) { this.body = body; return body; },
    });
    return routes.get(key).handler(req, reply);
  };
  return { page, calls, invoke };
}

test('product template preview route uses a signed scoped token and disables caching', async () => {
  const { page, calls, invoke } = setup();
  const session = await invoke('POST /api/cms/pages/:id/product-template-review', {
    params: { id: page.id },
    body: { revision: page.revision, previewScope: 'listing', productId: '' },
    user: { id: 'admin-1', role: 'admin' },
  });
  const slot = session.slots.find(item => item.locale === 'zh' && item.device === 'desktop');
  const reply = {};
  const preview = await invoke('GET /api/cms/product-template-review-preview', {
    query: { token: slot.token, locale: 'zh', productId: '' },
  }, reply);

  assert.equal(preview.draft, true);
  assert.equal(preview.locale, 'zh');
  assert.equal(typeof preview.receipt, 'string');
  assert.equal(reply.headers['Cache-Control'], 'no-store');
  assert.deepEqual(calls[0], { locale: 'zh', productId: '', options: { draft: true, pageId: page.id, expectedRevision: page.revision } });
});

test('product template review preview rejects a token used for another product', async () => {
  const { page, invoke } = setup();
  const session = await invoke('POST /api/cms/pages/:id/product-template-review', {
    params: { id: page.id },
    body: { revision: page.revision, previewScope: 'product', productId: 'bike-1' },
    user: { id: 'admin-1', role: 'admin' },
  });
  const slot = session.slots.find(item => item.locale === 'en' && item.device === 'mobile');

  const reply = {};
  const response = await invoke('GET /api/cms/product-template-review-preview', {
    query: { token: slot.token, locale: 'en', productId: 'bike-2' },
  }, reply);
  assert.equal(reply.statusCode, 403);
  assert.equal(response.error, '预览凭证与当前页面不匹配');
});
