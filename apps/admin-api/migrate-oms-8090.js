#!/usr/bin/env node
/**
 * 把 8090（ALSVID OMS，JSON 数据）的业务数据迁进 8089（ALSVID V2，Postgres）。
 *
 * 背景：把 8090 的能力重建到 8089 时只搬了功能，数据一条没搬，所以 8089 打开是空页面。
 * 这个脚本把订单中心 / 生产交付 / 库存资产 / 财务对账 四个维度的事实数据导过来。
 *
 * 用法：
 *   node migrate-oms-8090.js            # 预演，只打印将要做什么，不写库
 *   node migrate-oms-8090.js --apply    # 真正写入
 *
 * 幂等：按业务编号判重（订单号 / 生产单号 / VIN / 应付款编号），重复执行不会产生重复数据。
 * 安全：finance_obligations 是 append-only（有触发器禁止 UPDATE/DELETE），所以务必先预演。
 */
const fs = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { uuidv7 } = require('./uuidv7');

const SOURCE = process.env.OMS_SOURCE || path.join(process.env.HOME, 'Projects/alsvid-oms/data/oms.json');
const SECRET = process.env.ALSVID_SECRET_FILE || '/tmp/alsvid-secret.json';
const APPLY = process.argv.includes('--apply');

// 8090 的生产单状态 → 8089 的 CHECK 允许值
const PO_STATUS = { PENDING: '计划中', IN_PRODUCTION: '生产中', ARCHIVED: '已完成', COMPLETED: '已完成', READY: '待发货', CANCELLED: '已取消' };
// 8090 的资产归属 → 8089 的四态
const OWNER_STATE = { WAREHOUSE: 'STOCK', STOCK: 'STOCK', IN_TRANSIT: 'IN_TRANSIT', CUSTOMER: 'CUSTOMER' };
const ASSET_STATUS = { STOCK: '可用', VIRTUAL: '预占', IN_TRANSIT: '已出库', CUSTOMER: '已出库' };
// 8090 的 4 个车型在 8089 主档里必须各有独立 SKU：并到同一个 SKU 会让库存互相覆盖、
// 单据显示错车型（曾经把 C2 并进 A1，导致 C2 的 3 台库存丢失）。
// SKU 编码遵循 server/sku-code.js 的四段规则：[车型 2-3 位]-[配置 3 位]-[颜色 3 位]-[法规 3 位]。
// production_orders/vins 上有 sync_identity_uuid 触发器，sku_code 必须在 skus 表里存在，否则 23503 拒绝。
// 原始车型名称照旧写进 product_name，界面上看到的还是原样。
// 8090 的成本记的是 CNY，而 sales_orders 的 factory_cost/freight_cost/total_cost 按「订单币种」记录
// （毛利汇总里 costCny = total_cost × 订单汇率）。不折算会让 EUR 订单的毛利变成 -300%。
const FX_TO_CNY = { CNY: 1, EUR: 7.85, USD: 7.2 };
const costInOrderCurrency = (cnyAmount, currency) => Number(cnyAmount || 0) / (FX_TO_CNY[currency] || 1);
const SKU_MAP = { 'ALSVID-A1U': 'A1-ULT-GRY-EUR', 'ALSVID-A1': 'A1-STD-PUR-EUR', 'ALSVID-C2': 'C2-STD-STD-EUR', 'ALSVID-BAT36': 'UN-BAT-36S-BLK' };
const skuOf = (code) => SKU_MAP[code] || code;
// 8090 的仓库编码 → 8089 的 warehouse_code。8090 有 DE-FC1 / VIRTUAL-CN / CN-CZ，
// 8089 只有 CN-CZ（华东-常州仓）和 DE-XNC（德国综合虚拟仓），按用途就近归并。
const WAREHOUSE_MAP = { 'DE-FC1': 'DE-XNC', 'VIRTUAL-CN': 'CN-CZ', 'CN-CZ': 'CN-CZ' };
// 8090 里叫「常州车业」，8089 的主档是「常州耐驰车业有限公司」（同一家）。天津富士达是另一家，单独建档。
const PARTNER_ALIAS = { 常州车业: '常州耐驰车业有限公司' };
const FACTORY_ALIAS = { 常州车业: '常州耐驰车业有限公司' };

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(6) : '0.000000';
};
const day = (value) => (value ? String(value).slice(0, 10) : null);
const stamp = (value) => (value ? new Date(value) : null);

