'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { uuidv7 } = require('../uuidv7');

const audits = new Map(), allocationAudits = new Map(), landedAudits = new Map(), obligations = new Map(), documents = new Map(), payments = new Map(), allocations = new Map(), landedComponents = new Map(), landedAllocations = new Map();
const client = {
  async query(sql, values = []) {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim()) || sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
    if (sql.includes('FROM audit_log WHERE action=')) {
      if (sql.includes("action='finance.payment.allocate'")) {
        const row = allocationAudits.get(values[0]); return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.includes("action='finance.landed.component'")) {
        const row = landedAudits.get(values[1]); return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.includes("action='finance.landed.allocate'")) {
        const row = landedAudits.get(values[1]); return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      if (sql.includes("action='finance.landed.distribute'")) {
        const row = landedAudits.get(values[1]); return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
      }
      const row = audits.get(values[0]); return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes('FROM app_users WHERE username=$1')) return { rows: [{ id: 'user-1' }], rowCount: 1 };
    if (sql.includes('FROM finance_payments WHERE idempotency_key=$1')) {
      const row = payments.get(values[0]); return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes('INSERT INTO finance_payments')) {
      const row = { id: uuidv7(), direction: values[0], partner_id: values[1], currency: values[2], amount: values[3], value_date: values[4], provider: values[5], account_reference: values[6], external_reference: values[7], idempotency_key: values[8], note: values[9] };
      payments.set(row.idempotency_key, row); return { rows: [row], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO finance_allocations')) {
      const row = { id: uuidv7(), payment_id: values[0], obligation_id: values[1], payment_amount: values[2], obligation_amount: values[3], fx_rate_id: values[4], note: values[5] };
      allocations.set(row.id, row); return { rows: [row], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO finance_landed_cost_components')) {
      const row = { id: uuidv7(), batch_id: values[0], category: values[1], amount: values[2], currency: values[3], batch_currency_amount: values[4], fx_rate_id: values[5], source_document_id: values[6], capitalizable: values[7], note: values[8] };
      landedComponents.set(row.id, row); return { rows: [row], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO finance_landed_cost_allocations')) {
      const row = { id: uuidv7(), component_id: values[0], cargo_vin_uuid: values[1], basis_value: values[2], allocated_amount: values[3] };
      landedAllocations.set(row.id, row); return { rows: [row], rowCount: 1 };
    }
    if (sql.includes('SELECT * FROM finance_landed_cost_batches WHERE id=$1 FOR UPDATE')) return { rows: [{ id: values[0], status: 'DRAFT', currency: 'EUR', allocation_basis: 'QUANTITY', shipment_uuid: uuidv7() }], rowCount: 1 };
    if (sql.includes('FROM production_delivery_vins')) return { rows: [{ id: uuidv7() }, { id: uuidv7() }], rowCount: 2 };
    if (sql.includes('INSERT INTO finance_documents')) { documents.set(values[0], true); return { rows: [], rowCount: 1 }; }
    if (sql.includes('INSERT INTO finance_document_lines')) return { rows: [], rowCount: 1 };
    if (sql.includes('UPDATE finance_documents SET subtotal_amount')) {
      return { rows: [{ id: values[0], subtotal_amount: values[1], tax_amount: values[2], total_amount: values[3] }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO finance_obligations')) {
      const row = { id: values[0], direction: values[1], partner_id: values[2], currency: values[3], original_amount: values[4], due_date: values[5], source_type: values[6], source_id: values[7], note: values[8] };
      obligations.set(row.id, row); return { rows: [row], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO audit_log')) {
      const after=JSON.parse(values[4]),row={ before_json: values[3], after_json: values[4] };
      if(after.idempotencyKey&&(after.batch_id||after.component_id||after.allocationLines))landedAudits.set(after.idempotencyKey,row);
      else if(after.idempotencyKey)allocationAudits.set(after.idempotencyKey,row);else audits.set(after.id,row);
      return { rows: [], rowCount: 1 };
    }
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

test('finance obligation creation replays identical request IDs and rejects changed payloads', async () => {
  const request = { id: uuidv7(), direction: 'AP', partnerId: uuidv7(), currency: 'EUR', amount: '125.50', dueDate: '2026-12-01', sourceType: 'MANUAL', note: 'supplier invoice' };
  const first = await store.createObligation(request);
  const replay = await store.createObligation(request);
  assert.equal(first.id, request.id);
  assert.equal(replay.replayed, true);
  assert.equal(obligations.size, 1);
  await assert.rejects(store.createObligation({ ...request, amount: '126.00' }), error => error.statusCode === 409);
  assert.equal(obligations.size, 1);
  await store.close();
});

test('finance document creation replays identical request IDs and rejects changed payloads', async () => {
  const request = { id: uuidv7(), documentType: 'SUPPLIER_INVOICE', partnerId: uuidv7(), currency: 'EUR', issueDate: '2026-11-21', dueDate: null, sourceType: 'MANUAL', lines: [{ category: 'OTHER', description: 'Invoice', netAmount: '50', taxAmount: '0' }] };
  const first = await store.createDocument(request);
  const replay = await store.createDocument(request);
  assert.equal(first.id, request.id);
  assert.equal(replay.replayed, true);
  assert.equal(documents.size, 1);
  await assert.rejects(store.createDocument({ ...request, lines: [{ ...request.lines[0], netAmount: '51' }] }), error => error.statusCode === 409);
  assert.equal(documents.size, 1);
});

test('finance payment idempotency compares the full request payload', async () => {
  const request = { direction: 'OUTBOUND', partnerId: uuidv7(), currency: 'EUR', amount: '45', valueDate: '2026-11-21', idempotencyKey: uuidv7(), provider: 'MANUAL', externalReference: 'PAY-1', note: 'deposit' };
  const first = await store.createPayment(request);
  const replay = await store.createPayment(request);
  assert.equal(replay.replayed, true);
  assert.equal(first.id, replay.id);
  await assert.rejects(store.createPayment({ ...request, note: 'different purpose' }), error => error.statusCode === 409);
  assert.equal(payments.size, 1);
});

test('finance allocation retries do not duplicate partial allocations', async () => {
  const request={paymentId:uuidv7(),obligationId:uuidv7(),paymentAmount:'20',obligationAmount:'20',fxRateId:null,note:'partial allocation',idempotencyKey:uuidv7()};
  const first=await store.allocate(request),replay=await store.allocate(request);
  assert.equal(replay.replayed,true);
  assert.equal(first.id,replay.id);
  assert.equal(allocations.size,1);
  await assert.rejects(store.allocate({...request,obligationAmount:'21'}),error=>error.statusCode===409);
  assert.equal(allocations.size,1);
});

test('landed cost component retries do not duplicate costs and reject a changed payload', async () => {
  const request={batchId:uuidv7(),category:'FREIGHT',amount:'25',currency:'EUR',batchCurrencyAmount:'25',fxRateId:null,capitalizable:true,note:'shipping',idempotencyKey:uuidv7()};
  const first=await store.addLandedComponent(request.batchId,request),replay=await store.addLandedComponent(request.batchId,request);
  assert.equal(replay.replayed,true);
  assert.equal(first.id,replay.id);
  assert.equal(landedComponents.size,1);
  await assert.rejects(store.addLandedComponent(request.batchId,{...request,note:'changed'}),error=>error.statusCode===409);
  assert.equal(landedComponents.size,1);
});

test('landed cost allocation retries replay the original VIN allocation', async () => {
  const request={componentId:uuidv7(),cargoVinUuid:uuidv7(),allocatedAmount:'12.5',basisValue:'1',idempotencyKey:uuidv7()};
  const first=await store.allocateLanded(request.componentId,request),replay=await store.allocateLanded(request.componentId,request);
  assert.equal(replay.replayed,true);
  assert.equal(first.id,replay.id);
  assert.equal(landedAllocations.size,1);
  await assert.rejects(store.allocateLanded(request.componentId,{...request,allocatedAmount:'13'}),error=>error.statusCode===409);
  assert.equal(landedAllocations.size,1);
});

test('automatic landed cost distribution retries do not create components or VIN allocations twice', async () => {
  const beforeComponents=landedComponents.size,beforeAllocations=landedAllocations.size;
  const request={category:'FREIGHT',amountCents:2500,note:'port fee',idempotencyKey:uuidv7()},batchId=uuidv7();
  const first=await store.distributeLanded(batchId,request),replay=await store.distributeLanded(batchId,request);
  assert.equal(replay.replayed,true);
  assert.equal(first.componentId,replay.componentId);
  assert.equal(landedComponents.size-beforeComponents,1);
  assert.equal(landedAllocations.size-beforeAllocations,2);
  await assert.rejects(store.distributeLanded(batchId,{...request,amountCents:2501}),error=>error.statusCode===409);
  assert.equal(landedComponents.size-beforeComponents,1);
});
