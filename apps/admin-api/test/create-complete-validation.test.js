const { test } = require('node:test');
const assert = require('node:assert/strict');
const poolPath = require.resolve('../db-pool');
const storePath = require.resolve('../create-complete');

function setup(fitRowCount = 1, { existingVehicle = null, orphanSkus = [], references = [] } = {}) {
  const queries = [];
  const client = {
    release() {},
    async query(sql) {
      queries.push(sql);
      if (sql.startsWith('INSERT INTO fits')) return { rows: [], rowCount: fitRowCount };
      if (sql.startsWith("SELECT id,entity_uuid,specs FROM products WHERE kind='vehicle'")) return { rows: existingVehicle ? [existingVehicle] : [], rowCount: existingVehicle ? 1 : 0 };
      if (sql.startsWith('SELECT p.model,array_agg')) return { rows: [], rowCount: 0 };
      if (sql.startsWith('SELECT code,entity_uuid FROM skus WHERE product_id')) return { rows: orphanSkus, rowCount: orphanSkus.length };
      if (sql.startsWith('SELECT entity_uuid FROM products WHERE id=$1')) return { rows: [{ entity_uuid: existingVehicle?.entity_uuid }], rowCount: 1 };
      if (sql.includes('WITH product_skus AS')) return { rows: references, rowCount: references.length };
      if (sql.startsWith('INSERT INTO products')) return { rows: [{ entity_uuid: '12345678-1234-7234-8234-123456789abc' }], rowCount: 1 };
      if (sql.startsWith('SELECT code,templates')) return { rows: [{ code: 'capacity', templates: ['BAT'] }] };
      if (sql.startsWith('SELECT level,options')) return { rows: [{ level: 'sku', skuGen: true, enabled: true, templates: ['BAT'], options: ['450'] }] };
      if (sql.startsWith('SELECT code FROM colors')) return { rows: [{ code: 'BLK' }] };
      return { rows: [], rowCount: 1 };
    },
  };
  require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: { createPool: () => ({ connect: async () => client, end: async () => {} }) } };
  delete require.cache[storePath];
  return { store: require('../create-complete').createCompleteProductStore('unused'), queries };
}

test('complete product saves valid fields and SKU in one transaction', async () => {
  const { store, queries } = setup();
  const product = { id: 'product', kind: 'part', ownership: 'UN', productType: 'BAT', specs: { capacity: 0 }, skus: [{ spec: '450', color: 'BLK' }] };
  assert.deepEqual(await store.create(product, []), { id: 'product' });
  assert(queries.some(sql => sql.startsWith('INSERT INTO skus')));
  assert(queries.includes('COMMIT'));
  assert(!queries.includes('ROLLBACK'));
});

test('SKU replacement reports linked business documents before deleting SKU data', async () => {
  const existingVehicle = { id: 'vehicle', entity_uuid: '12345678-1234-7234-8234-123456789abc', specs: {} };
  const orphanSkus = [{ code: 'A1-STD-BLK-EUR', entity_uuid: '12345678-1234-7234-8234-123456789abd' }];
  const references = [{ type: '采购订单', documentNo: 'PO-TEST-1', detail: orphanSkus[0].code }];
  const { store, queries } = setup(1, { existingVehicle, orphanSkus, references });
  await assert.rejects(
    store.create({ id: 'vehicle', kind: 'vehicle', model: 'A1', ownership: 'A1', productType: 'EBI', name: 'Test', editing: true, replaceSkus: true, skus: [] }, []),
    error => error.code === 'ENTITY_REFERENCED' && error.references[0].documentNo === 'PO-TEST-1'
  );
  assert(!queries.some(sql => sql.startsWith('DELETE FROM storefront_offers')));
  assert(queries.includes('ROLLBACK'));
});
