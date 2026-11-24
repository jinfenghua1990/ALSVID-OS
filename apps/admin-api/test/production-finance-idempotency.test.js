'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { uuidv7 } = require('../uuidv7');

const payments = new Map(), invoices = new Map();
let audits = 0;
const client = {
  async query(sql, values = []) {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) return { rows: [], rowCount: 1 };
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
    if (sql.includes('FROM production_order_payments WHERE id=$1')) return { rows: payments.has(values[0]) ? [payments.get(values[0])] : [], rowCount: payments.has(values[0]) ? 1 : 0 };
    if (sql.includes('FROM production_order_invoices WHERE id=$1')) return { rows: invoices.has(values[0]) ? [invoices.get(values[0])] : [], rowCount: invoices.has(values[0]) ? 1 : 0 };
    if (sql.includes('FROM production_orders WHERE id=$1 FOR SHARE')) return { rows: [{ id: values[0], currency: 'EUR' }], rowCount: 1 };
    if (sql.includes('INSERT INTO production_order_payments')) {
      const row = { id: values[0], orderId: values[1], paidOn: values[2], payerType: values[3], payerAccount: values[4], payee: values[5], amount: Number(values[6]).toFixed(2), voucherType: values[8], note: values[9], status: '已确认', recordedBy: values[10], createdAt: 'now' };
      payments.set(row.id, row); return { rows: [row], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO production_order_invoices')) {
      const row = { id: values[0], orderId: values[1], status: values[2], amount: Number(values[3]).toFixed(2), issuedOn: values[4], invoiceNumber: values[5], currency: values[6], note: values[7], recordedBy: values[8], createdAt: 'now' };
      invoices.set(row.id, row); return { rows: [row], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO audit_log')) { audits++; return { rows: [], rowCount: 1 }; }
    throw new Error(`Unexpected query: ${sql}`);
  },
  release() {},
};
const fakePool = { connect: async () => client, end: async () => {}, query: client.query.bind(client) };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === path.resolve(__dirname, '../postgres-service.js') && request === './db-pool') return { createPool: () => fakePool };
  if (parent?.filename === path.resolve(__dirname, '../postgres-service.js') && request === './audit-context') return { currentActor: () => 'test-admin' };
  return originalLoad.call(this, request, parent, isMain);
};
const { createServiceStore } = require('../postgres-service');
Module._load = originalLoad;
const store = createServiceStore('unused');

test('production payments and invoices replay identical request IDs and reject changed payloads', async () => {
  const orderId = uuidv7(), paymentId = uuidv7(), invoiceId = uuidv7();
  const payment = { id: paymentId, paidOn: '2026-11-21', payerType: '对公', payerAccount: '', payee: 'Factory', amount: '25.00', voucherType: '', note: 'deposit' };
  const firstPayment = await store.addProductionPayment(orderId, payment);
  const replayPayment = await store.addProductionPayment(orderId, payment);
  assert.equal(firstPayment.id, paymentId);
  assert.equal(replayPayment.replayed, true);
  assert.equal(payments.size, 1);
  await assert.rejects(store.addProductionPayment(orderId, { ...payment, amount: '26.00' }), error => error.statusCode === 409);

  const invoice = { id: invoiceId, status: '已开票', amount: '25.00', issuedOn: '2026-11-21', invoiceNumber: 'INV-1', note: 'invoice' };
  const firstInvoice = await store.addProductionInvoice(orderId, invoice);
  const replayInvoice = await store.addProductionInvoice(orderId, invoice);
  assert.equal(firstInvoice.id, invoiceId);
  assert.equal(replayInvoice.replayed, true);
  assert.equal(invoices.size, 1);
  await assert.rejects(store.addProductionInvoice(orderId, { ...invoice, invoiceNumber: 'INV-2' }), error => error.statusCode === 409);
  assert.equal(audits, 2);
  await store.close();
});
