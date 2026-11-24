const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');

test('published BOM headers and items cannot be changed directly', async () => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, 'TEST_DATABASE_URL must target an isolated database with the migration applied');
  const pool = new Pool({connectionString:url,options:'-c search_path=alsvid_v2'});
  try {
    await pool.query("INSERT INTO colors(code,zh,hex) VALUES('IMM','Test','#000000')");
    await pool.query("INSERT INTO products(id,kind,name,product_type,ownership) VALUES('imm-bike','vehicle','Bike','EBI','IM'),('imm-part','part','Part','BAT','IM')");
    await pool.query("INSERT INTO skus(code,product_id,spec,color_code) VALUES('IM-BAT-450-IMM','imm-part','450','IMM')");
    const draft=(await pool.query("INSERT INTO bom_versions(vehicle_id,version) VALUES('imm-bike','draft') RETURNING id")).rows[0].id;
    const published=(await pool.query("INSERT INTO bom_versions(vehicle_id,version) VALUES('imm-bike','published') RETURNING id")).rows[0].id;
    const item=(await pool.query("INSERT INTO bom_version_items(bom_version_id,sku_code,quantity,drawing_no) VALUES($1,'IM-BAT-450-IMM',1,'D1') RETURNING id",[published])).rows[0].id;
    await pool.query("UPDATE bom_versions SET status='published' WHERE id=$1",[published]);
    const rejects = (sql,params) => assert.rejects(pool.query(sql,params), {code:'23514'});
    await rejects("UPDATE bom_versions SET status='draft' WHERE id=$1",[published]);
    await rejects('DELETE FROM bom_versions WHERE id=$1',[published]);
    await rejects('UPDATE bom_version_items SET quantity=2 WHERE id=$1',[item]);
    await rejects('DELETE FROM bom_version_items WHERE id=$1',[item]);
    await rejects("INSERT INTO bom_version_items(bom_version_id,sku_code,quantity) VALUES($1,'IM-BAT-450-IMM',1)",[published]);
    await rejects('UPDATE bom_version_items SET bom_version_id=$1 WHERE id=$2',[draft,item]);
    const draftItem=(await pool.query("INSERT INTO bom_version_items(bom_version_id,sku_code,quantity) VALUES($1,'IM-BAT-450-IMM',1) RETURNING id",[draft])).rows[0].id;
    await rejects('UPDATE bom_version_items SET bom_version_id=$1 WHERE id=$2',[published,draftItem]);
    await pool.query('UPDATE bom_version_items SET quantity=2 WHERE id=$1',[draftItem]);
    assert.equal((await pool.query('SELECT quantity FROM bom_version_items WHERE id=$1',[item])).rows[0].quantity,'1');
  } finally { await pool.end(); }
});
