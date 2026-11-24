const { test } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { apiAccessHook } = require('../access-policy');
const { registerPublicLocationRoutes, normalizeLocation } = require('../public-locations');

test('public directory validates capability and fails closed', async t => {
  const seen = [];
  const app = Fastify();
  app.addHook('onRequest', apiAccessHook(null, () => null));
  registerPublicLocationRoutes(app, { async list(capability) { seen.push(capability); if (capability === 'service') throw Error('private details'); return [{ id: 'example', name: 'Example', country: 'DE', city: 'Berlin', address: 'Example street', sales: true, service: false }]; } });
  t.after(() => app.close());
  assert.equal((await app.inject('/api/public/dealer-locations?capability=invalid')).statusCode, 400);
  const success = await app.inject('/api/public/dealer-locations?capability=sales');
  assert.equal(success.statusCode, 200);
  assert.equal(success.json().data[0].name, 'Example');
  const failure = await app.inject('/api/public/dealer-locations?capability=service');
  assert.equal(failure.statusCode, 503);
  assert.equal(failure.body.includes('private details'), false);
  assert.deepEqual(seen, ['sales', 'service']);
});

test('only administrators can maintain a validated versioned publication', async t => {
  let saves = 0;
  const app = Fastify();
  app.addHook('onRequest', apiAccessHook({ user: async role => role ? { role } : null }, req => req.headers['test-role']));
  registerPublicLocationRoutes(app, { async adminList() { return []; }, async source() { return { sourceId: 'synthetic-source' }; }, async save(id, input) { saves++; return input.revision === 2 ? null : { revision: 1 }; } });
  t.after(() => app.close());
  const id = '01890f3e-7b13-7aa9-b123-123456789abc';
  const payload = { name: 'Example', country: 'DE', city: 'Berlin', address: 'Example street', sales: true, service: false, approvedForPublication: false, authorizationActive: false, revision: 0 };
  assert.equal(normalizeLocation({ ...payload, approvedForPublication: undefined }), null);
  assert.equal(normalizeLocation({ ...payload, address: 'invalid\naddress' }), null);
  const put = (role, body) => app.inject({ method: 'PUT', url: `/api/public-locations/${id}`, headers: role ? { 'test-role': role } : {}, payload: body });
  for (const role of [null, 'viewer', 'dealer', 'owner']) assert.notEqual((await put(role, payload)).statusCode, 200);
  assert.equal((await put('admin', payload)).statusCode, 200);
  assert.equal((await put('admin', { ...payload, revision: 2 })).statusCode, 409);
  for (const role of ['viewer', 'dealer', 'owner']) assert.equal((await app.inject({ url: `/api/public-locations/${id}/source`, headers: { 'test-role': role } })).statusCode, 403);
  assert.equal((await app.inject({ url: `/api/public-locations/${id}/source`, headers: { 'test-role': 'admin' } })).json().data.sourceId, 'synthetic-source');
  assert.equal(saves, 2);
});

test('public projection requires approval and authorization and excludes contacts', async t => {
  const dbPath = require.resolve('../db-pool'), modulePath = require.resolve('../public-locations');
  const db = require(dbPath), original = db.createPool, queries = [];
  db.createPool = () => ({ async query(sql) { queries.push(sql); return { rows: [] }; }, async end() {} });
  delete require.cache[modulePath];
  t.after(() => { db.createPool = original; delete require.cache[modulePath]; });
  const store = require('../public-locations').createPublicLocationsStore('synthetic-only');
  await store.list('sales'); await store.list('service');
  for (const query of queries) {
    assert.match(query, /approved_for_publication=true AND authorization_active=true/);
    assert.doesNotMatch(query, /contact|phone|email|note/i);
  }
  assert.match(queries[0], /AND sales=true/);
  assert.match(queries[1], /AND service=true/);
});

test('revoking public location access also revokes test-ride authorization', async t => {
  const dbPath = require.resolve('../db-pool'), modulePath = require.resolve('../public-locations');
  const db = require(dbPath), original = db.createPool, queries = [];
  db.createPool = () => ({
    async connect() { return { async query(sql) {
      queries.push(sql);
      if (sql.startsWith('UPDATE public_locations')) return { rowCount: 1, rows: [{ revision: 2 }] };
      if (sql.includes('to_regclass')) return { rows: [{ present: true }] };
      if (sql.startsWith('UPDATE test_ride_enquiries')) return { rows: [] };
      return { rows: [] };
    }, release() {} }; },
    async end() {},
  });
  delete require.cache[modulePath];
  t.after(() => { db.createPool = original; delete require.cache[modulePath]; });
  const store = require('../public-locations').createPublicLocationsStore('synthetic-only');
  await store.save('01890f3e-7b13-7aa9-b123-123456789abc', {
    name: 'Example', country: 'DE', city: 'Berlin', address: 'Example street', sales: true, service: false,
    approvedForPublication: false, authorizationActive: true, revision: 1,
  });
  const revoke = queries.findIndex(sql => sql.startsWith('UPDATE test_ride_location_authorizations'));
  const clearAssignments = queries.findIndex(sql => sql.startsWith('UPDATE test_ride_enquiries'));
  assert.ok(revoke > 0);
  assert.match(queries[revoke], /test_ride_authorized=false,revision=revision\+1/);
  assert.ok(clearAssignments > revoke);
  assert.equal(queries.at(-1), 'COMMIT');
});
