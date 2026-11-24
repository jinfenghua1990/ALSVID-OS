const { createHash } = require('crypto');
const { createPool } = require('./db-pool');
const { currentActor } = require('./audit-context');
const { uuidv7, isUuidv7 } = require('./uuidv7');
const { normalizeReservation, createReservationMailer, createTestRideMailer } = require('./fc1-reservation');

const STATUSES = ['NEW', 'REVIEWING', 'CONTACTED', 'CLOSED'];
const controls = value => /[\x00-\x1f\x7f]/.test(value);

function normalizeTestRide(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.purpose !== 'test_ride') return null;
  if (typeof input.email !== 'string' || typeof input.city !== 'string' || (input.name !== undefined && typeof input.name !== 'string')) return null;
  const email = input.email.trim().toLowerCase(), city = input.city.trim(), name = (input.name || '').trim();
  if (email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) || city.length < 2 || city.length > 80 || name.length > 80 || controls(city) || controls(name)) return null;
  if (!['DE', 'AT'].includes(input.country) || !['zh', 'en', 'de'].includes(input.locale)) return null;
  if (typeof input.model !== 'string' || typeof input.colour !== 'string') return null;
  const model = input.model.trim(), colour = input.colour.trim();
  if (!model || model.length > 40 || !colour || colour.length > 60 || controls(model) || controls(colour)) return null;
  return { email, city, name, country: input.country, locale: input.locale, model, colour };
}