async function main() {
  const raw = JSON.parse(fs.readFileSync(SOURCE, 'utf8'));
  const secret = JSON.parse(fs.readFileSync(SECRET, 'utf8'));
  const client = new Client({ connectionString: secret.DATABASE_URL.replace('-pooler', ''), ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query('SET search_path TO alsvid_v2');

  const stat = { customers: 0, orders: 0, production: 0, vins: 0, finance: 0, skipped: 0, linked: 0 };
  const log = (...args) => console.log(...args);

  const customers = (await client.query('SELECT id::text, name FROM customers')).rows;
  const customerByName = new Map(customers.map((r) => [r.name, r.id]));

  await client.query('BEGIN');

  // ---------- 0. 车型主档（products / skus）----------
  // 必须最先跑：生产单 / VIN / 库存 / 销售单的 sku_code 都有 sync_identity_uuid 触发器，
  // SKU 不在 skus 表里会直接 23503 拒绝。8090 的 4 个车型要各有独立 SKU，不能并档。
  // 已有车型（A1U/A1/BAT36）8089 自己维护了更详细的实测规格，绝不覆盖；
  // 只把 8090 的成本/售价/重量口径挂到 specs._legacy8090 下备查。
  const legacyProducts = new Map((raw.products || []).map((p) => [p.sku, p]));
  const LEGACY_KEYS = new Set(Object.keys(SKU_MAP));
  const c2Legacy = legacyProducts.get('ALSVID-C2');
  const C2_SKU = SKU_MAP['ALSVID-C2'];
  const legacyPayload = (src) => ({
    unit_cost_cny: num(src.unitCost) ?? null,
    retail_price: num(src.price) ?? null,
    weight_kg: num(src.weight) ?? null,
    battery_weight_kg: num(src.batteryWeight) ?? null,
    spec_text: src.spec || '',
    default_factory: FACTORY_ALIAS[src.defaultFactory] || src.defaultFactory || '',
    category: src.category || '',
    source: '8090 OMS',
    migrated_at: '2026-11-18',
  });

  if (!(await client.query('SELECT 1 FROM skus WHERE code=$1', [C2_SKU])).rowCount) {
    log(`  + 车型 ${C2_SKU}（${c2Legacy?.name || 'ALSVID C2 城市通勤电助力车'}）`);
    if (APPLY) {
      const color = (await client.query("SELECT entity_uuid::text FROM colors WHERE code='STD'")).rows[0];
      if (!color) throw new Error('colors 表缺少 STD 标准色，无法建 C2 的 SKU');
      const productId = uuidv7();
      const product = (await client.query(
        `INSERT INTO products(id,kind,name,model,product_type,status,ownership,uses,specs,platform)
         VALUES($1,'vehicle',$2,'C2','EBI','启用','C2',$3::jsonb,$4::jsonb,'FC')
         RETURNING entity_uuid::text`,
        [productId, c2Legacy?.name || 'ALSVID C2 城市通勤电助力车', JSON.stringify(['日常通勤']),
          JSON.stringify({
            // 只写 8090 主档里明确有的信息，不猜功率 / 续航
            frame_material: '铝合金车架',
            electrical_voltage: '36',
            _dataNotes: ['规格、成本、售价来自 8090 OMS 车型主档（2026-11-18 迁移），未经官网或供应商核对；额定功率与续航 8090 未记录，故留空待补。'],
            _legacy8090: c2Legacy ? legacyPayload(c2Legacy) : null,
          })]
      )).rows[0];
      await client.query(
        `INSERT INTO skus(code,product_id,spec,color_code,price,note,product_uuid,color_uuid,region_code)
         VALUES($1,$2,'STD','STD',$3,'8090 OMS 迁移', $4::uuid,$5::uuid,'EUR')`,
        [C2_SKU, productId, c2Legacy?.price ?? null, product.entity_uuid, color.entity_uuid]
      );
    }
    stat.products = (stat.products || 0) + 1;
  }

  for (const [legacyCode, skuCode] of Object.entries(SKU_MAP)) {
    const src = legacyProducts.get(legacyCode);
    if (!src || !LEGACY_KEYS.has(legacyCode)) continue;
    const target = (await client.query(
      `SELECT p.id FROM skus s JOIN products p ON p.id = s.product_id WHERE s.code = $1`, [skuCode]
    )).rows[0];
    if (!target) { log(`  ! 车型 ${skuCode} 不在产品主档，跳过口径补写`); continue; }
    const payload = legacyPayload(src);
    if (APPLY) {
      const r = await client.query(
        `UPDATE products SET specs = specs || jsonb_build_object('_legacy8090', $2::jsonb), updated_at = now()
          WHERE id = $1 AND specs->'_legacy8090' IS DISTINCT FROM $2::jsonb`,
        [target.id, JSON.stringify(payload)]
      );
      if (r.rowCount) { log(`  ~ 车型口径 ${skuCode} ← 成本 ¥${payload.unit_cost_cny} / 售价 ${payload.retail_price}`); stat.productSpecs = (stat.productSpecs || 0) + 1; }
    } else if (!(await client.query(`SELECT 1 FROM products WHERE id=$1 AND specs->'_legacy8090' IS DISTINCT FROM $2::jsonb`, [target.id, JSON.stringify(payload)])).rowCount) {
      // 预演：无需变更
    } else {
      log(`  ~ 车型口径 ${skuCode} ← 成本 ¥${payload.unit_cost_cny} / 售价 ${payload.retail_price}`);
      stat.productSpecs = (stat.productSpecs || 0) + 1;
    }
  }

  // ---------- 1. 客户：按名称对齐，缺的补建 ----------
  for (const c of raw.customers || []) {
    if (customerByName.has(c.name)) continue;
    const id = uuidv7();
    log(`  + 客户 ${c.code} ${c.name}`);
    if (APPLY) {
      await client.query(
        `INSERT INTO customers(id,name,code,is_b2b,type,level,currency,country,country_cn,address,contact,phone,email,revision)
         VALUES($1,$2,$3,true,$4,$5,$6,$7,$8,$9,$10,$11,$12,1)`,
        [id, c.name, c.code || '', c.type || 'B2B 经销商', c.level || 'B', c.currency || 'EUR',
          c.country || '', c.countryCn || '', c.address || '', c.contact || '', c.phone || '', c.email || '']
      );
    }
    customerByName.set(c.name, id);
    stat.customers += 1;
  }

  // ---------- 2. 销售订单 ----------
  const existingOrders = new Map((await client.query('SELECT order_no, id::text FROM sales_orders')).rows.map((r) => [r.order_no, r.id]));
  const assetsByOrder = new Map();
  for (const a of raw.vehicle_assets || []) if (a.salesOrderId) assetsByOrder.set(a.salesOrderId, a);
  const shipmentsByOrder = new Map();
  for (const s of raw.shipments || []) {
    if (!shipmentsByOrder.has(s.orderId)) shipmentsByOrder.set(s.orderId, []);
    shipmentsByOrder.get(s.orderId).push(s);
  }

  for (const o of raw.sales_orders || []) {
    const asset = assetsByOrder.get(o.id) || {};
    if (existingOrders.has(o.orderNo)) {
      // 已存在：只校正成本币种（本迁移早期版本把 CNY 成本直接写进了订单币种字段）
      if (APPLY) {
        await client.query(
          `UPDATE sales_orders SET factory_cost=$1, freight_cost=$2, total_cost=$3, updated_at=now()
            WHERE order_no=$4 AND created_by='legacy-8090'`,
          [num(costInOrderCurrency(asset.factoryCost, o.currency)),
            num(costInOrderCurrency(asset.freightCost, o.currency)),
            num(costInOrderCurrency(asset.totalCost, o.currency)), o.orderNo]
        );
      }
      stat.skipped += 1; log(`  ~ 已存在订单 ${o.orderNo}：校正成本币种`); continue;
    }
    const packs = shipmentsByOrder.get(o.id) || [];
    const firstPack = packs[0] || {};
    const id = uuidv7();
    log(`  + 订单 ${o.orderNo} ${o.status} ${o.currency} ${o.saleAmount}`);
    if (APPLY) {
      await client.query(
        `INSERT INTO sales_orders(
           id,order_no,channel,customer_id,customer_name,consignee_name,consignee_country,consignee_address,
           consignee_phone,consignee_email,sku_code,product_name,quantity,unit_price,currency,sale_amount,
           fulfillment_type,fulfillment_reason,status,due_date,vin,motor_no,carrier,tracking_no,
           factory_cost,freight_cost,total_cost,note,created_by,updated_by,
           created_at,shipped_at,delivered_at,completed_at)
         VALUES($1,$2,'B2B',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,
                $24,$25,$26,$27,'legacy-8090','legacy-8090',$28,$29,$30,$31)`,
        [id, o.orderNo, customerByName.get(o.customerName) || null, o.customerName || '',
          o.consigneeName || '', o.consigneeCountry || '', o.consigneeAddress || '',
          o.consigneePhone || '', o.consigneeEmail || '', skuOf(o.productSku), o.productName || '',
          Number(o.qty) || 1, num(o.unitPrice), o.currency || 'EUR', num(o.saleAmount),
          o.fulfillmentType === 'WAREHOUSE_PICK' ? 'WAREHOUSE_PICK' : 'FACTORY_DROPSHIP',
          o.fulfillmentReason || '', o.status, day(o.dueDate), o.vin || '', o.motorNumber || '',
          firstPack.carrier || o.forwarder || '', firstPack.trackingNo || '',
          num(costInOrderCurrency(asset.factoryCost, o.currency)), num(costInOrderCurrency(asset.freightCost, o.currency)), num(costInOrderCurrency(asset.totalCost, o.currency)),
          o.note || '', stamp(o.createdAt) || new Date(), stamp(asset.shippedAt || o.shippedAt), stamp(asset.deliveredAt || o.deliveredAt), stamp(o.completedAt)]
      );
    }
    existingOrders.set(o.orderNo, id);
    stat.orders += 1;
  }

  // ---------- 3. 生产订单 ----------
  const existingPos = new Map((await client.query('SELECT order_no, entity_uuid::text FROM production_orders')).rows.map((r) => [r.order_no, r.entity_uuid]));
  for (const p of raw.production_orders || []) {
    if (existingPos.has(p.poNo)) { stat.linked += 1; continue; }
    const id = uuidv7();
    const soId = existingOrders.get(p.salesOrderNo) || null;
    log(`  + 生产单 ${p.poNo} ${p.status} → ${PO_STATUS[p.status] || '计划中'}`);
    if (APPLY) {
      await client.query(
        `INSERT INTO production_orders(id,entity_uuid,order_no,sku_code,factory,batch,planned_quantity,status,
           sourcing_mode,qc_status,supplier_cost,cost_currency,order_date,expected_delivery_date,note,
           progress_percent,production_started_at,production_completed_at,created_at,updated_at)
         VALUES($1::text,$1::uuid,$2,$3,$4,$5,$6,$7,'工厂包工包料',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())`,
        [id, p.poNo, skuOf(p.productSku), p.factoryName || '未指定工厂', 'LEGACY-8090', Number(p.qty) || 1,
          PO_STATUS[p.status] || '计划中', p.status === 'ARCHIVED' ? '合格' : '待质检',
          num(p.totalPurchaseAmount), p.currency || 'CNY', day(p.planStart), day(p.planEnd), p.note || '',
          p.status === 'ARCHIVED' ? 100 : (p.status === 'IN_PRODUCTION' ? 50 : 0),
          stamp(p.startedAt), stamp(p.completedAt), stamp(p.createdAt) || new Date()]
      );
    }
    existingPos.set(p.poNo, id);
    stat.production += 1;
  }

  // 订单 → 生产单 回填，让订单详情能跳到生产单
  if (APPLY) {
    for (const p of raw.production_orders || []) {
      const soId = existingOrders.get(p.salesOrderNo);
      const poId = existingPos.get(p.poNo);
      if (soId && poId) await client.query('UPDATE sales_orders SET production_order_uuid=$1::uuid WHERE id::text=$2 AND production_order_uuid IS NULL', [poId, soId]);
    }
  }

  // ---------- 4. 整车资产（VIN） ----------
  const existingVins = new Set((await client.query('SELECT vin FROM vins')).rows.map((r) => r.vin));
  for (const a of raw.vehicle_assets || []) {
    if (!a.vin || existingVins.has(a.vin)) { stat.skipped += 1; continue; }
    const id = uuidv7();
    const owner = OWNER_STATE[a.ownerAt] || 'STOCK';
    log(`  + VIN ${a.vin} 归属 ${owner}`);
    if (APPLY) {
      await client.query(
        `INSERT INTO vins(id,entity_uuid,vin,model,sku_code,order_no,factory,batch,status,asset_status,
           owner_state,sales_order_uuid,shipped_at,delivered_at,produced_at,asset_note)
         VALUES($1::text,$1::uuid,$2,$3,$4,$5,$6,'LEGACY-8090','在用',$7,$8,$9,$10,$11,$12,$13)`,
        [id, a.vin, a.productName || '', skuOf(a.productSku), a.poNo || '', a.factoryName || '未指定工厂',
          ASSET_STATUS[owner] || '可用', owner,
          existingOrders.get(a.salesOrderNo) || null,
          stamp(a.shippedAt), stamp(a.deliveredAt), stamp(a.producedAt),
          a.trackingPackages?.length ? `含 ${a.trackingPackages.length} 个包裹` : '']
      );
    }
    existingVins.add(a.vin);
    stat.vins += 1;
  }

  // ---------- 5. 库存：8090 的 stock_items → 8089 的 warehouse_stock ----------
  // warehouse_id 是 warehouses.id（触发器按 id 反查 entity_uuid），不是仓库编码
  const whRows = (await client.query('SELECT warehouse_code, id::text, entity_uuid::text FROM warehouses')).rows;
  const whByCode = new Map(whRows.map((r) => [r.warehouse_code, { id: r.id, uuid: r.entity_uuid }]));
  const stockNow = new Map((await client.query('SELECT warehouse_id, sku_code FROM warehouse_stock')).rows.map((r) => [r.warehouse_id + '|' + r.sku_code, true]));
  for (const st of raw.stock_items || []) {
    const whCode = WAREHOUSE_MAP[st.warehouse];
    const wh = whByCode.get(whCode);
    const skuCode = skuOf(st.sku);
    if (!wh) { log(`  ! 跳过库存 ${st.id}：8089 没有仓库 ${st.warehouse}`); continue; }
    const key = wh.id + '|' + skuCode;
    if (stockNow.has(key)) { stat.skipped += 1; continue; }
    if (!(Number(st.onHand) > 0)) { log(`  - 跳过零库存 ${whCode} ${skuCode}`); continue; }
    log(`  + 库存 ${whCode} ${skuCode} 现有 ${st.onHand} 可用 ${st.available}`);
    if (APPLY) {
      await client.query(
        `INSERT INTO warehouse_stock(warehouse_id,warehouse_uuid,sku_code,quantity) VALUES($1,$2::uuid,$3,$4)`,
        [wh.id, wh.uuid, skuCode, Number(st.onHand) || 0]
      );
    }
    stockNow.set(key, true);
    stat.stock = (stat.stock || 0) + 1;
  }


  // ---------- 6. 出入库流水：stock_ledger → inventory_ledger ----------
  // inventory_ledger 是只读账（不可改不可删），source_type 必须与来源 UUID 组合匹配。
  // 历史导入用 'opening_balance'（该类型要求所有来源 UUID 为空），库位台账由触发器自动联动。
  // 单号直接用可读的业务号（8090-GRN-PO-xxx），早期版本写成 LEGACY-8090-led-00x，
  // 所以判重必须两种都认，否则改号后重跑会重复入账。
  const skuUuidByCode = new Map((await client.query('SELECT code, entity_uuid::text FROM skus')).rows.map((r) => [r.code, r.entity_uuid]));
  const ledgerDone = new Set((await client.query("SELECT source_id FROM inventory_ledger WHERE source_id LIKE 'LEGACY-8090-%' OR source_id LIKE '8090-%'")).rows.map((r) => r.source_id));
  for (const e of raw.stock_ledger || []) {
    const sourceId = `8090-${e.bizType}-${e.refNo || e.id}`;
    if (ledgerDone.has(sourceId) || ledgerDone.has(`LEGACY-8090-${e.id}`)) { stat.skipped += 1; continue; }
    const wh = whByCode.get(WAREHOUSE_MAP[e.warehouse]);
    const skuUuid = skuUuidByCode.get(skuOf(e.sku));
    if (!wh || !skuUuid) { log(`  ! 跳过流水 ${e.id}：仓库或 SKU 未匹配`); continue; }
    const delta = e.direction === 'IN' ? Number(e.qty) : -Number(e.qty);
    log(`  + 出入库 ${e.bizType} ${e.direction} ${e.qty} ${skuOf(e.sku)} @${WAREHOUSE_MAP[e.warehouse]}`);
    if (APPLY) {
      await client.query(
        `INSERT INTO inventory_ledger(source_type,source_id,line_no,sku_uuid,warehouse_id,warehouse_uuid,quantity_delta,created_at)
         VALUES('opening_balance',$1,1,$2::uuid,$3,$4::uuid,$5,$6)`,
        [sourceId, skuUuid, wh.id, wh.uuid, delta, stamp(e.ts) || new Date()]
      );
    }
    ledgerDone.add(sourceId);
    stat.ledger = (stat.ledger || 0) + 1;
  }

  // ---------- 7. 发运单 / 包裹 / 物流事件 ----------
  const poByUuid = new Map((await client.query('SELECT id::text, entity_uuid::text, order_no FROM production_orders')).rows.map((r) => [r.entity_uuid, r]));
  const orderRows = (await client.query(
    `SELECT id::text, order_no, customer_id::text, quantity, consignee_name, consignee_country, consignee_address,
            consignee_phone, production_order_uuid::text AS po_uuid, tracking_no
       FROM sales_orders`)).rows;
  const orderByNo = new Map(orderRows.map((r) => [r.order_no, r]));
  const deliveryDone = new Set((await client.query('SELECT shipment_no FROM production_deliveries')).rows.map((r) => r.shipment_no));
  const parcelDone = new Set((await client.query('SELECT parcel_no FROM delivery_parcels')).rows.map((r) => r.parcel_no));
  const COMPONENT = { 整车: '车体', 电池: '电池', 配件: '配件' };
  const EVENT_STATUS = { IN_TRANSIT: '运输中', DELIVERED: '已签收', PICKED: '已揽收', EXCEPTION: '异常' };
  const EVENT_SOURCE = (carrier) => (carrier === 'DHL' ? 'DHL' : carrier === '手工' ? '手工' : '货代');
  const intlWh = whByCode.get('DE-XNC');

  const byOrderNo = new Map();
  for (const sh of raw.shipments || []) {
    const key = sh.salesOrderNo || sh.orderNo;
    if (!byOrderNo.has(key)) byOrderNo.set(key, []);
    byOrderNo.get(key).push(sh);
  }

  for (const [orderNo, packs] of byOrderNo) {
    const order = orderByNo.get(orderNo);
    if (!order) { log(`  ! 跳过发运 ${orderNo}：订单不存在`); continue; }
    const shipmentNo = `${orderNo}-D1`;
    const po = order.po_uuid ? poByUuid.get(order.po_uuid) : null;
    if (!po) { log(`  ! 跳过发运 ${orderNo}：没有生产单，无法挂发运单`); continue; }
    if (!intlWh) { log(`  ! 跳过发运 ${orderNo}：找不到德国虚拟仓`); continue; }
    if (deliveryDone.has(shipmentNo)) { stat.skipped += 1; continue; }

    const allDelivered = packs.every((x) => x.status === 'DELIVERED');
    const first = packs[0];
    const freight = packs.reduce((sum, x) => sum + Number(x.freight || 0), 0);
    const deliveryId = uuidv7();
    log(`  + 发运单 ${shipmentNo} 包裹 ${packs.length} 个 ${allDelivered ? '已签收' : '在途'}`);
    if (APPLY) {
      await client.query(
        `INSERT INTO production_deliveries(id,entity_uuid,order_id,order_uuid,shipment_no,warehouse_id,warehouse_uuid,
           planned_quantity,status,carrier,tracking_no,shipped_at,received_at,freight_cost,
           source_type,recipient_type,recipient_id,delivery_method,ship_to_snapshot,note,customs_status)
         VALUES($1::text,$1::uuid,$2,$3::uuid,$4,$5,$6::uuid,$7,$8,$9,$10,$11,$12,$13,
                'production_order','客户',$14,'工厂直发',$15,$16,'无需清关')`,
        [deliveryId, po.id, po.entity_uuid, shipmentNo, intlWh.id, intlWh.uuid, Number(order.quantity) || 1,
          allDelivered ? '已签收' : '在途', first.carrier || '', first.trackingNo || '',
          stamp(first.shippedAt), allDelivered ? stamp(packs.map((x) => x.deliveredAt).filter(Boolean).sort().pop()) : null,
          num(freight), order.customer_id || '',
          JSON.stringify({ name: order.consignee_name, country: order.consignee_country, address: order.consignee_address, phone: order.consignee_phone }),
          `迁移自 8090 · ${orderNo}`]
      );
    }

    for (const pack of packs) {
      const parcelId = uuidv7();
      const delivered = pack.status === 'DELIVERED';
      if (!APPLY) continue;
      await client.query(
        `INSERT INTO delivery_parcels(id,parcel_no,delivery_id,component_type,quantity,carrier,tracking_no,status,
           dispatched_at,delivered_at,gross_weight_kg,note,created_by)
         VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11,'legacy-8090')`,
        [parcelId, pack.packageNo || `${shipmentNo}-${pack.seq || 1}`, deliveryId,
          COMPONENT[pack.label] || '其他', pack.carrier || '', pack.trackingNo || '',
          delivered ? '已签收' : '已交运', stamp(pack.shippedAt), stamp(pack.deliveredAt),
          Number(pack.weight) > 0 ? Number(pack.weight) : null,
          pack.signedBy ? `签收人 ${pack.signedBy}` : '']
      );
      for (const ev of pack.events || []) {
        await client.query(
          `INSERT INTO tracking_events(package_id,tracking_no,event_time,status,location,source,actor,note)
           VALUES($1,$2,$3,$4,'',$5,'legacy-8090',$6)`,
          [parcelId, pack.trackingNo || '', stamp(ev.at) || new Date(),
            EVENT_STATUS[ev.status] || ev.status || '更新', EVENT_SOURCE(pack.carrier), String(ev.desc || '').slice(0, 900)]
        );
        stat.events = (stat.events || 0) + 1;
      }
      parcelDone.add(pack.packageNo);
    }

    if (APPLY) {
      await client.query(
        'UPDATE sales_orders SET delivery_uuid=$1::uuid, warehouse_uuid=COALESCE(warehouse_uuid,$2::uuid) WHERE id::text=$3',
        [deliveryId, intlWh.uuid, order.id]
      );
    }
    deliveryDone.add(shipmentNo);
    stat.deliveries = (stat.deliveries || 0) + 1;
  }

  // ---------- 8. 业务事件：events → sales_order_events ----------
  const EV_LABEL = { ORDER_COMPLETED: '已结案', POD: '已签收', SHIPMENT_CREATED: '已出运', PO_START: '开始生产', PO_COMPLETED: '已完工', ORDER_STATUS: '状态变更' };
  const evDone = new Set((await client.query('SELECT order_uuid::text, message FROM sales_order_events')).rows.map((r) => r.order_uuid + '|' + r.message));
  const orderByTracking = new Map();
  for (const o of orderRows) if (o.tracking_no) orderByTracking.set(o.tracking_no, o);
  const parcelOrder = new Map((await client.query('SELECT p.tracking_no, d.note FROM delivery_parcels p JOIN production_deliveries d ON d.id=p.delivery_id')).rows.map((r) => [r.tracking_no, r.note]));

  for (const ev of raw.events || []) {
    let order = null;
    const ref = String(ev.refNo || '');
    if (ref.startsWith('SO-')) order = orderByNo.get(ref);
    else if (orderByTracking.has(ref)) order = orderByTracking.get(ref);
    if (!order) { log(`  - 跳过事件 ${ev.type} ${ref}（非销售订单）`); continue; }
    if (evDone.has(order.id + '|' + ev.message)) { stat.skipped += 1; continue; }
    log(`  + 订单事件 ${order.order_no} ${EV_LABEL[ev.type] || ev.type}`);
    if (APPLY) {
      await client.query(
        'INSERT INTO sales_order_events(order_uuid,status,message,actor,payload,at) VALUES($1::uuid,$2,$3,$4,$5,$6)',
        [order.id, EV_LABEL[ev.type] || ev.type, String(ev.message || '').slice(0, 500), 'legacy-8090',
          JSON.stringify({ source: '8090', type: ev.type, refType: ev.refType, refNo: ev.refNo }), stamp(ev.at) || new Date()]
      );
    }
    evDone.add(order.id + '|' + ev.message);
    stat.orderEvents = (stat.orderEvents || 0) + 1;
  }

  // ---------- 5. 财务应收应付 ----------
  const partners = (await client.query('SELECT id::text, display_name FROM partners')).rows;
  const partnerByName = new Map(partners.map((r) => [r.display_name, r.id]));
  const admin = (await client.query("SELECT id::text FROM app_users WHERE enabled AND role='admin' ORDER BY username LIMIT 1")).rows[0];
  const existingObl = new Set((await client.query('SELECT obligation_number FROM finance_obligations')).rows.map((r) => r.obligation_number));
  let finSeq = 0;
  for (const e of raw.finance_entries || []) {
    finSeq += 1;
    const number = `OBL-8090-${String(finSeq).padStart(3, '0')}`;
    if (existingObl.has(number)) { stat.skipped += 1; continue; }
    const name = PARTNER_ALIAS[e.partner] || e.partner || '';
    let partnerId = partnerByName.get(name);
    if (!partnerId) {
      partnerId = uuidv7();
      log(`  + 往来单位 ${name}`);
      if (APPLY) await client.query(`INSERT INTO partners(id,display_name,country,status,revision) VALUES($1::uuid,$2,'中国','ACTIVE',1)`, [partnerId, name]);
      partnerByName.set(name, partnerId);
    }
    const direction = e.type === 'AR' ? 'AR' : 'AP';
    log(`  + ${direction} ${number} ${e.currency} ${e.amount} 到期 ${e.dueDate}`);
    if (APPLY) {
      await client.query(
        `INSERT INTO finance_obligations(obligation_number,direction,partner_id,currency,original_amount,due_date,source_type,source_id,note,created_by,created_at)
         VALUES($1,$2,$3::uuid,$4,$5,$6,'MANUAL',NULL,$7,$8,$9)`,
        [number, direction, partnerId, e.currency || 'CNY', num(e.amount), day(e.dueDate),
          e.note || '', admin?.id || null, stamp(e.createdAt)]
      );
    }
    existingObl.add(number);
    stat.finance += 1;
  }

  // ---------- 6. 工厂主档（代工厂） ----------
  // 8090 的生产单上只写了工厂简称，8089 的「工厂订单」页按 factories 主档聚合代工厂负荷；
  // 没有主档的工厂不会出现在负荷视图里，生产单也挂不上 factory_id。
  // 常州车业 = 常州耐驰车业有限公司（同一家，江苏常州），按主档全称归一；天津富士达单独建档。
  // FACTORY_ALIAS 定义在文件顶部（第 0 段补车型口径时也要用）。
  const FACTORY_SEED = [
    { name: '常州耐驰车业有限公司', country: '中国', address: '江苏省武进区横山桥镇芙蓉双庙陈家村801号' },
    { name: '天津富士达', country: '中国', address: '天津市' },
  ];
  const factoryByName = new Map((await client.query('SELECT id::text, entity_uuid::text, name FROM factories')).rows.map((r) => [r.name, r]));
  for (const seed of FACTORY_SEED) {
    if (factoryByName.has(seed.name)) continue;
    log(`  + 工厂 ${seed.name}`);
    if (APPLY) {
      const row = (await client.query(
        "INSERT INTO factories(id,name,country,address,status) VALUES($1,$2,$3,$4,'启用') RETURNING id::text, entity_uuid::text, name",
        [uuidv7(), seed.name, seed.country, seed.address]
      )).rows[0];
      factoryByName.set(row.name, row);
    } else {
      factoryByName.set(seed.name, { id: '(待创建)', entity_uuid: null, name: seed.name });
    }
    stat.factories = (stat.factories || 0) + 1;
  }
  for (const row of (await client.query("SELECT order_no, factory, factory_id::text FROM production_orders WHERE COALESCE(factory,'') <> ''")).rows) {
    const target = FACTORY_ALIAS[row.factory] || row.factory;
    const hit = factoryByName.get(target);
    if (!hit || (row.factory === target && row.factory_id === hit.id)) continue;
    log(`  ~ 生产单 ${row.order_no} 工厂「${row.factory}」→「${target}」并挂主档`);
    if (APPLY) await client.query('UPDATE production_orders SET factory=$1, factory_id=$2, factory_uuid=$3::uuid WHERE order_no=$4', [target, hit.id, hit.entity_uuid, row.order_no]);
    stat.factoryLinks = (stat.factoryLinks || 0) + 1;
  }
  for (const row of (await client.query(`SELECT vin, factory FROM vins WHERE factory = ANY($1::text[])`, [Object.keys(FACTORY_ALIAS)])).rows) {
    log(`  ~ VIN ${row.vin} 工厂「${row.factory}」→「${FACTORY_ALIAS[row.factory]}」`);
    if (APPLY) await client.query('UPDATE vins SET factory=$1 WHERE vin=$2', [FACTORY_ALIAS[row.factory], row.vin]);
    stat.factoryLinks = (stat.factoryLinks || 0) + 1;
  }

  // ---------- 9. 撞号生产单：改号导入 ----------
  // 8090 的 PO-20261115-001 与 8089 里手工建的同号单撞车（那张是 L1-PRO 计划单）。
  // 不覆盖已有单，把 8090 这张改号成 PO-YYYYMMDD-L1 导进来，两边都留。
  const RENUMBER = { 'PO-20261115-001': 'PO-20261115-L1' };
  const existingPoNos = new Set((await client.query('SELECT order_no FROM production_orders')).rows.map((r) => r.order_no));
  const factoryById = new Map((await client.query('SELECT id::text, entity_uuid::text, name FROM factories')).rows.map((r) => [r.name, r]));
  for (const p of raw.production_orders || []) {
    const targetNo = RENUMBER[p.poNo];
    if (!targetNo) continue;                       // 没在改号表里的不在这里处理
    if (!existingPoNos.has(p.poNo)) continue;       // 原号没被占，主段已经按原号导入了
    if (existingPoNos.has(targetNo)) { stat.skipped += 1; continue; }
    const facName = FACTORY_ALIAS[p.factoryName] || p.factoryName || '未指定工厂';
    const fac = factoryById.get(facName);
    log(`  + 生产单 ${p.poNo} → 改号 ${targetNo}（原号已被 8089 手工单占用）`);
    if (APPLY) {
      const id = uuidv7();
      await client.query(
        `INSERT INTO production_orders(id,entity_uuid,order_no,sku_code,factory,factory_id,factory_uuid,batch,planned_quantity,status,
           sourcing_mode,qc_status,supplier_cost,cost_currency,order_date,expected_delivery_date,note,
           progress_percent,production_started_at,production_completed_at,created_at,updated_at)
         VALUES($1::text,$1::uuid,$2,$3,$4,$5,$6::uuid,'LEGACY-8090',$7,$8,'工厂包工包料',$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())`,
        [id, targetNo, skuOf(p.productSku), facName, fac?.id || null, fac?.entity_uuid || null,
          Number(p.qty) || 1, PO_STATUS[p.status] || '计划中', p.status === 'ARCHIVED' ? '合格' : '待质检',
          num(p.totalPurchaseAmount), p.currency || 'CNY', day(p.planStart), day(p.planEnd), p.note || '',
          p.status === 'ARCHIVED' ? 100 : (p.status === 'IN_PRODUCTION' ? 50 : 0),
          stamp(p.startedAt), stamp(p.completedAt), stamp(p.createdAt) || new Date()]
      );
      const so = existingOrders.get(p.salesOrderNo);
      if (so) {
        // 订单指针要指向「真正为它生产的单」。如果现在指向的是那张撞号的手工单，改指过来；
        // 如果已经指向别的单，则不动（不覆盖人工建立的关联）。
        const current = (await client.query('SELECT production_order_uuid::text AS u FROM sales_orders WHERE id::text=$1', [so])).rows[0];
        const clash = (await client.query('SELECT entity_uuid::text AS u FROM production_orders WHERE order_no=$1', [p.poNo])).rows[0];
        if (!current?.u || current.u === clash?.u) {
          await client.query('UPDATE sales_orders SET production_order_uuid=$1::uuid, updated_at=now() WHERE id::text=$2', [id, so]);
          log(`    ↳ 订单 ${p.salesOrderNo} 的生产单指针改指 ${targetNo}`);
        }
      }
      existingOrders.set(p.salesOrderNo + '|renumbered', id);
    }
    existingPoNos.add(targetNo);
    stat.production = (stat.production || 0) + 1;
  }

  // ---------- 10. C2 单据归位 ----------
  // 首次迁移把 C2 并进了 A1 的 SKU，导致 C2 的订单 / 生产单 / VIN 都显示成 A1 车型。
  // 这里按 8090 的 productSku 精确改回独立 SKU。库存不在这里补：主段按新 SKU_MAP 重跑会自动插入。
  const renumberNo = (no) => RENUMBER[no] || no;
  const c2Fix = [
    { table: 'sales_orders', label: '销售单', key: 'orderNo', rows: (raw.sales_orders || []).filter((o) => o.productSku === 'ALSVID-C2') },
    { table: 'production_orders', label: '生产单', key: 'poNo', rows: (raw.production_orders || []).filter((p) => p.productSku === 'ALSVID-C2') },
    { table: 'vins', label: 'VIN', key: 'vin', rows: (raw.vehicle_assets || []).filter((a) => a.productSku === 'ALSVID-C2') },
  ];
  const KEY_COLUMN = { sales_orders: 'order_no', production_orders: 'order_no', vins: 'vin' };
  for (const group of c2Fix) {
    for (const row of group.rows) {
      const bizKey = renumberNo(row[group.key]);
      const current = (await client.query(`SELECT sku_code FROM ${group.table} WHERE ${KEY_COLUMN[group.table]}=$1`, [bizKey])).rows[0];
      if (!current || current.sku_code === C2_SKU) continue;
      log(`  ~ ${group.label} ${bizKey} SKU ${current.sku_code} → ${C2_SKU}`);
      if (APPLY) {
        // 必须把 sku_uuid 一起写成新 SKU 的 uuid：sync_identity_uuid 触发器会拿「旧 sku_uuid」
        // 和「新 sku_code 对应的 uuid」比对，只改 code 会直接抛 23514 legacy and UUID references do not match。
        await client.query(
          `UPDATE ${group.table} SET sku_code=$1, sku_uuid=(SELECT entity_uuid FROM skus WHERE code=$1) WHERE ${KEY_COLUMN[group.table]}=$2`,
          [C2_SKU, bizKey]);
      }
      stat.skuFix = (stat.skuFix || 0) + 1;
    }
  }

  // ---------- 11. 生产单状态时间线 ----------
  // 8090 每张生产单有完整节点流（待制造→制造中→已完工→已结案对账→已归档）。
  // 8089 的 event_type 只允许「进度更新 / 质检更新」，所以 8090 的 label 写进 note 前缀。
  const PROGRESS = { PENDING: 0, IN_PRODUCTION: 50, COMPLETED: 100, CLOSED: 100, ARCHIVED: 100 };
  const poRowByNo = new Map((await client.query('SELECT order_no, id::text, entity_uuid::text FROM production_orders')).rows.map((r) => [r.order_no, r]));
  const seenEvents = new Set((await client.query('SELECT order_id, created_at FROM production_order_events')).rows.map((r) => r.order_id + '|' + new Date(r.created_at).getTime()));
  for (const p of raw.production_orders || []) {
    const po = poRowByNo.get(renumberNo(p.poNo));
    if (!po) continue;
    for (const node of p.timeline || []) {
      const at = stamp(node.at);
      if (!at) continue;
      const key = po.id + '|' + at.getTime();
      if (seenEvents.has(key)) { stat.skipped += 1; continue; }
      log(`  + 生产节点 ${renumberNo(p.poNo)} ${node.label}`);
      if (APPLY) {
        await client.query(
          `INSERT INTO production_order_events(id,order_id,entity_uuid,order_uuid,event_type,progress_percent,note,actor,created_at)
           VALUES($1::text,$2,$1::uuid,$3::uuid,'进度更新',$4,$5,'legacy-8090',$6)`,
          [uuidv7(), po.id, po.entity_uuid, PROGRESS[node.status] ?? null, `${node.label}：${node.message || ''}`.slice(0, 500), at]
        );
      }
      seenEvents.add(key);
      stat.poEvents = (stat.poEvents || 0) + 1;
    }
  }

  // ---------- 12. 出入库流水单号与 SKU 归位 ----------
  // 首次迁移把 source_id 写成 LEGACY-8090-led-00x（技术 ID），还把 C2 的两条挂到了 A1 的 SKU 上。
  // 两张台账都是 append-only（BEFORE UPDATE 触发器直接拒绝），所以事务内临时禁用用户触发器，
  // 改完立刻恢复；动手前先落一份 JSON 原文备份到 server/backups/。
  const ledMap = new Map((raw.stock_ledger || []).map((x) => [x.id, x]));
  const skuUuidByCodeNow = new Map((await client.query('SELECT code, entity_uuid::text FROM skus')).rows.map((r) => [r.code, r.entity_uuid]));
  const ledFixes = [];
  for (const row of (await client.query("SELECT id::text, source_id, sku_uuid::text FROM inventory_ledger WHERE source_id LIKE 'LEGACY-8090-%'")).rows) {
    const legacy = ledMap.get(row.source_id.replace('LEGACY-8090-', ''));
    if (!legacy) continue;
    const wantSource = `8090-${legacy.bizType}-${legacy.refNo || legacy.id}`;
    const wantSku = skuUuidByCodeNow.get(skuOf(legacy.sku));
    if (!wantSku) continue;
    if (row.source_id === wantSource && row.sku_uuid === wantSku) continue;
    ledFixes.push({ id: row.id, fromSource: row.source_id, toSource: wantSource, toSku: wantSku });
  }
  if (ledFixes.length) {
    if (APPLY) {
      const backupFile = path.join(__dirname, 'backups', `inventory-ledger-8090-${Date.now()}.json`);
      fs.mkdirSync(path.dirname(backupFile), { recursive: true });
      const ids = ledFixes.map((f) => f.id);
      const ledgerSnapshot = (await client.query('SELECT * FROM inventory_ledger WHERE id = ANY($1::uuid[])', [ids])).rows;
      const locationSnapshot = (await client.query('SELECT * FROM inventory_location_ledger WHERE inventory_ledger_uuid = ANY($1::uuid[])', [ids])).rows;
      fs.writeFileSync(backupFile, JSON.stringify({ ledger: ledgerSnapshot, locationLedger: locationSnapshot }, null, 2));
      log(`  · 已备份 ${ledFixes.length} 条流水原文 → ${path.relative(process.cwd(), backupFile)}`);
      await client.query('ALTER TABLE inventory_ledger DISABLE TRIGGER USER');
      await client.query('ALTER TABLE inventory_location_ledger DISABLE TRIGGER USER');
      try {
        for (const f of ledFixes) {
          await client.query('UPDATE inventory_ledger SET source_id=$1, sku_uuid=$2::uuid WHERE id=$3::uuid', [f.toSource, f.toSku, f.id]);
          await client.query('UPDATE inventory_location_ledger SET source_id=$1, sku_uuid=$2::uuid WHERE inventory_ledger_uuid=$3::uuid', [f.toSource, f.toSku, f.id]);
        }
      } finally {
        await client.query('ALTER TABLE inventory_ledger ENABLE TRIGGER USER');
        await client.query('ALTER TABLE inventory_location_ledger ENABLE TRIGGER USER');
      }
    }
    for (const f of ledFixes) log(`  ~ 流水 ${f.fromSource} → ${f.toSource}`);
    stat.ledgerFix = ledFixes.length;
  }

  // ---------- 13. 生产单车型明细 ----------
  // 工厂订单页的「整车 SKU」「N 个车型」读的是 production_order_items，不读 production_orders.sku_code。
  // 首次迁移没写这张明细表，所以那几张单的车型列全显示成「—」。
  const itemDone = new Set((await client.query('SELECT order_uuid::text, sku_uuid::text FROM production_order_items')).rows.map((r) => r.order_uuid + '|' + r.sku_uuid));
  for (const p of raw.production_orders || []) {
    const po = poRowByNo.get(renumberNo(p.poNo));
    if (!po) continue;
    const itemSku = skuOf(p.productSku);
    const itemSkuUuid = skuUuidByCodeNow.get(itemSku);
    if (!itemSkuUuid) { log(`  ! 生产明细 ${p.poNo}：SKU ${itemSku} 不在主档`); continue; }
    const key = po.entity_uuid + '|' + itemSkuUuid;
    if (itemDone.has(key)) { stat.skipped += 1; continue; }
    const qty = Number(p.qty) || 1;
    const unitPrice = Number(num(p.totalPurchaseAmount) || 0) / qty;
    log(`  + 生产明细 ${renumberNo(p.poNo)} ${itemSku} × ${qty} @ ¥${unitPrice.toFixed(2)}`);
    if (APPLY) {
      await client.query(
        'INSERT INTO production_order_items(order_uuid,sku_uuid,sku_code,planned_quantity,unit_price) VALUES($1::uuid,$2::uuid,$3,$4,$5)',
        [po.entity_uuid, itemSkuUuid, itemSku, qty, unitPrice]);
    }
    itemDone.add(key);
    stat.poItems = (stat.poItems || 0) + 1;
  }

  // ---------- 14. 发运单归属修正 ----------
  // 撞号单改号成 PO-20261115-L1 之后，当初为它生成的发运单还挂在撞号的手工单上，
  // 于是物流跟踪页把 A1U 的这票显示成了 L1 PRO，财务费用行也跟着错。
  for (const [shipmentNo, poNo] of Object.entries({ 'SO-202611-001-D1': 'PO-20261115-L1' })) {
    const po = poRowByNo.get(poNo);
    if (!po) continue;
    const row = (await client.query('SELECT order_id, order_uuid::text FROM production_deliveries WHERE shipment_no=$1', [shipmentNo])).rows[0];
    if (!row || row.order_id === po.id) continue;
    log(`  ~ 发运单 ${shipmentNo} 归属 ${row.order_id} → ${po.id}（${poNo}）`);
    if (APPLY) {
      // sync_uuidv7_reference 会拿旧 order_uuid 和「新 order_id 对应的 uuid」比对，必须一起写，否则 23514。
      await client.query('UPDATE production_deliveries SET order_id=$1, order_uuid=$2::uuid WHERE shipment_no=$3', [po.id, po.entity_uuid, shipmentNo]);
    }
    stat.deliveryFix = (stat.deliveryFix || 0) + 1;
  }

  // VIN 上记的生产单号是撞号前的旧号，一并纠正，否则资产台账还指向那张手工单。
  for (const a of raw.vehicle_assets || []) {
    if (!a.poNo) continue;                    // 没有生产单号的（散装库存车）不动，别把空串写成 null
    const targetPoNo = renumberNo(a.poNo);
    const row = (await client.query('SELECT order_no FROM vins WHERE vin=$1', [a.vin])).rows[0];
    if (!row || row.order_no === targetPoNo) continue;
    log(`  ~ VIN ${a.vin} 生产单号 ${row.order_no} → ${targetPoNo}`);
    if (APPLY) await client.query('UPDATE vins SET order_no=$1 WHERE vin=$2', [targetPoNo, a.vin]);
    stat.deliveryFix = (stat.deliveryFix || 0) + 1;
  }

  if (APPLY) await client.query('COMMIT');
  else await client.query('ROLLBACK');

  log('\n===== 汇总 =====');
  log(`客户 ${stat.customers} · 销售订单 ${stat.orders} · 生产单 ${stat.production} · VIN ${stat.vins} · 库存 ${stat.stock || 0} · 出入库 ${stat.ledger || 0} · 发运单 ${stat.deliveries || 0} · 物流事件 ${stat.events || 0} · 订单事件 ${stat.orderEvents || 0} · 应收应付 ${stat.finance} · 工厂 ${stat.factories || 0} · 工厂关联 ${stat.factoryLinks || 0} · 车型 ${stat.products || 0} · 车型口径 ${stat.productSpecs || 0} · SKU 归位 ${stat.skuFix || 0} · 生产节点 ${stat.poEvents || 0} · 流水修正 ${stat.ledgerFix || 0} · 生产明细 ${stat.poItems || 0} · 发运归属 ${stat.deliveryFix || 0}`);
  log('注：预演模式下新建的 C2 SKU / 改号生产单还不存在，相关联动（C2 流水归位、改号单时间线）会在 --apply 时补齐。');
  log(`跳过已存在 ${stat.skipped} 条；生产单已存在 ${stat.linked} 条（会做订单关联回填）`);
  log(APPLY ? '\n已写入数据库。' : '\n以上为预演，未写入。确认无误后加 --apply 执行。');
  await client.end();
}

main().catch((e) => { console.error('迁移失败:', e.message); process.exit(1); });
