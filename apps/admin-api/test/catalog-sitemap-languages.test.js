const { test } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { registerCatalogRoutes } = require('../catalog');

test('sitemap exposes only published languages for each product', async t => {
  const app = Fastify();
  t.after(() => app.close());
  registerCatalogRoutes(app, {
    catalog: { sitemapProducts: async () => [
      { slug: 'bike-one', languages: ['zh', 'de'] },
      { slug: 'bike-two', languages: ['en'] },
    ] },
  });
  const response = await app.inject({ method: 'GET', url: '/sitemap.xml' });
  assert.equal(response.statusCode, 200);
  // API 保留旧地址作为兼容入口，官网由 Next.js 301 到规范商品 URL。
  for (const path of ['/www/zh/products/bike-one', '/www/de/products/bike-one', '/www/en/products/bike-two']) {
    assert.ok(response.body.includes(path), path);
  }
  for (const path of ['/www/en/products/bike-one', '/www/zh/products/bike-two', '/www/de/products/bike-two']) {
    assert.equal(response.body.includes(path), false, path);
  }
});