function createTestRideStore(connectionString) {
  const pool = createPool(connectionString, { max: 2, connectionTimeoutMillis: 10000 });
  const fields = 'id,name,email,country_code AS "country",city,model,colour,locale,status,notification_state AS "notificationState",review_note AS "reviewNote",version,consent_at AS "consentAt",created_at AS "createdAt",updated_at AS "updatedAt"';
  return {
    async limitReservation(email, ip) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const digest = value => createHash('sha256').update(value).digest('hex');
        const buckets = [{ key: digest('reservation:global'), limit: 300 }, { key: digest(`reservation:client:${ip}`), limit: 20 }, { key: digest(`reservation:email:${email}`), limit: 3 }].sort((a,b)=>a.key.localeCompare(b.key));
        let limited = false;
        for (const bucket of buckets) {
          const row = (await client.query(`INSERT INTO test_ride_rate_limits(bucket_hash,window_started_at,request_count)
            VALUES($1,now(),1) ON CONFLICT(bucket_hash) DO UPDATE SET
            request_count=CASE WHEN test_ride_rate_limits.window_started_at<=now()-interval '1 hour' THEN 1 ELSE test_ride_rate_limits.request_count+1 END,
            window_started_at=CASE WHEN test_ride_rate_limits.window_started_at<=now()-interval '1 hour' THEN now() ELSE test_ride_rate_limits.window_started_at END
            RETURNING request_count`, [bucket.key])).rows[0];
          if (row.request_count > bucket.limit) limited = true;
        }
        await client.query('COMMIT');
        return limited;
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
      finally { client.release(); }
    },
    async submit(input, ip) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const digest = value => createHash('sha256').update(value).digest('hex');
        const buckets = [
          { key: digest('test-ride:global'), limit: 300 },
          { key: digest(`test-ride:client:${ip}`), limit: 20 },
          { key: digest(`test-ride:email:${input.email}`), limit: 3 },
        ].sort((a, b) => a.key.localeCompare(b.key));
        let limited = false;
        for (const bucket of buckets) {
          const row = (await client.query(`INSERT INTO test_ride_rate_limits(bucket_hash,window_started_at,request_count)
            VALUES($1,now(),1) ON CONFLICT(bucket_hash) DO UPDATE SET
            request_count=CASE WHEN test_ride_rate_limits.window_started_at<=now()-interval '1 hour' THEN 1 ELSE test_ride_rate_limits.request_count+1 END,
            window_started_at=CASE WHEN test_ride_rate_limits.window_started_at<=now()-interval '1 hour' THEN now() ELSE test_ride_rate_limits.window_started_at END
            RETURNING request_count`, [bucket.key])).rows[0];
          if (row.request_count > bucket.limit) limited = true;
        }
        if (limited) { await client.query('COMMIT'); return { limited: true }; }
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [digest(`test-ride:dedupe:${input.email}`)]);
        const existing = (await client.query(`SELECT id FROM test_ride_enquiries WHERE lower(email)=$1 AND country_code=$2 AND lower(city)=lower($3)
          AND model=$4 AND colour=$5 AND created_at>now()-interval '24 hours' ORDER BY created_at DESC LIMIT 1`,
        [input.email, input.country, input.city, input.model, input.colour])).rows[0];
        if (existing) { await client.query('COMMIT'); return { id: existing.id, created: false }; }
        const id = uuidv7();
        await client.query(`INSERT INTO test_ride_enquiries(id,name,email,country_code,city,model,colour,locale)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [id, input.name, input.email, input.country, input.city, input.model, input.colour, input.locale]);
        await client.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)', ['public applicant', 'test_ride.submit', `test-rides/${id}`, JSON.stringify({ status: 'NEW' })]);
        await client.query('COMMIT');
        return { id, created: true };
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
      finally { client.release(); }
    },
    async list() { return (await pool.query(`SELECT ${fields} FROM test_ride_enquiries ORDER BY created_at DESC,id DESC LIMIT 200`)).rows; },
    async notification(id, state) {
      if (!isUuidv7(id) || !['PENDING','SENT','FAILED'].includes(state)) throw Error('Invalid notification state');
      await pool.query('UPDATE test_ride_enquiries SET notification_state=$2,updated_at=now() WHERE id=$1', [id,state]);
    },
    async history(id) {
      if (!isUuidv7(id)) throw Object.assign(Error('试骑意向编号无效'), { statusCode: 400 });
      return (await pool.query('SELECT previous_status AS "previousStatus",status,note,version,actor,created_at AS "createdAt" FROM test_ride_review_events WHERE enquiry_id=$1 ORDER BY version', [id])).rows;
    },
    async source(id) {
      if (!isUuidv7(id)) throw Object.assign(Error('试骑意向编号无效'), { statusCode: 400 });
      return (await pool.query(`SELECT m.source_id AS "sourceId",m.source_location_id AS "sourceLocationId",m.target_location_id AS "targetLocationId",
        l.name AS "locationName",m.source_snapshot->>'status' AS "sourceStatus",m.captured_at AS "capturedAt"
        FROM test_ride_migration_sources m LEFT JOIN public_locations l ON l.id=m.target_location_id WHERE m.target_id=$1`, [id])).rows[0] || null;
    },
    async review(id, input) {
      if (!isUuidv7(id) || !STATUSES.includes(input?.status) || !Number.isSafeInteger(input.version) || input.version < 1 || typeof input.note !== 'string' || input.note.length > 2000) throw Object.assign(Error('审核资料无效'), { statusCode: 400 });
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const old = (await client.query('SELECT status,review_note,version FROM test_ride_enquiries WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!old) throw Object.assign(Error('试骑意向不存在'), { statusCode: 404 });
        if (old.version !== input.version) throw Object.assign(Error('记录已更新，请刷新后重试'), { statusCode: 409 });
        const after = (await client.query(`UPDATE test_ride_enquiries SET status=$2,review_note=$3,version=version+1,updated_at=now() WHERE id=$1 RETURNING ${fields}`, [id, input.status, input.note.trim()])).rows[0];
        await client.query('INSERT INTO test_ride_review_events(id,enquiry_id,previous_status,status,note,version,actor) VALUES($1,$2,$3,$4,$5,$6,$7)', [uuidv7(), id, old.status, after.status, input.note.trim(), after.version, currentActor()]);
        await client.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'test_ride.review', `test-rides/${id}`, JSON.stringify({ status: old.status, version: old.version }), JSON.stringify({ status: after.status, version: after.version })]);
        await client.query('COMMIT');
        return after;
      } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
      finally { client.release(); }
    },
    close: () => pool.end(),
  };
}

function registerTestRideRoutes(app, store, mailer = createReservationMailer({ apiKey: process.env.MAIL_API_KEY?.trim(), from: process.env.MAIL_FROM_ADDRESS?.trim(), recipient: process.env.FC1_RESERVATION_EMAIL?.trim() }), testRideMailer = createTestRideMailer({ apiKey: process.env.MAIL_API_KEY?.trim(), from: process.env.MAIL_FROM_ADDRESS?.trim(), recipient: process.env.FC1_RESERVATION_EMAIL?.trim() })) {
  app.post('/api/public/fc1-reservation', { config: { publicTestRide: true }, bodyLimit: 2048 }, async (req, reply) => {
    if (req.headers.origin) {
      let valid = false;
      try { valid = new URL(req.headers.origin).origin === `${req.protocol}://${req.headers.host}`; } catch (_) {}
      if (!valid) return reply.code(403).send({ error: '请求来源不受信任' });
    }
    if (req.body?.purpose !== 'test_ride') {
      const input = normalizeReservation(req.body);
      if (!input || !isUuidv7(req.body?.requestId)) return reply.code(400).send({ error: '预约意向资料无效' });
      if (!store || !mailer) return reply.code(503).send({ error: '预约意向服务暂不可用' });
      try {
        if (await store.limitReservation(input.email, req.ip)) return reply.code(429).send({ error: '请求过多，请稍后重试' });
        await mailer(input, req.body.requestId);
        return { data: { received: true } };
      } catch (_) { return reply.code(503).send({ error: '预约意向服务暂不可用' }); }
    }
    const input = normalizeTestRide(req.body);
    if (!input) return reply.code(400).send({ error: '试骑意向资料无效' });
    if (!store) return reply.code(503).send({ error: '试骑意向服务暂不可用' });
    try {
      const result = await store.submit(input, req.ip);
      if (result.limited) return reply.code(429).send({ error: '请求过多，请稍后重试' });
      if (result.created && testRideMailer) {
        try {
          await store.notification(result.id, 'PENDING');
          let state = 'SENT';
          try { await testRideMailer(input, result.id); } catch (_) { state = 'FAILED'; }
          await store.notification(result.id, state);
        } catch (_) { /* The saved enquiry remains available to administrators. */ }
      }
      return { data: { received: true, reference: result.id } };
    } catch (_) { return reply.code(503).send({ error: '试骑意向服务暂不可用' }); }
  });
  app.get('/api/test-rides', async (req, reply) => {
    if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可查看试骑意向' });
    if (!store) return reply.code(503).send({ error: '试骑意向服务暂不可用' });
    try { return { data: await store.list() }; }
    catch (_) { return reply.code(503).send({ error: '试骑意向服务暂不可用' }); }
  });
  app.get('/api/test-rides/:id/history', async (req, reply) => {
    if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可查看处理记录' });
    if (!store) return reply.code(503).send({ error: '试骑意向服务暂不可用' });
    try { return { data: await store.history(req.params.id) }; }
    catch (error) { return reply.code(error.statusCode || 503).send({ error: error.statusCode ? error.message : '试骑意向服务暂不可用' }); }
  });
  app.get('/api/test-rides/:id/source', async (req, reply) => {
    if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可查看迁移来源' });
    if (!store) return reply.code(503).send({ error: '试骑来源暂不可用' });
    try { return { data: await store.source(req.params.id) }; }
    catch (error) { return reply.code(error.statusCode || 503).send({ error: error.statusCode ? error.message : '试骑来源暂不可用' }); }
  });
  app.patch('/api/test-rides/:id', async (req, reply) => {
    if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可处理试骑意向' });
    if (!store) return reply.code(503).send({ error: '试骑意向服务暂不可用' });
    try { return { data: await store.review(req.params.id, req.body || {}) }; }
    catch (error) { return reply.code(error.statusCode || 503).send({ error: error.statusCode ? error.message : '试骑意向服务暂不可用' }); }
  });
}

module.exports = { normalizeTestRide, createTestRideStore, registerTestRideRoutes };
