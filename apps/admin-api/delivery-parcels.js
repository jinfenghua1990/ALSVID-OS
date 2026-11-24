'use strict';

// 交付包裹：整车车体（无动力电池）与独立锂电池分包裹、分开发运、独立签收。
// 依据《生产交付与仓储履约规范》§4/§5/§6：一车两包裹、按 VIN 合并判断完整交付、
// 物流签收不等于库存入库（库存只由 production-deliveries/:id/receive 记账）。

const { createPool } = require('./db-pool');
const { currentActor } = require('./audit-context');
const { uuidv7 } = require('./uuidv7');

const COMPONENT_TYPES = ['车体', '电池', '配件', '其他'];
const PARCEL_STATUSES = ['待发运', '已交运', '运输中', '已签收', '异常', '取消'];
const EDITABLE_DELIVERY_STATUS = ['草稿', '待确认', '待发运'];

function fail(message, statusCode = 400) {
  throw Object.assign(new Error(message), { statusCode });
}

function text(value, max, field) {
  const out = typeof value === 'string' ? value.trim() : '';
  if (out.length > max) fail(`${field}过长`);
  return out;
}

function positiveInt(value, field, max = 1000000) {
  const out = Number(value);
  if (!Number.isInteger(out) || out < 1 || out > max) fail(`${field}无效`);
  return out;
}

function decimalOrNull(value, field) {
  if (value === undefined || value === null || value === '') return null;
  const out = Number(value);
  if (!Number.isFinite(out) || out <= 0) fail(`${field}无效`);
  return out;
}

function dateOrNull(value, field) {
  if (!value) return null;
  const out = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out)) fail(`${field}格式应为 YYYY-MM-DD`);
  return out;
}

// 唯一约束冲突映射为可读的 409，避免用户看到 duplicate key value violates...
function mapConflict(error) {
  if (error?.code !== '23505') return error;
  const constraint = String(error.constraint || '');
  if (constraint.includes('active_vin')) return fail('该 VIN 已在其他交付批次中占用，请先关闭原关联或确认是否重复发运', 409);
  if (constraint.includes('active_battery')) return fail('该电池 SN 已在其他交付批次中占用，请先关闭原关联或确认是否重复发运', 409);
  if (constraint.includes('tracking_uniq')) return fail('该运单号已被其他包裹使用', 409);
  if (constraint.includes('parcel_no')) return fail('包裹号在该批次内已存在', 409);
  if (constraint.includes('delivery_items')) return fail('同一批次内同一 SKU 与组件类型只能有一行', 409);
  return fail('包裹信息与已有记录冲突', 409);
}

