'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { uuidv7 } = require('../uuidv7');

const obligationId = uuidv7(), paymentRows = new Map(), allocationRows = new Map();
let obligation = { id: obligationId, direction: 'AP', partner_id: uuidv7(), currency: 'EUR', outstanding_amount: '75.000000', settlement_status: 'OPEN' };
const client = {
  async query(sql, values = []) {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) return { rows: [], rowCount: 1 };
    if (sql.includes('FROM finance_obligations WHERE id=$1 FOR UPDATE')) return { rows: [{ id: obligationId }], rowCount: 1 };
    if (sql.includes('FROM finance_v_obligations WHERE id=$1')) return { rows: [obligation], rowCount: 1 };
    if (sql.includes('FROM app_users WHERE username=$1')) return { rows: [{ id: 'user-1' }], rowCount: 1 };
    if (sql.includes('FROM finance_payments WHERE idempotency_key=$1')) return { rows: paymentRows.has(values[0]) ? [paymentRows.get(values[0])] : [], rowCount: paymentRows.has(values[0]) ? 1 : 0 };
    if (sql.includes('FROM finance_allocations WHERE payment_id=$1 AND obligation_id=$2')) {
      const row = allocationRows.get(`${values[0]}:${values[1]}`); return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes('INSERT INTO finance_payments')) {
      const row = { id: uuidv7(), idempotency_key: values[5], amount: values[3], value_date: values[4] };
      paymentRows.set(values[5], row); return { rows: [row], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO finance_allocations')) {
      const row = { id: uuidv7(), payment_id: values[0], obligation_id: values[1] };
      allocationRows.set(`${values[0]}:${values[1]}`, row);
      obligation = { ...obligation, outstanding_amount: '0.000000', settlement_status: 'SETTLED' };
      return { rows: [row], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO audit_log')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected query: ${sql}`);
  },
  release() {},
};
const fakePool = { connect: async () => client, end: async () => {}, query: client.query.bind(client) };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === path.resolve(__dirname, '../finance.js') && request === './db-pool') return { createPool: () => fakePool };
  if (parent?.filename === path.resolve(__dirname, '../finance.js') && request === './audit-context') return { currentActor: () => 'test-admin' };
  return originalLoad.call(this, request, parent, isMain);
};
const { createFinanceStore } = require('../finance');
Module._load = originalLoad;
const store = createFinanceStore('unused');

test('settlement retry replays after the obligation has already been settled', async () => {
  const idempotencyKey = uuidv7();
  const first = await store.settleObligation(obligationId, { idempotencyKey });
  const retry = await store.settleObligation(obligationId, { idempotencyKey });
  assert.equal(retry.replayed, true);
  assert.equal(first.payment.id, retry.payment.id);
  assert.equal(allocationRows.size, 1);
  await store.close();
});
