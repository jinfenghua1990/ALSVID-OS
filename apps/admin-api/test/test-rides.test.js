const { test } = require('node:test');
const assert = require('node:assert/strict');
const Fastify = require('fastify');
const { apiAccessHook } = require('../access-policy');
const { normalizeTestRide, registerTestRideRoutes } = require('../test-rides');

const valid = () => ({ purpose: 'test_ride', name: 'Example', email: 'Rider@example.invalid', country: 'DE', city: 'Berlin', model: 'A1 Ultra Standard', colour: 'Sample', locale: 'en' });

function appWith(store) {
  const app = Fastify();
  app.addHook('onRequest', apiAccessHook({ user: async role => role ? { role } : null }, req => req.headers['test-role']));
  registerTestRideRoutes(app, store);
  return app;
}

test('test-ride input preserves purpose and rejects unsafe or incomplete details', () => {
  assert.equal(normalizeTestRide(valid()).email, 'rider@example.invalid');
  for (const input of [
    { ...valid(), purpose: 'reservation' }, { ...valid(), country: 'FR' }, { ...valid(), city: 'x' },
    { ...valid(), email: 'invalid' }, { ...valid(), name: 'line\nbreak' }, { ...valid(), model: '' },
    { ...valid(), locale: 'fr' }, { ...valid(), colour: 'x'.repeat(61) },
  ]) assert.equal(normalizeTestRide(input), null);
});

