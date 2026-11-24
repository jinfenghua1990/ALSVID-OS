const { test } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { apiAccessHook } = require('../access-policy');
const { registerStorefrontOrderRoutes } = require('../storefront-orders');

test('storefront order requests and manual payments enforce portal roles', async t => {
  const calls = [];
  const orders = {
    async submit(user, body) { calls.push(['submit', user.id, body]); return { id: 'synthetic', status: 'submitted' }; },
    async recordPayment(id, body) { calls.push(['payment', id, body]); return { id: 'synthetic-payment' }; },
  };
  const app = Fastify();
  app.addHook('onRequest', apiAccessHook({ user: async role => role ? { role, id: 'synthetic-' + role } : null }, req => req.headers['test-role']));
  registerStorefrontOrderRoutes(app, orders);
  t.after(() => app.close());
  const post = (url, role) => app.inject({ method: 'POST', url, headers: role ? { 'test-role': role } : {}, payload: {} });
  for (const role of [null, 'dealer', 'admin', 'viewer']) assert.notEqual((await post('/api/portal/storefront/orders', role)).statusCode, 200);
  assert.equal((await post('/api/portal/storefront/orders', 'owner')).statusCode, 200);
  assert.deepEqual(calls[0].slice(0, 2), ['submit', 'synthetic-owner']);
  for (const role of [null, 'owner', 'dealer', 'viewer']) assert.notEqual((await post('/api/storefront/orders/id/payments', role)).statusCode, 200);
  assert.equal((await post('/api/storefront/orders/id/payments', 'admin')).statusCode, 200);
  assert.equal(calls.length, 2);
});