function createDeliveryParcelStore(connectionString) {
  const pool = createPool(connectionString, { max: 3, connectionTimeoutMillis: 10000 });

  async function tx(action, target, work) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const result = await work(c);
      await c.query(
        'INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',
        [currentActor(), action, target, JSON.stringify(result)]
      );
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      c.release();
    }
  }

  const PARCEL_COLUMNS = `p.id, p.parcel_no AS "parcelNo", p.delivery_id AS "deliveryId",
    p.component_type AS "componentType", p.carton_no AS "cartonNo", p.quantity,
    p.gross_weight_kg AS "grossWeightKg", p.volume_m3 AS "volumeM3", p.carrier,
    p.tracking_no AS "trackingNo", p.eta, p.status, p.dispatched_at AS "dispatchedAt",
    p.delivered_at AS "deliveredAt", p.hazmat_un AS "hazmatUn", p.hazmat_approved AS "hazmatApproved",
    p.hazmat_note AS "hazmatNote", p.note, p.created_by AS "createdBy", p.created_at AS "createdAt"`;

  const SERIAL_LATERAL = `LEFT JOIN LATERAL (
      SELECT s.vin, s.battery_sn AS "batterySn", s.motor_sn AS "motorSn",
             s.component_type AS "serialComponentType", s.association_version AS "associationVersion"
        FROM delivery_parcel_serials s
       WHERE s.parcel_id = p.id AND s.effective_to IS NULL
       ORDER BY s.association_version DESC LIMIT 1
    ) ser ON true`;

  async function list(deliveryId) {
    const rows = (await pool.query(
      `SELECT ${PARCEL_COLUMNS}, ser.vin, ser."batterySn", ser."motorSn", ser."associationVersion"
         FROM delivery_parcels p ${SERIAL_LATERAL}
        WHERE p.delivery_id = $1
        ORDER BY p.component_type, p.created_at, p.id`,
      [deliveryId]
    )).rows;
    return { deliveryId, parcels: rows };
  }

  async function create(deliveryId, input) {
    const raw = Array.isArray(input?.parcels) ? input.parcels : null;
    if (!raw || !raw.length || raw.length > 50) fail('请提供 1–50 个包裹');

    const normalized = raw.map((item, index) => {
      const componentType = String(item?.componentType || '').trim();
      if (!COMPONENT_TYPES.includes(componentType)) fail(`第 ${index + 1} 个包裹的组件类型无效`);
      const vin = text(item?.vin, 40, 'VIN');
      const batterySn = text(item?.batterySn, 60, '电池 SN');
      if (componentType === '车体' && !vin) fail('车体包裹必须绑定 VIN');
      if (componentType === '电池' && !batterySn) fail('电池包裹必须绑定电池 SN');
      return {
        componentType,
        vin,
        batterySn,
        motorSn: text(item?.motorSn, 60, '电机 SN'),
        parcelNo: text(item?.parcelNo, 60, '包裹号'),
        cartonNo: text(item?.cartonNo, 60, '箱号'),
        quantity: positiveInt(item?.quantity ?? 1, '数量'),
        grossWeightKg: decimalOrNull(item?.grossWeightKg, '毛重'),
        volumeM3: decimalOrNull(item?.volumeM3, '体积'),
        carrier: text(item?.carrier, 120, '承运商'),
        trackingNo: text(item?.trackingNo, 120, '运单号'),
        eta: dateOrNull(item?.eta, '预计到达'),
        hazmatUn: text(item?.hazmatUn, 40, 'UN 码'),
        hazmatApproved: item?.hazmatApproved === true,
        hazmatNote: text(item?.hazmatNote, 300, '危品说明'),
        note: text(item?.note, 500, '备注')
      };
    });

    const hasBody = normalized.some(x => x.componentType === '车体');
    const hasBattery = normalized.some(x => x.componentType === '电池');
    if (hasBody && !hasBattery) fail('整车交付必须同时生成车体与电池两个包裹，二者不得合箱');

    const bodyVins = normalized.filter(x => x.componentType === '车体').map(x => x.vin);
    if (new Set(bodyVins).size !== bodyVins.length) fail('同一批次内车体 VIN 不能重复');
    const batterySns = normalized.filter(x => x.componentType === '电池').map(x => x.batterySn);
    if (new Set(batterySns).size !== batterySns.length) fail('同一批次内电池 SN 不能重复');

    try {
      return await tx('delivery.parcel.create', `production-deliveries/${deliveryId}/parcels`, async c => {
      const delivery = (await c.query(
        `SELECT id, order_id AS "orderId", shipment_no AS "shipmentNo", status,
                planned_quantity AS "plannedQuantity"
           FROM production_deliveries WHERE id = $1 FOR UPDATE`,
        [deliveryId]
      )).rows[0];
      if (!delivery) fail('发运批次不存在', 404);
      if (!EDITABLE_DELIVERY_STATUS.includes(delivery.status)) fail(`批次状态「${delivery.status}」不允许新增包裹`);

      const existing = (await c.query(
        'SELECT parcel_no FROM delivery_parcels WHERE delivery_id = $1',
        [deliveryId]
      )).rows.map(r => r.parcelNo);

      const created = [];
      for (let index = 0; index < normalized.length; index += 1) {
        const item = normalized[index];
        const id = uuidv7();
        let parcelNo = item.parcelNo;
        if (!parcelNo) {
          let seq = existing.length + index + 1;
          while (existing.includes(`${delivery.shipmentNo}-${seq}`)) seq += 1;
          parcelNo = `${delivery.shipmentNo}-${seq}`;
        }
        if (existing.includes(parcelNo)) fail(`包裹号 ${parcelNo} 已存在`);

        await c.query(
          `INSERT INTO delivery_parcels
             (id, parcel_no, delivery_id, component_type, carton_no, quantity, gross_weight_kg, volume_m3,
              carrier, tracking_no, eta, hazmat_un, hazmat_approved, hazmat_note, note, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
          [id, parcelNo, deliveryId, item.componentType, item.cartonNo, item.quantity,
            item.grossWeightKg, item.volumeM3, item.carrier, item.trackingNo, item.eta,
            item.hazmatUn, item.hazmatApproved, item.hazmatNote, item.note, currentActor()]
        );

        if (item.vin || item.batterySn || item.motorSn) {
          await c.query(
            `INSERT INTO delivery_parcel_serials
               (id, parcel_id, component_type, vin, battery_sn, motor_sn, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [uuidv7(), id, item.componentType, item.vin, item.batterySn, item.motorSn, currentActor()]
          );
        }
        created.push({ id, parcelNo, componentType: item.componentType, vin: item.vin, batterySn: item.batterySn });
      }

        return { deliveryId, orderId: delivery.orderId, parcels: created };
      });
    } catch (e) {
      throw mapConflict(e);
    }
  }

  async function update(parcelId, input) {
    const patch = {
      carrier: input?.carrier === undefined ? undefined : text(input.carrier, 120, '承运商'),
      trackingNo: input?.trackingNo === undefined ? undefined : text(input.trackingNo, 120, '运单号'),
      cartonNo: input?.cartonNo === undefined ? undefined : text(input.cartonNo, 60, '箱号'),
      eta: input?.eta === undefined ? undefined : dateOrNull(input.eta, '预计到达'),
      grossWeightKg: input?.grossWeightKg === undefined ? undefined : decimalOrNull(input.grossWeightKg, '毛重'),
      volumeM3: input?.volumeM3 === undefined ? undefined : decimalOrNull(input.volumeM3, '体积'),
      hazmatUn: input?.hazmatUn === undefined ? undefined : text(input.hazmatUn, 40, 'UN 码'),
      hazmatNote: input?.hazmatNote === undefined ? undefined : text(input.hazmatNote, 300, '危品说明'),
      hazmatApproved: input?.hazmatApproved === undefined ? undefined : input.hazmatApproved === true,
      note: input?.note === undefined ? undefined : text(input.note, 500, '备注'),
      status: input?.status === undefined ? undefined : String(input.status).trim()
    };
    if (patch.status !== undefined && !PARCEL_STATUSES.includes(patch.status)) fail('包裹状态无效');
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (!entries.length) fail('没有可更新的字段');

    try {
      return await tx('delivery.parcel.update', `delivery-parcels/${parcelId}`, async c => {
      const current = (await c.query(
        `SELECT id, delivery_id AS "deliveryId", status, component_type AS "componentType"
           FROM delivery_parcels WHERE id = $1 FOR UPDATE`,
        [parcelId]
      )).rows[0];
      if (!current) fail('包裹不存在', 404);
      if (current.status === '已签收' && patch.status && patch.status !== '异常') {
        fail('已签收包裹只能登记异常，不能改回其他状态');
      }
      if (patch.status === '已签收') fail('签收请使用签收接口');
      if (patch.status === '已交运' || patch.status === '运输中') fail('交运请使用发运接口，不能直接改状态');
      if (patch.status === '待发运' && ['已交运', '运输中'].includes(current.status)) fail('已交运包裹不能改回待发运');

      const sets = [];
      const values = [];
      const columnOf = {
        carrier: 'carrier', trackingNo: 'tracking_no', cartonNo: 'carton_no', eta: 'eta',
        grossWeightKg: 'gross_weight_kg', volumeM3: 'volume_m3', hazmatUn: 'hazmat_un',
        hazmatNote: 'hazmat_note', hazmatApproved: 'hazmat_approved', note: 'note', status: 'status'
      };
      for (const [key, value] of entries) {
        values.push(value);
        sets.push(`${columnOf[key]} = $${values.length}`);
      }
      values.push(parcelId);
      const row = (await c.query(
        `UPDATE delivery_parcels SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING ${PARCEL_COLUMNS.replace(/p\./g, '')}`,
        values
      )).rows[0];
        return row;
      });
    } catch (e) {
      throw mapConflict(e);
    }
  }

  async function dispatch(parcelId) {
    return tx('delivery.parcel.dispatch', `delivery-parcels/${parcelId}/dispatch`, async c => {
      const row = (await c.query(
        `SELECT p.id, p.delivery_id AS "deliveryId", p.status, p.component_type AS "componentType",
                p.hazmat_un AS "hazmatUn", p.hazmat_approved AS "hazmatApproved",
                d.status AS "deliveryStatus", o.status AS "orderStatus"
           FROM delivery_parcels p
           JOIN production_deliveries d ON d.id = p.delivery_id
           JOIN production_orders o ON o.id = d.order_id
          WHERE p.id = $1 FOR UPDATE OF p, d`,
        [parcelId]
      )).rows[0];
      if (!row) fail('包裹不存在', 404);
      if (row.status !== '待发运') fail(`包裹当前状态「${row.status}」不能确认发运`);
      if (row.deliveryStatus === '取消') fail('批次已取消，不能发运');
      if (!['待发运', '在途'].includes(row.deliveryStatus)) fail(`批次状态「${row.deliveryStatus}」不能发运`);
      if (row.orderStatus === '已取消') fail('订单已取消，不能发运');

      const serial = (await c.query(
        `SELECT vin, battery_sn AS "batterySn" FROM delivery_parcel_serials
          WHERE parcel_id = $1 AND effective_to IS NULL
          ORDER BY association_version DESC LIMIT 1`,
        [parcelId]
      )).rows[0];
      if (row.componentType === '车体' && !serial?.vin) fail('车体包裹未绑定 VIN，不能发运');
      if (row.componentType === '电池' && !serial?.batterySn) fail('电池包裹未绑定电池 SN，不能发运');
      if (row.hazmatUn && !row.hazmatApproved) {
        fail('危险品未完成合规审核，禁止确认发运或生成危险品标签', 409);
      }

      await c.query(
        `UPDATE delivery_parcels SET status = '已交运', dispatched_at = now() WHERE id = $1`,
        [parcelId]
      );
      await syncDeliveryStatus(c, row.deliveryId);
      return { id: parcelId, status: '已交运', componentType: row.componentType };
    });
  }

  async function receive(parcelId, input) {
    const note = text(input?.note, 500, '备注');
    return tx('delivery.parcel.receive', `delivery-parcels/${parcelId}/receive`, async c => {
      const row = (await c.query(
        `SELECT id, delivery_id AS "deliveryId", status, component_type AS "componentType"
           FROM delivery_parcels WHERE id = $1 FOR UPDATE`,
        [parcelId]
      )).rows[0];
      if (!row) fail('包裹不存在', 404);
      if (row.status === '已签收') {
        return { id: parcelId, status: '已签收', idempotent: true };
      }
      if (!['已交运', '运输中', '异常'].includes(row.status)) {
        fail(`包裹当前状态「${row.status}」不能签收`);
      }
      await c.query(
        `UPDATE delivery_parcels SET status = '已签收', delivered_at = now(),
                note = CASE WHEN $2 = '' THEN note ELSE $2 END
          WHERE id = $1`,
        [parcelId, note]
      );
      await syncDeliveryStatus(c, row.deliveryId);
      return { id: parcelId, status: '已签收', componentType: row.componentType };
    });
  }

  async function syncDeliveryStatus(c, deliveryId) {
    const stats = (await c.query(
      `SELECT count(*) FILTER (WHERE status = '待发运')::int AS pending,
              count(*) FILTER (WHERE status IN ('已交运','运输中'))::int AS moving,
              count(*) FILTER (WHERE status = '已签收')::int AS delivered,
              count(*) FILTER (WHERE status = '异常')::int AS abnormal,
              count(*)::int AS total
         FROM delivery_parcels WHERE delivery_id = $1`,
      [deliveryId]
    )).rows[0];
    if (!stats.total) return null;
    let next = null;
    if (stats.abnormal > 0) next = null;
    else if (stats.delivered === stats.total) next = null;
    else if (stats.pending === 0 && stats.moving > 0) next = '在途';
    if (!next) return null;
    await c.query(
      `UPDATE production_deliveries SET status = $2
        WHERE id = $1 AND status NOT IN ('已入库','取消','异常')`,
      [deliveryId, next]
    );
    return next;
  }

  async function overview(orderId) {
    const order = (await pool.query(
      `SELECT id, order_no AS "orderNo", sku_code AS "skuCode", planned_quantity AS "plannedQuantity",
              actual_quantity AS "actualQuantity", status
         FROM production_orders WHERE id = $1`,
      [orderId]
    )).rows[0];
    if (!order) fail('生产订单不存在', 404);

    const rows = (await pool.query(
      `SELECT ${PARCEL_COLUMNS}, d.shipment_no AS "shipmentNo", d.warehouse_id AS "warehouseId",
              d.recipient_type AS "recipientType", d.delivery_method AS "deliveryMethod",
              ser.vin, ser."batterySn", ser."motorSn"
         FROM delivery_parcels p
         JOIN production_deliveries d ON d.id = p.delivery_id
         ${SERIAL_LATERAL}
        WHERE d.order_id = $1
        ORDER BY p.component_type, p.created_at`,
      [orderId]
    )).rows;

    // 按 VIN 合并车体与电池交付状态；不得用「已发包数/2」推算整车数
    const vehicleMap = new Map();
    const unpaired = [];
    for (const row of rows) {
      if (row.componentType !== '车体' && row.componentType !== '电池') continue;
      const vin = row.vin || '';
      if (!vin) { unpaired.push(row); continue; }
      if (!vehicleMap.has(vin)) vehicleMap.set(vin, { vin, body: null, battery: null });
      const slot = vehicleMap.get(vin);
      if (row.componentType === '车体') slot.body = slot.body || row;
      else slot.battery = slot.battery || row;
    }

    const vehicles = [...vehicleMap.values()].map(slot => {
      const bodyReceived = slot.body?.status === '已签收';
      const batteryReceived = slot.battery?.status === '已签收';
      const abnormal = [slot.body, slot.battery].some(x => x && x.status === '异常');
      return {
        vin: slot.vin,
        body: slot.body ? { parcelId: slot.body.id, status: slot.body.status, trackingNo: slot.body.trackingNo } : null,
        battery: slot.battery ? { parcelId: slot.battery.id, status: slot.battery.status, trackingNo: slot.battery.trackingNo } : null,
        complete: Boolean(bodyReceived && batteryReceived && !abnormal),
        partial: Boolean((bodyReceived || batteryReceived) && !(bodyReceived && batteryReceived)),
        missingBattery: !slot.battery,
        abnormal
      };
    });

    const count = status => rows.filter(r => r.status === status).length;
    return {
      order,
      totals: {
        parcels: rows.length,
        pending: count('待发运'),
        dispatched: rows.filter(r => r.status === '已交运' || r.status === '运输中').length,
        delivered: count('已签收'),
        abnormal: count('异常'),
        cancelled: count('取消'),
        vehicles: vehicles.length,
        vehiclesComplete: vehicles.filter(v => v.complete).length,
        vehiclesPartial: vehicles.filter(v => v.partial).length
      },
      vehicles,
      parcels: rows.map(r => ({
        id: r.id, parcelNo: r.parcelNo, deliveryId: r.deliveryId, shipmentNo: r.shipmentNo,
        componentType: r.componentType, cartonNo: r.cartonNo, quantity: r.quantity,
        carrier: r.carrier, trackingNo: r.trackingNo, eta: r.eta, status: r.status,
        dispatchedAt: r.dispatchedAt, deliveredAt: r.deliveredAt,
        vin: r.vin, batterySn: r.batterySn, hazmatUn: r.hazmatUn, hazmatApproved: r.hazmatApproved
      })),
      unpairedParcels: unpaired.map(r => ({ id: r.id, parcelNo: r.parcelNo, componentType: r.componentType }))
    };
  }

  async function reconcile(deliveryId) {
    const delivery = (await pool.query(
      `SELECT id, order_id AS "orderId", shipment_no AS "shipmentNo",
              planned_quantity AS "plannedQuantity", received_quantity AS "receivedQuantity", status
         FROM production_deliveries WHERE id = $1`,
      [deliveryId]
    )).rows[0];
    if (!delivery) fail('发运批次不存在', 404);

    const parcels = (await pool.query(
      `SELECT ${PARCEL_COLUMNS}, ser.vin, ser."batterySn"
         FROM delivery_parcels p ${SERIAL_LATERAL}
        WHERE p.delivery_id = $1 ORDER BY p.created_at`,
      [deliveryId]
    )).rows;

    const issues = [];
    for (const p of parcels) {
      if (p.componentType === '车体' && !p.vin) issues.push({ parcelId: p.id, type: '车体缺 VIN' });
      if (p.componentType === '电池' && !p.batterySn) issues.push({ parcelId: p.id, type: '电池缺 SN' });
      if (p.hazmatUn && !p.hazmatApproved) issues.push({ parcelId: p.id, type: '危品未审核' });
      if (p.status === '异常') issues.push({ parcelId: p.id, type: '包裹异常' });
    }
    const bodyParcels = parcels.filter(p => p.componentType === '车体');
    const batteryParcels = parcels.filter(p => p.componentType === '电池');
    if (bodyParcels.length && bodyParcels.length !== batteryParcels.length) {
      issues.push({ type: `车体与电池包裹数量不匹配（车体 ${bodyParcels.length} / 电池 ${batteryParcels.length}）` });
    }

    return {
      delivery,
      summary: {
        parcelCount: parcels.length,
        bodyCount: bodyParcels.length,
        batteryCount: batteryParcels.length,
        quantityTotal: parcels.reduce((sum, p) => sum + p.quantity, 0),
        byStatus: PARCEL_STATUSES.reduce((acc, s) => {
          const n = parcels.filter(p => p.status === s).length;
          if (n) acc[s] = n;
          return acc;
        }, {})
      },
      issues
    };
  }

  const TRACKING_TYPES = ['货代运单', '承运商运单', '其他'];

  async function listTrackings(parcelId) {
    const parcel = (await pool.query('SELECT id, parcel_no FROM delivery_parcels WHERE id = $1', [parcelId])).rows[0];
    if (!parcel) fail('包裹不存在', 404);
    const trackings = (await pool.query(
      `SELECT id, parcel_id AS "parcelId", tracking_type AS "trackingType", tracking_no AS "trackingNo",
              note, created_by AS "createdBy", created_at AS "createdAt"
         FROM delivery_parcel_trackings WHERE parcel_id = $1 ORDER BY created_at, id`,
      [parcelId]
    )).rows;
    return { parcelId, parcelNo: parcel.parcel_no, trackings };
  }

  async function addTracking(parcelId, input) {
    const trackingType = String(input?.trackingType || '').trim();
    if (!TRACKING_TYPES.includes(trackingType)) fail('物流编号类型无效');
    const trackingNo = text(input?.trackingNo, 120, '物流编号');
    if (!trackingNo) fail('物流编号不能为空');
    const note = text(input?.note, 300, '备注');
    try {
      return await tx('delivery.parcel.tracking.add', `delivery-parcels/${parcelId}/trackings`, async c => {
        const parcel = (await c.query(
          `SELECT p.id, p.parcel_no, p.tracking_no FROM delivery_parcels p WHERE p.id = $1 FOR UPDATE`,
          [parcelId]
        )).rows[0];
        if (!parcel) fail('包裹不存在', 404);
        const dup = (await c.query(
          'SELECT 1 FROM delivery_parcel_trackings WHERE parcel_id = $1 AND tracking_no = $2',
          [parcelId, trackingNo]
        )).rows[0];
        if (dup) fail(`物流编号 ${trackingNo} 已登记在该包裹`);
        const id = uuidv7();
        const row = (await c.query(
          `INSERT INTO delivery_parcel_trackings (id, parcel_id, tracking_type, tracking_no, note, created_by)
           VALUES ($1,$2,$3,$4,$5,$6)
           RETURNING id, parcel_id AS "parcelId", tracking_type AS "trackingType",
                     tracking_no AS "trackingNo", note, created_by AS "createdBy", created_at AS "createdAt"`,
          [id, parcelId, trackingType, trackingNo, note, currentActor()]
        )).rows[0];
        // 首个物流编号同步回填主表 tracking_no，保持旧视图兼容
        if (!parcel.tracking_no) {
          await c.query('UPDATE delivery_parcels SET tracking_no = $1 WHERE id = $2', [trackingNo, parcelId]);
        }
        return row;
      });
    } catch (e) {
      throw mapConflict(e);
    }
  }

  return { list, create, update, dispatch, receive, overview, reconcile, listTrackings, addTracking };
}