test('public submission and admin review enforce source, role and failure boundaries', async t => {
  let calls = 0;
  const store = {
    async submit() { calls++; return { id: 'reference', created: true }; },
    async list() { return [{ id: 'reference' }]; },
    async history() { return [{ version: 2, note: 'follow up' }]; },
    async source() { return { sourceId: 'old-id', locationName: 'Example location' }; },
    async review() { throw Object.assign(Error('记录已更新，请刷新后重试'), { statusCode: 409 }); },
  };
  const app = appWith(store);
  t.after(() => app.close());
  const post = (payload, origin = 'http://localhost:8089') => app.inject({ method: 'POST', url: '/api/public/fc1-reservation', headers: { host: 'localhost:8089', origin }, payload });
  assert.equal((await post(valid(), 'https://attacker.invalid')).statusCode, 403);
  assert.equal((await post({ ...valid(), city: '' })).statusCode, 400);
  assert.equal((await post({ ...valid(), purpose: 'reservation' })).statusCode, 400);
  assert.equal(calls, 0);
  const result = await post(valid());
  assert.equal(result.statusCode, 200);
  assert.deepEqual(result.json(), { data: { received: true, reference: 'reference' } });
  assert.equal((await app.inject({ method: 'GET', url: '/api/test-rides' })).statusCode, 401);
  for (const role of ['owner', 'dealer', 'viewer']) assert.equal((await app.inject({ method: 'GET', url: '/api/test-rides', headers: { 'test-role': role } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'GET', url: '/api/test-rides', headers: { 'test-role': 'admin' } })).statusCode, 200);
  assert.equal((await app.inject({ method: 'GET', url: '/api/test-rides/id/history', headers: { 'test-role': 'viewer' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'GET', url: '/api/test-rides/id/history', headers: { 'test-role': 'admin' } })).json().data[0].version, 2);
  assert.equal((await app.inject({ method: 'GET', url: '/api/test-rides/id/source', headers: { 'test-role': 'viewer' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'GET', url: '/api/test-rides/id/source', headers: { 'test-role': 'admin' } })).json().data.locationName, 'Example location');
  assert.equal((await app.inject({ method: 'PATCH', url: '/api/test-rides/id', headers: { 'test-role': 'admin' }, payload: {} })).statusCode, 409);
});

test('ordinary reservation requires a stable key, limit and successful notification', async t => {
  let sent = 0, limited = false, failed = false;
  const store = { async limitReservation() { if (failed) throw Error('private detail'); return limited; } };
  const app = Fastify();
  app.addHook('onRequest', apiAccessHook({ user: async () => null }, () => null));
  registerTestRideRoutes(app, store, async () => { sent++; });
  t.after(() => app.close());
  const payload = { purpose: 'reservation', email: 'person@example.invalid', model: 'A1 Ultra', colour: 'Blue', locale: 'en', requestId: '01890f3e-7b13-7aa9-b123-123456789abc' };
  const post = data => app.inject({ method: 'POST', url: '/api/public/fc1-reservation', payload: data });
  assert.equal((await post({ ...payload, requestId: 'invalid' })).statusCode, 400);
  limited = true;
  assert.equal((await post(payload)).statusCode, 429);
  assert.equal(sent, 0);
  limited = false; failed = true;
  assert.equal((await post(payload)).statusCode, 503);
  assert.equal(sent, 0);
  failed = false;
  assert.equal((await post(payload)).statusCode, 200);
  assert.equal(sent, 1);
});

test('storage failures and rate limiting never report a successful enquiry', async t => {
  let limited = false;
  const app = appWith({ async submit() { if (limited) return { limited: true }; throw Error('private database detail'); } });
  t.after(() => app.close());
  const send = () => app.inject({ method: 'POST', url: '/api/public/fc1-reservation', payload: valid() });
  const unavailable = await send();
  assert.equal(unavailable.statusCode, 503);
  assert.equal(unavailable.body.includes('private database detail'), false);
  limited = true;
  assert.equal((await send()).statusCode, 429);
});

test('test-ride notification failure does not lose the saved enquiry or resend a duplicate', async t => {
  let sent=0, created=true; const states=[];
  const id='01890f3e-7b13-7aa9-b123-123456789abc';
  const app=Fastify();
  app.addHook('onRequest',apiAccessHook(null,()=>null));
  registerTestRideRoutes(app,{async submit(){const result={id,created};created=false;return result},async notification(_,state){states.push(state)}},null,async()=>{sent++;throw Error('synthetic mail failure')});
  t.after(()=>app.close());
  const submit=()=>app.inject({method:'POST',url:'/api/public/fc1-reservation',payload:valid()});
  assert.equal((await submit()).statusCode,200);
  assert.deepEqual(states,['PENDING','FAILED']);
  assert.equal((await submit()).statusCode,200);
  assert.equal(sent,1);
});

test('submit deduplicates in a transaction and commits rate limits even when limited', async t => {
  const dbPath = require.resolve('../db-pool'), modulePath = require.resolve('../test-rides');
  const db = require(dbPath), original = db.createPool, buckets = new Map(), audits = [];
  let saved = null, inserts = 0, commits = 0, rollbacks = 0;
  db.createPool = () => ({
    async connect() { return {
      async query(sql, params = []) {
        if (sql === 'BEGIN') return { rows: [] };
        if (sql === 'COMMIT') { commits++; return { rows: [] }; }
        if (sql === 'ROLLBACK') { rollbacks++; return { rows: [] }; }
        if (sql.includes('INSERT INTO test_ride_rate_limits')) { const next = (buckets.get(params[0]) || 0) + 1; buckets.set(params[0], next); return { rows: [{ request_count: next }] }; }
        if (sql.startsWith('SELECT pg_advisory_xact_lock')) return { rows: [] };
        if (sql.startsWith('SELECT id FROM test_ride_enquiries')) return { rows: saved ? [{ id: saved }] : [] };
        if (sql.includes('INSERT INTO test_ride_enquiries')) { inserts++; saved = params[0]; return { rows: [] }; }
        if (sql.startsWith('INSERT INTO audit_log')) { audits.push(params); return { rows: [] }; }
        throw Error(`Unexpected query: ${sql}`);
      }, release() {},
    }; },
    async end() {},
  });
  delete require.cache[modulePath];
  t.after(() => { db.createPool = original; delete require.cache[modulePath]; });
  const { createTestRideStore } = require('../test-rides');
  const store = createTestRideStore('synthetic-only'), input = normalizeTestRide(valid());
  const first = await store.submit(input, '127.0.0.1');
  assert.equal(first.created, true);
  assert.deepEqual(await store.submit(input, '127.0.0.1'), { id: first.id, created: false });
  assert.deepEqual(await store.submit(input, '127.0.0.1'), { id: first.id, created: false });
  assert.deepEqual(await store.submit(input, '127.0.0.1'), { limited: true });
  assert.equal(inserts, 1);
  assert.equal(commits, 4);
  assert.equal(rollbacks, 0);
  assert.equal(audits.length, 1);
  assert.equal(JSON.stringify(audits).includes(input.email), false);
});

test('reservation rate limits are shared in storage and commit even when exceeded', async t => {
  const dbPath = require.resolve('../db-pool'), modulePath = require.resolve('../test-rides');
  const db = require(dbPath), original = db.createPool, buckets = new Map();
  let commits = 0;
  db.createPool = () => ({
    async connect() { return {
      async query(sql, params = []) {
        if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] };
        if (sql === 'COMMIT') { commits++; return { rows: [] }; }
        if (sql.includes('INSERT INTO test_ride_rate_limits')) {
          const count = (buckets.get(params[0]) || 0) + 1;
          buckets.set(params[0], count);
          return { rows: [{ request_count: count }] };
        }
        throw Error('Unexpected query');
      }, release() {},
    }; }, async end() {},
  });
  delete require.cache[modulePath];
  t.after(() => { db.createPool = original; delete require.cache[modulePath]; });
  const { createTestRideStore } = require('../test-rides');
  const store = createTestRideStore('synthetic-only');
  for (let n = 0; n < 3; n++) assert.equal(await store.limitReservation('preview@example.invalid', '127.0.0.1'), false);
  assert.equal(await store.limitReservation('preview@example.invalid', '127.0.0.1'), true);
  assert.equal(commits, 4);
  assert.equal(buckets.size, 3);
  assert.ok([...buckets.keys()].every(key => /^[a-f0-9]{64}$/.test(key)));
});

