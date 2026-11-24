'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { uuidv7 } = require('../uuidv7');

const audit = new Map(), partners = new Map();
const receiptWrites = [];
const client = {
  async query(sql, values = []) {
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim()) || sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 1 };
    if (sql.includes('FROM procurement_purchase_orders WHERE id=$1 FOR UPDATE')) return { rows: [{ status: 'CONFIRMED' }], rowCount: 1 };
    if (sql.includes('FROM procurement_receipts WHERE id=$1')) return { rows: [], rowCount: 0 };
    if (sql.includes('FROM warehouses WHERE id=$1 AND status=\'启用\' FOR SHARE')) return { rows: [{ id: 'test-warehouse', entityUuid: '12345678-1234-7234-8234-123456789a01' }], rowCount: 1 };
    if (sql.includes('FROM warehouse_locations WHERE id=$1 AND warehouse_uuid=$2 AND status=\'启用\' FOR SHARE')) return { rows: [{ id: '12345678-1234-7234-8234-123456789a02' }], rowCount: 1 };
    if (sql.startsWith('INSERT INTO procurement_receipts')) { receiptWrites.push({ table: 'receipt', values }); return { rows: [], rowCount: 1 }; }
    if (sql.includes('FROM procurement_purchase_order_lines l JOIN skus s')) return { rows: [{ id: '12345678-1234-7234-8234-123456789a03', skuUuid: '12345678-1234-7234-8234-123456789a04', sku: 'BAT-36S-BLK-EUR', quantity: '10.000000', unit: '件', productKind: 'part' }], rowCount: 1 };
    if (sql.includes('SELECT COALESCE(sum(rl.quantity),0)::text AS quantity')) return { rows: [{ quantity: '0' }], rowCount: 1 };
    if (sql.startsWith('INSERT INTO procurement_receipt_lines')) { receiptWrites.push({ table: 'receipt-line', values }); return { rows: [], rowCount: 1 }; }
    if (sql.startsWith('INSERT INTO warehouse_stock')) { receiptWrites.push({ table: 'stock-initialize', values }); return { rows: [], rowCount: 1 }; }
    if (sql.startsWith('SELECT quantity FROM warehouse_stock')) return { rows: [{ quantity: 5 }], rowCount: 1 };
    if (sql.includes('FROM inventory_ledger WHERE warehouse_uuid=$1 AND sku_uuid=$2')) return { rows: [{ quantity: '5' }], rowCount: 1 };
    if (sql.startsWith('UPDATE warehouse_stock SET quantity=quantity+$1')) { receiptWrites.push({ table: 'stock-update', values }); return { rows: [], rowCount: 1 }; }
    if (sql.startsWith('INSERT INTO stock_movements')) { receiptWrites.push({ table: 'stock-movement', values }); return { rows: [], rowCount: 1 }; }
    if (sql.includes('SELECT count(*)::int total,count(*) FILTER')) return { rows: [{ total: 1, fulfilled: 1, partial: 1 }], rowCount: 1 };
    if (sql.startsWith('UPDATE procurement_purchase_orders SET status=$2')) return { rows: [], rowCount: 1 };
    if (sql.includes("FROM audit_log WHERE action='partner.supplier.create'")) {
      const row = audit.get(values[0]); return { rows: row ? [row] : [], rowCount: row ? 1 : 0 };
    }
    if (sql.includes('INSERT INTO partners')) {
      const row = { id: values[0], displayName: values[1], country: values[3] };
      partners.set(row.id, row); return { rows: [row], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO partner_roles")) return { rows: [], rowCount: 1 };
    if (sql.includes('INSERT INTO audit_log')) {
      audit.set(values[2], { before_json: values[3], after_json: values[4] });
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  },
  release() {},
};
const fakePool = { connect: async () => client, end: async () => {}, query: client.query.bind(client) };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (parent?.filename === path.resolve(__dirname, '../procurement.js') && request === './db-pool') return { createPool: () => fakePool };
  if (parent?.filename === path.resolve(__dirname, '../procurement.js') && request === './audit-context') return { currentActor: () => 'test-admin' };
  return originalLoad.call(this, request, parent, isMain);
};
const { createProcurementStore } = require('../procurement');
Module._load = originalLoad;
const store = createProcurementStore('unused');

test('supplier creation replays the same request and rejects changed content', async () => {
  const request = { id: uuidv7(), displayName: 'Supplier GmbH', country: 'DE', contactEmail: 'ops@example.test' };
  const first = await store.createSupplier(request);
  const replay = await store.createSupplier(request);
  assert.equal(first.id, request.id);
  assert.equal(replay.replayed, true);
  assert.equal(partners.size, 1);
  await assert.rejects(store.createSupplier({ ...request, displayName: 'Different GmbH' }), error => error.statusCode === 409);
  assert.equal(partners.size, 1);
  await store.close();
});

test('physical receipt accepts PostgreSQL decimal quantities and updates stock', async () => {
  receiptWrites.length = 0;
  const result = await store.receive('12345678-1234-7234-8234-123456789a05', {
    receiptId: '12345678-1234-7234-8234-123456789a06',
    kind: 'PHYSICAL_RECEIPT',
    occurredOn: '2026-11-21',
    warehouseId: 'test-warehouse',
    locationId: '12345678-1234-7234-8234-123456789a02',
    lines: [{ purchaseOrderLineId: '12345678-1234-7234-8234-123456789a03', quantity: '10' }],
  });
  assert.equal(result.id, '12345678-1234-7234-8234-123456789a06');
  assert.deepEqual(receiptWrites.map(write => write.table), ['receipt', 'receipt-line', 'stock-initialize', 'stock-update', 'stock-movement']);
  assert.equal(receiptWrites.find(write => write.table === 'stock-update').values[0], 10);
  await store.close();
});
