const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Pool } = require('pg');
const { createProductStore } = require('../postgres-products');
const { createServiceStore } = require('../postgres-service');
const { uuidv7 } = require('../uuidv7');

test('only a validated published BOM can be used for a new production order', async () => {
  const url = process.env.TEST_DATABASE_URL;
  assert.ok(url, 'TEST_DATABASE_URL must target an isolated database');
  const pool = new Pool({connectionString:url,options:'-c search_path=alsvid_v2'});
  const products = createProductStore(url), service = createServiceStore(url);
  try {
    await pool.query("INSERT INTO colors(code,zh,hex) VALUES('BOM','Test','#000000')");
    await pool.query("INSERT INTO products(id,kind,name,product_type,ownership) VALUES('pub-vehicle','vehicle','Bike','EBI','PB'),('pub-part','part','Part','BAT','PB')");
    await pool.query("INSERT INTO skus(code,product_id,spec,color_code) VALUES('PB-EBI-450-BOM','pub-vehicle','450','BOM'),('PB-BAT-450-BOM','pub-part','450','BOM')");
    await products.saveBom('pub-vehicle',{version:'empty',items:[]});
    await assert.rejects(products.publishBom('pub-vehicle','empty',null,1), /BOM 须包含/);
    await assert.rejects(products.saveBom('pub-vehicle',{version:'bypass',status:'published',items:[]}), /草稿/);
    await products.saveBom('pub-vehicle',{version:'v1',items:[{sku:'PB-BAT-450-BOM',drawingNo:'D1',qty:1,unit:'件'}]});
    await assert.rejects(products.publishBom('pub-vehicle','v1',null,1), /未设置为适配/);
    const vehicleUuid=(await pool.query("SELECT entity_uuid FROM products WHERE id='pub-vehicle'")).rows[0].entity_uuid;
    await products.setFitments('pub-part',[{vehicleUuid}]);
    await assert.rejects(products.publishBom('pub-vehicle','v1',null,1), /缺少该整车的图纸/);
    const drawingId=uuidv7();
    await pool.query("INSERT INTO product_media(id,product_id,object_key,content_type,label) VALUES($1,'pub-vehicle','test-drawing','image/png','drawing')",[drawingId]);
    await pool.query("UPDATE bom_version_items SET drawing_media_id=$1,drawing_x=0.5,drawing_y=0.5 WHERE bom_version_id=(SELECT id FROM bom_versions WHERE vehicle_id='pub-vehicle' AND version='v1')",[drawingId]);
    const order={orderNo:'PUB-ORDER',sku:'PB-EBI-450-BOM',bomVersion:'v1',factory:'Factory',batch:'Batch',plannedQuantity:1};
    await assert.rejects(service.createProductionOrder(order), /只能使用已发布/);
    const result=await products.publishBom('pub-vehicle','v1',async()=>({size:1}),1);
    assert.equal(result.status,'published');
    await assert.rejects(products.publishBom('pub-vehicle','v1',null,1), /只有草稿/);
    const created=await service.createProductionOrder(order);
    assert.equal(created.bomVersion,'v1');
    const snapshot=(await service.getProductionBomSnapshot(created.id)).snapshot;
    assert.equal(snapshot.version,'v1');
    assert.equal(snapshot.items[0].productName,'Part');
    assert.equal(snapshot.items[0].drawingNo,'D1');
    await pool.query("UPDATE products SET name='Renamed' WHERE id='pub-part'");
    assert.equal((await service.getProductionBomSnapshot(created.id)).snapshot.items[0].productName,'Part');
    await assert.rejects(pool.query("UPDATE production_orders SET bom_snapshot='{}'::jsonb WHERE id=$1",[created.id]),{code:'23514'});
    assert.equal((await service.listOrderMaterials((await service.listProductionOrders()).find(x=>x.orderNo==='PUB-ORDER').id)).length,1);
    assert.equal((await pool.query("SELECT count(*)::int n FROM audit_log WHERE action='bom.version.publish' AND target='products/pub-vehicle/bom/v1'")).rows[0].n,1);
  } finally { await products.close(); await service.close(); await pool.end(); }
});
