const { test } = require('node:test');
const assert = require('node:assert/strict');
const poolPath = require.resolve('../db-pool');
const servicePath = require.resolve('../postgres-service');

test('completed repair business details cannot be edited', async () => {
  const queries = [];
  const repair = {
    id: 'repair-1', no: 'WO-1', vin: 'ABCDEFGH12345678', type: '质保维修', fault: '原始故障',
    sku: '', qty: 1, store: '网点 A', serviceCenterId: null, status: '已完成', oldPart: '旧件记录',
  };
  const client = {
    release() {},
    async query(sql) {
      queries.push(sql);
      if (sql.startsWith('SELECT id,work_order_no AS no')) return { rows: [repair] };
      return { rows: [], rowCount: 1 };
    },
  };
  const pool = { connect: async () => client, end: async () => {} };
  require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: { createPool: () => pool } };
  delete require.cache[servicePath];
  const service = require('../postgres-service').createServiceStore('unused');
  try {
    await assert.rejects(service.updateRepair(repair.id, { fault: '被覆盖的故障' }), /不能更改业务信息/);
    assert.equal(queries.some(sql => sql.startsWith('UPDATE repairs SET')), false);
  } finally {
    await service.close();
    delete require.cache[servicePath];
    delete require.cache[poolPath];
  }
});
