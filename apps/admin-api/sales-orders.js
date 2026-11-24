'use strict';
/*
 * 销售订单中心（B2B 销售订单）
 *
 * 设计要点
 * - 单号 SO-YYYYMM-NNN，来自 sequence，全局唯一。
 * - 履约路由：目标仓现货充足 → WAREHOUSE_PICK（不建生产单）；否则 FACTORY_DROPSHIP 并连带建 production_order。
 * - 状态机：WAIT_PRODUCTION → IN_PRODUCTION → READY_TO_SHIP → IN_TRANSIT → DELIVERED → COMPLETED，可 CANCEL。
 * - 每次状态推进同时写 sales_order_events 与 audit_log，前端时间线直接用事件表。
 */
const { createPool } = require('./db-pool');
const { uuidv7, isUuidv7 } = require('./uuidv7');
const { currentActor } = require('./audit-context');
const { createHash } = require('node:crypto');
const TX_META=Symbol('transaction metadata');

const fail = (message, statusCode = 400) => {
  throw Object.assign(new Error(message), { statusCode });
};
const text = (value, max = 500) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const dateOnly = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) fail('日期格式须为 YYYY-MM-DD');
  const parsed=new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())||parsed.toISOString().slice(0,10)!==s) fail('日期不是有效日期');
  return s;
};
const money = (value, { allowZero = true } = {}) => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) fail('金额须为非负数');
  if (!allowZero && n === 0) fail('金额须大于 0');
  return Math.round(n * 100) / 100;
};
const int = (value, { min = 1, max = 100000 } = {}) => {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) fail(`数量须为 ${min}-${max} 的整数`);
  return n;
};
const CURRENCIES = new Set(['CNY', 'EUR', 'USD']);
/** 汇总口径：不同币种金额统一折算成 CNY 再相加，成本按订单同币种记账 */
const FX_TO_CNY = { CNY: 1, USD: 7.2, EUR: 7.85 };
/** 整车资产归属四态（对应 8090 序列号台账的四类归属） */
const ASSET_OWNER = {
  STOCK: { key: 'STOCK', label: '实体仓在库', tone: 'on', note: '已入库、可直接出库' },
  VIRTUAL: { key: 'VIRTUAL', label: '虚拟仓待出库', tone: 'plan', note: '已完工、已被销售订单预占' },
  IN_TRANSIT: { key: 'IN_TRANSIT', label: '国际在途', tone: 'on', note: '已出运、尚未签收' },
  CUSTOMER: { key: 'CUSTOMER', label: '买方持有', tone: '', note: '客户已签收、订单结案' },
};
const STATUS_FLOW = ['WAIT_WAREHOUSE_PICK', 'WAIT_PRODUCTION', 'IN_PRODUCTION', 'READY_TO_SHIP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'];
const STATUS_LABEL = {
  WAIT_WAREHOUSE_PICK: '待仓库拣货',
  WAIT_PRODUCTION: '待排产',
  IN_PRODUCTION: '生产中',
  READY_TO_SHIP: '待出运',
  IN_TRANSIT: '国际在途',
  DELIVERED: '已妥投',
  COMPLETED: '已完成',
  CANCELLED: '已取消',
};
/** 现货仓优先顺序：先看德国综合虚拟仓，再看国内的备货仓 */
const PICK_WAREHOUSE_CODES = ['DE-XNC', 'CN-CZ'];
/**
 * 应收账龄分档。口径必须与 server/finance.js 的 bucketOf 完全一致，
 * 否则订单中心看到的「回款健康度」和财务对账页对不上，用户会以为其中一边算错了。
 * daysToDue：正数 = 已逾期天数，负数 = 距到期还有几天。
 */
const RECEIVABLE_BUCKETS = [
  { key: 'NOT_DUE', label: '未到期', tone: 'ok' },
  { key: 'DUE_SOON', label: '30 天内到期', tone: 'info' },
  { key: 'D1_30', label: '逾期 1-30 天', tone: 'warn' },
  { key: 'D31_60', label: '逾期 31-60 天', tone: 'warn' },
  { key: 'D61_90', label: '逾期 61-90 天', tone: 'danger' },
  { key: 'D90_PLUS', label: '逾期 90 天以上', tone: 'danger' },
];
const receivableBucketOf = (daysToDue) => {
  if (daysToDue === null) return 'NOT_DUE';
  if (daysToDue <= -31) return 'NOT_DUE';
  if (daysToDue <= 0) return 'DUE_SOON';
  if (daysToDue <= 30) return 'D1_30';
  if (daysToDue <= 60) return 'D31_60';
  if (daysToDue <= 90) return 'D61_90';
  return 'D90_PLUS';
};
/** due_date 可能是 date 文本、timestamp 文本，也可能被驱动转成 Date；按 UTC 日粒度取毫秒 */
const dueDayMs = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const t = Date.parse(String(value));
  return Number.isNaN(t) ? null : t;
};

