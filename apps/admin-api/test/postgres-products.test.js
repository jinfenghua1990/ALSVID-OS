const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { createProductStore } = require('../postgres-products');

test('product and SKU persist with version conflicts and audit', async () => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, 'TEST_DATABASE_URL must target an isolated database');
  const store = createProductStore(url);
  const pool = new Pool({ connectionString: url, options: '-c search_path=alsvid_v2' });
  try {
    await pool.query("INSERT INTO colors(code,zh,hex) VALUES('BLK','黑色','#000000')");
    await pool.query("INSERT INTO fields(code,name_zh,data_type,level,options,templates,sku_gen) VALUES('test_spec','规格','enum','sku','[\"450\"]','[\"EBI\"]',true)");
    const product = await store.create({ kind:'vehicle', name:'测试车', productType:'EBI', ownership:'A1S',model:'A1S' });
    await store.addSku(product.id,{spec:'450',color:'BLK'});
    const loaded = await store.get(product.id);
    assert.equal(loaded.skus[0].sku,'A1S-EBI-450-BLK');
    assert.equal(loaded.version,2);
    await assert.rejects(store.update(product.id,{version:1,name:'过期数据'}), {code:'VERSION_CONFLICT'});
    const updated = await store.update(product.id,{version:2,name:'更新后的车型'});
    assert.equal(updated.version,3);
    assert.equal((await store.list('vehicle')).find(x=>x.id===product.id).name,'更新后的车型');
    await assert.rejects(store.addSku(product.id,{spec:'450',color:'BLK'}));
    const audit = await pool.query('SELECT action FROM audit_log WHERE target LIKE $1 ORDER BY id', [`products/${product.id}%`]);
    assert.deepEqual(audit.rows.map(x=>x.action), ['product.create','sku.create','product.update']);
    await assert.rejects(store.create({kind:'part',name:'旧编码产品',productType:'BAT',ownership:'BAD-CODE'}), /产品型号或归属编码无效/);
    const batch = await store.addSkus(product.id,[{spec:'INVALID',color:'BLK'}]);
    assert.equal(batch.added.length,0);
    assert.equal(batch.skipped[0].reason,'规格或颜色不可用');
  } finally { await store.close(); await pool.end(); }
});