function registerDeliveryParcelRoutes(app, store) {
  const route = (method, url, action, { write = false } = {}) =>
    app.route({
      method,
      url,
      handler: async (req, reply) => {
        if (write && req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可操作交付包裹' });
        if (!store) return reply.code(503).send({ error: '交付包裹服务暂不可用' });
        try {
          return await action(req, reply);
        } catch (e) {
          if (e.statusCode) return reply.code(e.statusCode).send({ error: /[\u4e00-\u9fa5]/.test(e.message || '') ? e.message : '交付包裹操作失败' });
          req.log.error({ err: e, url: req.url }, 'delivery parcel failed');
          return reply.code(500).send({ error: '交付包裹操作失败' });
        }
      }
    });

  route('GET', '/api/production-deliveries/:id/parcels', req => store.list(req.params.id));
  route('POST', '/api/production-deliveries/:id/parcels', (req, reply) =>
    store.create(req.params.id, req.body || {}).then(row => reply.code(201).send(row)), { write: true });
  route('PATCH', '/api/delivery-parcels/:id', req => store.update(req.params.id, req.body || {}), { write: true });
  route('POST', '/api/delivery-parcels/:id/dispatch', req => store.dispatch(req.params.id), { write: true });
  route('POST', '/api/delivery-parcels/:id/receive', req => store.receive(req.params.id, req.body || {}), { write: true });
  route('GET', '/api/delivery-parcels/:id/trackings', req => store.listTrackings(req.params.id));
  route('POST', '/api/delivery-parcels/:id/trackings', (req, reply) =>
    store.addTracking(req.params.id, req.body || {}).then(row => reply.code(201).send(row)), { write: true });
  route('GET', '/api/production-orders/:id/delivery-overview', req => store.overview(req.params.id));
  route('GET', '/api/production-deliveries/:id/reconciliation', req => store.reconcile(req.params.id));
}

module.exports = { createDeliveryParcelStore, registerDeliveryParcelRoutes, COMPONENT_TYPES, PARCEL_STATUSES };
