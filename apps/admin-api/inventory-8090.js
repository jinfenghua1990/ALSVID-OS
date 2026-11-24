'use strict';
/*
 * 8090 库存中心口径桥接层。
 * 8090 的「库存台账 / 整车序列号」有两样 8089 原生表没有的展示字段：
 *   均价成本、库存金额、单据单价/金额/结存。迁移脚本 168 把这些值落在 *_8090 列里，
 *   本模块只读这些列拼出 8090 同款快照，不参与 8089 自身库存与财务核算。
 */
const { createPool } = require('./db-pool');

function createInventory8090(connectionString) {
  const pool = createPool(connectionString, { max: 3, connectionTimeoutMillis: 10000 });

  async function snapshot() {
    const [stock, ledger, warehouses] = await pool.queryMany([
      `SELECT ws.sku_code AS sku, COALESCE(p.name,'') AS product_name,
              w.name AS warehouse_name, w.warehouse_code,
              ws.quantity AS on_hand, COALESCE(ws.avg_cost_8090,0) AS avg_cost,
              ROUND(ws.quantity * COALESCE(ws.avg_cost_8090,0), 2) AS amount,
              to_char(lt.ts,'YYYY-MM-DD HH24:MI') AS updated_at
         FROM warehouse_stock ws
         LEFT JOIN skus s ON s.code = ws.sku_code
         LEFT JOIN products p ON p.id = s.product_id
         LEFT JOIN warehouses w ON w.entity_uuid = ws.warehouse_uuid
         LEFT JOIN LATERAL (SELECT max(l.created_at) AS ts FROM inventory_ledger l WHERE l.sku_uuid = ws.sku_uuid) lt ON true
        ORDER BY ws.quantity DESC, ws.sku_code`,
      `SELECT to_char(l.created_at,'YYYY-MM-DD HH24:MI') AS ts,
              CASE WHEN l.source_id LIKE '8090-GRN-%' THEN 'GRN'
                   WHEN l.source_id LIKE '8090-GDO-%' THEN 'GDO' ELSE 'ADJ' END AS biz_type,
              l.source_id AS source_id,
              s.code AS sku, w.name AS warehouse_name, w.warehouse_code,
              l.quantity_delta AS qty, l.unit_cost_8090 AS unit_cost,
              l.amount_8090 AS amount, l.balance_after_8090 AS balance_after,
              regexp_replace(l.source_id, '^8090-(GRN|GDO)-', '') AS ref_no,
              CASE WHEN l.source_id LIKE '8090-GRN-%' THEN '工厂交货逻辑入库'
                   WHEN l.source_id LIKE '8090-GDO-%' THEN '直发客户出库'
                   ELSE '库存调整' END AS note
         FROM inventory_ledger l
         LEFT JOIN skus s ON s.entity_uuid = l.sku_uuid
         LEFT JOIN warehouses w ON w.entity_uuid = l.warehouse_uuid
        ORDER BY l.created_at DESC`,
      `SELECT w.warehouse_code, w.name, COALESCE(SUM(ws.quantity),0)::int AS on_hand,
              COUNT(ws.sku_code)::int AS sku_count
         FROM warehouses w LEFT JOIN warehouse_stock ws ON ws.warehouse_uuid = w.entity_uuid
        GROUP BY w.warehouse_code, w.name`,
    ]);
    const stockRows = stock.rows;
    const ledgerRows = ledger.rows;
    const warehouseMap = Object.fromEntries(warehouses.rows.map(r => [r.warehouse_code, r]));
    const stockValue = Math.round(stockRows.reduce((sum, r) => sum + Number(r.amount || 0), 0) * 100) / 100;
    const documentHealth = { GRN: 0, GDO: 0, ADJ: 0 };
    for (const row of ledgerRows) documentHealth[row.biz_type] = (documentHealth[row.biz_type] || 0) + 1;
    return { asOf: new Date().toISOString().slice(0, 10), stockValue, stockRows, ledgerRows, warehouseMap, documentHealth };
  }

  return { snapshot };
}

module.exports = { createInventory8090 };
