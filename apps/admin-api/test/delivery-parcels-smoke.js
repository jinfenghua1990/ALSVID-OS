'use strict';

// 交付包裹端到端冒烟：验证 AT-01 / AT-02 / AT-05 / AT-09 与「车体必须有电池」强制规则。
// 全部测试数据带 E2E 前缀，运行结束自动清理；最后断言相关表回到 0 行。
// 用法：DATABASE_URL_UNPOOLED=... node test/delivery-parcels-smoke.js

const { Client } = require('pg');
const { createDeliveryParcelStore } = require('../delivery-parcels');
const { uuidv7 } = require('../uuidv7');

const CONNECTION = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!CONNECTION) {
  console.error('缺少 DATABASE_URL_UNPOOLED / DATABASE_URL');
  process.exit(1);
}

const TAG = `E2E-${Date.now()}`;
const ids = { warehouse: uuidv7(), bom: uuidv7(), order: uuidv7(), delivery: uuidv7() };
const results = [];
let failures = 0;

function check(name, condition, detail = '') {
  results.push({ name, ok: Boolean(condition), detail });
  if (!condition) failures += 1;
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function expectError(name, action, expectedFragment) {
  try {
    await action();
    check(name, false, '预期抛错但成功返回');
  } catch (error) {
    const hit = !expectedFragment || String(error.message).includes(expectedFragment);
    check(name, hit, error.message);
  }
}

async function seed(client) {
  await client.query(
    `INSERT INTO alsvid_v2.warehouses(id, entity_uuid, warehouse_code, name, kind, address)
     VALUES ($1, $2, $3, $4, '国内仓', 'E2E')`,
    [ids.warehouse, uuidv7(), `${TAG}-WH`, `${TAG} 国内仓`]
  );
  await client.query(
    `INSERT INTO alsvid_v2.bom_versions(id, entity_uuid, vehicle_id, version)
     VALUES (900001, $1, (SELECT id FROM alsvid_v2.products WHERE kind='vehicle' ORDER BY id LIMIT 1), '1')`,
    [ids.bom]
  );
  await client.query(
    `INSERT INTO alsvid_v2.production_orders
       (id, entity_uuid, order_no, sku_code, sku_uuid, bom_version_id, bom_version_uuid, factory, batch, planned_quantity)
     VALUES ($1, $2, $3, 'A1-ULT-GRY-EUR',
             (SELECT entity_uuid FROM alsvid_v2.skus WHERE code='A1-ULT-GRY-EUR'),
             900001, $4, 'E2E 工厂', $5, 2)`,
    [ids.order, uuidv7(), `${TAG}-PO`, ids.bom, TAG]
  );
  await client.query(
    `INSERT INTO alsvid_v2.production_deliveries
       (id, order_id, order_uuid, shipment_no, warehouse_id, warehouse_uuid, planned_quantity, status)
     VALUES ($1, $2, (SELECT entity_uuid FROM alsvid_v2.production_orders WHERE id=$2),
             $3, $4, (SELECT entity_uuid FROM alsvid_v2.warehouses WHERE id=$4), 2, '待发运')`,
    [ids.delivery, ids.order, `${TAG}-SHP`, ids.warehouse]
  );
}

async function cleanup(client) {
  await client.query('DELETE FROM alsvid_v2.delivery_parcel_serials WHERE parcel_id IN (SELECT id FROM alsvid_v2.delivery_parcels WHERE delivery_id=$1)', [ids.delivery]);
  await client.query('DELETE FROM alsvid_v2.delivery_parcels WHERE delivery_id=$1', [ids.delivery]);
  await client.query('DELETE FROM alsvid_v2.delivery_items WHERE delivery_id=$1', [ids.delivery]);
  await client.query('DELETE FROM alsvid_v2.production_deliveries WHERE id=$1', [ids.delivery]);
  await client.query('DELETE FROM alsvid_v2.production_orders WHERE id=$1', [ids.order]);
  await client.query('DELETE FROM alsvid_v2.bom_versions WHERE id=900001');
  await client.query('DELETE FROM alsvid_v2.warehouse_locations WHERE warehouse_uuid=(SELECT entity_uuid FROM alsvid_v2.warehouses WHERE id=$1)', [ids.warehouse]);
  await client.query('DELETE FROM alsvid_v2.warehouses WHERE id=$1', [ids.warehouse]);
  await client.query('DELETE FROM alsvid_v2.audit_log WHERE target LIKE $1', [`%${ids.delivery}%`]);
}

async function main() {
  const client = new Client({ connectionString: CONNECTION });
  await client.connect();
  const store = createDeliveryParcelStore(CONNECTION);
  let parcelIds = [];

  try {
    await seed(client);
    console.log(`\n=== 种子数据 ${TAG} 就绪 ===\n`);

    await expectError(
      '规则：整车只给车体不给电池 → 拒绝',
      () => store.create(ids.delivery, { parcels: [{ componentType: '车体', vin: `${TAG}-VIN0` }] }),
      '必须同时生成车体与电池'
    );

    await expectError(
      '规则：车体包裹缺 VIN → 拒绝',
      () => store.create(ids.delivery, { parcels: [{ componentType: '车体' }, { componentType: '电池', batterySn: `${TAG}-B0` }] }),
      '必须绑定 VIN'
    );

    const created = await store.create(ids.delivery, {
      parcels: [
        { componentType: '车体', vin: `${TAG}-VIN1`, cartonNo: 'CTN-1', carrier: 'DHL', trackingNo: `${TAG}-TRK1`, quantity: 1, grossWeightKg: 85.5 },
        { componentType: '电池', vin: `${TAG}-VIN1`, batterySn: `${TAG}-BAT1`, cartonNo: 'CTN-2', carrier: 'DHL', trackingNo: `${TAG}-TRK2`, quantity: 1, hazmatUn: 'UN3480' },
        { componentType: '车体', vin: `${TAG}-VIN2`, carrier: 'DHL', trackingNo: `${TAG}-TRK3`, quantity: 1 },
        { componentType: '电池', vin: `${TAG}-VIN2`, batterySn: `${TAG}-BAT2`, carrier: 'DHL', trackingNo: `${TAG}-TRK4`, quantity: 1 }
      ]
    });
    parcelIds = created.parcels.map(p => p.id);
    check('AT-01 一辆整车拆成车体+电池两个独立包裹', created.parcels.length === 4, `${created.parcels.length} 个包裹 / 2 辆车`);

    await expectError(
      '重复创建同一 VIN → 拒绝且不产生重复包裹',
      () => store.create(ids.delivery, { parcels: [
        { componentType: '车体', vin: `${TAG}-VIN1` },
        { componentType: '电池', vin: `${TAG}-VIN1`, batterySn: `${TAG}-BAT9` }
      ] }),
      '已在其他交付批次中占用'
    );

    const listed = await store.list(ids.delivery);
    check('包裹列表按组件类型可读', listed.parcels.length === 4, `${listed.parcels.length} 条`);
    check('车体与电池不共用包裹（component_type 单值）',
      listed.parcels.every(p => ['车体', '电池'].includes(p.componentType)));

    const body1 = listed.parcels.find(p => p.vin === `${TAG}-VIN1` && p.componentType === '车体');
    const battery1 = listed.parcels.find(p => p.vin === `${TAG}-VIN1` && p.componentType === '电池');

    await expectError(
      'AT-09 危品未审批 → 禁止确认发运',
      () => store.dispatch(battery1.id),
      '危险品未完成合规审核'
    );

    await store.dispatch(body1.id);
    await store.update(battery1.id, { hazmatApproved: true });
    await store.dispatch(battery1.id);
    check('车体与电池可各自独立发运', true);

    await store.receive(body1.id);
    const partial = await store.overview(ids.order);
    const v1 = partial.vehicles.find(v => v.vin === `${TAG}-VIN1`);
    check('AT-02 车体已签收、电池未签收 → 部分交付', v1?.partial === true && v1?.complete === false,
      `partial=${v1?.partial} complete=${v1?.complete}`);
    check('AT-02 完整交付计数据 VIN 合并判断，不用包数推算',
      partial.totals.vehiclesComplete === 0 && partial.totals.vehicles === 2,
      `complete=${partial.totals.vehiclesComplete} vehicles=${partial.totals.vehicles}`);

    await store.receive(battery1.id);
    const done = await store.overview(ids.order);
    const v1done = done.vehicles.find(v => v.vin === `${TAG}-VIN1`);
    check('AT-02 车体与电池均签收 → 完整交付', v1done?.complete === true, `complete=${v1done?.complete}`);

    const again = await store.receive(body1.id);
    check('AT-05 重复签收幂等', again.idempotent === true);

    const rec = await store.reconcile(ids.delivery);
    check('对账能识别未绑定序列号的包裹', rec.summary.parcelCount === 4,
      `parcels=${rec.summary.parcelCount} issues=${rec.issues.length}`);
    check('对账识别车体/电池数量匹配', rec.summary.bodyCount === rec.summary.batteryCount,
      `body=${rec.summary.bodyCount} battery=${rec.summary.batteryCount}`);
  } finally {
    try {
      await cleanup(client);
      const left = (await client.query(
        `SELECT (SELECT count(*) FROM alsvid_v2.delivery_parcels WHERE delivery_id=$1)
              + (SELECT count(*) FROM alsvid_v2.delivery_parcel_serials WHERE parcel_id = ANY($2::text[])) AS n`,
        [ids.delivery, parcelIds]
      )).rows[0].n;
      check('清理完成，无测试数据残留', Number(left) === 0, `残留 ${left}`);
    } catch (e) {
      console.error('清理失败：', e.message);
      failures += 1;
    }
    await client.end().catch(() => {});
  }

  console.log(`\n=== ${failures === 0 ? '全部通过' : failures + ' 项失败'} / 共 ${results.length} 项 ===`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch(error => {
  console.error('冒烟测试异常：', error);
  process.exitCode = 1;
});
