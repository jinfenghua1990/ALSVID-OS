const { test } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { apiAccessHook } = require('../access-policy');
const { normalizeColourInterest, registerColourInterestRoutes } = require('../colour-interest');

const sample = () => ({ productCode: 'A1-ULTRA', sessionKey: '123e4567-e89b-42d3-a456-426614174000', modelCode: 'standard', colourCode: 'sample', locale: 'de' });

function appWith(store, options) {
  const app = Fastify();
  const auth = { user: async token => token ? { role: token } : null };
  app.addHook('onRequest', apiAccessHook(auth, req => req.headers['test-role']));
  registerColourInterestRoutes(app, store, options);
  return app;
}

test('only small pseudonymous FC1 preferences are accepted', () => {
  assert.deepEqual(normalizeColourInterest(sample()), sample());
  assert.equal(normalizeColourInterest({ ...sample(), sessionKey: 'bad' }), null);
  assert.equal(normalizeColourInterest({ ...sample(), modelCode: 'other' }), null);
  assert.equal(normalizeColourInterest({ ...sample(), colourCode: 'red' }), null);
  assert.equal(normalizeColourInterest({ ...sample(), locale: 'fr' }), null);
  assert.equal(normalizeColourInterest({ ...sample(), email: 'not-accepted@example.invalid' }), null);
});

test('public preference submission enforces origin and exposes summary only to admin', async t => {
  const saved = [];
  const store = { async save(input) { saved.push(input); }, async summary() { return { total: saved.length, variants: [] }; } };
  const app = appWith(store);
  t.after(() => app.close());
  const post = (payload, origin = 'http://localhost:8089') => app.inject({ method: 'POST', url: '/api/public/fc1-colour-interest', headers: { host: 'localhost:8089', origin }, payload });
  assert.equal((await post(sample(), 'https://attacker.invalid')).statusCode, 403);
  assert.equal((await post({ ...sample(), email: 'private@example.invalid' })).statusCode, 400);
  assert.equal((await post(sample())).statusCode, 200);
  assert.deepEqual(saved, [sample()]);
  assert.equal((await app.inject({ method: 'GET', url: '/api/colour-interest/summary' })).statusCode, 401);
  for (const role of ['owner', 'dealer', 'viewer']) {
    assert.equal((await app.inject({ method: 'GET', url: '/api/colour-interest/summary', headers: { 'test-role': role } })).statusCode, 403);
  }
  const result = await app.inject({ method: 'GET', url: '/api/colour-interest/summary', headers: { 'test-role': 'admin' } });
  assert.equal(result.statusCode, 200);
  assert.equal(result.json().data.total, 1);
});

test('public preference route fails closed on rate limit and storage errors', async t => {
  const app = appWith({ async save() { throw Error('sensitive backend detail'); } }, { maxPerHour: 1 });
  t.after(() => app.close());
  const request = () => app.inject({ method: 'POST', url: '/api/public/fc1-colour-interest', payload: sample() });
  const first = await request();
  assert.equal(first.statusCode, 503);
  assert.equal(first.body.includes('sensitive backend detail'), false);
  assert.equal((await request()).statusCode, 429);
});

test('store upserts one preference per session and returns only aggregates', async t => {
  const dbPath = require.resolve('../db-pool'), modulePath = require.resolve('../colour-interest');
  const db = require(dbPath), original = db.createPool, calls = [];
  db.createPool = () => ({
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: sql.startsWith('SELECT') ? [{ model_code: 'standard', colour_code: 'sample', count: 2, last_selection: new Date('2026-01-01T00:00:00Z') }] : [] };
    },
    async end() {},
  });
  delete require.cache[modulePath];
  t.after(() => { db.createPool = original; delete require.cache[modulePath]; });
  const { createColourInterestStore } = require('../colour-interest');
  const store = createColourInterestStore('synthetic-only');
  await store.save(sample());
  assert.match(calls[0].sql, /ON CONFLICT\(product_code,session_key\) DO UPDATE/);
  assert.deepEqual(calls[0].params, ['A1-ULTRA', sample().sessionKey, 'standard', 'sample', 'de']);
  const summary = await store.summary();
  assert.equal(summary.total, 2);
  assert.deepEqual(summary.variants, [{ model: 'standard', colour: 'sample', count: 2 }]);
  assert.equal(JSON.stringify(summary).includes(sample().sessionKey), false);
});
