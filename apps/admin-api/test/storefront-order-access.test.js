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

test('direct order recovery permits only owner role and delegates ownership to the order store', async t => {
  const id='018e6e58-3921-789a-bcde-1234567890ab';
  const app=Fastify();
  app.addHook('onRequest',apiAccessHook({user:async role=>role?{role,id:'account-'+role}:null},req=>req.headers['test-role']));
  const seen=[];
  registerStorefrontOrderRoutes(app,{async get(user,requested){seen.push([user.id,requested]);return {id:requested,status:'submitted'}}});
  t.after(()=>app.close());
  const get=role=>app.inject({method:'GET',url:'/api/portal/storefront/orders/'+id,headers:role?{'test-role':role}:{}});
  for(const role of [null,'admin','viewer','dealer'])assert.notEqual((await get(role)).statusCode,200);
  const response=await get('owner');
  assert.equal(response.statusCode,200);
  assert.deepEqual(response.json(),{id,status:'submitted'});
  assert.deepEqual(seen,[['account-owner',id]]);
});