test('review rejects stale versions and audits only non-personal status changes', async t => {
  const dbPath = require.resolve('../db-pool'), modulePath = require.resolve('../test-rides');
  const db = require(dbPath), original = db.createPool, { uuidv7 } = require('../uuidv7');
  const id = uuidv7(), audit = [], events = [];
  let row = { status: 'NEW', review_note: '', version: 1 }, rollbacks = 0;
  db.createPool = () => ({
    async connect() { return {
      async query(sql, params = []) {
        if (sql === 'BEGIN' || sql === 'COMMIT') return { rows: [] };
        if (sql === 'ROLLBACK') { rollbacks++; return { rows: [] }; }
        if (sql.startsWith('SELECT status,review_note,version')) return { rows: [{ ...row }] };
        if (sql.startsWith('UPDATE test_ride_enquiries')) { row = { status: params[1], review_note: params[2], version: row.version + 1 }; return { rows: [{ ...row }] }; }
        if (sql.startsWith('INSERT INTO test_ride_review_events')) { events.push(params); return { rows: [] }; }
        if (sql.startsWith('INSERT INTO audit_log')) { audit.push(params); return { rows: [] }; }
        throw Error(`Unexpected query: ${sql}`);
      }, release() {},
    }; },
  });
  delete require.cache[modulePath];
  t.after(() => { db.createPool = original; delete require.cache[modulePath]; });
  const { createTestRideStore } = require('../test-rides');
  const store = createTestRideStore('synthetic-only');
  const updated = await store.review(id, { status: 'REVIEWING', note: 'private contact note', version: 1 });
  assert.equal(updated.version, 2);
  await assert.rejects(store.review(id, { status: 'CONTACTED', note: '', version: 1 }), error => error.statusCode === 409);
  assert.equal(rollbacks, 1);
  assert.equal(audit.length, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0][4], 'private contact note');
  assert.equal(JSON.stringify(audit).includes('private contact note'), false);
});
