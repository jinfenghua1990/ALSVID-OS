#!/usr/bin/env node
/**
 * 一次性把 8090 库存中心专有的字段补进 8089：
 *   1) warehouse_stock.avg_cost_8090    —— 8090 库存台账的「均价成本 / 库存金额」
 *   2) inventory_ledger.*_8090          —— 8090 单据流水的「单价 / 金额 / 结存」
 *   3) vins.batch / owner_state / produced_at —— 8090 整车序列号的批次、归属、库龄基准
 *
 * 默认预演；--apply 才写库。幂等：只填 NULL 或 LEGACY-8090 占位值。
 * 备份写在 server/backups/，写入前会先落盘。
 */
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');

const SOURCE = process.env.OMS_SOURCE || path.join(process.env.HOME, 'Projects/alsvid-oms/data/oms.json');
const SECRET = process.env.ALSVID_SECRET_FILE || '/tmp/alsvid-secret.json';
const APPLY = process.argv.includes('--apply');
const BACKUP_DIR = path.join(__dirname, 'backups');

const SKU_MAP = {
  'ALSVID-A1': 'A1-STD-PUR-EUR',
  'ALSVID-A1U': 'A1-ULT-GRY-EUR',
  'ALSVID-C2': 'C2-STD-STD-EUR',
  'ALSVID-BAT36': 'UN-BAT-36S-BLK',
};
const WAREHOUSE_MAP = { 'DE-FC1': 'DE-XNC', 'VIRTUAL-CN': 'CN-CZ', 'CN-CZ': 'CN-CZ' };
const OWNER_STATE = { STOCK: 'STOCK', VIRTUAL: 'VIRTUAL', IN_TRANSIT: 'IN_TRANSIT', CUSTOMER: 'CUSTOMER' };
const num = value => {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toFixed(2) : '0.00';
};

