const { test } = require('node:test');
const assert = require('node:assert/strict');
const poolPath = require.resolve('../db-pool');
const storePath = require.resolve('../postgres-products');
const vehicleUuid = '12345678-1234-7234-8234-123456789abc';

function setup(matches) {
  const queries = [];
  const client = {
    release() {},
    async query(sql, params) {
      queries.push({ sql, params });
      if (sql.startsWith("SELECT id,entity_uuid AS \"entityUuid\" FROM products WHERE id=$1 AND kind='part'")) return { rows: [{ id: 'part', entityUuid: vehicleUuid }], rowCount: 1 };
      if (sql.startsWith('SELECT v.entity_uuid')) return { rows: [] };
      if (sql.startsWith('SELECT id,entity_uuid FROM products')) return { rows: matches, rowCount: matches.length };
      return { rows: [], rowCount: 1 };
    },
  };
  require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: { createPool: () => ({ connect: async () => client, end: async () => {} }) } };
  delete require.cache[storePath];
  return { store: require('../postgres-products').createProductStore('unused'), queries };
}

test('fitment uses the vehicle UUID to select one product', async () => {
  const { store, queries } = setup([{ id: 'legacy-vehicle-id', entity_uuid: vehicleUuid }]);
  await store.setFitments('part', [{ vehicleUuid, vehicleModel: 'A1', note: 'ok' }]);
  const lookup = queries.find(q => q.sql.startsWith('SELECT id,entity_uuid FROM products'));
  assert.match(lookup.sql, /entity_uuid=\$1/);
  assert.equal(lookup.params[0], vehicleUuid);
  const insert = queries.find(q => q.sql.startsWith('INSERT INTO fits'));
  assert.deepEqual(insert.params, ['part', vehicleUuid, 'legacy-vehicle-id', vehicleUuid, 'ok']);
});

test('ambiguous legacy model is rejected before old fitments are removed', async () => {
  const { store, queries } = setup([{ id: 'one', entity_uuid: vehicleUuid }, { id: 'two', entity_uuid: '12345678-1234-7234-8234-123456789abd' }]);
  await assert.rejects(store.setFitments('part', [{ vehicleModel: 'A1' }]), /车型对应多辆整车/);
  assert(!queries.some(q => q.sql.startsWith('DELETE FROM fits')));
  assert(queries.some(q => q.sql === 'ROLLBACK'));
});
