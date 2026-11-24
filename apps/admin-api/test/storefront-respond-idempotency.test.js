'use strict';
// 无数据库依赖：mock pool 验证报价回复幂等分支返回订单当前状态，而非从历史 decision 推导的旧状态。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uuidv7 } = require('../uuidv7');

function setup(orderStatus) {
  const poolPath = require.resolve('../db-pool');
  const servicePath = require.resolve('../storefront-orders');
  const queries = [];
  const orderId = uuidv7();
  const quoteId = uuidv7();
  const ownerUuid = uuidv7();
  const client = {
    release() {},
    async query(sql, params) {
      queries.push(String(sql).replace(/\s+/g, ' ').trim());
      if (String(sql).startsWith('BEGIN')) return { rows: [] };
      if (String(sql).startsWith('COMMIT')) return { rows: [] };
      if (String(sql).includes('FROM app_users WHERE id=$1 AND role=\'owner\'')) return { rows: [{ entity_uuid: ownerUuid }] };
      if (String(sql).startsWith('SELECT id,status FROM storefront_orders')) return { rows: [{ id: orderId, status: orderStatus }] };
      if (String(sql).startsWith('SELECT id FROM storefront_order_quotes')) return { rows: [{ id: quoteId }] };
      if (String(sql).startsWith('SELECT decision FROM storefront_order_responses')) return { rows: [{ decision: 'accept' }] };
      return { rows: [], rowCount: 0 };
    },
  };
  require.cache[poolPath] = { id: poolPath, filename: poolPath, loaded: true, exports: { createPool: () => ({ connect: async () => client, end: async () => {} }) } };
  delete require.cache[servicePath];
  const { createStorefrontOrders } = require('../storefront-orders');
  return { store: createStorefrontOrders('unused'), orderId, quoteId, ownerUuid, queries, poolPath, servicePath };
}

function teardown(ctx) {
  delete require.cache[ctx.poolPath];
  delete require.cache[ctx.servicePath];
}

test('respond replay returns current order status, not the historical decision', async t => {
  for (const [current, expected] of [['accepted', 'accepted'], ['shipped', 'shipped'], ['delivered', 'delivered'], ['cancelled', 'cancelled']]) {
    const ctx = setup(current);
    t.after(() => teardown(ctx));
    const result = await ctx.store.respond({ id: uuidv7() }, ctx.orderId, { quoteId: ctx.quoteId, decision: 'accept' });
    assert.equal(result.status, expected, `order status ${current} must be returned verbatim on replay`);
  }
});
