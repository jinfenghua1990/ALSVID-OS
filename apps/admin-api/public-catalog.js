// 官网商品数据出口：只读、标准化结构，供官网按字段契约取值。
// 约定：specs 只输出字段表中已登记的标准字段；以 "_" 开头的内部键（如 _externalLinks）不对外。
const { createPool } = require('./db-pool');

function toPublicSpecs(specs, allowed) {
  const out = {};
  for (const [k, v] of Object.entries(specs || {})) {
    if (k.startsWith('_')) continue;
    if (allowed && !allowed.has(k)) continue;
    if (v == null || String(v).trim() === '') continue;
    out[k] = v;
  }
  return out;
}

async function loadCatalog(pool, onlyEnabled) {
  const fields = (await pool.query(
    "SELECT code,name_zh,name_en,name_de,data_type,unit,options,required,shop_visible FROM fields WHERE enabled AND templates::text LIKE '%EBI%' ORDER BY code"
  )).rows;
  const allowed = new Set(fields.map((f) => f.code));
  const products = (await pool.query(
    `SELECT id,model,name,status,uses,specs,platform,updated_at FROM products WHERE kind='vehicle'${onlyEnabled ? " AND status='启用'" : ''} ORDER BY model,created_at`
  )).rows;
  const skus = (await pool.query(
    'SELECT product_id,code,spec,color_code,region_code,price,disabled FROM skus ORDER BY code'
  )).rows;

  return {
    version: '1',
    generatedAt: new Date().toISOString(),
    fieldCatalog: fields.map((f) => ({
      code: f.code,
      name: { zh: f.name_zh, en: f.name_en, de: f.name_de },
      type: f.data_type,
      unit: f.unit || '',
      options: f.options || [],
      required: Boolean(f.required),
      shopVisible: Boolean(f.shop_visible),
    })),
    products: products.map((p) => ({
      id: p.id,
      model: p.model,
      name: p.name,
      status: p.status,
      uses: Array.isArray(p.uses) ? p.uses : [],
      platform: p.platform || '',
      updatedAt: p.updated_at,
      specs: toPublicSpecs(p.specs, allowed),
      skus: skus
        .filter((s) => s.product_id === p.id && !s.disabled)
        .map((s) => ({ code: s.code, spec: s.spec, color: s.color_code, region: s.region_code, price: s.price })),
    })),
  };
}

function registerPublicCatalog(app, connectionString) {
  if (!connectionString) return;
  const pool = createPool(connectionString, { max: 2 });

  app.get('/api/public/catalog', { config: { publicCatalog: true } }, async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Cache-Control', 'public, max-age=60');
    return loadCatalog(pool, true);
  });

  app.get('/api/public/products/:id', { config: { publicCatalog: true } }, async (req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    const all = await loadCatalog(pool, true);
    const product = all.products.find((p) => p.id === req.params.id);
    if (!product) return reply.code(404).send({ error: '商品不存在' });
    return { version: '1', generatedAt: all.generatedAt, fieldCatalog: all.fieldCatalog, product };
  });
}

module.exports = { registerPublicCatalog };
