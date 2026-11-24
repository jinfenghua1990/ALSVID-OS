const { createHash } = require('crypto');
const { createPool } = require('./db-pool');

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FIELDS = new Set(['productCode', 'sessionKey', 'modelCode', 'colourCode', 'locale']);

function normalizeColourInterest(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !FIELDS.has(key))) return null;
  if (input.productCode !== 'A1-ULTRA' || typeof input.sessionKey !== 'string' || !UUID_V4.test(input.sessionKey)) return null;
  if (!['standard', 'pro'].includes(input.modelCode) || !['sample', 'black', 'blue', 'silver'].includes(input.colourCode) || !['zh', 'en', 'de'].includes(input.locale)) return null;
  return { productCode: input.productCode, sessionKey: input.sessionKey.toLowerCase(), modelCode: input.modelCode, colourCode: input.colourCode, locale: input.locale };
}

function createColourInterestStore(connectionString) {
  const pool = createPool(connectionString, { max: 2 });
  return {
    async save(input) {
      await pool.query(`INSERT INTO product_colour_preferences(product_code,session_key,model_code,colour_code,locale)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(product_code,session_key) DO UPDATE
        SET model_code=EXCLUDED.model_code,colour_code=EXCLUDED.colour_code,locale=EXCLUDED.locale,updated_at=now()`,
      [input.productCode, input.sessionKey, input.modelCode, input.colourCode, input.locale]);
    },
    async summary() {
      const rows = (await pool.query(`SELECT model_code,colour_code,count(*)::int AS count,max(updated_at) AS last_selection
        FROM product_colour_preferences WHERE product_code=$1 GROUP BY model_code,colour_code ORDER BY model_code,colour_code`, ['A1-ULTRA'])).rows;
      return { productCode: 'A1-ULTRA', total: rows.reduce((sum, row) => sum + row.count, 0), variants: rows.map(row => ({ model: row.model_code, colour: row.colour_code, count: row.count })), lastSelection: rows.reduce((latest, row) => row.last_selection && (!latest || row.last_selection > latest) ? row.last_selection : latest, null) };
    },
    close: () => pool.end(),
  };
}

function registerColourInterestRoutes(app, store, { maxPerHour = 120 } = {}) {
  const attempts = new Map();
  app.post('/api/public/fc1-colour-interest', { config: { publicColourInterest: true }, bodyLimit: 700 }, async (req, reply) => {
    if (req.headers.origin) {
      let valid = false;
      try { valid = new URL(req.headers.origin).origin === `${req.protocol}://${req.headers.host}`; } catch (_) {}
      if (!valid) return reply.code(403).send({ error: '请求来源不受信任' });
    }
    const now = Date.now(), key = createHash('sha256').update(req.ip).digest('hex');
    if (attempts.size >= 10000) for (const [id, entry] of attempts) if (entry.until <= now) attempts.delete(id);
    let entry = attempts.get(key);
    if (!entry || entry.until <= now) {
      if (attempts.size >= 10000 && !attempts.has(key)) return reply.code(429).send({ error: '请求过多，请稍后重试' });
      entry = { count: 0, until: now + 3600000 };
      attempts.set(key, entry);
    }
    if (++entry.count > maxPerHour) return reply.code(429).send({ error: '请求过多，请稍后重试' });
    const input = normalizeColourInterest(req.body);
    if (!input) return reply.code(400).send({ error: '颜色偏好数据无效' });
    if (!store) return reply.code(503).send({ error: '颜色偏好服务暂不可用' });
    try { await store.save(input); return { saved: true }; }
    catch (_) { return reply.code(503).send({ error: '颜色偏好服务暂不可用' }); }
  });
  app.get('/api/colour-interest/summary', async (req, reply) => {
    if (req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可查看颜色偏好' });
    if (!store) return reply.code(503).send({ error: '颜色偏好服务暂不可用' });
    try { return { data: await store.summary() }; }
    catch (_) { return reply.code(503).send({ error: '颜色偏好服务暂不可用' }); }
  });
}

module.exports = { normalizeColourInterest, createColourInterestStore, registerColourInterestRoutes };
