const { test } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { apiAccessHook } = require('../access-policy');
const { registerDealerApplicationArchiveRoutes } = require('../dealer-application-archive');

test('only admins can read historical dealer applications', async t => {
  const app = Fastify();
  app.addHook('onRequest', apiAccessHook({ user: async role => role ? { role } : null }, req => req.headers['test-role']));
  let requestedPage;
  registerDealerApplicationArchiveRoutes(app, { async list(page) { requestedPage = page; return { items: [{ sourceId: 'example', snapshot: { status: 'CONTACTED' } }], hasMore: false }; } });
  t.after(() => app.close());
  assert.equal((await app.inject('/api/dealer-application-sources')).statusCode, 401);
  for (const role of ['viewer', 'owner', 'dealer']) assert.equal((await app.inject({ url: '/api/dealer-application-sources', headers: { 'test-role': role } })).statusCode, 403);
  assert.equal((await app.inject({ url: '/api/dealer-application-sources?page=2', headers: { 'test-role': 'admin' } })).json().data.items[0].snapshot.status, 'CONTACTED');
  assert.equal(requestedPage, 2);
  assert.equal((await app.inject({ url: '/api/dealer-application-sources?page=-1', headers: { 'test-role': 'admin' } })).statusCode, 400);
});