function createSalesOrderStore(url) {
  const pool = createPool(url, { max: 4, connectionTimeoutMillis: 10000 });

  async function tx(action, target, fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client),meta=result?.[TX_META];
      if(!meta?.replayed)await client.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [
        currentActor(),action,target,meta?.before?JSON.stringify(meta.before):null,
        JSON.stringify(result && result.id ? { id: result.id, orderNo: result.orderNo || result.order_no } : {}),
      ]);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  const selectOrder = `
    SELECT o.*,
           c.code AS customer_code,
           po.order_no AS po_no,
           po.status AS po_status,
           po.supplier_cost AS po_supplier_cost,
           po.material_cost AS po_material_cost,
           po.processing_cost AS po_processing_cost,
           po.cost_currency AS po_cost_currency,
           d.shipment_no AS delivery_no,
           d.freight_cost AS delivery_freight_cost,
           COALESCE(NULLIF(d.carrier,''), o.carrier) AS carrier,
           COALESCE(NULLIF(d.tracking_no,''), o.tracking_no) AS tracking_no,
           COALESCE(d.eta_date, o.eta_date) AS eta
      FROM sales_orders o
      LEFT JOIN customers c ON c.id = o.customer_id
      LEFT JOIN production_orders po ON po.entity_uuid = o.production_order_uuid
      LEFT JOIN production_deliveries d ON d.entity_uuid = o.delivery_uuid`;

  async function list(filters = {}) {
    const status = text(filters.status, 32).toUpperCase();
    const q = text(filters.q, 80).toLowerCase();
    const where = [];
    const args = [];
    if (status && status !== 'ALL') {
      args.push(status);
      where.push(`o.status = $${args.length}`);
    }
    if (q) {
      args.push(`%${q}%`);
      where.push(`(lower(o.order_no) LIKE $${args.length} OR lower(o.customer_name) LIKE $${args.length}
        OR lower(o.sku_code) LIKE $${args.length} OR lower(o.vin) LIKE $${args.length}
        OR lower(COALESCE(d.tracking_no,'')) LIKE $${args.length})`);
    }
    const sql = `${selectOrder}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY o.created_at DESC LIMIT 500`;
    return (await pool.query(sql, args)).rows;
  }

  /**
   * 应收账龄汇总（订单中心「回款健康度」用）。
   * 为什么不复用 /api/finance/aging：那条路由限管理员，销售看订单中心时会拿到 403，
   * 面板就会常年空白；这里直接读同一个只读视图，按同一口径算一份轻量汇总。
   * 视图不存在（老库/未迁财务）时返回 null，前端降级成「暂无应收数据」而不是整页报错。
   */
  async function receivableAging() {
    let rows;
    try {
      rows = (await pool.query(
        `SELECT o.currency, o.outstanding_amount, o.due_date::text AS due_date
           FROM finance_v_obligations o
          WHERE o.direction = 'AR' AND o.settlement_status <> 'VOID' AND o.outstanding_amount > 0`,
      )).rows;
    } catch {
      return null;
    }
    const today = new Date();
    const baseMs = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
    const buckets = RECEIVABLE_BUCKETS.map((b) => ({ ...b, count: 0, amount: 0, ratio: 0 }));
    const index = new Map(buckets.map((b) => [b.key, b]));
    let total = 0;
    let overdueAmount = 0;
    let overdueCount = 0;
    let dueSoonAmount = 0;
    let weighted = 0;
    let maxOverdueDays = 0;
    for (const row of rows) {
      const amount = Number(row.outstanding_amount || 0);
      const rate = FX_TO_CNY[row.currency] || 1;
      const amountCny = amount * rate;
      const dueMs = dueDayMs(row.due_date);
      const daysToDue = dueMs === null ? null : Math.round((baseMs - dueMs) / 86400000);
      const bucket = index.get(receivableBucketOf(daysToDue));
      total += amountCny;
      if (bucket) {
        bucket.count += 1;
        bucket.amount += amountCny;
      }
      if (daysToDue !== null && daysToDue > 0) {
        overdueAmount += amountCny;
        overdueCount += 1;
        weighted += amountCny * daysToDue;
        maxOverdueDays = Math.max(maxOverdueDays, daysToDue);
      } else if (daysToDue !== null && daysToDue >= -30) {
        dueSoonAmount += amountCny;
      }
    }
    const round2 = (n) => Math.round(n * 100) / 100;
    return {
      total: round2(total),
      count: rows.length,
      overdueAmount: round2(overdueAmount),
      overdueCount,
      overdueRatio: total ? Math.round((overdueAmount / total) * 1000) / 10 : 0,
      dueSoonAmount: round2(dueSoonAmount),
      avgOverdueDays: overdueAmount ? Math.round(weighted / overdueAmount) : 0,
      maxOverdueDays,
      buckets: buckets.map((b) => ({ ...b, amount: round2(b.amount), ratio: total ? Math.round((b.amount / total) * 1000) / 10 : 0 })),
    };
  }

  /** 订单中心总览：只统计真实库内数据，未出运的按销售价折算应收敞口 */
  async function summary() {
    // 两个查询互不依赖，并发发出去：跨境库单次往返 0.7–1.5s，串行会让首屏多等一个来回。
    const [orderResult, receivable] = await Promise.all([pool.query(selectOrder), receivableAging()]);
    const rows = orderResult.rows;
    const live = rows.filter((r) => r.status !== 'CANCELLED');
    // 与 8090 毛利口径一致：样车单（SAMPLE）不参与已出运销售额与毛利统计。
    const shipped = live.filter((r) => ['IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(r.status) && r.channel !== 'SAMPLE');
    const byStatus = {};
    for (const s of Object.keys(STATUS_LABEL)) byStatus[s] = 0;
    for (const r of rows) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

    const amount = (r) => Number(r.sale_amount || 0);
    const rate = (r) => FX_TO_CNY[r.currency] || 1;
    const toCny = (r) => amount(r) * rate(r);
    const shippedAmount = shipped.reduce((s, r) => s + amount(r), 0);
    const openAmount = live.filter((r) => !['IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(r.status)).reduce((s, r) => s + amount(r), 0);
    // 收入与成本都按订单币种记账，折算成 CNY 后求毛利，避免 EUR 成本直接和 CNY 收入相减
    const revenueCny = shipped.reduce((s, r) => s + toCny(r), 0);
    const costCny = shipped.reduce((s, r) => s + Number(r.total_cost || 0) * rate(r), 0);
    const grossProfit = Math.round((revenueCny - costCny) * 100) / 100;
    const overdue = live.filter((r) => r.due_date && String(r.due_date).slice(0, 10) < new Date().toISOString().slice(0, 10)
      && !['DELIVERED', 'COMPLETED'].includes(r.status));

    return {
      orders: rows,
      fx: FX_TO_CNY,
      metrics: {
        total: rows.length,
        open: live.filter((r) => !['DELIVERED', 'COMPLETED'].includes(r.status)).length,
        waitProduction: live.filter((r) => r.status === 'WAIT_PRODUCTION').length,
        inProduction: live.filter((r) => r.status === 'IN_PRODUCTION').length,
        readyToShip: live.filter((r) => r.status === 'READY_TO_SHIP').length,
        inTransit: live.filter((r) => r.status === 'IN_TRANSIT').length,
        shippedCount: shipped.length,
        shippedAmount: Math.round(shippedAmount * 100) / 100,
        shippedAmountCny: Math.round(revenueCny * 100) / 100,
        openAmount: Math.round(openAmount * 100) / 100,
        openAmountCny: Math.round(live.filter((r) => !['IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(r.status)).reduce((s, r) => s + toCny(r), 0) * 100) / 100,
        costCny: Math.round(costCny * 100) / 100,
        grossProfit,
        grossMargin: revenueCny ? Math.round((grossProfit / revenueCny) * 1000) / 10 : 0,
        overdueCount: overdue.length,
        overdueAmount: Math.round(overdue.reduce((s, r) => s + amount(r), 0) * 100) / 100,
        dropship: live.filter((r) => r.fulfillment_type === 'FACTORY_DROPSHIP').length,
        warehousePick: live.filter((r) => r.fulfillment_type === 'WAREHOUSE_PICK').length,
      },
      byStatus,
      receivable,
      statusLabels: STATUS_LABEL,
    };
  }

  async function detail(id) {
    const order = (await pool.query(`${selectOrder} WHERE o.id::text = $1 OR o.order_no = $1 LIMIT 1`, [id])).rows[0];
    if (!order) fail('销售订单不存在', 404);
    const toCny = (value, currency) => {
      const rounded = Math.round(Number(value || 0) * (FX_TO_CNY[currency] || 1) * 100) / 100;
      return Math.abs(rounded - Math.round(rounded)) < 0.05 ? Math.round(rounded) : rounded;
    };
    const poFactoryCost = Number(order.po_supplier_cost || 0) + Number(order.po_material_cost || 0) + Number(order.po_processing_cost || 0);
    const factoryCostCny = Number(order.factory_cost || 0) > 0
      ? toCny(order.factory_cost, order.currency)
      : toCny(poFactoryCost, order.po_cost_currency || 'CNY');
    const freightCostCny = Number(order.freight_cost || 0) > 0
      ? toCny(order.freight_cost, order.currency)
      : toCny(order.delivery_freight_cost, order.po_cost_currency || 'CNY');
    const revenueCny = toCny(order.sale_amount, order.currency);
    const hasCost = factoryCostCny + freightCostCny > 0;
    const costSummary = {
      currency: 'CNY',
      revenueCny,
      factoryCostCny,
      freightCostCny,
      totalCostCny: Number(order.total_cost || 0) > 0 ? toCny(order.total_cost, order.currency) : Math.round((factoryCostCny + freightCostCny) * 100) / 100,
      estimated: Number(order.total_cost || 0) <= 0 && poFactoryCost > 0,
      hasCost,
    };
    costSummary.grossProfitCny = hasCost ? Math.round((costSummary.revenueCny - costSummary.totalCostCny) * 100) / 100 : null;
    costSummary.grossMargin = hasCost && revenueCny ? Math.round((costSummary.grossProfitCny / revenueCny) * 1000) / 10 : null;
    const events = (await pool.query('SELECT * FROM sales_order_events WHERE order_uuid = $1 ORDER BY at ASC', [order.id])).rows;
    const parcels = order.delivery_uuid
      ? (await pool.query('SELECT * FROM delivery_parcels WHERE delivery_id = $1 ORDER BY created_at', [order.delivery_uuid])).rows
      : [];
    const ledger = (await pool.query(
      `SELECT l.id, l.source_type, l.source_id, l.line_no, l.quantity_delta,
              l.created_at, w.name AS warehouse_name
         FROM inventory_ledger l
         LEFT JOIN warehouses w ON w.id = l.warehouse_id
        WHERE l.source_id = ANY($1::text[])
           OR l.source_id IN (SELECT r.id::text FROM inventory_reservations r WHERE r.source_type='sales_order' AND r.source_id=$2)
           OR l.source_id LIKE ANY($3::text[])
        ORDER BY l.created_at ASC, l.line_no ASC`,
      [[order.id, order.order_no, order.production_order_uuid, order.po_no].filter(Boolean).map(String), String(order.id), [order.order_no, order.po_no].filter(Boolean).map(value => `%${value}%`)],
    )).rows;
    let finance = [];
    try {
      finance = (await pool.query(
        `SELECT o.id, o.direction, o.currency, o.original_amount, o.allocated_amount,
                o.outstanding_amount, o.due_date, o.settlement_status,
                to_jsonb(o)->>'legacy_ref_no' AS legacy_ref_no,
                CASE WHEN to_jsonb(o)->>'legacy_ref_no' = ANY($1::text[]) THEN '单号关联'
                     WHEN o.note ILIKE ANY($2::text[]) THEN '备注关联'
                     ELSE '历史字段唯一匹配' END AS link_basis
           FROM finance_v_obligations o
           LEFT JOIN partners p ON p.id = o.partner_id
          WHERE ((to_jsonb(o)->>'legacy_ref_no') = ANY($1::text[]) OR o.note ILIKE ANY($2::text[])
             OR (o.direction = 'AR' AND p.display_name = $3 AND o.currency = $4
                 AND o.original_amount = $5 AND o.due_date IS NOT DISTINCT FROM $6::date
                 AND o.created_at = $7::timestamptz
                 AND (SELECT count(*) FROM finance_obligations f
                       WHERE f.direction = 'AR' AND f.partner_id = o.partner_id
                         AND f.currency = o.currency AND f.original_amount = o.original_amount
                         AND f.due_date IS NOT DISTINCT FROM o.due_date AND f.created_at = o.created_at) = 1))
            AND o.settlement_status <> 'VOID'
          ORDER BY o.created_at ASC`,
        [[order.order_no, order.po_no].filter(Boolean), [order.order_no, order.po_no].filter(Boolean).map(value => `%${value}%`), order.customer_name, order.currency, order.sale_amount, order.due_date, order.created_at],
      )).rows;
    } catch (_) {
      finance = [];
    }
    const tracking = order.delivery_uuid ? await listEvents({ deliveryUuid: order.delivery_uuid }) : [];
    const vinRow = order.vin
      ? (await pool.query('SELECT vin, owner_state, asset_status, current_warehouse_uuid FROM vins WHERE vin = $1', [order.vin])).rows[0]
      : null;
    return { order, events, parcels, tracking, ledger, finance, costSummary, asset: vinRow || null, statusLabel: STATUS_LABEL[order.status] || order.status };
  }

  /**
   * 销售侧运单流：供「生产交付 › 物流跟踪」与销售订单共用。
   * 工厂直发的单在生产发运单里已有记录，这里只补两类：仓库现货出库的单、以及销售订单维度的口径。
   */
  async function tracking(filters = {}) {
    const q = text(filters.q, 80).toLowerCase();
    const args = [];
    // 口径是「已经出运的销售单」：有运单号的，或者已经派生出生产发运单的。
    // 早前只认 o.tracking_no <> ''，工厂直发的单运单号记在发运单/包裹上，订单行本身是空的，
    // 结果这个列表永远是空的（物流跟踪页那一块死掉）。
    const where = ["(o.tracking_no <> '' OR o.delivery_uuid IS NOT NULL)"];
    if (q) {
      args.push(`%${q}%`);
      where.push(`(lower(o.order_no) LIKE $${args.length} OR lower(o.customer_name) LIKE $${args.length}
        OR lower(o.tracking_no) LIKE $${args.length} OR lower(o.sku_code) LIKE $${args.length})`);
    }
    const rows = (await pool.query(
      `SELECT o.id AS order_uuid, o.order_no, o.customer_name, o.sku_code, o.product_name,
              o.quantity, o.status, o.fulfillment_type, o.currency, o.sale_amount,
              COALESCE(NULLIF(d.carrier,''), o.carrier) AS carrier,
              COALESCE(NULLIF(d.tracking_no,''), o.tracking_no) AS tracking_no,
              COALESCE(d.eta_date, o.eta_date) AS eta, o.shipped_at, o.delivered_at,
              o.consignee_country AS destination, o.delivery_uuid,
              po.order_no AS po_no, d.shipment_no,
              (SELECT COUNT(*)::int FROM delivery_parcels p WHERE p.delivery_id = o.delivery_uuid::text) AS parcel_count
         FROM sales_orders o
         LEFT JOIN production_orders po ON po.entity_uuid = o.production_order_uuid
         LEFT JOIN production_deliveries d ON d.entity_uuid = o.delivery_uuid
        WHERE ${where.join(' AND ')}
        ORDER BY o.shipped_at DESC NULLS LAST LIMIT 300`,
      args,
    )).rows;
    const open = rows.filter((r) => !['DELIVERED', 'COMPLETED'].includes(r.status));
    return {
      shipments: rows,
      statusLabels: STATUS_LABEL,
      metrics: {
        total: rows.length,
        inTransit: open.length,
        delivered: rows.length - open.length,
        warehousePick: rows.filter((r) => r.fulfillment_type === 'WAREHOUSE_PICK').length,
        dropship: rows.filter((r) => r.fulfillment_type === 'FACTORY_DROPSHIP').length,
      },
    };
  }

  /** 履约路由：目标仓现货够 → 现货出库；否则工厂直发 */
  async function routeFulfillment(client, skuCode, quantity) {
    const stock = (await client.query(
      `SELECT w.id, w.warehouse_code, w.entity_uuid, w.name, COALESCE(s.quantity,0) AS quantity
         FROM warehouses w LEFT JOIN warehouse_stock s ON s.warehouse_uuid = w.entity_uuid AND s.sku_code = $1
        WHERE w.warehouse_code = ANY($2::text[]) AND w.status = '启用'
        ORDER BY array_position($2::text[], w.warehouse_code)`,
      [skuCode, PICK_WAREHOUSE_CODES],
    )).rows;
    for(const candidate of stock){
      await client.query('INSERT INTO warehouse_stock(warehouse_id,sku_code,quantity) VALUES($1,$2,0) ON CONFLICT DO NOTHING',[candidate.id,skuCode]);
      const locked=(await client.query('SELECT ws.quantity,s.entity_uuid AS "skuUuid",w.entity_uuid AS "warehouseUuid",w.id AS "warehouseId" FROM warehouse_stock ws JOIN skus s ON s.code=ws.sku_code JOIN warehouses w ON w.id=ws.warehouse_id WHERE w.entity_uuid=$1 AND s.code=$2 FOR UPDATE OF ws',[candidate.entity_uuid,skuCode])).rows[0];
      if(!locked)continue;
      const ledger=Number((await client.query('SELECT COALESCE(sum(quantity_delta),0)::bigint AS quantity FROM inventory_ledger WHERE sku_uuid=$1 AND warehouse_uuid=$2',[locked.skuUuid,locked.warehouseUuid])).rows[0].quantity);
      if(ledger!==Number(locked.quantity))fail(`仓库 ${candidate.name} 的库存余额与账本不一致，不能自动分配`,409);
      const reserved=Number((await client.query("SELECT COALESCE(sum(quantity),0)::bigint AS quantity FROM inventory_reservations WHERE sku_uuid=$1 AND warehouse_uuid=$2 AND status='reserved'",[locked.skuUuid,locked.warehouseUuid])).rows[0].quantity);
      const available=ledger-reserved;
      if(available<quantity)continue;
      const location=(await client.query("SELECT id FROM warehouse_locations WHERE warehouse_uuid=$1 AND status='启用' AND is_default FOR SHARE",[locked.warehouseUuid])).rows[0];
      if(!location)continue;
      const conditionAvailable=Number((await client.query("SELECT COALESCE(sum(quantity_delta) FILTER(WHERE condition='available'),0)::bigint AS quantity FROM inventory_condition_ledger WHERE location_uuid=$1 AND sku_uuid=$2",[location.id,locked.skuUuid])).rows[0].quantity);
      if(conditionAvailable-reserved<quantity)continue;
      const vinCount=Number((await client.query("SELECT count(*)::int AS quantity FROM vins WHERE sku_code=$1 AND current_warehouse_uuid=$2 AND asset_status='可用' AND owner_state='STOCK' AND sales_order_uuid IS NULL",[skuCode,locked.warehouseUuid])).rows[0].quantity);
      if(vinCount<quantity)continue;
      return{type:'WAREHOUSE_PICK',warehouse:{...candidate,...locked,quantity:available},reason:`${candidate.name} 可用现货 ${available} 台，可整单出库`};
    }
    const best = stock[0] || null;
    if (!best) fail('没有启用的履约仓库，不能创建销售订单',409);
    return {
      type: 'FACTORY_DROPSHIP',
      warehouse: best,
      reason: best
        ? `${best.name} 现货 ${Number(best.quantity)} 台，不足 ${quantity} 台，转工厂直发`
        : '目标仓无现货记录，转工厂直发',
    };
  }

  async function nextOrderNo(client) {
    const seq = (await client.query("SELECT nextval('sales_order_no_seq') AS n")).rows[0].n;
    const ym = new Date().toISOString().slice(0, 7).replace('-', '');
    return `SO-${ym}-${String(seq).padStart(3, '0')}`;
  }

  async function nextOutboundNo(client){
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('ob-'||to_char(now(),'YYYYMMDD'),0))");
    return 'OUT-'+(await client.query("SELECT to_char(now(),'YYYYMMDD')||'-'||lpad(((SELECT count(*) FROM inventory_outbound_orders WHERE outbound_no LIKE 'OUT-'||to_char(now(),'YYYYMMDD')||'-%')+1)::text,3,'0') AS d")).rows[0].d;
  }

  async function create(input) {
    const skuCode = text(input.skuCode, 80);
    if (!skuCode) fail('请选择车型 SKU');
    const quantity = int(input.quantity);
    const currency = text(input.currency, 3).toUpperCase() || 'CNY';
    if (!CURRENCIES.has(currency)) fail('币种只支持 CNY / EUR / USD');
    const unitPrice = money(input.unitPrice);
    const channel = text(input.channel, 8).toUpperCase() || 'B2B';
    if (!['B2B', 'B2C', 'SAMPLE'].includes(channel)) fail('渠道无效');
    const dueDate = dateOnly(input.dueDate);
    const factoryName = text(input.factory, 120);
    const idempotencyKey=String(input.idempotencyKey||'').trim().toLowerCase();
    if(!isUuidv7(idempotencyKey))fail('销售订单幂等编号无效');
    const request={customerId:text(input.customerId,64)||null,customerName:text(input.customerName,120),skuCode,quantity,unitPrice,currency,channel,dueDate,factory:factoryName,consigneeName:text(input.consigneeName,120),consigneeCountry:text(input.consigneeCountry,80),consigneeAddress:text(input.consigneeAddress,300),consigneePhone:text(input.consigneePhone,60),consigneeEmail:text(input.consigneeEmail,120),note:text(input.note,500)};
    const requestHash=createHash('sha256').update(JSON.stringify(request)).digest('hex');

    return tx('sales.order.create', 'sales/orders', async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',[idempotencyKey]);
      const prior=(await client.query("SELECT before_json FROM audit_log WHERE action='sales.order.create' AND target='sales/orders' AND after_json->>'id'=$1 ORDER BY created_at DESC LIMIT 1",[idempotencyKey])).rows[0];
      if(prior){const before=typeof prior.before_json==='string'?JSON.parse(prior.before_json):prior.before_json;if(before?.idempotencyKey!==idempotencyKey||before?.requestHash!==requestHash)fail('销售订单编号已用于不同内容',409);const saved=(await client.query(`${selectOrder} WHERE o.id::text=$1 LIMIT 1`,[idempotencyKey])).rows[0];if(!saved)fail('销售订单请求已记录但订单不存在',409);return Object.assign({...saved,poNo:saved.po_no,replayed:true},{[TX_META]:{replayed:true}})}
      const sku = (await client.query("SELECT sku.code,sku.entity_uuid,p.name AS product_name FROM skus sku JOIN products p ON p.id=sku.product_id WHERE sku.code=$1 AND sku.disabled=false AND p.status='启用' AND p.kind='vehicle' FOR SHARE OF p,sku", [skuCode])).rows[0];
      if (!sku) fail('车型 SKU 不存在', 404);

      let customer = null;
      if (text(input.customerId, 64)) {
        customer = (await client.query('SELECT * FROM customers WHERE id = $1', [input.customerId])).rows[0];
        if (!customer) fail('客户不存在', 404);
      }

      const routeInfo = await routeFulfillment(client, skuCode, quantity);
      const orderNo = await nextOrderNo(client);
      const id = idempotencyKey;
      const saleAmount = Math.round(unitPrice * quantity * 100) / 100;

      let productionOrderUuid = null;
      if (routeInfo.type === 'FACTORY_DROPSHIP') {
        const poId = uuidv7();
        const poNo = `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(Math.floor(Math.random() * 900) + 100)}`;
        const po = (await client.query(
          `INSERT INTO production_orders
             (id, entity_uuid, order_no, sku_code, sku_uuid, factory, batch, planned_quantity, status,
              order_date, expected_delivery_date, customer_id, unit_price, currency, note)
           VALUES ($1::text,$1::uuid,$2,$3,$4,$5,$6,$7,'计划中',$8,$9,$10,$11,$12,$13)
           RETURNING entity_uuid, id, order_no`,
          [
            poId, poNo, skuCode, sku.entity_uuid,
            factoryName || '待指派工厂',
            `SO-${orderNo}`,
            quantity,
            new Date().toISOString().slice(0, 10),
            dueDate,
            customer ? customer.id : null,
            unitPrice, currency,
            `由销售订单 ${orderNo} 以销定产`,
          ],
        )).rows[0];
        productionOrderUuid = po.entity_uuid;
      }

      const order = (await client.query(
        `INSERT INTO sales_orders
           (id, order_no, channel, customer_id, customer_name, consignee_name, consignee_country,
            consignee_address, consignee_phone, consignee_email, sku_uuid, sku_code, product_name,
            quantity, unit_price, currency, sale_amount, fulfillment_type, fulfillment_reason,
            status, due_date, warehouse_uuid, production_order_uuid, note, created_by, updated_by, confirmed_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$25,now())
         RETURNING *`,
        [
          id, orderNo, channel,
          customer ? customer.id : null,
          text(input.customerName, 120) || (customer ? customer.name : ''),
          text(input.consigneeName, 120) || (customer ? customer.name : ''),
          text(input.consigneeCountry, 80) || (customer ? customer.country : ''),
          text(input.consigneeAddress, 300) || (customer ? customer.address : ''),
          text(input.consigneePhone, 60) || (customer ? customer.phone : ''),
          text(input.consigneeEmail, 120) || (customer ? customer.email : ''),
          sku.entity_uuid, skuCode, sku.product_name || '',
          quantity, unitPrice, currency, saleAmount,
          routeInfo.type, routeInfo.reason,
          routeInfo.type === 'WAREHOUSE_PICK' ? 'WAIT_WAREHOUSE_PICK' : 'WAIT_PRODUCTION',
          dueDate,
          routeInfo.warehouse ? routeInfo.warehouse.entity_uuid : null,
          productionOrderUuid,
          text(input.note, 500),
          currentActor(),
        ],
      )).rows[0];

      if(routeInfo.type==='WAREHOUSE_PICK'){
        await client.query("INSERT INTO inventory_reservations(sku_uuid,warehouse_uuid,quantity,source_type,source_id,created_by,note) VALUES($1,$2,$3,'b2b_sales_order',$4,$5,$6)",[sku.entity_uuid,routeInfo.warehouse.warehouseUuid,quantity,id,currentActor(),`B2B 订单 ${orderNo} 现货预占`]);
      }

      await client.query(
        `INSERT INTO sales_order_events(order_uuid,status,message,actor,payload) VALUES($1,$2,$3,$4,$5)`,
        [id,order.status,`订单创建，履约方式：${routeInfo.type === 'WAREHOUSE_PICK' ? '实体仓现货出库' : '工厂直发'}（${routeInfo.reason}）`,currentActor(),JSON.stringify({route:routeInfo.type,po:productionOrderUuid})],
      );

      return Object.assign({ ...order, poNo: productionOrderUuid ? (await client.query('SELECT order_no FROM production_orders WHERE entity_uuid=$1', [productionOrderUuid])).rows[0].order_no : null },{[TX_META]:{before:{idempotencyKey,requestHash}}});
    });
  }

  async function advance(id, target, message, patch = {}) {
    return tx(`sales.order.${target.toLowerCase()}`, 'sales/orders', async (client) => {
      const order = (await client.query('SELECT * FROM sales_orders WHERE id::text=$1 OR order_no=$1 FOR UPDATE', [id])).rows[0];
      if (!order) fail('销售订单不存在', 404);
      if (order.status === 'CANCELLED') fail('订单已取消，不能继续推进');
      if(target==='IN_PRODUCTION'&&(order.fulfillment_type!=='FACTORY_DROPSHIP'||order.status!=='WAIT_PRODUCTION'))fail('只有待排产的工厂直发订单可以开工',409);
      const from = STATUS_FLOW.indexOf(order.status);
      const to = STATUS_FLOW.indexOf(target);
      if (to < 0) fail('非法目标状态');
      if (to <= from) fail(`订单当前为「${STATUS_LABEL[order.status]}」，不能回退到「${STATUS_LABEL[target]}」`);

      const sets = ['status=$2', 'updated_at=now()', 'updated_by=$3'];
      const args = [order.id, target, currentActor()];
      for (const [col, value] of Object.entries(patch)) {
        args.push(value);
        sets.push(`${col}=$${args.length}`);
      }
      const stamp = { IN_PRODUCTION: 'production_started_at', READY_TO_SHIP: 'ready_to_ship_at', IN_TRANSIT: 'shipped_at', DELIVERED: 'delivered_at', COMPLETED: 'completed_at' }[target];
      if (stamp) sets.push(`${stamp}=now()`);

      const updated = (await client.query(`UPDATE sales_orders SET ${sets.join(',')} WHERE id=$1 RETURNING *`, args)).rows[0];
      await client.query('INSERT INTO sales_order_events(order_uuid,status,message,actor) VALUES($1,$2,$3,$4)', [order.id, target, message, currentActor()]);
      return updated;
    });
  }

  const startProduction = (id) => advance(id, 'IN_PRODUCTION', '工厂已接单，进入生产');

  /**
   * 完工交货时把 VIN 写进车辆主档（vins）。
   * 8090 的整车序列号台账就靠这一步才有数据：只记在销售订单的文本字段上，库存中心永远看不到。
   * 仓库现货出库 → 实体仓在库(STOCK/可用)；工厂直发 → 虚拟仓待出库(VIRTUAL/预占)。
   */
  const readyToShip = async (id, body = {}) => {
    const raw=Array.isArray(body.vins)?body.vins:(body.vin?[body.vin]:[]),vins=raw.map(value=>text(value,60).toUpperCase());
    if(vins.some(vin=>!/^[A-Z0-9]{6,20}$/.test(vin))||new Set(vins).size!==vins.length)fail('VIN 列表格式无效或存在重复');
    const motorNo=text(body.motorNo,60),factoryCost=body.factoryCost===undefined?null:money(body.factoryCost);
    return tx('sales.order.ready_to_ship','sales/orders',async client=>{
      const order=(await client.query('SELECT * FROM sales_orders WHERE id::text=$1 OR order_no=$1 FOR UPDATE',[id])).rows[0];if(!order)fail('销售订单不存在',404);
      const warehousePick=order.fulfillment_type==='WAREHOUSE_PICK';
      if((warehousePick&&order.status!=='WAIT_WAREHOUSE_PICK')||(!warehousePick&&order.status!=='IN_PRODUCTION'))fail('当前订单不处于可登记 VIN 的履约阶段',409);
      if(vins.length!==Number(order.quantity))fail(`请登记完整的 ${order.quantity} 台 VIN`);
      const po=order.production_order_uuid?(await client.query('SELECT order_no,factory,batch FROM production_orders WHERE entity_uuid=$1',[order.production_order_uuid])).rows[0]:null;
      const assets=[];
      for(const [index,vin] of vins.entries()){
        const existing=(await client.query('SELECT id,entity_uuid AS "vinUuid",sku_code AS sku,asset_status AS "assetStatus",owner_state AS "ownerState",current_warehouse_uuid AS "warehouseUuid",sales_order_uuid AS "salesOrderUuid" FROM vins WHERE vin=$1 FOR UPDATE',[vin])).rows[0];
        if(warehousePick){
          if(!existing||existing.sku!==order.sku_code||existing.warehouseUuid!==order.warehouse_uuid||existing.assetStatus!=='可用'||existing.ownerState!=='STOCK'||existing.salesOrderUuid)fail(`VIN ${vin} 不属于该 SKU 的可用在库车辆`,409);
          await client.query("UPDATE vins SET asset_status='预占',sales_order_uuid=$1,asset_note=$2 WHERE entity_uuid=$3",[order.id,`B2B 订单 ${order.order_no} 库存预占`,existing.vinUuid]);
          await client.query("INSERT INTO vehicle_asset_ledger(event_key,vin_uuid,sku_uuid,to_warehouse_uuid,movement_type,source_type,source_id,occurred_at,actor,note,raw) VALUES($1,$2,$3,$4,'RESERVE','sales_order',$5,now(),$6,$7,$8)",[`${order.id}:reserve:${existing.vinUuid}`,existing.vinUuid,order.sku_uuid,order.warehouse_uuid,order.id,currentActor(),`订单 ${order.order_no} 现货预占`,JSON.stringify({vin})]);
          assets.push(existing);
        }else{
          if(existing)fail(`VIN ${vin} 已存在，不能覆盖其他车辆档案`,409);
          const inserted=(await client.query(`INSERT INTO vins(id,vin,model,sku_code,order_no,factory,batch,status,asset_status,owner_state,current_warehouse_uuid,sales_order_uuid,produced_at,asset_note)
            VALUES($1,$2,$3,$4,$5,$6,$7,'在用','预占','VIRTUAL',$8,$9,now(),$10) RETURNING id,entity_uuid AS "vinUuid",vin,sku_code AS sku,asset_status AS "assetStatus",owner_state AS "ownerState",current_warehouse_uuid AS "warehouseUuid",sales_order_uuid AS "salesOrderUuid"`,[
              uuidv7(),vin,order.product_name||'',order.sku_code,po?.order_no||order.order_no,po?.factory||'',po?.batch||order.order_no,order.warehouse_uuid||null,order.id,`销售订单 ${order.order_no} 完工交货`
            ])).rows[0];
          await client.query("INSERT INTO vehicle_asset_ledger(event_key,vin_uuid,sku_uuid,to_warehouse_uuid,movement_type,source_type,source_id,occurred_at,actor,note,raw) VALUES($1,$2,$3,$4,'VIRTUAL_IN','sales_order',$5,now(),$6,$7,$8)",[`${order.id}:virtual-in:${inserted.vinUuid}`,inserted.vinUuid,order.sku_uuid,order.warehouse_uuid||null,order.id,currentActor(),`订单 ${order.order_no} 工厂完工交货`,JSON.stringify({vin})]);
          assets.push(inserted);
        }
      }
      const cost=factoryCost===null?Number(order.factory_cost||0):factoryCost,totalCost=Math.round((cost+Number(order.freight_cost||0))*100)/100;
      const updated=(await client.query("UPDATE sales_orders SET status='READY_TO_SHIP',vin=$2,motor_no=$3,factory_cost=$4,total_cost=$5,ready_to_ship_at=now(),updated_at=now(),updated_by=$6 WHERE id=$1 RETURNING *",[order.id,vins[0],motorNo,cost,totalCost,currentActor()])).rows[0];
      await client.query('INSERT INTO sales_order_events(order_uuid,status,message,actor,payload) VALUES($1,$2,$3,$4,$5)',[order.id,'READY_TO_SHIP',`${warehousePick?'仓库拣货':'工厂完工交货'}，登记 ${vins.length} 台 VIN，等待出运`,currentActor(),JSON.stringify({vins})]);
      return updated;
    });
  };

  /** 出运：订单上落运单；有生产单时同步写生产发运单 + 包裹，物流跟踪页可直接看到 */
  async function ship(id, body = {}) {
    const carrier = text(body.carrier, 60);
    const trackingNo = text(body.trackingNo, 80);
    const etaDate = dateOnly(body.etaDate);
    const freightCost = money(body.freightCost || 0);
    if (!trackingNo) fail('请填写运单号');
    return tx('sales.order.ship', 'sales/orders', async (client) => {
      const order = (await client.query('SELECT * FROM sales_orders WHERE id::text=$1 OR order_no=$1 FOR UPDATE', [id])).rows[0];
      if (!order) fail('销售订单不存在', 404);
      if (order.status!=='READY_TO_SHIP') {
        fail(`订单当前为「${STATUS_LABEL[order.status]}」，不能出运`);
      }
      const assets=(await client.query("SELECT entity_uuid AS \"vinUuid\",vin,sku_code AS sku,asset_status AS \"assetStatus\",owner_state AS \"ownerState\",current_warehouse_uuid AS \"warehouseUuid\" FROM vins WHERE sales_order_uuid=$1 ORDER BY vin FOR UPDATE",[order.id])).rows;
      if(assets.length!==Number(order.quantity)||assets.some(asset=>asset.sku!==order.sku_code||asset.assetStatus!=='预占'||asset.ownerState!==(order.fulfillment_type==='WAREHOUSE_PICK'?'STOCK':'VIRTUAL')||(order.fulfillment_type==='WAREHOUSE_PICK'&&asset.warehouseUuid!==order.warehouse_uuid)))fail('VIN 资产归属或预占状态不完整，不能发运',409);
      if(!order.vin||!assets.some(asset=>asset.vin===order.vin))fail('销售订单 VIN 与车辆资产档案不一致',409);

      // 发运仓：优先订单落定的目标仓，否则取启用中的德国虚拟仓 → 常州仓
      const wh = (order.warehouse_uuid
        ? await client.query('SELECT id, entity_uuid, warehouse_code, name FROM warehouses WHERE entity_uuid=$1', [order.warehouse_uuid])
        : await client.query(
          `SELECT id, entity_uuid, warehouse_code, name FROM warehouses
            WHERE status='启用' ORDER BY array_position(ARRAY['DE-XNC','CN-CZ']::text[], warehouse_code) NULLS LAST LIMIT 1`,
        )).rows[0];
      if (!wh) fail('系统内没有启用中的仓库，无法登记发运');

      if(order.fulfillment_type==='WAREHOUSE_PICK'){
        const reservation=(await client.query("SELECT id,quantity,sku_uuid,warehouse_uuid,status FROM inventory_reservations WHERE source_type='b2b_sales_order' AND source_id=$1 FOR UPDATE",[order.id])).rows[0];
        if(!reservation||reservation.status!=='reserved'||Number(reservation.quantity)!==Number(order.quantity)||reservation.sku_uuid!==order.sku_uuid||reservation.warehouse_uuid!==order.warehouse_uuid)fail('B2B 现货预占记录无效或已变化，不能出库',409);
        const stock=(await client.query('SELECT quantity FROM warehouse_stock WHERE warehouse_uuid=$1 AND sku_uuid=$2 FOR UPDATE',[order.warehouse_uuid,order.sku_uuid])).rows[0];
        const ledger=Number((await client.query('SELECT COALESCE(sum(quantity_delta),0)::bigint AS quantity FROM inventory_ledger WHERE warehouse_uuid=$1 AND sku_uuid=$2',[order.warehouse_uuid,order.sku_uuid])).rows[0].quantity);
        if(!stock||Number(stock.quantity)!==ledger||ledger<Number(order.quantity))fail('库存账本与仓库余额不一致或库存不足，不能发运',409);
        const location=(await client.query("SELECT id FROM warehouse_locations WHERE warehouse_uuid=$1 AND status='启用' AND is_default FOR SHARE",[order.warehouse_uuid])).rows[0];
        if(!location)fail('发运仓没有启用的默认库位，不能发运',409);
        const available=Number((await client.query("SELECT COALESCE(sum(quantity_delta) FILTER(WHERE condition='available'),0)::bigint AS quantity FROM inventory_condition_ledger WHERE location_uuid=$1 AND sku_uuid=$2",[location.id,order.sku_uuid])).rows[0].quantity);
        if(available<Number(order.quantity))fail('默认库位可用库存不足，不能发运',409);
        await client.query('UPDATE warehouse_stock SET quantity=quantity-$1 WHERE warehouse_uuid=$2 AND sku_uuid=$3',[order.quantity,order.warehouse_uuid,order.sku_uuid]);
        const outboundId=uuidv7(),outboundNo=await nextOutboundNo(client);
        await client.query("INSERT INTO inventory_outbound_orders(id,outbound_no,source_type,source_ref,warehouse_id,location_uuid,status,ledger_source,note,created_by,confirmed_by,confirmed_at) VALUES($1,$2,'销售出库',$3,$4,$5,'已完成','outbound_order',$6,$7,$7,now())",[outboundId,outboundNo,`B2B 销售订单 ${order.order_no}`,wh.id,location.id,`B2B 销售发运自动生成出库单`,currentActor()]);
        await client.query('INSERT INTO inventory_outbound_items(id,outbound_id,sku_code,quantity) VALUES($1,$2,$3,$4)',[uuidv7(),outboundId,order.sku_code,Number(order.quantity)]);
        await client.query("INSERT INTO inventory_ledger(source_type,source_id,line_no,sku_uuid,warehouse_id,warehouse_uuid,quantity_delta) VALUES('outbound_order',$1,1,$2,$3,$4,$5)",[outboundId,order.sku_uuid,wh.id,order.warehouse_uuid,-Number(order.quantity)]);
        await client.query("UPDATE inventory_reservations SET status='consumed',consumed_by=$2,consumed_at=now() WHERE id=$1 AND status='reserved'",[reservation.id,currentActor()]);
      }

      let delivery = null;
      {
        const po = order.production_order_uuid ? (await client.query('SELECT id FROM production_orders WHERE entity_uuid=$1', [order.production_order_uuid])).rows[0] : null;
        const deliveryId = uuidv7();
        const shipmentNo = `${order.order_no}-D1`;
        const sourceType='sales_order';
        delivery = (await client.query(
          `INSERT INTO production_deliveries
             (id, entity_uuid, order_id, order_uuid, sales_order_uuid, shipment_no, warehouse_id, warehouse_uuid,
              planned_quantity, status, carrier, tracking_no, shipped_at, eta_date, freight_cost,
              source_type, recipient_type, recipient_id, delivery_method, ship_to_snapshot, note)
           VALUES ($1::text,$1::uuid,$2,$3,$4,$5,$6,$7,$8,'在途',$9,$10,now(),$11,$12,
                   $13,'客户',$14,$15,$16,$17)
           RETURNING id, entity_uuid, shipment_no`,
          [
            deliveryId, po?.id || null, po ? order.production_order_uuid : null, po ? null : order.id,
            shipmentNo, wh.id, wh.entity_uuid, order.quantity, carrier, trackingNo, etaDate, freightCost,sourceType,
            order.customer_id || '',order.fulfillment_type==='WAREHOUSE_PICK'?'物流':'工厂直发',
            JSON.stringify({ name: order.consignee_name, country: order.consignee_country, address: order.consignee_address, phone: order.consignee_phone }),
            `销售订单 ${order.order_no} 出运`,
          ],
        )).rows[0];

        const parcelId = uuidv7();
        await client.query(
          `INSERT INTO delivery_parcels(id, parcel_no, delivery_id, component_type, quantity, carrier, tracking_no, status, dispatched_at, eta, note)
           VALUES ($1,$2,$3,'车体',$4,$5,$6,'已交运',now(),$7,$8)`,
          [parcelId, `${shipmentNo}-P1`, delivery.id, order.quantity, carrier, trackingNo, etaDate, carrier ? `${carrier} 运单` : ''],
        );
        // 首个物流事件：已揽收。tracking_events 由 package_id 挂到包裹上。
        await client.query(
          `INSERT INTO tracking_events(package_id, tracking_no, event_time, status, location, source, actor, note)
           VALUES ($1,$2,now(),'已揽收','','手工',$3,$4)`,
          [parcelId, trackingNo, currentActor(), `${carrier || '承运商'} ${trackingNo} 已揽收`],
        );
      }

      // 整车资产从"虚拟仓待出库"转"国际在途"
      await client.query(
        "UPDATE vins SET owner_state='IN_TRANSIT', asset_status='已出库', current_warehouse_uuid=NULL, shipped_at=now() WHERE sales_order_uuid=$1",
        [order.id],
      );
      for(const asset of assets)await client.query("INSERT INTO vehicle_asset_ledger(event_key,vin_uuid,sku_uuid,from_warehouse_uuid,movement_type,source_type,source_id,occurred_at,actor,note,raw) VALUES($1,$2,$3,$4,$5,'sales_order',$6,now(),$7,$8,$9)",[`${order.id}:ship:${asset.vinUuid}`,asset.vinUuid,order.sku_uuid,order.warehouse_uuid,order.fulfillment_type==='WAREHOUSE_PICK'?'PHYSICAL_OUT':'VIRTUAL_OUT',order.id,currentActor(),`订单 ${order.order_no} 发运`,JSON.stringify({vin:asset.vin})]);

      const totalCost = Math.round((Number(order.factory_cost || 0) + freightCost) * 100) / 100;
      const updated = (await client.query(
        `UPDATE sales_orders
            SET status='IN_TRANSIT', shipped_at=now(), updated_at=now(), updated_by=$2,
                delivery_uuid=$3, freight_cost=$4, total_cost=$5,
                carrier=$6, tracking_no=$7, eta_date=$8, warehouse_uuid=COALESCE(warehouse_uuid,$9)
          WHERE id=$1 RETURNING *`,
        [order.id, currentActor(), delivery ? delivery.entity_uuid : null, freightCost, totalCost, carrier, trackingNo, etaDate, wh.entity_uuid],
      )).rows[0];
      await client.query(
        'INSERT INTO sales_order_events(order_uuid,status,message,actor,payload) VALUES($1,$2,$3,$4,$5)',
        [order.id, 'IN_TRANSIT', `${carrier || '承运商'} ${trackingNo} 已揽收，订单转国际在途`, currentActor(), JSON.stringify({ deliveryNo: delivery ? delivery.shipment_no : null, trackingNo, eta: etaDate })],
      );
      return { order: updated, delivery };
    });
  }

  async function deliver(id) {
    return tx('sales.order.deliver', 'sales/orders', async (client) => {
      const order = (await client.query('SELECT * FROM sales_orders WHERE id::text=$1 OR order_no=$1 FOR UPDATE', [id])).rows[0];
      if (!order) fail('销售订单不存在', 404);
      if (order.status !== 'IN_TRANSIT') fail(`订单当前为「${STATUS_LABEL[order.status]}」，只有国际在途可登记妥投`);
      if (order.delivery_uuid) {
        await client.query("UPDATE delivery_parcels SET status='已签收', delivered_at=now() WHERE delivery_id=$1 AND status<>'已签收'", [order.delivery_uuid]);
        await client.query("UPDATE production_deliveries SET status='已签收', received_at=now(), received_quantity=planned_quantity WHERE entity_uuid=$1", [order.delivery_uuid]);
        await client.query(
          `INSERT INTO tracking_events(package_id, tracking_no, event_time, status, location, source, actor, note)
           SELECT p.id, COALESCE(NULLIF(p.tracking_no,''),''), now(), '已签收', '', '手工', $2, '客户签收'
             FROM delivery_parcels p WHERE p.delivery_id=$1`,
          [order.delivery_uuid, currentActor()],
        );
      }
      // 整车资产转"买方持有"
      await client.query(
        "UPDATE vins SET owner_state='CUSTOMER', delivered_at=now() WHERE sales_order_uuid=$1",
        [order.id],
      );
      const updated = (await client.query(
        "UPDATE sales_orders SET status='DELIVERED', delivered_at=now(), completed_at=now(), updated_at=now(), updated_by=$2 WHERE id=$1 RETURNING *",
        [order.id, currentActor()],
      )).rows[0];
      await client.query(
        'INSERT INTO sales_order_events(order_uuid,status,message,actor) VALUES($1,$2,$3,$4)',
        [order.id, 'DELIVERED', '客户签收，订单结案', currentActor()],
      );
      return updated;
    });
  }

  async function cancel(id, body = {}) {
    const reason = text(body.reason, 200) || '人工取消';
    return tx('sales.order.cancel', 'sales/orders', async (client) => {
      const order = (await client.query('SELECT * FROM sales_orders WHERE id::text=$1 OR order_no=$1 FOR UPDATE', [id])).rows[0];
      if (!order) fail('销售订单不存在', 404);
      if (['IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED'].includes(order.status)) {
        fail(`订单当前为「${STATUS_LABEL[order.status]}」，不可取消`);
      }
      if (order.production_order_uuid) {
        await client.query("UPDATE production_orders SET status='已取消', updated_at=now() WHERE entity_uuid=$1 AND status IN ('计划中','待工厂确认')", [order.production_order_uuid]);
      }
      if(order.fulfillment_type==='WAREHOUSE_PICK'){
        const reservation=(await client.query("SELECT id FROM inventory_reservations WHERE source_type='b2b_sales_order' AND source_id=$1 AND status='reserved' FOR UPDATE",[order.id])).rows[0];
        if(!reservation)fail('B2B 现货预占记录缺失，不能取消订单',409);
        await client.query("UPDATE inventory_reservations SET status='released',released_by=$2,released_at=now() WHERE id=$1",[reservation.id,currentActor()]);
      }
      const assets=(await client.query("SELECT entity_uuid,vin,owner_state FROM vins WHERE sales_order_uuid=$1 AND asset_status='预占' FOR UPDATE",[order.id])).rows;
      for(const asset of assets){
        const physical=asset.owner_state==='STOCK',nextAssetStatus=physical?'可用':'冻结';
        await client.query("UPDATE vins SET asset_status=$2,sales_order_uuid=NULL,asset_note=$3 WHERE entity_uuid=$1",[asset.entity_uuid,nextAssetStatus,`B2B 订单 ${order.order_no} 已取消，释放车辆预占`]);
        await client.query("INSERT INTO vehicle_asset_ledger(event_key,vin_uuid,sku_uuid,from_warehouse_uuid,movement_type,source_type,source_id,occurred_at,actor,note,raw) VALUES($1,$2,$3,$4,'RELEASE','sales_order',$5,now(),$6,$7,$8)",[`${order.id}:release:${asset.entity_uuid}`,asset.entity_uuid,order.sku_uuid,order.warehouse_uuid,order.id,currentActor(),`订单 ${order.order_no} 取消，释放 VIN 预占`,JSON.stringify({vin:asset.vin,previousOwnerState:asset.owner_state,resultingAssetStatus:nextAssetStatus})]);
      }
      const updated = (await client.query(
        "UPDATE sales_orders SET status='CANCELLED', cancelled_at=now(), cancel_reason=$2, updated_at=now(), updated_by=$3 WHERE id=$1 RETURNING *",
        [order.id, reason, currentActor()],
      )).rows[0];
      await client.query(
        'INSERT INTO sales_order_events(order_uuid,status,message,actor) VALUES($1,$2,$3,$4)',
        [order.id, 'CANCELLED', `订单取消：${reason}`, currentActor()],
      );
      return updated;
    });
  }

  /**
   * 批量操作（8090 的「多选改交期 / 批量出运」）。
   * 逐单独立事务：单笔失败不连累其他单，回传每单原因。
   */
  async function bulk(action, ids, payload = {}) {
    const list = Array.isArray(ids) ? [...new Set(ids.map((v) => text(String(v), 64)).filter(Boolean))] : [];
    if (!list.length) fail('请先选择要操作的订单');
    if (list.length > 100) fail('单次最多批量操作 100 单');
    const succeeded = [];
    const failed = [];
    for (const id of list) {
      try {
        if (action === 'due') {
          const dueDate = dateOnly(payload.dueDate);
          if (!dueDate) fail('请填写新的交期');
          const patch = await tx('sales.order.bulk.due', `sales/orders/${id}`, async (client) => {
            const order = (await client.query('SELECT * FROM sales_orders WHERE id::text=$1 OR order_no=$1 FOR UPDATE', [id])).rows[0];
            if (!order) fail('销售订单不存在', 404);
            if (['IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED'].includes(order.status)) fail(`「${STATUS_LABEL[order.status]}」不可改交期`);
            const updated = (await client.query(
              'UPDATE sales_orders SET due_date=$2, updated_at=now(), updated_by=$3 WHERE id=$1 RETURNING *',
              [order.id, dueDate, currentActor()],
            )).rows[0];
            if (order.production_order_uuid) {
              await client.query(
                'UPDATE production_orders SET expected_delivery_date=$2, updated_at=now() WHERE entity_uuid=$1',
                [order.production_order_uuid, dueDate],
              );
            }
            await client.query(
              'INSERT INTO sales_order_events(order_uuid,status,message,actor) VALUES($1,$2,$3,$4)',
              [order.id, order.status, `批量调整交期：${order.due_date ? String(order.due_date).slice(0, 10) : '未设'} → ${dueDate}`, currentActor()],
            );
            return updated;
          });
          succeeded.push({ id: patch.id, orderNo: patch.order_no, dueDate });
        } else if (action === 'ship') {
          const conf = Array.isArray(payload.shipments) ? payload.shipments : [];
          const mine = conf.find((row) => String(row.id) === id || String(row.orderNo) === id) || {};
          const trackingNo = text(mine.trackingNo, 80);
          if (!trackingNo) fail('该单未填写运单号，已跳过');
          const result = await ship(id, { carrier: mine.carrier || payload.carrier, trackingNo, etaDate: mine.etaDate || payload.etaDate, freightCost: mine.freightCost || payload.freightCost });
          succeeded.push({ id: result.order.id, orderNo: result.order.order_no, trackingNo });
        } else {
          fail(`不支持的批量动作：${action}`);
        }
      } catch (error) {
        failed.push({ id, reason: error.message || '操作失败' });
      }
    }
    return { action, total: list.length, successCount: succeeded.length, failCount: failed.length, succeeded, failed };
  }

  /** 物流事件流：读 tracking_events（迁移 153 建表，此前无任何读写代码） */
  async function listEvents({ deliveryUuid = '', orderUuid = '', trackingNo = '', limit = 200 } = {}) {
    const args = [];
    const where = [];
    if (text(deliveryUuid, 64)) { args.push(text(deliveryUuid, 64)); where.push(`p.delivery_id = $${args.length}`); }
    if (text(orderUuid, 64)) {
      // sales_orders.id 是 uuid 列，但调用方（前端 / 外部脚本）经常直接传订单号。
      // 早前这里写 `id = $n::uuid`，传订单号时会在库层报 invalid input syntax → 整个接口 500。
      // 现在统一按文本匹配 id 或 order_no 两种入参。
      args.push(text(orderUuid, 64));
      where.push(`(p.delivery_id = (SELECT delivery_uuid::text FROM sales_orders WHERE id::text = $${args.length} OR order_no = $${args.length})
                   OR d.order_uuid = (SELECT production_order_uuid FROM sales_orders WHERE id::text = $${args.length} OR order_no = $${args.length}))`);
    }
    if (text(trackingNo, 120)) { args.push(text(trackingNo, 120)); where.push(`e.tracking_no = $${args.length}`); }
    const sql = `
      SELECT e.id, e.package_id, e.tracking_no, e.event_time, e.received_at, e.status, e.status_code,
             e.location, e.source, e.actor, e.note, e.created_at,
             p.parcel_no, p.delivery_id, p.component_type
        FROM tracking_events e
        JOIN delivery_parcels p ON p.id = e.package_id
        LEFT JOIN production_deliveries d ON d.id = p.delivery_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY e.event_time DESC, e.created_at DESC
       LIMIT ${Math.min(Number(limit) || 200, 500)}`;
    return (await pool.query(sql, args)).rows;
  }

  /** 手工登记一条物流事件 */
  async function addEvent(body = {}) {
    const deliveryUuid = text(body.deliveryUuid, 64);
    const parcelId = text(body.parcelId, 64);
    const trackingNo = text(body.trackingNo, 120);
    const status = text(body.status, 120);
    const source = ['手工', 'DHL', '货代', '其他'].includes(text(body.source, 8)) ? text(body.source, 8) : '手工';
    if (!status) fail('请填写事件状态，例如「已到港」「清关中」');
    if (!deliveryUuid && !parcelId) fail('请指定发运单或包裹');
    return tx('tracking.event.add', 'tracking_events', async (client) => {
      let targetParcel = parcelId;
      if (!targetParcel) {
        targetParcel = (await client.query(
          'SELECT id FROM delivery_parcels WHERE delivery_id=$1 ORDER BY created_at LIMIT 1',
          [deliveryUuid],
        )).rows[0]?.id;
      }
      if (!targetParcel) fail('该发运单还没有包裹，无法登记事件', 404);
      const eventAt = body.eventTime ? new Date(body.eventTime) : new Date();
      if (Number.isNaN(eventAt.getTime())) fail('事件时间无效');
      return (await client.query(
        `INSERT INTO tracking_events(package_id, tracking_no, event_time, status, status_code, location, source, actor, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [targetParcel, trackingNo, eventAt, status, text(body.statusCode, 60), text(body.location, 300), source, currentActor(), text(body.note, 1000)],
      )).rows[0];
    });
  }

  /** 整车资产归属四态台账（对应 8090 的序列号台账） */
  async function assetLedger({ owner = '', q = '' } = {}) {
    const args = [];
    const where = [];
    const ownerKey = text(owner, 16).toUpperCase();
    if (ownerKey && ASSET_OWNER[ownerKey]) { args.push(ownerKey); where.push(`v.owner_state = $${args.length}`); }
    const needle = text(q, 80).toLowerCase();
    if (needle) {
      args.push(`%${needle}%`);
      where.push(`(lower(v.vin) LIKE $${args.length} OR lower(v.sku_code) LIKE $${args.length}
        OR lower(v.order_no) LIKE $${args.length} OR lower(COALESCE(o.order_no,'')) LIKE $${args.length}
        OR lower(COALESCE(o.customer_name,'')) LIKE $${args.length})`);
    }
    const rows = (await pool.query(
      `SELECT v.id, v.vin, v.model, v.sku_code, v.order_no, v.factory, v.batch, v.status,
              v.asset_status, v.owner_state, v.asset_note, v.produced_at, v.shipped_at, v.delivered_at, v.created_at,
              w.name AS warehouse_name, w.warehouse_code,
              o.id AS sales_order_id, o.order_no AS sales_order_no, o.customer_name, o.consignee_country,
              o.currency, o.sale_amount, o.tracking_no, o.motor_no, o.factory_cost, o.freight_cost, o.total_cost
         FROM vins v
         LEFT JOIN warehouses w ON w.entity_uuid = v.current_warehouse_uuid
         LEFT JOIN sales_orders o ON o.id = v.sales_order_uuid
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY v.created_at DESC LIMIT 500`,
      args,
    )).rows;
    // 8090 的「整车序列号」台账成本以 CNY 展示；8089 成本按订单币种存两位小数，这里折回 CNY。
    // 8090 记的是整元，折算后会有几分钱舍入差（955.41 × 7.85 = 7499.97），贴近整元时归位，避免与 8090 对不上。
    const toCny = (value, currency) => {
      const rounded = Math.round(Number(value || 0) * (FX_TO_CNY[currency] || 1) * 100) / 100;
      return Math.abs(rounded - Math.round(rounded)) < 0.05 ? Math.round(rounded) : rounded;
    };
    const enriched = rows.map(row => {
      const factoryCostCny = toCny(row.factory_cost, row.currency);
      const freightCostCny = toCny(row.freight_cost, row.currency);
      const since = row.produced_at || row.created_at;
      return {
        ...row,
        motor_number: row.motor_no || '',
        factory_cost_cny: factoryCostCny,
        freight_cost_cny: freightCostCny,
        landed_cost_cny: Math.round((factoryCostCny + freightCostCny) * 100) / 100,
        total_cost_cny: toCny(row.total_cost, row.currency),
        in_stock_days: since ? Math.max(0, Math.round((Date.now() - new Date(since).getTime()) / 86400000)) : null
      };
    });
    const counts = {};
    for (const key of Object.keys(ASSET_OWNER)) counts[key] = 0;
    for (const row of enriched) counts[row.owner_state] = (counts[row.owner_state] || 0) + 1;
    const held = enriched.filter(row => row.owner_state !== 'CUSTOMER');
    const totalLandedCost = Math.round(enriched.reduce((s, r) => s + r.landed_cost_cny, 0) * 100) / 100;
    return {
      rows: enriched, counts, labels: ASSET_OWNER,
      summary: {
        total: enriched.length,
        heldUnits: held.length,
        heldLandedCost: Math.round(held.reduce((s, r) => s + r.landed_cost_cny, 0) * 100) / 100,
        totalLandedCost,
        avgLandedCost: enriched.length ? Math.round(totalLandedCost / enriched.length * 100) / 100 : 0,
        skuCount: new Set(enriched.map(r => r.sku_code)).size,
        batchCount: new Set(enriched.map(r => r.batch).filter(Boolean)).size
      }
    };
  }

  /** 新建订单表单所需的参考数据 */
  async function formOptions() {
    const [customers, skus, warehouses] = await Promise.all([
      pool.query("SELECT id, code, name, country, address, phone, email, currency FROM customers WHERE COALESCE(is_b2b, true) ORDER BY code"),
      pool.query(`SELECT sku.code, sku.entity_uuid, sku.price, COALESCE(p.name,'') AS product_name
                    FROM skus sku LEFT JOIN products p ON p.id = sku.product_id
                   WHERE COALESCE(sku.disabled,false) = false ORDER BY sku.code`),
      pool.query("SELECT entity_uuid, warehouse_code, name, COALESCE(warehouse_purpose,'') AS purpose FROM warehouses WHERE status <> '停用' ORDER BY warehouse_code"),
    ]);
    return { customers: customers.rows, skus: skus.rows, warehouses: warehouses.rows, warehouses_for_pick: PICK_WAREHOUSE_CODES };
  }

  return { list, summary, tracking, detail, create, startProduction, readyToShip, ship, deliver, cancel, bulk, listEvents, addEvent, assetLedger, formOptions };
}

function registerSalesOrderRoutes(app, store) {
  const route = (method, url, action, { write = false } = {}) =>
    app.route({
      method,
      url,
      handler: async (req, reply) => {
        if (write && req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可操作销售订单' });
        if (!store) return reply.code(503).send({ error: '销售订单服务暂不可用' });
        try {
          return await action(req, reply);
        } catch (e) {
          if (e.statusCode) return reply.code(e.statusCode).send({ error: /[\u4e00-\u9fa5]/.test(e.message || '') ? e.message : '销售订单操作失败' });
          req.log.error({ err: e, url: req.url }, 'sales order failed');
          return reply.code(500).send({ error: '销售订单操作失败' });
        }
      },
    });

  route('GET', '/api/sales-orders', (req) => store.list({ status: req.query.status, q: req.query.q }));
  route('GET', '/api/sales-orders/summary', () => store.summary());
  route('GET', '/api/sales-orders/options', () => store.formOptions());
  route('GET', '/api/sales-orders/tracking', (req) => store.tracking({ q: req.query.q }));
  route('GET', '/api/sales-orders/assets', (req) => store.assetLedger({ owner: req.query.owner, q: req.query.q }));
  route('GET', '/api/sales-orders/tracking-events', (req) => store.listEvents({
    deliveryUuid: req.query.delivery,
    orderUuid: req.query.order,
    trackingNo: req.query.trackingNo,
  }));
  route('POST', '/api/sales-orders/tracking-events', (req, reply) => store.addEvent(req.body || {}).then((row) => reply.code(201).send(row)), { write: true });
  route('POST', '/api/sales-orders/bulk', (req) => store.bulk(req.body?.action, req.body?.ids, req.body || {}), { write: true });
  route('GET', '/api/sales-orders/:id', (req) => store.detail(req.params.id));
  route('POST', '/api/sales-orders', (req, reply) => store.create(req.body || {}).then((row) => reply.code(201).send(row)), { write: true });
  route('POST', '/api/sales-orders/:id/start', (req) => store.startProduction(req.params.id), { write: true });
  route('POST', '/api/sales-orders/:id/ready', (req) => store.readyToShip(req.params.id, req.body || {}), { write: true });
  route('POST', '/api/sales-orders/:id/ship', (req) => store.ship(req.params.id, req.body || {}), { write: true });
  route('POST', '/api/sales-orders/:id/deliver', (req) => store.deliver(req.params.id), { write: true });
  route('POST', '/api/sales-orders/:id/cancel', (req) => store.cancel(req.params.id, req.body || {}), { write: true });
}

module.exports = { createSalesOrderStore, registerSalesOrderRoutes, STATUS_LABEL };