async function main() {
  const raw = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  const secret = JSON.parse(fs.readFileSync(SECRET, 'utf8'));
  const url = (secret.DATABASE_URL_UNPOOLED || secret.DATABASE_URL || secret.databaseUrl || '').replace('-pooler', '');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('SET search_path TO alsvid_v2');

  const omsStock = raw.stock_items || raw.stock || [];
  const omsLedger = raw.stock_ledger || raw.ledger || [];
  const omsAssets = raw.vehicle_assets || (raw.assetsLedger?.rows) || [];
  console.log(`8090 源数据：库存 ${omsStock.length} 行，流水 ${omsLedger.length} 行，整车资产 ${omsAssets.length} 台；模式 ${APPLY ? 'APPLY' : '预演'}`);

  if (APPLY) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const file = path.join(BACKUP_DIR, `inventory-8090-bridge-${stamp}.json`);
    const [ws, led, vins] = await Promise.all([
      client.query('SELECT * FROM warehouse_stock WHERE avg_cost_8090 IS NOT NULL'),
      client.query('SELECT * FROM inventory_ledger WHERE unit_cost_8090 IS NOT NULL OR amount_8090 IS NOT NULL OR balance_after_8090 IS NOT NULL'),
      client.query("SELECT id,vin,batch,owner_state,produced_at FROM vins WHERE batch<>'LEGACY-8090' OR owner_state<>'STOCK'"),
    ]);
    fs.writeFileSync(file, JSON.stringify({ warehouseStock: ws.rows, ledger: led.rows, vins: vins.rows }, null, 2));
    console.log(`备份已写入 ${file}`);
  }

  const stats = { stock: 0, ledger: 0, vins: 0, skipped: 0 };
  await client.query('BEGIN');
  try {
    if (APPLY) await client.query('ALTER TABLE inventory_ledger DISABLE TRIGGER USER');

    const warehouses = new Map((await client.query('SELECT warehouse_code,id FROM warehouses')).rows.map(r => [r.warehouse_code, r.id]));
    for (const item of omsStock) {
      const whId = warehouses.get(WAREHOUSE_MAP[item.warehouse]);
      const sku = SKU_MAP[item.sku] || item.sku;
      if (!whId || !item.avgCost) { stats.skipped += 1; continue; }
      if (APPLY) {
        const r = await client.query('UPDATE warehouse_stock SET avg_cost_8090=$1 WHERE warehouse_id=$2 AND sku_code=$3 AND avg_cost_8090 IS NULL', [num(item.avgCost), whId, sku]);
        stats.stock += r.rowCount;
      } else {
        const r = await client.query('SELECT 1 FROM warehouse_stock WHERE warehouse_id=$1 AND sku_code=$2 AND avg_cost_8090 IS NULL', [whId, sku]);
        stats.stock += r.rowCount;
      }
    }

    for (const item of omsLedger) {
      const sourceId = `8090-${item.bizType}-${item.refNo}`;
      if (!item.unitCost && !item.amount) { stats.skipped += 1; continue; }
      const args = [item.unitCost === null || item.unitCost === undefined ? null : num(item.unitCost), num(item.amount), Number(item.balanceAfter ?? 0), sourceId];
      if (APPLY) {
        const r = await client.query('UPDATE inventory_ledger SET unit_cost_8090=$1,amount_8090=$2,balance_after_8090=$3 WHERE source_id=$4 AND unit_cost_8090 IS NULL', args);
        stats.ledger += r.rowCount;
      } else {
        const r = await client.query('SELECT 1 FROM inventory_ledger WHERE source_id=$1 AND unit_cost_8090 IS NULL', [sourceId]);
        stats.ledger += r.rowCount;
      }
    }

    for (const asset of omsAssets) {
      // 8090 domain.js 的归属推导：妥投=买方持有；已出运=国际在途；有销售单未出运=虚拟仓待出库；其余实体仓在库
      const owner = (asset.ownerAt === 'CUSTOMER' || asset.deliveredAt) ? 'CUSTOMER'
        : (asset.ownerAt === 'IN_TRANSIT' || asset.shippedAt) ? 'IN_TRANSIT'
        : asset.salesOrderId ? 'VIRTUAL' : 'STOCK';
      const batch = asset.batch || (asset.createdAt ? String(asset.createdAt).slice(0, 7) : null);
      if (!asset.vin || !batch) { stats.skipped += 1; continue; }
      const producedAt = asset.createdAt ? new Date(asset.createdAt).toISOString() : null;
      if (APPLY) {
        const r = await client.query(
          "UPDATE vins SET batch=$1,owner_state=$2,asset_status=CASE WHEN $2='VIRTUAL' THEN '预占' ELSE asset_status END,produced_at=COALESCE(produced_at,$3::timestamptz) WHERE vin=$4 AND (batch IS DISTINCT FROM $1 OR owner_state IS DISTINCT FROM $2)",
          [batch, owner, producedAt, asset.vin]
        );
        stats.vins += r.rowCount;
      } else {
        const r = await client.query('SELECT 1 FROM vins WHERE vin=$1 AND (batch IS DISTINCT FROM $2 OR owner_state IS DISTINCT FROM $3)', [asset.vin, batch, owner]);
        stats.vins += r.rowCount;
      }
    }

    if (APPLY) await client.query('ALTER TABLE inventory_ledger ENABLE TRIGGER USER');
    if (APPLY) await client.query('COMMIT');
    else await client.query('ROLLBACK');
  } catch (error) {
    if (APPLY) await client.query('ALTER TABLE inventory_ledger ENABLE TRIGGER USER').catch(() => {});
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  }
  console.log(`回填：库存均价 ${stats.stock} 行，流水金额 ${stats.ledger} 行，VIN 归属/批次 ${stats.vins} 台，跳过 ${stats.skipped} 行`);
  await client.end();
}

main().catch(error => { console.error(`失败：${error.message}`); process.exit(1); });
