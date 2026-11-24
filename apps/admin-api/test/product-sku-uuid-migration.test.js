const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

test('legacy product and SKU writes receive consistent UUID v7 identities', async () => {
  const url=process.env.TEST_DATABASE_URL;
  assert.ok(url, 'TEST_DATABASE_URL must target an isolated migrated database');
  const pool=new Pool({connectionString:url,options:'-c search_path=alsvid_v2'});
  const c=await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("INSERT INTO colors(code,zh,hex) VALUES('UID','Test','#000000')");
    const p=(await c.query("INSERT INTO products(id,kind,name,product_type,ownership) VALUES('uuid-legacy-product','part','Part','BAT','UN') RETURNING entity_uuid")).rows[0];
    const sku=(await c.query("INSERT INTO skus(code,product_id,spec,color_code) VALUES('UN-BAT-UID-UID','uuid-legacy-product','UID','UID') RETURNING entity_uuid,product_uuid")).rows[0];
    const v7=/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    assert.match(p.entity_uuid,v7);
    assert.match(sku.entity_uuid,v7);
    assert.equal(sku.product_uuid,p.entity_uuid);
    await c.query('SAVEPOINT mismatch');
    await assert.rejects(c.query("UPDATE skus SET product_uuid=$1 WHERE code='UN-BAT-UID-UID'",['00000000-0000-7000-8000-000000000000']),{code:'23514'});
    await c.query('ROLLBACK TO SAVEPOINT mismatch');
    const before=(await c.query('SELECT count(*)::int AS n FROM skus s JOIN products p ON s.product_id=p.id WHERE s.product_uuid<>p.entity_uuid')).rows[0].n;
    assert.equal(before,0);
    await c.query('ROLLBACK');
  } finally { c.release(); await pool.end(); }
});
