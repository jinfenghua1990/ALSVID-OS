'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const poolPath = require.resolve('../db-pool');
const inventoryPath = require.resolve('../inventory');

test('outbound return retries replay the original result and reject changed payloads', async () => {
  const calls = [];
  let connections = 0;
  const id = '12345678-1234-7234-8234-123456789abc';
  const key = '12345678-1234-7234-8234-123456789abd';
  const saved = { before: { id, status: '已完成' }, after: { id, status: '已完成' }, request: { reason: '误发', items: [{ sku: 'A1-STD-BLK-EUR', quantity: 1 }] } };
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT after_json AS result')) return { rows: [{ result: saved }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = { async connect() { connections += 1; return client; }, async end() {} };
  require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: { createPool: () => pool } };
  delete require.cache[inventoryPath];
  const store = require('../inventory').createInventory('unused');

  await assert.rejects(store.returnOutboundOrder(id, { idempotencyKey: key, reason: '误发', items: [{ sku: 'A1-STD-BLK-EUR', quantity: 0 }] }), /退回明细无效/);
  assert.equal(connections, 0);
  const replay = await store.returnOutboundOrder(id, { idempotencyKey: key, reason: '误发', items: [{ sku: 'A1-STD-BLK-EUR', quantity: 1 }] });
  assert.equal(replay.replayed, true);
  assert.equal(replay.after.status, '已完成');
  await assert.rejects(
    store.returnOutboundOrder(id, { idempotencyKey: key, reason: '误发', items: [{ sku: 'A1-STD-BLK-EUR', quantity: 2 }] }),
    error => error.statusCode === 409 && /幂等编号/.test(error.message)
  );
  assert.equal(calls.filter(call => call.sql.startsWith('SELECT after_json AS result')).length, 2);
  assert.equal(calls.some(call => call.sql.startsWith('UPDATE warehouse_stock')), false);
});

test('outbound cancellation retries replay the same reason and reject a changed reason', async () => {
  const calls = [];
  const id = '12345678-1234-7234-8234-123456789abe';
  let order = { status: '待出库', cancelReason: null };
  const client = {
    async query(sql, values = []) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT status,cancel_reason')) return { rows: [{ ...order }], rowCount: 1 };
      if (sql.startsWith("UPDATE inventory_outbound_orders SET status='已取消'")) {
        order = { status: '已取消', cancelReason: values[1] };
        return { rows: [{ id, status: order.status, cancelReason: order.cancelReason }], rowCount: 1 };
      }
      return { rows: [], rowCount: 1 };
    },
    release() {},
  };
  const pool = { async connect() { return client; }, async end() {} };
  require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: { createPool: () => pool } };
  delete require.cache[inventoryPath];
  const store = require('../inventory').createInventory('unused');
  try {
    const first = await store.cancelOutboundOrder(id, { reason: '登记错误' });
    assert.equal(first.status, '已取消');
    const replay = await store.cancelOutboundOrder(id, { reason: '登记错误' });
    assert.equal(replay.replayed, true);
    assert.equal(replay.after.cancelReason, '登记错误');
    await assert.rejects(store.cancelOutboundOrder(id, { reason: '其他原因' }), error => error.statusCode === 409);
    assert.equal(calls.filter(call => call.sql.startsWith("UPDATE inventory_outbound_orders SET status='已取消'")).length, 1);
  } finally {
    await store.close();
    delete require.cache[inventoryPath];
    delete require.cache[poolPath];
  }
});
