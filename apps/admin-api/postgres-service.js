const { currentActor } = require('./audit-context');
const { createPool } = require('./db-pool');
const { uuidv7, isUuidv7 } = require('./uuidv7');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const migrationDirectory=path.join(__dirname,'migrations');
const expectedMigrations=fs.readdirSync(migrationDirectory)
  .filter(name=>/^\d+_[a-z0-9_]+\.sql$/.test(name)).sort()
  .map(name=>({name,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(migrationDirectory,name))).digest('hex')}));
const optionalMigrations=new Set(['074_sku_attributes.sql', '117_product_colour_preferences.sql', '118_test_ride_enquiries.sql', '119_public_locations.sql', '120_public_location_source_links.sql', '121_dealer_application_source_archive.sql', '122_dealer_application_metadata.sql', '123_migration_source_immutability.sql', '124_test_ride_source_links.sql', '125_test_ride_location_authorization.sql', '126_shared_partners.sql', '127_procurement.sql', '128_supplier_portal.sql', '129_finance_workspace.sql', '130_inventory_stocktakes.sql', '131_warehouse_location_hierarchy.sql', '132_inventory_non_sku_ledger.sql', '133_engineering_build_specs.sql', '178_storefront_layout_versions.sql', '179_seo_traffic_sources.sql', '180_payment_providers.sql']);
function moneyAmount(value){const text=value==null||value===''?'0':typeof value==='string'?value.trim():typeof value==='number'&&Number.isFinite(value)?String(value):'';return /^\d{1,12}(?:\.\d{1,2})?$/.test(text)?text:null;}
function plannedMaterialQuantity(perVehicle,planned){if(!Number.isSafeInteger(planned)||planned<1)return null;const match=/^(\d+)(?:\.(\d+))?$/.exec(String(perVehicle));if(!match)return null;const fraction=match[2]||'',scale=10n**BigInt(fraction.length),units=BigInt(match[1])*scale+BigInt(fraction||'0'),total=units*BigInt(planned);if(total%scale!==0n)return null;const quantity=total/scale;return quantity>0n&&quantity<=BigInt(Number.MAX_SAFE_INTEGER)?Number(quantity):null;}

function createServiceStore(connectionString, options = {}) {
  const pool = createPool(connectionString, { max: 3, connectionTimeoutMillis: 10000 });
  async function tx(action, target, fn) {
    const c=await pool.connect();
    try { await c.query('BEGIN'); const result=await fn(c),{before=null,after}=result; if(!result.replayed&&after?.replayed!==true)await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(),action,target,before && JSON.stringify(before),after == null ? null : JSON.stringify(after)]); await c.query('COMMIT'); return after; }
    catch(e){await c.query('ROLLBACK').catch(()=>{});throw e;} finally{c.release();}
  }
  async function reservationSchemaReady(c) {
    const row=(await c.query(`SELECT to_regclass('alsvid_v2.inventory_ledger') IS NOT NULL
      AND to_regclass('alsvid_v2.inventory_reservations') IS NOT NULL
      AND EXISTS(SELECT 1 FROM information_schema.columns
        WHERE table_schema='alsvid_v2' AND table_name='production_order_materials'
          AND column_name='source_warehouse_uuid') AS ready`)).rows[0];
    return !!row.ready;
  }
  async function reserveProductionMaterial(c,orderId,materialId,warehouseId) {
    if(!await reservationSchemaReady(c)) throw Error('库存预占迁移尚未执行');
    const m=(await c.query(`SELECT m.id,m.sku_code AS sku,m.quantity,o.planned_quantity AS "plannedQuantity",
        s.entity_uuid AS "skuUuid",w.id AS "warehouseId",w.entity_uuid AS "warehouseUuid",w.status
      FROM production_order_materials m
      JOIN production_orders o ON o.id=m.order_id
      JOIN skus s ON s.code=m.sku_code
      JOIN products p ON p.id=s.product_id
      JOIN warehouses w ON w.id=$3
      WHERE m.id=$2 AND m.order_id=$1 AND p.kind='part'
      FOR UPDATE OF m`,[orderId,materialId,warehouseId])).rows[0];
    if(!m||m.status!=='启用') throw Error('请选择已启用的出料仓和有效配件');
    const quantity=plannedMaterialQuantity(m.quantity,m.plannedQuantity);
    if(quantity===null) throw Error('生产物料计划总量必须为正整数');
    const sourceId=`${orderId}:${materialId}`;
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[m.skuUuid+':'+m.warehouseUuid]);
    const prior=(await c.query(`SELECT id,quantity,warehouse_uuid AS "warehouseUuid"
      FROM inventory_reservations WHERE source_type='production_order'
        AND source_id=$1 AND status='reserved' FOR UPDATE`,[sourceId])).rows[0];
    if(prior&&prior.warehouseUuid===m.warehouseUuid&&Number(prior.quantity)===quantity){
      await c.query("UPDATE production_order_materials SET supply_party='ALSVID',source_warehouse_uuid=$1 WHERE id=$2",[m.warehouseUuid,materialId]);
      return prior;
    }
    if(prior) await c.query(`UPDATE inventory_reservations
      SET status='released',released_by=$1,released_at=now(),note='生产物料仓库或数量已调整'
      WHERE id=$2`,[currentActor(),prior.id]);
    const stock=(await c.query('SELECT quantity FROM warehouse_stock WHERE warehouse_id=$1 AND sku_code=$2 FOR UPDATE',[m.warehouseId,m.sku])).rows[0];
    if(!stock) throw Error('出料仓库存不足');
    const ledger=Number((await c.query(`SELECT COALESCE(sum(quantity_delta),0)::bigint AS quantity
      FROM inventory_ledger WHERE sku_uuid=$1 AND warehouse_uuid=$2`,[m.skuUuid,m.warehouseUuid])).rows[0].quantity);
    if(ledger!==Number(stock.quantity)) throw Error('库存账本与仓库余额不一致，已暂停预占');
    const available=Number((await c.query('SELECT available_quantity AS quantity FROM inventory_available_balances WHERE sku_uuid=$1 AND warehouse_uuid=$2',[m.skuUuid,m.warehouseUuid])).rows[0]?.quantity||0);
    if(available<quantity) throw Error('可用库存不足，无法预占生产物料');
    const reservation=(await c.query(`INSERT INTO inventory_reservations
      (sku_uuid,warehouse_uuid,quantity,source_type,source_id,created_by)
      VALUES($1,$2,$3,'production_order',$4,$5)
      RETURNING id,quantity,status`,[m.skuUuid,m.warehouseUuid,quantity,sourceId,currentActor()])).rows[0];
    await c.query("UPDATE production_order_materials SET supply_party='ALSVID',source_warehouse_uuid=$1 WHERE id=$2",[m.warehouseUuid,materialId]);
    return reservation;
  }
  async function releaseProductionMaterialReservation(c,orderId,materialId,note) {
    await c.query(`UPDATE inventory_reservations
      SET status='released',released_by=$1,released_at=now(),note=$2
      WHERE source_type='production_order' AND source_id=$3 AND status='reserved'`,
      [currentActor(),String(note||'').slice(0,500),`${orderId}:${materialId}`]);
  }
  async function releaseProductionOrderReservations(c,orderId) {
    await c.query(`UPDATE inventory_reservations
      SET status='released',released_by=$1,released_at=now(),note='生产订单已取消'
      WHERE source_type='production_order' AND status='reserved'
        AND source_id IN (SELECT $2 || ':' || m.id::text FROM production_order_materials m WHERE m.order_id=$2)`,
      [currentActor(),orderId]);
  }
  async function stageProductionMaterialAtDefaultLocation(c,orderId,material,quantity,warehouseLedger) {
    const locations=(await c.query(`SELECT l.id,l.code,l.is_default AS "isDefault",
        COALESCE((SELECT sum(x.quantity_delta) FROM inventory_condition_ledger x
          WHERE x.location_uuid=l.id AND x.sku_uuid=$2 AND x.condition='available'),0)::bigint AS available
      FROM warehouse_locations l WHERE l.warehouse_uuid=$1 AND l.status='启用'
      ORDER BY l.is_default DESC,l.code,l.id`,[material.warehouseUuid,material.skuUuid])).rows;
    const primary=locations.find(location=>location.isDefault);
    if(!primary)throw Error('生产物料出料仓缺少启用的默认库位');
    const locationTotal=Number((await c.query(`SELECT COALESCE(sum(x.quantity_delta),0)::bigint AS quantity FROM inventory_location_ledger x
      JOIN warehouse_locations l ON l.id=x.location_uuid WHERE l.warehouse_uuid=$1 AND x.sku_uuid=$2`,[material.warehouseUuid,material.skuUuid])).rows[0].quantity);
    const conditionTotal=Number((await c.query(`SELECT COALESCE(sum(x.quantity_delta),0)::bigint AS quantity FROM inventory_condition_ledger x
      JOIN warehouse_locations l ON l.id=x.location_uuid WHERE l.warehouse_uuid=$1 AND x.sku_uuid=$2`,[material.warehouseUuid,material.skuUuid])).rows[0].quantity);
    if(locationTotal!==warehouseLedger||conditionTotal!==warehouseLedger)throw Error('库存账本与库位余额不一致，已暂停生产完工');
    let remaining=Math.max(0,quantity-Number(primary.available));
    for(const location of locations){
      if(location.isDefault||remaining===0)continue;
      const moved=Math.min(remaining,Number(location.available));
      if(moved<=0)continue;
      await c.query(`INSERT INTO stock_movements(id,kind,sku_code,quantity,from_warehouse,to_warehouse,from_location_uuid,to_location_uuid,note,actor)
        VALUES($1,'调拨',$2,$3,$4,$4,$5,$6,$7,$8)`,[
        uuidv7(),material.sku,moved,material.warehouseId,location.id,primary.id,
        `生产订单 ${orderId} 完工领料拣货 ${material.id}`,currentActor()
      ]);
      remaining-=moved;
    }
    if(remaining>0)throw Error('生产物料缺少足够的可用库位库存，无法完成领料');
  }
  async function consumeProductionOrderReservations(c,orderId,plannedQuantity) {
    const materials=(await c.query(`SELECT m.id,m.sku_code AS sku,m.quantity,
        m.source_warehouse_uuid AS "warehouseUuid",s.entity_uuid AS "skuUuid",w.id AS "warehouseId"
      FROM production_order_materials m
      JOIN skus s ON s.code=m.sku_code
      LEFT JOIN warehouses w ON w.entity_uuid=m.source_warehouse_uuid
      WHERE m.order_id=$1 AND m.supply_party='ALSVID'
      ORDER BY m.id FOR UPDATE OF m`,[orderId])).rows;
    for(const m of materials){
      const quantity=plannedMaterialQuantity(m.quantity,plannedQuantity);
      if(quantity===null) throw Error('生产物料预占数量无效');
      const sourceId=`${orderId}:${m.id}`;
      const reservation=(await c.query(`SELECT id,quantity FROM inventory_reservations
        WHERE source_type='production_order' AND source_id=$1 AND sku_uuid=$2
          AND warehouse_uuid=$3 AND status='reserved' FOR UPDATE`,
        [sourceId,m.skuUuid,m.warehouseUuid])).rows[0];
      if(!reservation||Number(reservation.quantity)!==quantity) throw Error('ALSVID 供料物料尚未按计划完成库存预占');
      const stock=(await c.query('SELECT quantity FROM warehouse_stock WHERE warehouse_id=$1 AND sku_code=$2 FOR UPDATE',[m.warehouseId,m.sku])).rows[0];
      if(!stock) throw Error('生产物料出料仓库存不足');
      const ledger=Number((await c.query(`SELECT COALESCE(sum(quantity_delta),0)::bigint AS quantity
        FROM inventory_ledger WHERE sku_uuid=$1 AND warehouse_uuid=$2`,[m.skuUuid,m.warehouseUuid])).rows[0].quantity);
      if(ledger!==Number(stock.quantity)||ledger<quantity) throw Error('库存账本与仓库余额不一致，已暂停生产完工');
      const reserved=Number((await c.query(`SELECT COALESCE(sum(quantity),0)::bigint AS quantity
        FROM inventory_reservations WHERE sku_uuid=$1 AND warehouse_uuid=$2 AND status='reserved'`,[m.skuUuid,m.warehouseUuid])).rows[0].quantity);
      if(ledger<reserved) throw Error('生产物料预占已超过当前库存');
      await stageProductionMaterialAtDefaultLocation(c,orderId,m,quantity,ledger);
      await c.query('UPDATE warehouse_stock SET quantity=quantity-$1 WHERE warehouse_id=$2 AND sku_code=$3',[quantity,m.warehouseId,m.sku]);
      await c.query(`INSERT INTO inventory_ledger(source_type,source_id,line_no,sku_uuid,warehouse_id,quantity_delta,created_at)
        VALUES('production_order_material',$1,1,$2,$3,$4,now())`,
        [sourceId,m.skuUuid,m.warehouseId,-quantity]);
      await c.query(`UPDATE inventory_reservations SET status='consumed',consumed_by=$1,consumed_at=now()
        WHERE id=$2 AND status='reserved'`,[currentActor(),reservation.id]);
    }
  }
  const vinSql=`id,vin,model,sku_code AS sku,order_no AS "orderNo",factory,batch,bom_version AS "bomVersion",installed,serials,produced_at AS "producedAt",status,created_at AS "createdAt"`;
  const repairSql=`id,work_order_no AS no,vin,type,fault,replacement_sku AS sku,quantity AS qty,repair_store AS store,service_center_uuid AS "serviceCenterId",status,old_part AS "oldPart",created_at AS "createdAt"`;
  const serviceCenterSql=`id,code,name,country,region,city,address,contact_name AS "contactName",phone,email,status,note,revision,created_at AS "createdAt",updated_at AS "updatedAt"`;
  async function validServiceCenter(c,id,previousId=null){
    if(!id)return null;
    if(!isUuidv7(id))throw Error('服务网点编号无效');
    const center=(await c.query("SELECT id,name,status FROM service_centers WHERE id=$1 FOR SHARE",[id])).rows[0];
    if(!center)throw Error('服务网点不存在');
    if(center.status!=='启用'&&id!==previousId)throw Error('只能将维修工单分配给已启用的服务网点');
    return center;
  }
  const subSql=`id,original_sku AS "originalSku",replacement_sku AS "replacementSku",reason,effective_at AS "effectiveAt",status,note`;
  async function validateVinBom(c,sku,version){
    if(!sku){if(version)throw Error('选择 BOM 版本前请先选择整车 SKU');return;}
    const result=await c.query("SELECT p.id FROM skus s JOIN products p ON p.id=s.product_id WHERE s.code=$1 AND p.kind='vehicle'",[sku]);
    if(!result.rowCount)throw Error('整车 SKU 不存在');
    if(version&&!(await c.query('SELECT 1 FROM bom_versions WHERE vehicle_id=$1 AND version=$2',[result.rows[0].id,version])).rowCount)throw Error('BOM 版本不属于所选整车');
  }
  async function validateVinOrder(c,vin,existingOrder){
    if(!vin.orderNo)return;
    const order=(await c.query('SELECT o.entity_uuid AS "entityUuid",o.factory,o.batch,o.status FROM production_orders o WHERE o.order_no=$1 FOR UPDATE',[vin.orderNo])).rows[0];
    if(!order)throw Error('生产订单不存在');
    const item=(await c.query('SELECT planned_quantity AS "plannedQuantity" FROM production_order_items WHERE order_uuid=$1 AND sku_code=$2 FOR SHARE',[order.entityUuid,vin.sku])).rows[0];
    if(!item||order.factory!==vin.factory||order.batch!==vin.batch)throw Error('VIN 的整车 SKU、工厂和批次须与生产订单一致');
    if(existingOrder!==vin.orderNo){if(!['生产中','待发货'].includes(order.status))throw Error('仅生产中或待发货的订单可以关联新 VIN');const count=(await c.query('SELECT count(*)::int AS n FROM vins WHERE order_no=$1 AND sku_code=$2',[vin.orderNo,vin.sku])).rows[0].n;if(count>=item.plannedQuantity)throw Error('该车型已达到订单计划数量');}
  }
  // 迁移状态只在部署时变化（migration 文件在模块加载时已算好 sha256，库表由 migrate.js 写入）。
  // 每次 health 都跨境查 Neon 全量 schema_migrations + 存活探测会耗时 1~3s，做 30s TTL 缓存：
  // 成功结果与迁移门禁失败都会缓存；瞬时网络故障不缓存，以便下次请求重试。
  let migrationHealthCache=null; // {at, value, error}
  // 可注入 TTL：测试可传 0 关闭缓存，保证每次 health 都真实校验迁移状态。
  const MIGRATION_HEALTH_TTL_MS=Number.isFinite(options.healthCacheTtlMs)?options.healthCacheTtlMs:30_000;
  async function checkMigrationHealth(){
    const schema=(await pool.query("SELECT to_regclass('alsvid_v2.schema_migrations') IS NOT NULL AS ready")).rows[0];
    if(!schema.ready){const error=new Error('数据库迁移未完成');error.code='ALSVID_MIGRATIONS_PENDING';throw error;}
    const applied=(await pool.query('SELECT name,sha256 FROM alsvid_v2.schema_migrations')).rows;
    const current=new Map(applied.map(row=>[row.name,row.sha256]));
    const expectedNames=new Set(expectedMigrations.map(m=>m.name));
    const pendingOptionalMigrations=expectedMigrations.filter(m=>optionalMigrations.has(m.name)&&!current.has(m.name)).map(m=>m.name);
    if(expectedMigrations.some(m=>!optionalMigrations.has(m.name)&&current.get(m.name)!==m.sha256)||expectedMigrations.some(m=>optionalMigrations.has(m.name)&&current.has(m.name)&&current.get(m.name)!==m.sha256)||applied.some(m=>!expectedNames.has(m.name))){const error=new Error('数据库迁移未完成');error.code='ALSVID_MIGRATIONS_PENDING';throw error;}
    await pool.query('SELECT 1 FROM alsvid_v2.products LIMIT 0');
    return {pendingOptionalMigrations};
  }
  return {
    async health(){
      const now=Date.now();
      if(migrationHealthCache&&now-migrationHealthCache.at<MIGRATION_HEALTH_TTL_MS){
        if(migrationHealthCache.error)throw migrationHealthCache.error;
        return migrationHealthCache.value;
      }
      try{
        const value=await checkMigrationHealth();
        migrationHealthCache={at:Date.now(),value,error:null};
        return value;
      }catch(error){
        if(error.code==='ALSVID_MIGRATIONS_PENDING')migrationHealthCache={at:Date.now(),value:null,error};
        throw error;
      }
    },
    /**
     * 生产总览的两个外部口径：现货在库台数、应付未结（折 CNY）。
     * 单独一个轻量接口，避免前端为两个数字去拉整个库存页（7 个接口、跨境库 3–5s）。
     * 两个 query 都 try/catch：库存或财务视图不在时返回 null，前端降级显示「—」，不让总览整块挂掉。
     */
    /**
     * 库存货值：优先按「最近一张未取消生产单的采购单价」计价，
     * 没有采购单的 SKU 回退到产品主档单位成本（specs.unit_cost / specs._legacy8090.unit_cost_cny）。
     * costSource 会把每个 SKU 用的是哪一层暴露出来，「未计价」的就是两层都缺、货值按 0 计。
     * 一律折 CNY 汇总，汇率取该生产单上记的 exchange_rate。
     */
    // 审计留痕：8090「审计日志」同款能力。AuditPage 期待 at/before/after 字段名。
    async stockValuation(){
      const rows=(await pool.query(`
        WITH latest AS (
          SELECT DISTINCT ON (i.sku_code) i.sku_code,i.unit_price,
                 COALESCE(o.currency,'CNY') AS currency,COALESCE(o.exchange_rate,1) AS fx
          FROM production_order_items i
          JOIN production_orders o ON o.entity_uuid=i.order_uuid
          WHERE o.status<>'已取消'
          ORDER BY i.sku_code,o.order_date DESC NULLS LAST,o.created_at DESC
        ),
        stock AS (
          SELECT sku_code,sum(quantity)::int AS qty FROM warehouse_stock GROUP BY sku_code
        )
        SELECT s.sku_code,s.qty,
               COALESCE(l.unit_price,(p.specs->>'unit_cost')::numeric,(p.specs->'_legacy8090'->>'unit_cost_cny')::numeric) AS unit_cost,
               COALESCE(l.currency,'CNY') AS cost_currency,
               COALESCE(l.fx,1) AS fx,
               CASE WHEN l.unit_price IS NOT NULL THEN '采购单价'
                    WHEN COALESCE((p.specs->>'unit_cost')::numeric,(p.specs->'_legacy8090'->>'unit_cost_cny')::numeric) IS NOT NULL THEN '主档成本'
                    ELSE '未计价' END AS cost_source,
               COALESCE(p.name,'') AS product_name,
               COALESCE(p.kind,'') AS kind
        FROM stock s
        LEFT JOIN latest l ON l.sku_code=s.sku_code
        LEFT JOIN skus sk ON sk.code=s.sku_code
        LEFT JOIN products p ON p.id=sk.product_id
        ORDER BY s.sku_code`)).rows;
      const bySku=rows.map(r=>{
        const qty=Number(r.qty||0),unitCost=r.unit_cost===null?null:Number(r.unit_cost),fx=Number(r.fx||1);
        const valueCny=unitCost===null?0:Math.round(qty*unitCost*fx*100)/100;
        return{sku:r.sku_code,productName:r.product_name,kind:r.kind,quantity:qty,
          unitCost,currency:r.cost_currency,valueCny,costSource:r.cost_source};
      });
      return{
        totalCny:Math.round(bySku.reduce((sum,r)=>sum+r.valueCny,0)*100)/100,
        unpriced:bySku.filter(r=>r.costSource==='未计价').length,
        skuCount:bySku.length,
        bySku,
      };
    },
    async productionOverviewExtras(){
      let inventory=null,payable=null;
      try{inventory=(await pool.query(`SELECT COALESCE(sum(ws.quantity),0)::int AS units,count(DISTINCT ws.sku_code)::int AS skus
        FROM warehouse_stock ws
        JOIN skus s ON s.entity_uuid=ws.sku_uuid
        JOIN products p ON p.id=s.product_id
        WHERE p.kind='vehicle' AND p.status='启用'`)).rows[0]}catch(_){}
      try{payable=(await pool.query(`SELECT count(*)::int AS count,
          COALESCE(sum(CASE currency WHEN 'EUR' THEN 7.85 WHEN 'USD' THEN 7.2 ELSE 1 END*outstanding_amount),0) AS total_cny
        FROM finance_v_obligations
        WHERE direction='AP' AND settlement_status<>'VOID' AND outstanding_amount>0`)).rows[0]}catch(_){}
      return{
        inventoryUnits:inventory?Number(inventory.units||0):null,
        inventorySkus:inventory?Number(inventory.skus||0):null,
        payableCny:payable?Math.round(Number(payable.total_cny||0)*100)/100:null,
        payableCount:payable?Number(payable.count||0):null,
      };
    },
    async listProductionOrderEvents(id){const exists=(await pool.query('SELECT 1 FROM production_orders WHERE id=$1',[id])).rowCount;if(!exists)throw Error('生产订单不存在');return (await pool.query('SELECT id,event_type AS "eventType",progress_percent AS "progressPercent",actual_quantity AS "actualQuantity",note,actor,created_at AS "createdAt" FROM production_order_events WHERE order_id=$1 ORDER BY created_at DESC,id DESC',[id])).rows;},    async confirmProductionFactory(id){return tx('production_order.factory_confirm',`production_orders/${id}`,async c=>{const row=(await c.query("SELECT id,status,factory_confirmed_at AS \"factoryConfirmedAt\" FROM production_orders WHERE id=$1 FOR UPDATE",[id])).rows[0];if(!row)throw Error('生产订单不存在');if(row.status==='已取消')throw Error('已取消订单不能确认工厂');const after=(await c.query("UPDATE production_orders SET factory_confirmed_at=COALESCE(factory_confirmed_at,now()),status=CASE WHEN status IN ('待工厂确认','计划中') THEN '生产中' ELSE status END,updated_at=now() WHERE id=$1 RETURNING id,status,factory_confirmed_at AS \"factoryConfirmedAt\",updated_at AS \"updatedAt\"",[id])).rows[0];return after;});},
    async createProductionOrderV3(b){const factoryId=String(b.factoryId||'').trim(),customerId=b.customerId?String(b.customerId).toLowerCase():null,currency=String(b.currency||'CNY').trim().toUpperCase(),rate=Number(b.exchangeRate),orderDate=String(b.orderDate||''),expected=String(b.expectedDeliveryDate||''),note=String(b.note||'').trim(),items=(Array.isArray(b.items)?b.items:[]).map(item=>({sku:String(item.sku||'').trim(),plannedQuantity:Number(item.plannedQuantity),unitPrice:moneyAmount(item.unitPrice)})),idempotencyKey=String(b.idempotencyKey||'').trim().slice(0,200);if(!idempotencyKey)throw Error('生产订单幂等编号必填');const requestHash=crypto.createHash('sha256').update(JSON.stringify({factoryId,customerId,currency,rate,orderDate,expected,note,items,exchangeRateSource:String(b.exchangeRateSource||'')})).digest('hex');if(!factoryId||(customerId&&!isUuidv7(customerId))||!items.length||items.some(item=>!item.sku||!Number.isSafeInteger(item.plannedQuantity)||item.plannedQuantity<1||item.unitPrice===null)||new Set(items.map(item=>item.sku)).size!==items.length||!['CNY','EUR','USD','GBP'].includes(currency)||!Number.isFinite(rate)||rate<=0||!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)||!/^\d{4}-\d{2}-\d{2}$/.test(expected))throw Error('请完整填写订单信息、车型明细、金额、币种、汇率和日期，且同一 SKU 不能重复');return tx('production_order.create','production_orders',async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`production-order-create:${idempotencyKey}`]);const prior=(await c.query("SELECT before_json,after_json FROM audit_log WHERE action='production_order.create' AND target='production_orders' AND before_json->>'idempotencyKey'=$1 ORDER BY created_at DESC LIMIT 1",[idempotencyKey])).rows[0];if(prior){const before=typeof prior.before_json==='string'?JSON.parse(prior.before_json):prior.before_json;if(before?.requestHash!==requestHash)throw Object.assign(Error('生产订单幂等编号已用于不同内容'),{statusCode:409});const saved=typeof prior.after_json==='string'?JSON.parse(prior.after_json):prior.after_json;return{replayed:true,after:{...saved,replayed:true}}}const factory=(await c.query("SELECT name FROM factories WHERE id=$1 AND status='启用'",[factoryId])).rows[0];if(customerId){const customer=(await c.query('SELECT id,is_b2b,currency FROM customers WHERE id=$1 FOR SHARE',[customerId])).rows[0];if(!customer||!customer.is_b2b)throw Error('B2B客户不存在');if(customer.currency!==currency)throw Error('订单币种必须与客户结算币种一致')}if(!factory)throw Error('请选择已启用的合作工厂');const vehicles=(await c.query("SELECT s.code,s.entity_uuid AS \"skuUuid\" FROM skus s JOIN products p ON p.id=s.product_id WHERE s.code=ANY($1) AND p.kind='vehicle' AND p.status='启用' FOR SHARE OF p",[items.map(item=>item.sku)])).rows;if(vehicles.length!==items.length)throw Error('车型明细中包含未启用或不存在的整车 SKU');const vehicleBySku=new Map(vehicles.map(vehicle=>[vehicle.code,vehicle]));const totalQuantity=items.reduce((sum,item)=>sum+item.plannedQuantity,0),orderTotal=items.reduce((sum,item)=>sum+Number(item.unitPrice)*item.plannedQuantity,0),day=orderDate.replaceAll('-','');await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`production-order:${day}`]);const next=(await c.query("SELECT COALESCE(max((substring(order_no from '([0-9]{3})$'))::int),0)+1 AS n FROM production_orders WHERE order_no LIKE $1",[`PO-${day}-%`])).rows[0].n,orderNo=`PO-${day}-${String(next).padStart(3,'0')}`,id=uuidv7(),legacySku=items[0].sku;const after=(await c.query("INSERT INTO production_orders(id,order_no,sku_code,factory,factory_id,batch,planned_quantity,supplier_cost,cost_currency,status,order_date,currency,exchange_rate,exchange_rate_source,expected_delivery_date,note,customer_id) VALUES($1,$2,$3,$4,$5,'',$6,$7,$8,'待工厂确认',$9,$10,$11,$12,$13,$14,$15) RETURNING id,entity_uuid AS \"entityUuid\",order_no AS \"orderNo\",factory,factory_id AS \"factoryId\",planned_quantity AS \"plannedQuantity\",actual_quantity AS \"actualQuantity\",status,order_date::text AS \"orderDate\",currency,exchange_rate AS \"exchangeRate\",exchange_rate_source AS \"exchangeRateSource\",expected_delivery_date::text AS \"expectedDeliveryDate\",note,created_at AS \"createdAt\",updated_at AS \"updatedAt\"",[id,orderNo,legacySku,factory.name,factoryId,totalQuantity,orderTotal,currency,orderDate,currency,rate,String(b.exchangeRateSource||''),expected,note,customerId])).rows[0];for(const item of items){const vehicle=vehicleBySku.get(item.sku);await c.query('INSERT INTO production_order_items(order_uuid,sku_uuid,sku_code,planned_quantity,unit_price) VALUES($1,$2,$3,$4,$5)',[after.entityUuid,vehicle.skuUuid,item.sku,item.plannedQuantity,item.unitPrice]);}return{before:{idempotencyKey,requestHash},after:{...after,items,orderTotal,cnyTotal:currency==='CNY'?orderTotal:orderTotal*rate}};});},    async updateProductionOrderV3(id,b){const factoryId=String(b.factoryId||'').trim(),currency=String(b.currency||'CNY').trim().toUpperCase(),rate=Number(b.exchangeRate),orderDate=String(b.orderDate||''),expected=String(b.expectedDeliveryDate||''),note=String(b.note||'').trim(),items=(Array.isArray(b.items)?b.items:[]).map(item=>({sku:String(item.sku||'').trim(),plannedQuantity:Number(item.plannedQuantity),unitPrice:moneyAmount(item.unitPrice)}));if(!factoryId||!items.length||items.some(item=>!item.sku||!Number.isSafeInteger(item.plannedQuantity)||item.plannedQuantity<1||item.unitPrice===null)||new Set(items.map(item=>item.sku)).size!==items.length||!['CNY','EUR','USD','GBP'].includes(currency)||!Number.isFinite(rate)||rate<=0||!/^\d{4}-\d{2}-\d{2}$/.test(orderDate)||!/^\d{4}-\d{2}-\d{2}$/.test(expected))throw Error('请完整填写订单信息、车型明细、金额、币种、汇率和日期，且同一 SKU 不能重复');return tx('production_order.update','production_orders/'+id,async c=>{const old=(await c.query('SELECT id,entity_uuid AS "entityUuid",actual_quantity AS "actualQuantity" FROM production_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old)throw Error('生产订单不存在');if(Number(old.actualQuantity||0)>0||(await c.query('SELECT 1 FROM production_deliveries WHERE order_id=$1 LIMIT 1',[id])).rowCount)throw Error('已有生产进度、交货或发货记录的订单不能修改车型和数量');const factory=(await c.query("SELECT name FROM factories WHERE id=$1 AND status='启用'",[factoryId])).rows[0];if(!factory)throw Error('请选择已启用的合作工厂');const vehicles=(await c.query("SELECT s.code,s.entity_uuid AS \"skuUuid\" FROM skus s JOIN products p ON p.id=s.product_id WHERE s.code=ANY($1) AND p.kind='vehicle' AND p.status='启用' FOR SHARE OF p",[items.map(item=>item.sku)])).rows;if(vehicles.length!==items.length)throw Error('车型明细中包含未启用或不存在的整车 SKU');const vehicleBySku=new Map(vehicles.map(vehicle=>[vehicle.code,vehicle])),totalQuantity=items.reduce((sum,item)=>sum+item.plannedQuantity,0),orderTotal=items.reduce((sum,item)=>sum+Number(item.unitPrice)*item.plannedQuantity,0),legacySku=items[0].sku;await c.query("UPDATE production_orders SET sku_code=$1,factory=$2,factory_id=$3,planned_quantity=$4,supplier_cost=$5,cost_currency=$6,order_date=$7,currency=$8,exchange_rate=$9,exchange_rate_source=$10,expected_delivery_date=$11,note=$12,updated_at=now() WHERE id=$13",[legacySku,factory.name,factoryId,totalQuantity,orderTotal,currency,orderDate,currency,rate,String(b.exchangeRateSource||''),expected,note,id]);await c.query('DELETE FROM production_order_items WHERE order_uuid=$1',[old.entityUuid]);for(const item of items){const vehicle=vehicleBySku.get(item.sku);await c.query('INSERT INTO production_order_items(order_uuid,sku_uuid,sku_code,planned_quantity,unit_price) VALUES($1,$2,$3,$4,$5)',[old.entityUuid,vehicle.skuUuid,item.sku,item.plannedQuantity,item.unitPrice]);}const after=(await c.query("SELECT id,entity_uuid AS \"entityUuid\",order_no AS \"orderNo\",factory,factory_id AS \"factoryId\",planned_quantity AS \"plannedQuantity\",actual_quantity AS \"actualQuantity\",status,order_date::text AS \"orderDate\",currency,exchange_rate AS \"exchangeRate\",exchange_rate_source AS \"exchangeRateSource\",expected_delivery_date::text AS \"expectedDeliveryDate\",note,updated_at AS \"updatedAt\" FROM production_orders WHERE id=$1",[id])).rows[0];return{before:old,after:{...after,items,orderTotal,cnyTotal:currency==='CNY'?orderTotal:orderTotal*rate}};});},
    async listProductionOrdersV3(){return (await pool.query(`SELECT o.id,o.order_no AS "orderNo",o.factory,o.factory_id AS "factoryId",o.batch,COALESCE(lines."plannedQuantity",o.planned_quantity) AS "plannedQuantity",o.progress_percent AS "progressPercent",o.actual_quantity AS "actualQuantity",COALESCE(lines."orderTotal",o.supplier_cost*o.planned_quantity) AS "orderTotal",COALESCE(o.currency,o.cost_currency) AS currency,o.exchange_rate AS "exchangeRate",o.exchange_rate_source AS "exchangeRateSource",o.order_date::text AS "orderDate",o.expected_delivery_date::text AS "expectedDeliveryDate",o.factory_confirmed_at AS "factoryConfirmedAt",o.production_started_at AS "productionStartedAt",o.production_completed_at AS "productionCompletedAt",o.note,o.status,COALESCE(d."deliveryCount",0)::int AS "deliveryCount",COALESCE(d."receiptCount",0)::int AS "receiptCount",COALESCE(d."deliveredQuantity",0)::int AS "deliveryPlannedQuantity",COALESCE(d."receivedQuantity",0)::int AS "deliveryReceivedQuantity",COALESCE(p."paidTotal",0) AS "paidTotal",COALESCE(p."paymentCount",0)::int AS "paymentCount",CASE WHEN o.status='已取消' THEN '已取消' WHEN o.status='已完成' THEN '交货完成' WHEN COALESCE(lines."plannedQuantity",o.planned_quantity)>0 AND o.actual_quantity>=COALESCE(lines."plannedQuantity",o.planned_quantity) AND COALESCE(d."receivedQuantity",0)>=COALESCE(lines."plannedQuantity",o.planned_quantity) THEN '交货完成' WHEN o.actual_quantity>0 OR COALESCE(d."deliveredQuantity",0)>0 OR COALESCE(d."receivedQuantity",0)>0 THEN '部分交货' ELSE '待交货' END AS "flowStatus",o.updated_at AS "updatedAt",o.created_at AS "createdAt",COALESCE(lines.items,'[]'::json) AS items,o.customer_id AS "b2bCustomerId",c.code AS "b2bCustomerCode",EXISTS(SELECT 1 FROM sales_orders so WHERE so.production_order_uuid=o.entity_uuid) AS "servesSalesOrder",
(SELECT so.order_no FROM sales_orders so WHERE so.production_order_uuid=o.entity_uuid ORDER BY so.created_at LIMIT 1) AS "sourceOrderNo",
(SELECT so.customer_name FROM sales_orders so WHERE so.production_order_uuid=o.entity_uuid ORDER BY so.created_at LIMIT 1) AS "soCustomerName",
(SELECT w.name FROM production_deliveries d JOIN warehouses w ON w.entity_uuid=d.warehouse_uuid WHERE d.order_id=o.id LIMIT 1) AS "targetWarehouse" FROM production_orders o LEFT JOIN customers c ON c.id=o.customer_id LEFT JOIN LATERAL (SELECT sum(i.planned_quantity)::int AS "plannedQuantity",sum(i.planned_quantity*i.unit_price) AS "orderTotal",json_agg(json_build_object('sku',i.sku_code,'productName',p.name,'plannedQuantity',i.planned_quantity,'unitPrice',i.unit_price) ORDER BY i.created_at) AS items FROM production_order_items i LEFT JOIN skus sk ON sk.code=i.sku_code LEFT JOIN products p ON p.id=sk.product_id WHERE i.order_uuid=o.entity_uuid) lines ON true LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE x.cancelled IS NULL)::int AS "deliveryCount",count(*) FILTER (WHERE x.cancelled IS NULL AND x.received_quantity>0)::int AS "receiptCount",COALESCE(sum(x.planned_quantity) FILTER (WHERE x.cancelled IS NULL),0)::int AS "deliveredQuantity",COALESCE(sum(x.received_quantity) FILTER (WHERE x.cancelled IS NULL),0)::int AS "receivedQuantity",count(*) FILTER (WHERE x.cancelled IS NULL AND x.status IN ('已交运','在途','运输中','已签收','已入库','异常'))::int AS "dispatched" FROM (SELECT delivery.*,(SELECT 1 FROM production_delivery_cancellations c WHERE c.delivery_uuid=delivery.entity_uuid LIMIT 1) AS cancelled FROM production_deliveries delivery WHERE delivery.order_id=o.id) x) d ON true LEFT JOIN LATERAL (SELECT COALESCE(sum(payment.amount) FILTER (WHERE payment.status='已确认'),0) AS "paidTotal",count(*)::int AS "paymentCount" FROM production_order_payments payment WHERE payment.order_id=o.id) p ON true ORDER BY o.created_at DESC`)).rows;},
    async listProductionFinance(orderId){
      const order=(await pool.query(`SELECT o.id,COALESCE(o.currency,o.cost_currency) AS currency,
        COALESCE((SELECT sum(i.planned_quantity*i.unit_price) FROM production_order_items i WHERE i.order_uuid=o.entity_uuid),o.supplier_cost*o.planned_quantity)::numeric AS "orderTotal"
        FROM production_orders o WHERE o.id=$1`,[orderId])).rows[0];
      if(!order)throw Error('生产订单不存在');
      const payments=(await pool.query(`SELECT id,paid_on::text AS "paidOn",payer_type AS "payerType",payer_account AS "payerAccount",payee,amount::text,voucher_type AS "voucherType",attachment_id AS "attachmentId",note,status,recorded_by AS "recordedBy",created_at AS "createdAt" FROM production_order_payments WHERE order_id=$1 ORDER BY paid_on,created_at,id`,[orderId])).rows;
      const invoices=(await pool.query(`SELECT id,status,amount::text,issued_on::text AS "issuedOn",invoice_number AS "invoiceNumber",attachment_id AS "attachmentId",note,recorded_by AS "recordedBy",created_at AS "createdAt" FROM production_order_invoices WHERE order_id=$1 ORDER BY created_at,id`,[orderId])).rows;
      const orderTotal=Number(order.orderTotal||0);
      const paidTotal=payments.filter(payment=>payment.status==='已确认').reduce((sum,payment)=>sum+Number(payment.amount||0),0);
      const invoicedTotal=invoices.reduce((sum,invoice)=>sum+Number(invoice.amount||0),0);
      return{orderId,currency:order.currency,orderTotal:orderTotal.toFixed(2),paidTotal:paidTotal.toFixed(2),remainingTotal:Math.max(0,orderTotal-paidTotal).toFixed(2),invoicedTotal:invoicedTotal.toFixed(2),paymentCount:payments.length,invoiceCount:invoices.length,invoiceStatus:invoicedTotal<=0?'未开票':invoicedTotal>=orderTotal?'已开票':'部分开票',payments,invoices};
    },
    async addProductionPayment(orderId,b){
      const id=b.id==null?uuidv7():String(b.id).toLowerCase(),paidOn=String(b.paidOn||'').trim(),payerType=String(b.payerType||'').trim(),payerAccount=String(b.payerAccount||'').trim(),payee=String(b.payee||'').trim(),voucherType=String(b.voucherType||'').trim(),note=String(b.note||'').trim(),amount=moneyAmount(b.amount);
      if(!isUuidv7(id)||!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)||!['对公','个人'].includes(payerType)||!payee||payee.length>120||amount===null||Number(amount)<=0||!['','银行回单','银行流水','转账截图'].includes(voucherType)||payerAccount.length>120||note.length>2000)throw Error('请填写有效的付款日期、付款主体、收款方和付款金额');
      return tx('production_order.payment.add',`production_orders/${orderId}/payments/${id}`,async c=>{
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`production-payment:${id}`]);
        const prior=(await c.query('SELECT id,order_id AS "orderId",paid_on::text AS "paidOn",payer_type AS "payerType",payer_account AS "payerAccount",payee,amount::text,voucher_type AS "voucherType",note,status,recorded_by AS "recordedBy",created_at AS "createdAt" FROM production_order_payments WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(prior){if(prior.orderId!==orderId||prior.paidOn!==paidOn||prior.payerType!==payerType||prior.payerAccount!==payerAccount||prior.payee!==payee||Number(prior.amount)!==Number(amount)||prior.voucherType!==voucherType||prior.note!==note)throw Object.assign(Error('付款请求编号已用于不同内容'),{statusCode:409});return{after:{...prior,replayed:true}};}
        const order=(await c.query('SELECT id,COALESCE(currency,cost_currency) AS currency FROM production_orders WHERE id=$1 FOR SHARE',[orderId])).rows[0];
        if(!order)throw Error('生产订单不存在');
        const after=(await c.query(`INSERT INTO production_order_payments(id,order_id,paid_on,payer_type,payer_account,payee,amount,currency,voucher_type,note,status,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'已确认',$11) RETURNING id,paid_on::text AS "paidOn",payer_type AS "payerType",payer_account AS "payerAccount",payee,amount::text,voucher_type AS "voucherType",attachment_id AS "attachmentId",note,status,recorded_by AS "recordedBy",created_at AS "createdAt"`,[id,orderId,paidOn,payerType,payerAccount,payee,amount,order.currency,voucherType,note,currentActor()])).rows[0];
        return{after};
      });
    },
    async addProductionInvoice(orderId,b){
      const id=b.id==null?uuidv7():String(b.id).toLowerCase(),status=String(b.status||'已开票').trim(),issuedOn=String(b.issuedOn||'').trim(),invoiceNumber=String(b.invoiceNumber||'').trim(),note=String(b.note||'').trim(),amount=moneyAmount(b.amount);
      if(!isUuidv7(id)||!['未开票','部分开票','已开票'].includes(status)||invoiceNumber.length>120||note.length>2000)throw Error('发票状态、发票号码或备注无效');
      const hasDate=/^\d{4}-\d{2}-\d{2}$/.test(issuedOn);
      if(issuedOn&&!hasDate)throw Error('开票日期无效');
      if(status!=='未开票'&&(!hasDate||!invoiceNumber||amount===null||Number(amount)<=0))throw Error('请填写有效的开票日期、发票号码和发票金额');
      if(amount===null)throw Error('发票金额无效');
      return tx('production_order.invoice.add',`production_orders/${orderId}/invoices/${id}`,async c=>{
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`production-invoice:${id}`]);
        const prior=(await c.query('SELECT id,order_id AS "orderId",status,amount::text,issued_on::text AS "issuedOn",invoice_number AS "invoiceNumber",currency,note,recorded_by AS "recordedBy",created_at AS "createdAt" FROM production_order_invoices WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(prior){if(prior.orderId!==orderId||prior.status!==status||Number(prior.amount)!==Number(amount)||prior.issuedOn!==(hasDate?issuedOn:null)||prior.invoiceNumber!==invoiceNumber||prior.note!==note)throw Object.assign(Error('发票请求编号已用于不同内容'),{statusCode:409});return{after:{...prior,replayed:true}};}
        const order=(await c.query('SELECT id,COALESCE(currency,cost_currency) AS currency FROM production_orders WHERE id=$1 FOR SHARE',[orderId])).rows[0];
        if(!order)throw Error('生产订单不存在');
        const after=(await c.query(`INSERT INTO production_order_invoices(id,order_id,status,amount,issued_on,invoice_number,currency,note,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,status,amount::text,issued_on::text AS "issuedOn",invoice_number AS "invoiceNumber",attachment_id AS "attachmentId",note,recorded_by AS "recordedBy",created_at AS "createdAt"`,[id,orderId,status,amount,hasDate?issuedOn:null,invoiceNumber,order.currency,note,currentActor()])).rows[0];
        return{after};
      });
    },
    async getProductionBomSnapshot(id){return (await pool.query('SELECT bom_snapshot AS snapshot FROM production_orders WHERE id=$1',[id])).rows[0]||null;},
    async transitionProductionOrder(id,status){
      return tx('production_order.status',`production_orders/${id}`,async c=>{
        const old=(await c.query('SELECT id,order_no AS "orderNo",status,qc_status,planned_quantity AS "plannedQuantity",progress_percent AS "progressPercent",actual_quantity AS "actualQuantity" FROM production_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!old)throw Error('生产订单不存在');
        const allowed={'计划中':['生产中','已取消'],'待工厂确认':['已取消'],'生产中':['已完成','已取消'],'待发货':['已完成','已取消'],'已完成':[],'已取消':[]};
        if(!allowed[old.status]?.includes(status))throw Error('订单状态流转无效');
        const count=(await c.query('SELECT count(*)::int AS n FROM vins WHERE order_no=$1',[old.orderNo])).rows[0].n;
        if(status==='已完成'){
          const received=(await c.query("SELECT COALESCE(sum(received_quantity) FILTER (WHERE status<>'取消'),0)::int AS quantity FROM production_deliveries WHERE order_id=$1",[id])).rows[0].quantity;
          if(old.progressPercent!==100||old.actualQuantity!==old.plannedQuantity)throw Error('生产进度须为 100%，实际完成数量须等于计划数量才能完成生产订单');
          if(received<old.plannedQuantity)throw Error('全部计划数量确认入库后才能完成生产订单');
        }
        if(status==='已取消'&&count>0)throw Error('已有 VIN 关联的订单不能取消');
        if(status==='已取消'){
          if((await c.query("SELECT 1 FROM production_deliveries d LEFT JOIN production_delivery_cancellations x ON x.delivery_uuid=d.entity_uuid WHERE d.order_id=$1 AND x.id IS NULL AND d.status IN ('在途','已入库') LIMIT 1",[id])).rowCount)throw Error('已有在途或已入库发运的订单不能取消');
        }
        if(status==='已完成'&&await reservationSchemaReady(c))await consumeProductionOrderReservations(c,id,old.plannedQuantity);
        if(status==='已取消'&&await reservationSchemaReady(c))await releaseProductionOrderReservations(c,id);
        const updated=(await c.query('UPDATE production_orders SET status=$1 WHERE id=$2 RETURNING id,order_no AS "orderNo",status',[status,id])).rows[0];
        return{before:old,after:{...updated,vinCount:count}};
      });
    },
    async listProductionAttachments(orderId){return (await pool.query('SELECT id,order_id AS "orderId",file_name AS "fileName",content_type AS "contentType",file_size AS "fileSize",category,ref_id AS "refId",uploaded_by AS "uploadedBy",created_at AS "createdAt" FROM production_order_attachments WHERE order_id=$1 ORDER BY created_at DESC',[orderId])).rows;},
    async addProductionAttachment(orderId,input){const category=String(input.category||'其他').trim().slice(0,40),refId=String(input.refId||'').trim().toLowerCase(),id=uuidv7();if(refId&&!isUuidv7(refId))throw Error('付款或发票记录编号无效');return tx('production_order.attachment.add',`production_orders/${orderId}/attachments/${id}`,async c=>{const order=(await c.query('SELECT id FROM production_orders WHERE id=$1 FOR SHARE',[orderId])).rows[0];if(!order)throw Error('生产订单不存在');const row=(await c.query('INSERT INTO production_order_attachments(id,order_id,object_key,file_name,content_type,file_size,category,ref_id,uploaded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,order_id AS "orderId",file_name AS "fileName",content_type AS "contentType",file_size AS "fileSize",category,ref_id AS "refId",uploaded_by AS "uploadedBy",created_at AS "createdAt"',[id,orderId,input.key,input.fileName,input.contentType,input.fileSize,category,refId||null,currentActor()])).rows[0];if(refId){let linked=(await c.query('UPDATE production_order_payments SET attachment_id=$1 WHERE id=$2 AND order_id=$3 RETURNING id',[id,refId,orderId])).rows[0];if(!linked)linked=(await c.query('UPDATE production_order_invoices SET attachment_id=$1 WHERE id=$2 AND order_id=$3 RETURNING id',[id,refId,orderId])).rows[0];if(!linked)throw Error('付款或发票记录不存在');}return{after:row};});},
    async getProductionAttachment(orderId,id){return (await pool.query('SELECT object_key AS "key",file_name AS "fileName",content_type AS "contentType" FROM production_order_attachments WHERE order_id=$1 AND id=$2',[orderId,id])).rows[0]||null;},
    async listOrderMaterials(orderId){
      const ready=await reservationSchemaReady(pool);
      const reservationJoin=ready?`LEFT JOIN LATERAL (
        SELECT r.status,r.quantity,r.warehouse_uuid,w.name AS "warehouseName",w.id AS "warehouseId"
        FROM inventory_reservations r LEFT JOIN warehouses w ON w.entity_uuid=r.warehouse_uuid
        WHERE r.source_type='production_order' AND r.source_id=(m.order_id||':'||m.id)
        ORDER BY r.created_at DESC LIMIT 1
      ) reservation ON true`:'';
      const reservationFields=ready?`,m.source_warehouse_uuid AS "sourceWarehouseUuid",reservation."warehouseName",reservation."warehouseId",COALESCE(reservation.quantity,0) AS "reservedQuantity",reservation.status AS "reservationStatus"`:'';
      return (await pool.query(`SELECT m.id,m.order_id AS "orderId",m.bom_item_id AS "bomItemId",m.sku_code AS sku,p.name AS product,m.section,m.quantity,m.unit,m.supply_party AS "supplyParty"${reservationFields}
        FROM production_order_materials m JOIN skus s ON s.code=m.sku_code JOIN products p ON p.id=s.product_id ${reservationJoin}
        WHERE m.order_id=$1 ORDER BY m.section,m.id`,[orderId])).rows;
    },
    async updateMaterialSupplier(orderId,materialId,supplyParty,warehouseId){
      if(!['工厂','ALSVID'].includes(supplyParty))throw Error('供料方无效');
      return tx('production_order.material.supplier',`production_orders/${orderId}/materials/${materialId}`,async c=>{
        const order=(await c.query('SELECT status AS "orderStatus" FROM production_orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
        if(!order)throw Error('生产订单不存在');
        const material=(await c.query(`SELECT id,supply_party AS "supplyParty"
          FROM production_order_materials WHERE id=$1 AND order_id=$2 FOR UPDATE`,[materialId,orderId])).rows[0];
        if(!material)throw Error('生产物料不存在');
        const old={...material,orderStatus:order.orderStatus};
        if(['已完成','已取消'].includes(old.orderStatus))throw Error('已完成或取消的订单不能修改供料责任');
        if(supplyParty==='ALSVID'){
          if(!warehouseId)throw Error('ALSVID 供料必须选择出料仓');
          await reserveProductionMaterial(c,orderId,materialId,warehouseId);
        }else{
          if(await reservationSchemaReady(c))await releaseProductionMaterialReservation(c,orderId,materialId,'物料改由工厂供料');
          const ready=await reservationSchemaReady(c);
          const after=ready
            ?(await c.query("UPDATE production_order_materials SET supply_party='工厂',source_warehouse_uuid=NULL WHERE id=$1 RETURNING id,supply_party AS \"supplyParty\",source_warehouse_uuid AS \"sourceWarehouseUuid\"",[materialId])).rows[0]
            :(await c.query("UPDATE production_order_materials SET supply_party='工厂' WHERE id=$1 RETURNING id,supply_party AS \"supplyParty\"",[materialId])).rows[0];
          return{before:old,after};
        }
        const ready=await reservationSchemaReady(c);
        const after=ready
          ?(await c.query('SELECT id,supply_party AS "supplyParty",source_warehouse_uuid AS "sourceWarehouseUuid" FROM production_order_materials WHERE id=$1',[materialId])).rows[0]
          :(await c.query('SELECT id,supply_party AS "supplyParty" FROM production_order_materials WHERE id=$1',[materialId])).rows[0];
        return{before:old,after};
      });
    },
    async updateProductionQuality(id,b){const status=b.qcStatus,note=String(b.note||'').trim();if(!['合格','不合格'].includes(status)||!note)throw Error('请选择质检结果并填写质检说明');return tx('production_order.quality',`production_orders/${id}`,async c=>{const old=(await c.query('SELECT id,qc_status AS "qcStatus",status FROM production_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old)throw Error('生产订单不存在');if(!['计划中','生产中'].includes(old.status))throw Error('当前状态不能登记质检');const after=(await c.query('UPDATE production_orders SET qc_status=$1,qc_note=$2 WHERE id=$3 RETURNING id,qc_status AS "qcStatus",qc_note AS "qcNote"',[status,note,id])).rows[0];await c.query("INSERT INTO production_order_events(id,order_id,event_type,qc_status,note,actor) VALUES($1,$2,'质检更新',$3,$4,$5)",[uuidv7(),id,status,note,currentActor()]);return{before:old,after};});},
    async listProductionVinQuality(id){return (await pool.query(`SELECT v.id AS "vinId",v.vin,q.result,q.note,q.inspected_by AS "inspectedBy",q.inspected_at AS "inspectedAt"
      FROM production_orders o JOIN vins v ON v.order_no=o.order_no
      LEFT JOIN production_vin_quality q ON q.order_uuid=o.entity_uuid AND q.vin_uuid=v.entity_uuid
      WHERE o.id=$1 ORDER BY v.vin`,[id])).rows;},
    async listProductionCosts(){return (await pool.query(`
      SELECT o.id||':'||x.code AS "recordId",'订单录入'::text AS source,o.order_no AS "orderNo",NULL::text AS "shipmentNo",o.sku_code AS sku,x.cost_type AS "costType",x.amount,o.cost_currency AS currency,o.created_at AS "recordedAt",NULL::text AS status
      FROM production_orders o CROSS JOIN LATERAL (VALUES ('supplier','工厂费用',o.supplier_cost),('material','物料成本',o.material_cost),('processing','加工费',o.processing_cost),('freight','运输费',o.freight_cost),('import','进口费',o.import_cost)) AS x(code,cost_type,amount)
      WHERE x.amount>0
      UNION ALL
      SELECT d.id||':'||x.code AS "recordId",'发货单'::text AS source,o.order_no AS "orderNo",d.shipment_no AS "shipmentNo",o.sku_code AS sku,x.cost_type AS "costType",x.amount,o.cost_currency AS currency,d.created_at AS "recordedAt",CASE WHEN dc.id IS NULL THEN d.status ELSE '已取消' END AS status
      FROM production_deliveries d JOIN production_orders o ON o.id=d.order_id LEFT JOIN production_delivery_cancellations dc ON dc.delivery_uuid=d.entity_uuid CROSS JOIN LATERAL (VALUES ('freight','运输费',d.freight_cost),('import','进口费',d.import_cost)) AS x(code,cost_type,amount)
      WHERE x.amount>0
      ORDER BY "recordedAt" DESC,"orderNo","shipmentNo"
    `)).rows;},
    async listDeliveries(orderId='',inTransitOnly=false,statusFilter=''){
      return (await pool.query(`SELECT d.id,COALESCE(d.order_id,d.sales_order_uuid::text) AS "orderId",COALESCE(o.order_no,so.order_no) AS "orderNo",COALESCE(o.sku_code,so.sku_code) AS sku,d.shipment_no AS "shipmentNo",d.source_type AS "sourceType",d.carrier,d.tracking_no AS "trackingNo",d.eta_date::text AS "etaDate",d.warehouse_id AS "warehouseId",w.name AS warehouse,w.kind AS "warehouseKind",d.planned_quantity AS "plannedQuantity",d.received_quantity AS "receivedQuantity",d.receipt_note AS "receiptNote",d.customs_status AS "customsStatus",d.customs_reference AS "customsReference",d.customs_note AS "customsNote",d.customs_updated_by AS "customsUpdatedBy",d.customs_updated_at AS "customsUpdatedAt",CASE WHEN dc.id IS NOT NULL THEN '已取消' ELSE d.status END AS status,dc.reason AS "cancelReason",dc.actor AS "cancelledBy",dc.created_at AS "cancelledAt",COALESCE(dv.vins,'{}') AS vins,d.note,d.shipped_at AS "shippedAt",d.received_at AS "receivedAt",d.freight_cost AS "freightCost",d.import_cost AS "importCost",o.cost_currency AS "costCurrency",(SELECT count(*)::int FROM delivery_parcels p WHERE p.delivery_id=d.id) AS "parcelCount",(SELECT count(*)::int FROM tracking_events e JOIN delivery_parcels p2 ON p2.id=e.package_id WHERE p2.delivery_id=d.id) AS "eventCount",CASE WHEN d.source_type='production_order' AND d.status='已入库' AND d.received_quantity>0 THEN round((o.supplier_cost+o.material_cost+o.processing_cost)/o.planned_quantity+(d.freight_cost+d.import_cost)/d.received_quantity,2) ELSE NULL END AS "landedUnitCost" FROM production_deliveries d LEFT JOIN production_orders o ON o.id=d.order_id LEFT JOIN sales_orders so ON so.id=d.sales_order_uuid JOIN warehouses w ON w.id=d.warehouse_id LEFT JOIN production_delivery_cancellations dc ON dc.delivery_uuid=d.entity_uuid LEFT JOIN LATERAL (SELECT array_agg(v.vin ORDER BY v.vin) AS vins FROM production_delivery_vins a JOIN vins v ON v.entity_uuid=a.vin_uuid WHERE a.delivery_uuid=d.entity_uuid AND (a.released_at IS NULL OR EXISTS(SELECT 1 FROM production_delivery_cancellations c WHERE c.delivery_uuid=a.delivery_uuid))) dv ON true WHERE ($1='' OR d.order_id=$1 OR d.sales_order_uuid::text=$1) AND (NOT $2::boolean OR (d.status='在途' AND dc.id IS NULL AND d.source_type<>'sales_order')) AND ($3='' OR (CASE WHEN dc.id IS NOT NULL THEN '已取消' ELSE d.status END)=$3) ORDER BY d.created_at DESC`,[orderId,inTransitOnly,statusFilter])).rows;
    },
    async deliveryCustomsHistory(id){if(!isUuidv7(id))throw Error('发运记录不存在');if(!(await pool.query('SELECT 1 FROM production_deliveries WHERE id=$1',[id])).rowCount)throw Error('发运记录不存在');return (await pool.query("SELECT actor,created_at AS \"changedAt\",before_json AS \"before\",after_json AS \"after\" FROM audit_log WHERE action='production_delivery.customs' AND target=$1 ORDER BY created_at DESC",[`production_deliveries/${id}/customs`])).rows;},
    async listDeliveryVins(id){return (await pool.query(`SELECT v.id,v.vin,v.model,v.sku_code AS sku,v.order_no AS "orderNo",a.assigned_by AS "assignedBy",a.assigned_at AS "assignedAt",a.released_by AS "releasedBy",a.released_at AS "releasedAt",EXISTS(SELECT 1 FROM production_delivery_receipt_vins rv JOIN production_delivery_receipts r ON r.entity_uuid=rv.receipt_uuid WHERE r.delivery_id=d.id AND rv.vin_uuid=a.vin_uuid) AS received FROM production_delivery_vins a JOIN vins v ON v.entity_uuid=a.vin_uuid JOIN production_deliveries d ON d.entity_uuid=a.delivery_uuid WHERE d.id=$1 AND (a.released_at IS NULL OR EXISTS(SELECT 1 FROM production_delivery_cancellations c WHERE c.delivery_uuid=a.delivery_uuid)) ORDER BY v.vin`,[id])).rows;},
    async assignDeliveryVins(id,input){const rawIds=input.vinIds;if(!isUuidv7(id)||!Array.isArray(rawIds)||rawIds.some(x=>typeof x!=='string'||!isUuidv7(x)))throw Error('VIN 列表无效');const ids=rawIds.map(x=>x.toLowerCase());id=String(id).toLowerCase();if(new Set(ids).size!==ids.length)throw Error('VIN 列表无效');return tx('production_delivery.vins.assign',`production_deliveries/${id}/vins`,async c=>{const delivery=(await c.query('SELECT d.id,d.entity_uuid,d.order_id,d.status,d.planned_quantity,o.order_no FROM production_deliveries d JOIN production_orders o ON o.id=d.order_id WHERE d.id=$1 FOR UPDATE OF d',[id])).rows[0];if(!delivery)throw Error('发运记录不存在');if(delivery.status!=='待发运'||(await c.query('SELECT 1 FROM production_delivery_cancellations WHERE delivery_uuid=$1',[delivery.entity_uuid])).rowCount)throw Error('只有待发运批次可以分配 VIN');if(ids.length>delivery.planned_quantity)throw Error('VIN 数量不能超过批次发运数量');const current=(await c.query('SELECT vin_uuid FROM production_delivery_vins WHERE delivery_uuid=$1 AND released_at IS NULL FOR UPDATE',[delivery.entity_uuid])).rows.map(row=>row.vin_uuid);const resolved=[];for(const vinId of [...ids].sort()){const vin=(await c.query('SELECT entity_uuid,order_no FROM vins WHERE id=$1 FOR UPDATE',[vinId])).rows[0];if(!vin||vin.order_no!==delivery.order_no)throw Error('VIN 不属于该生产订单');const assigned=(await c.query('SELECT delivery_uuid FROM production_delivery_vins WHERE vin_uuid=$1 AND released_at IS NULL AND delivery_uuid<>$2',[vin.entity_uuid,delivery.entity_uuid])).rows[0];if(assigned)throw Error('VIN 已分配给其他发运批次');resolved.push(vin.entity_uuid)}if(current.length===resolved.length&&current.every(vin=>resolved.includes(vin)))return{after:{deliveryId:id,vinIds:ids},replayed:true};await c.query('UPDATE production_delivery_vins SET released_by=$2,released_at=now() WHERE delivery_uuid=$1 AND released_at IS NULL',[delivery.entity_uuid,currentActor()]);for(const vinUuid of resolved)await c.query('INSERT INTO production_delivery_vins(delivery_uuid,vin_uuid,assigned_by) VALUES($1,$2,$3)',[delivery.entity_uuid,vinUuid,currentActor()]);return{after:{deliveryId:id,vinIds:ids}}})},
    async listDeliveryReceipts(id){return (await pool.query(`SELECT r.id,r.grn_no AS "grnNo",r.status AS "receiptStatus",r.received_quantity AS "receivedQuantity",r.note,r.received_by AS "receivedBy",r.received_at AS "receivedAt",loc.code AS "locationCode",loc.name AS location,COALESCE((SELECT array_agg(v.vin ORDER BY v.vin) FROM production_delivery_receipt_vins rv JOIN vins v ON v.entity_uuid=rv.vin_uuid WHERE rv.receipt_uuid=r.entity_uuid),'{}') AS vins FROM production_delivery_receipts r JOIN production_deliveries d ON d.id=r.delivery_id LEFT JOIN stock_movements sm ON sm.id=r.id LEFT JOIN warehouse_locations loc ON loc.id=COALESCE(sm.to_location_uuid,(SELECT l.id FROM warehouse_locations l WHERE l.warehouse_uuid=d.warehouse_uuid AND l.is_default)) WHERE r.delivery_id=$1 ORDER BY r.received_at,r.id`,[id])).rows;},
    async createDelivery(orderId,b){
      const shipmentNo=String(b.shipmentNo||'').trim(),warehouseId=String(b.warehouseId||'').toLowerCase(),qty=Number(b.plannedQuantity),note=String(b.note||'').trim(),freightCost=moneyAmount(b.freightCost),importCost=moneyAmount(b.importCost),id=b.id==null?uuidv7():String(b.id).toLowerCase();
      const carrier=String(b.carrier||'').trim(),trackingNo=String(b.trackingNo||'').trim(),etaDate=String(b.etaDate||'').trim()||null;
      if(!isUuidv7(id))throw Error('发运编号无效');
      if(carrier.length>80||trackingNo.length>120||(etaDate&&!/^\d{4}-\d{2}-\d{2}$/.test(etaDate)))throw Error('物流信息无效');
      if(!shipmentNo||!Number.isSafeInteger(qty)||qty<1||!warehouseId)throw Error('发运单号、目标仓库和正整数发运数量必填');
      if(freightCost===null||importCost===null)throw Error('本批运输费和进口费必须为非负金额');
      const cents=value=>{const [whole,fraction='']=String(value).split('.');return BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2));};
      return tx('production_delivery.create','production_orders/'+orderId+'/deliveries/'+id,async c=>{
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',[id]);
        const prior=(await c.query('SELECT id,order_id AS "orderId",shipment_no AS "shipmentNo",warehouse_id AS "warehouseId",planned_quantity AS "plannedQuantity",customs_status AS "customsStatus",status,note,carrier,tracking_no AS "trackingNo",eta_date::text AS "etaDate",freight_cost::text AS "freightCost",import_cost::text AS "importCost" FROM production_deliveries WHERE id=$1',[id])).rows[0];
        if(prior){
          if(prior.orderId!==orderId.toLowerCase()||prior.shipmentNo!==shipmentNo||prior.warehouseId!==warehouseId||prior.plannedQuantity!==qty||prior.note!==note||(prior.carrier||'')!==carrier||(prior.trackingNo||'')!==trackingNo||(prior.etaDate||'')!==(etaDate||'')||cents(prior.freightCost)!==cents(freightCost)||cents(prior.importCost)!==cents(importCost)){const error=Error('发运编号已用于其他内容');error.code='IDEMPOTENCY_CONFLICT';throw error;}
          return{after:prior,replayed:true};
        }
        const order=(await c.query('SELECT id,actual_quantity AS "actualQuantity",planned_quantity AS "plannedQuantity",status FROM production_orders WHERE id=$1 FOR UPDATE',[orderId])).rows[0];
        if(!order)throw Error('生产订单不存在');
        if(order.status==='已取消')throw Error('已取消订单不能创建发运');
        const dispatchCapacity=Number(order.actualQuantity||0);
        if(dispatchCapacity<1)throw Error('请先登记已完成的生产数量后再发运');
        const wh=(await c.query("SELECT id,kind FROM warehouses WHERE id=$1 AND kind IN ('国内仓','海外仓') AND status='启用' FOR SHARE",[warehouseId])).rows[0];
        if(!wh)throw Error('请选择已启用的国内仓或海外仓');
        const booked=(await c.query('SELECT COALESCE(sum(d.planned_quantity),0)::int AS n FROM production_deliveries d LEFT JOIN production_delivery_cancellations x ON x.delivery_uuid=d.entity_uuid WHERE d.order_id=$1 AND x.id IS NULL',[orderId])).rows[0].n;
        if(booked+qty>dispatchCapacity)throw Error('累计发运数量不能超过已完成生产数量');
        if(booked+qty>Number(order.plannedQuantity))throw Error('发运数量超过生产订单计划数量');
        const customsStatus=wh.kind==='海外仓'?'待清关':'无需清关';
        const row=(await c.query('INSERT INTO production_deliveries(id,order_id,shipment_no,warehouse_id,planned_quantity,note,freight_cost,import_cost,customs_status,carrier,tracking_no,eta_date) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id,order_id AS "orderId",shipment_no AS "shipmentNo",carrier,tracking_no AS "trackingNo",eta_date::text AS "etaDate",warehouse_id AS "warehouseId",planned_quantity AS "plannedQuantity",customs_status AS "customsStatus",status,note,freight_cost AS "freightCost",import_cost AS "importCost"',[id,orderId,shipmentNo,warehouseId,qty,note,freightCost,importCost,customsStatus,carrier,trackingNo,etaDate])).rows[0];
        return{after:row};
      });
    },
    async cancelDelivery(id,b){const reason=String(b.reason||'').trim();if(!reason||reason.length>2000)throw Error('取消原因无效');return tx('production_delivery.cancel',`production_deliveries/${id}`,async c=>{const initial=(await c.query('SELECT order_id FROM production_deliveries WHERE id=$1',[id])).rows[0];if(!initial)throw Error('发运记录不存在');await c.query('SELECT id FROM production_orders WHERE id=$1 FOR UPDATE',[initial.order_id]);const d=(await c.query('SELECT id,entity_uuid,status FROM production_deliveries WHERE id=$1 FOR UPDATE',[id])).rows[0];const prior=(await c.query('SELECT reason FROM production_delivery_cancellations WHERE delivery_uuid=$1',[d.entity_uuid])).rows[0];if(prior){if(prior.reason!==reason)throw Error('发运记录已取消');return {after:{id,status:'已取消',reason},replayed:true}}if(d.status!=='待发运')throw Error('只有待发运记录可以取消');await c.query('INSERT INTO production_delivery_cancellations(delivery_uuid,reason,actor) VALUES($1,$2,$3)',[d.entity_uuid,reason,currentActor()]);await c.query('UPDATE production_delivery_vins SET released_by=$2,released_at=now() WHERE delivery_uuid=$1 AND released_at IS NULL',[d.entity_uuid,currentActor()]);return {before:{id,status:d.status},after:{id,status:'已取消',reason}}})},
    async dispatchDelivery(id){
      return tx('production_delivery.dispatch','production_deliveries/'+id,async c=>{
        const initial=(await c.query('SELECT order_id FROM production_deliveries WHERE id=$1',[id])).rows[0];
        if(!initial)throw Error('发运记录不存在');
        await c.query('SELECT id FROM production_orders WHERE id=$1 FOR UPDATE',[initial.order_id]);
        const old=(await c.query('SELECT id,status,shipped_at AS "shippedAt" FROM production_deliveries WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!old)throw Error('发运记录不存在');
        if(['在途','已入库'].includes(old.status))return{before:old,after:old,replayed:true};
        if(old.status!=='待发运'||(await c.query('SELECT 1 FROM production_delivery_cancellations x JOIN production_deliveries d ON d.entity_uuid=x.delivery_uuid WHERE d.id=$1',[id])).rowCount)throw Error('只有待发运记录可以标记发出');
        const delivery=(await c.query('SELECT entity_uuid,planned_quantity FROM production_deliveries WHERE id=$1',[id])).rows[0];
        const orderItems=(await c.query('SELECT sku_code AS sku,planned_quantity AS "plannedQuantity" FROM production_order_items WHERE order_uuid=(SELECT entity_uuid FROM production_orders WHERE id=(SELECT order_id FROM production_deliveries WHERE id=$1))',[id])).rows;
        if(orderItems.length>1){
          const allocations=(await c.query('SELECT sku_code AS sku,planned_quantity AS "plannedQuantity" FROM production_delivery_items WHERE delivery_uuid=$1',[delivery.entity_uuid])).rows;
          if(!allocations.length||allocations.reduce((sum,item)=>sum+Number(item.plannedQuantity),0)!==Number(delivery.planned_quantity))throw Error('多车型发运批次必须先保存车型明细');
          const limits=new Map(orderItems.map(item=>[item.sku,Number(item.plannedQuantity)]));
          if(allocations.some(item=>!limits.has(item.sku)||Number(item.plannedQuantity)<1||Number(item.plannedQuantity)>limits.get(item.sku)))throw Error('车型发运数量不能超过订单计划数量');
          const cumulative=(await c.query(`SELECT i.sku_code AS sku,COALESCE(sum(i.planned_quantity),0)::int AS quantity FROM production_delivery_items i JOIN production_deliveries d ON d.entity_uuid=i.delivery_uuid LEFT JOIN production_delivery_cancellations x ON x.delivery_uuid=d.entity_uuid WHERE d.order_id=$1 AND x.id IS NULL GROUP BY i.sku_code`,[initial.order_id])).rows;
          const totals=new Map(cumulative.map(item=>[item.sku,Number(item.quantity)]));
          if([...totals].some(([sku,quantity])=>!limits.has(sku)||quantity>limits.get(sku)))throw Error('车型跨批次累计发运数量不能超过订单计划数量');
        }
        const assigned=Number((await c.query('SELECT count(*)::int AS n FROM production_delivery_vins WHERE delivery_uuid=$1 AND released_at IS NULL',[delivery.entity_uuid])).rows[0].n);
        if(assigned!==delivery.planned_quantity)throw Error('发运前须为批次分配完整 VIN');
        const after=(await c.query("UPDATE production_deliveries SET status='在途',shipped_at=now() WHERE id=$1 RETURNING id,status,shipped_at AS \"shippedAt\"",[id])).rows[0];
        return{before:old,after};
      });
    },
    async updateDeliveryLogistics(id,b){
      const carrier=String(b.carrier||'').trim(),trackingNo=String(b.trackingNo||'').trim(),etaDate=String(b.etaDate||'').trim()||null;
      if(!isUuidv7(id))throw Error('发运记录不存在');
      if(carrier.length>80||trackingNo.length>120||(etaDate&&!/^\d{4}-\d{2}-\d{2}$/.test(etaDate)))throw Error('物流信息无效');
      return tx('production_delivery.logistics',`production_deliveries/${id}/logistics`,async c=>{
        const old=(await c.query('SELECT id,status,source_type AS "sourceType",sales_order_uuid AS "salesOrderUuid",entity_uuid AS "deliveryUuid",carrier,tracking_no AS "trackingNo",eta_date::text AS "etaDate" FROM production_deliveries WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!old)throw Error('发运记录不存在');
        if(old.status==='已入库')throw Error('已入库批次不能修改物流信息');
        if((await c.query('SELECT 1 FROM production_delivery_cancellations x JOIN production_deliveries d ON d.entity_uuid=x.delivery_uuid WHERE d.id=$1',[id])).rowCount)throw Error('已取消批次不能修改物流信息');
        const after=(await c.query('UPDATE production_deliveries SET carrier=$1,tracking_no=$2,eta_date=$3 WHERE id=$4 RETURNING id,carrier,tracking_no AS "trackingNo",eta_date::text AS "etaDate"',[carrier,trackingNo,etaDate,id])).rows[0];
        if(old.sourceType==='sales_order'&&old.salesOrderUuid){await c.query('UPDATE sales_orders SET carrier=$1,tracking_no=$2,eta_date=$3,updated_at=now() WHERE id=$4 AND delivery_uuid=$5',[carrier,trackingNo,etaDate,old.salesOrderUuid,old.deliveryUuid]);}
        return{before:old,after};
      });
    },
    async updateDeliveryCustoms(id,b){const status=String(b.status||''),reference=String(b.reference||'').trim(),note=String(b.note||'').trim();if(!['待清关','清关中','查验中','已放行','无需清关'].includes(status)||reference.length>200||note.length>1000)throw Error('清关状态或记录无效');return tx('production_delivery.customs',`production_deliveries/${id}/customs`,async c=>{const old=(await c.query('SELECT d.id,d.status,d.customs_status AS "customsStatus",d.customs_reference AS "customsReference",d.customs_note AS "customsNote",w.kind AS "warehouseKind" FROM production_deliveries d JOIN warehouses w ON w.id=d.warehouse_id WHERE d.id=$1 FOR UPDATE OF d',[id])).rows[0];if(!old)throw Error('发运记录不存在');if(old.status!=='在途')throw Error('只有在途发运记录可以更新清关状态');if(old.warehouseKind!=='海外仓'&&status!=='无需清关')throw Error('国内仓发运不能登记海关清关状态');const after=(await c.query('UPDATE production_deliveries SET customs_status=$1,customs_reference=$2,customs_note=$3,customs_updated_by=$4,customs_updated_at=now() WHERE id=$5 RETURNING id,customs_status AS "customsStatus",customs_reference AS "customsReference",customs_note AS "customsNote",customs_updated_by AS "customsUpdatedBy",customs_updated_at AS "customsUpdatedAt"',[status,reference,note,currentActor(),id])).rows[0];return{before:old,after};});},
    async receiveDelivery(id,b){const qty=Number(b.receivedQuantity),receiptId=String(b.receiptId||'').toLowerCase(),receiptNote=String(b.receiptNote||'').trim(),locationId=String(b.locationId||'').toLowerCase();let vinIds=b.vinIds;if(!isUuidv7(id)||!isUuidv7(receiptId)||(locationId&&!isUuidv7(locationId))||!Number.isSafeInteger(qty)||qty<1||receiptNote.length>2000||!Array.isArray(vinIds)||vinIds.length!==qty||vinIds.some(x=>typeof x!=='string'||!isUuidv7(x))||new Set(vinIds.map(x=>x.toLowerCase())).size!==vinIds.length)throw Error('签收编号、数量或 VIN 列表无效');id=String(id).toLowerCase();vinIds=vinIds.map(x=>x.toLowerCase());return tx('production_delivery.receive',`production_deliveries/${id}/receipts/${receiptId}`,async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[receiptId]);const d=(await c.query('SELECT d.*,w.kind AS "warehouseKind",w.entity_uuid AS "warehouseUuid" FROM production_deliveries d JOIN warehouses w ON w.id=d.warehouse_id WHERE d.id=$1 FOR UPDATE OF d',[id])).rows[0];if(!d)throw Object.assign(Error('发运记录不存在'),{statusCode:404});if(d.source_type==='sales_order')throw Error('B2B 客户发运不能执行仓库签收入库，请在销售订单中登记妥投');const prior=(await c.query('SELECT id,entity_uuid AS "entityUuid",delivery_id AS "deliveryId",received_quantity AS "receivedQuantity",note FROM production_delivery_receipts WHERE id=$1',[receiptId])).rows[0];if(prior){const recorded=(await c.query('SELECT v.id FROM production_delivery_receipt_vins rv JOIN vins v ON v.entity_uuid=rv.vin_uuid WHERE rv.receipt_uuid=$1 ORDER BY v.id',[prior.entityUuid])).rows.map(row=>row.id),expected=[...vinIds].sort();if(prior.deliveryId!==id||prior.receivedQuantity!==qty||prior.note!==receiptNote||recorded.length!==expected.length||recorded.some((vinId,index)=>vinId!==expected[index]))throw Object.assign(Error('签收编号已用于其他记录'),{statusCode:409});return{before:null,after:prior,replayed:true}}const location=(await c.query("SELECT id,code,name FROM warehouse_locations WHERE warehouse_uuid=$1 AND status='启用' AND (($2::uuid IS NULL AND is_default) OR id=$2::uuid) FOR SHARE",[d.warehouseUuid,locationId||null])).rows[0];if(!location)throw Error('收货库位无效或已停用');if(d.status==='已入库')throw Error('该发运记录已全部签收入库');if(d.status!=='在途')throw Error('只有在途发运记录可以签收');if(d.warehouseKind==='海外仓'&&!['已放行','无需清关'].includes(d.customs_status))throw Error('海外仓签收入库前须完成清关或确认无需清关');const already=Number(d.received_quantity||0),remaining=d.planned_quantity-already;if(qty>remaining)throw Error('签收数量超过本批剩余发运数量');if(qty!==remaining&&!receiptNote)throw Error('本次签收后仍有未到数量，必须填写差异说明');const selected=(await c.query(`SELECT v.id,v.entity_uuid AS "vinUuid",v.sku_code AS sku,s.entity_uuid AS "skuUuid" FROM production_delivery_vins a JOIN vins v ON v.entity_uuid=a.vin_uuid JOIN skus s ON s.code=v.sku_code WHERE a.delivery_uuid=$1 AND a.released_at IS NULL AND v.id=ANY($2::text[])`,[d.entity_uuid,vinIds])).rows;if(selected.length!==qty)throw Error('签收 VIN 未分配给该发运批次');for(const vin of selected)if((await c.query('SELECT 1 FROM production_delivery_receipt_vins WHERE vin_uuid=$1',[vin.vinUuid])).rowCount)throw Error('签收 VIN 已登记到货');await c.query("SELECT pg_advisory_xact_lock(hashtextextended('grn-'||to_char(now(),'YYYYMMDD'),0))");const grnNo='GRN-'+(await c.query("SELECT to_char(now(),'YYYYMMDD')||'-'||lpad(((SELECT count(*) FROM production_delivery_receipts WHERE grn_no LIKE 'GRN-'||to_char(now(),'YYYYMMDD')||'-%')+1)::text,3,'0') AS d")).rows[0].d;const groups=new Map();for(const vin of selected){const group=groups.get(vin.sku)||{sku:vin.sku,skuUuid:vin.skuUuid,quantity:0};group.quantity+=1;groups.set(vin.sku,group)}const deliveryItems=(await c.query('SELECT sku_code AS sku,planned_quantity AS "plannedQuantity",received_quantity AS "receivedQuantity" FROM production_delivery_items WHERE delivery_uuid=$1',[d.entity_uuid])).rows;if(deliveryItems.length){const limits=new Map(deliveryItems.map(item=>[item.sku,Number(item.plannedQuantity)-Number(item.receivedQuantity||0)]));for(const group of groups.values())if(!limits.has(group.sku)||group.quantity>limits.get(group.sku))throw Error('签收数量超过该车型本批剩余分配数量')}for(const group of groups.values()){await c.query('INSERT INTO warehouse_stock(warehouse_id,sku_code,quantity) VALUES($1,$2,0) ON CONFLICT DO NOTHING',[d.warehouse_id,group.sku]);const stock=(await c.query('SELECT quantity FROM warehouse_stock WHERE warehouse_uuid=$1 AND sku_uuid=$2 FOR UPDATE',[d.warehouseUuid,group.skuUuid])).rows[0],ledger=Number((await c.query('SELECT COALESCE(sum(quantity_delta),0)::bigint AS n FROM inventory_ledger WHERE warehouse_uuid=$1 AND sku_uuid=$2',[d.warehouseUuid,group.skuUuid])).rows[0].n);if(!stock||Number(stock.quantity)!==ledger)throw Error('库存账本与仓库余额不一致，不能入库');await c.query('UPDATE warehouse_stock SET quantity=quantity+$1 WHERE warehouse_uuid=$2 AND sku_uuid=$3',[group.quantity,d.warehouseUuid,group.skuUuid]);const movementId=groups.size===1?receiptId:uuidv7();await c.query("INSERT INTO stock_movements(id,kind,sku_code,quantity,to_warehouse,to_location_uuid,note,actor) VALUES($1,'入库',$2,$3,$4,$5,$6,$7)",[movementId,group.sku,group.quantity,d.warehouse_id,location.id,`生产订单 ${d.order_id} 发货单 ${d.shipment_no} 入库单 ${grnNo}`,currentActor()]);await c.query('UPDATE production_delivery_items SET received_quantity=received_quantity+$1 WHERE delivery_uuid=$2 AND sku_code=$3',[group.quantity,d.entity_uuid,group.sku])}await c.query("INSERT INTO production_delivery_receipts(id,delivery_id,grn_no,status,received_quantity,note,received_by) VALUES($1,$2,$3,'已完成',$4,$5,$6)",[receiptId,id,grnNo,qty,receiptNote,currentActor()]);const receipt=(await c.query('SELECT entity_uuid FROM production_delivery_receipts WHERE id=$1',[receiptId])).rows[0];for(const vin of selected)await c.query('INSERT INTO production_delivery_receipt_vins(receipt_uuid,vin_uuid) VALUES($1,$2)',[receipt.entityUuid,vin.vinUuid]);const total=already+qty,status=total===d.planned_quantity?'已入库':'在途',row=(await c.query('UPDATE production_deliveries SET received_quantity=$1,receipt_note=concat_ws(E\'\\n\',nullif(receipt_note,\'\'),nullif($2,\'\')),status=$3,received_by=$4,received_at=CASE WHEN $3=\'已入库\' THEN now() ELSE received_at END WHERE id=$5 RETURNING id,shipment_no AS "shipmentNo",planned_quantity AS "plannedQuantity",received_quantity AS "receivedQuantity",receipt_note AS "receiptNote",status,received_at AS "receivedAt"',[total,receiptNote,status,currentActor(),id])).rows[0];return{before:{id,status:d.status,receivedQuantity:already},after:{...row,locationId:location.id,locationCode:location.code,location:location.name}};});},
    async summary(){const r=await pool.query(`SELECT (SELECT count(*) FROM products WHERE kind='vehicle')::int vehicles,(SELECT count(*) FROM products WHERE kind='part')::int parts,(SELECT count(*) FROM skus)::int skus,(SELECT count(*) FROM vins)::int vins,(SELECT count(*) FROM repairs)::int repairs,(SELECT count(*) FROM repairs WHERE status NOT IN ('已完成','已关闭'))::int "repairsOpen",(SELECT count(*) FROM fits)::int fitments,(SELECT count(*) FROM substitutes)::int substitutes,(SELECT count(*) FROM audit_log)::int audits`);return r.rows[0];},
    listVins:async q=>(await pool.query(`SELECT ${vinSql},(SELECT w.name FROM production_delivery_receipt_vins rv JOIN production_delivery_receipts r ON r.entity_uuid=rv.receipt_uuid JOIN production_deliveries d ON d.entity_uuid=r.delivery_uuid JOIN warehouses w ON w.id=d.warehouse_id WHERE rv.vin_uuid=vins.entity_uuid ORDER BY r.received_at DESC LIMIT 1) AS "warehouseName",(SELECT d.id FROM production_delivery_vins a JOIN production_deliveries d ON d.entity_uuid=a.delivery_uuid WHERE a.vin_uuid=vins.entity_uuid AND a.released_at IS NULL LIMIT 1) AS "deliveryId" FROM vins WHERE $1='' OR position(lower($1) in lower(concat_ws(' ',vin,model,sku_code,batch,factory,status)))>0 OR EXISTS (SELECT 1 FROM vin_installed vi WHERE vi.vin_id=vins.id AND position(lower($1) in lower(concat_ws(' ',vi.sku_code,vi.serial_no,vi.batch_no)))>0) ORDER BY created_at DESC`,[q||''])).rows,
    async getVinTrace(id){const c=await pool.connect();try{const vin=(await c.query(`SELECT ${vinSql} FROM vins WHERE id=$1`,[id])).rows[0];if(!vin)return null;const installed=await c.query('SELECT vi.id,vi.sku_code AS sku,vi.quantity AS qty,vi.serial_no AS serial,vi.batch_no AS batch,vi.deviation_reason AS "deviationReason",vi.deviation_approved_by AS "approvedBy",vi.installed_at AS "installedAt" FROM vin_installed vi WHERE vi.vin_id=$1 ORDER BY vi.id',[id]);const repairs=await c.query(`SELECT ${repairSql} FROM repairs WHERE vin=$1 ORDER BY created_at DESC`,[vin.vin]);const replacements=await c.query('SELECT repair_id AS "repairId",old_sku AS "oldSku",old_serial AS "oldSerial",old_batch AS "oldBatch",new_sku AS "newSku",new_serial AS "newSerial",new_batch AS "newBatch",quantity,actor,created_at AS "createdAt" FROM repair_replacements WHERE vin_id=$1 ORDER BY created_at DESC',[id]);return{...vin,installed:installed.rows,repairs:repairs.rows,replacements:replacements.rows};}finally{c.release();}},
    async replaceInstalled(id,items){if(!Array.isArray(items))throw Error('装车明细格式无效');return tx('vin.installed.replace',`vins/${id}/installed`,async c=>{const vin=(await c.query('SELECT id FROM vins WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!vin)throw Error('VIN 档案不存在');const before=(await c.query('SELECT sku_code AS sku,quantity AS qty,serial_no AS serial,batch_no AS batch,deviation_reason AS "deviationReason",deviation_approved_by AS "approvedBy",installed_at AS "installedAt" FROM vin_installed WHERE vin_id=$1 ORDER BY id',[id])).rows;await c.query('DELETE FROM vin_installed WHERE vin_id=$1',[id]);for(const it of items){const qty=Number(it.qty??1);if(!Number.isFinite(qty)||qty<=0)throw Error('装车数量必须大于零');if(String(it.deviationReason||'').trim()&&!String(it.approvedBy||'').trim())throw Error('生产偏差必须记录批准人');const part=await c.query("SELECT 1 FROM skus s JOIN products p ON p.id=s.product_id WHERE s.code=$1 AND p.kind='part'",[it.sku]);if(!part.rowCount)throw Error('装车配件 SKU 不存在');await c.query('INSERT INTO vin_installed(vin_id,sku_code,quantity,serial_no,batch_no,deviation_reason,deviation_approved_by,installed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,it.sku,qty,it.serial||'',it.batch||'',it.deviationReason||'',it.approvedBy||'',it.installedAt||new Date().toISOString()]);}return{before,after:items};});},
    createVin(b){const vin=String(b.vin||'').trim().toUpperCase();if(!/^[A-HJ-NPR-Z0-9]{11,20}$/.test(vin))throw Error('VIN 格式无效');const id=uuidv7();return tx('vin.create',`vins/${id}`,async c=>{await validateVinBom(c,b.sku,b.bomVersion);await validateVinOrder(c,b);const r=await c.query(`INSERT INTO vins(id,vin,model,sku_code,order_no,factory,batch,bom_version,installed,serials,produced_at,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING ${vinSql}`,[id,vin,b.model||'',b.sku||null,b.orderNo||'',b.factory||'',b.batch||'',b.bomVersion||'',JSON.stringify(b.installed||[]),JSON.stringify(b.serials||[]),b.producedAt||null,b.status||'在用']);return{after:r.rows[0]};});},
    async updateVin(id,b){return tx('vin.update',`vins/${id}`,async c=>{const old=(await c.query(`SELECT ${vinSql} FROM vins WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!old)throw Error('VIN 档案不存在');const next={...old,...b,vin:String(b.vin??old.vin).trim().toUpperCase()};if(old.orderNo&&next.orderNo!==old.orderNo)throw Error('已关联生产订单的 VIN 不能变更订单');if(!/^[A-HJ-NPR-Z0-9]{11,20}$/.test(next.vin))throw Error('VIN 格式无效');if(b.sku!==undefined||b.bomVersion!==undefined)await validateVinBom(c,next.sku,next.bomVersion);if(['orderNo','sku','bomVersion','factory','batch'].some(k=>b[k]!==undefined))await validateVinOrder(c,next,old.orderNo);const r=await c.query(`UPDATE vins SET vin=$1,model=$2,sku_code=$3,order_no=$4,factory=$5,batch=$6,bom_version=$7,installed=$8,serials=$9,produced_at=$10,status=$11 WHERE id=$12 RETURNING ${vinSql}`,[next.vin,next.model||'',next.sku||null,next.orderNo||'',next.factory||'',next.batch||'',next.bomVersion||'',JSON.stringify(next.installed||[]),JSON.stringify(next.serials||[]),next.producedAt||null,next.status||'在用',id]);return{before:old,after:r.rows[0]};});},
    listServiceCenters:async(publicOnly=false)=>(await pool.query(publicOnly?`SELECT id,code,name,country,region,city,address,contact_name AS "contactName",phone,email,status FROM service_centers WHERE status='启用' ORDER BY name,id`:`SELECT ${serviceCenterSql} FROM service_centers ORDER BY CASE status WHEN '启用' THEN 0 WHEN '待审核' THEN 1 ELSE 2 END,name,id`)).rows,
    createServiceCenter(b){const code=String(b.code||'').trim(),name=String(b.name||'').trim(),status=b.status||'待审核';if(!code||code.length>40||!name||name.length>160||!['待审核','启用','停用'].includes(status))throw Error('服务网点资料无效');const keys=['country','region','city','address','contactName','phone','email','note'];const limits=[120,120,120,500,120,80,254,2000];const values=keys.map(k=>String(b[k]||'').trim());if(values.some((v,i)=>v.length>limits[i])||(values[6]&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[6])))throw Error('服务网点资料无效');const id=uuidv7();return tx('service_center.create',`service-centers/${id}`,async c=>{const after=(await c.query(`INSERT INTO service_centers(id,code,name,country,region,city,address,contact_name,phone,email,status,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING ${serviceCenterSql}`,[id,code,name,...values.slice(0,7),status,values[7],currentActor()])).rows[0];return{after}});},
    async updateServiceCenter(id,b){if(!isUuidv7(id))throw Error('服务网点不存在');const code=String(b.code||'').trim(),name=String(b.name||'').trim(),status=b.status;if(!code||code.length>40||!name||name.length>160||!['待审核','启用','停用'].includes(status))throw Error('服务网点资料无效');const keys=['country','region','city','address','contactName','phone','email','note'];const limits=[120,120,120,500,120,80,254,2000];const values=keys.map(k=>String(b[k]||'').trim());if(values.some((v,i)=>v.length>limits[i])||(values[6]&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values[6])))throw Error('服务网点资料无效');return tx('service_center.update',`service-centers/${id}`,async c=>{const old=(await c.query(`SELECT ${serviceCenterSql} FROM service_centers WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!old)throw Error('服务网点不存在');if(Number(b.revision)!==old.revision){const e=Error('服务网点资料已被其他操作更新，请重新载入');e.code='VERSION_CONFLICT';throw e}const after=(await c.query(`UPDATE service_centers SET code=$1,name=$2,country=$3,region=$4,city=$5,address=$6,contact_name=$7,phone=$8,email=$9,status=$10,note=$11,revision=revision+1,updated_at=now() WHERE id=$12 RETURNING ${serviceCenterSql}`,[code,name,...values.slice(0,7),status,values[7],id])).rows[0];return{before:old,after}});},
    listRepairs:async q=>(await pool.query(`SELECT ${repairSql} FROM repairs WHERE $1='' OR lower(concat_ws(' ',work_order_no,vin,type,fault,repair_store,status)) LIKE '%'||lower($1)||'%' ORDER BY created_at DESC`,[q||''])).rows,
    async getRecovery(repairId){const r=(await pool.query('SELECT x.replacement_id AS "replacementId",x.status,x.warehouse_id AS "warehouseId",w.name AS warehouse,r.old_sku AS "oldSku",r.old_serial AS "oldSerial",r.old_batch AS "oldBatch",r.quantity FROM old_part_recoveries x JOIN repair_replacements r ON r.id=x.replacement_id LEFT JOIN warehouses w ON w.id=x.warehouse_id WHERE r.repair_id=$1',[repairId])).rows[0];if(!r)return null;r.restock=(await pool.query('SELECT request_note AS note,requested_by AS "requestedBy",requested_at AS "requestedAt",approved_by AS "approvedBy",approved_at AS "approvedAt",movement_id AS "movementId" FROM old_part_restock_requests WHERE replacement_id=$1',[r.replacementId])).rows[0]||null;r.events=(await pool.query('SELECT from_status AS "fromStatus",to_status AS "toStatus",note,actor,created_at AS "createdAt" FROM old_part_recovery_events WHERE replacement_id=$1 ORDER BY created_at,id',[r.replacementId])).rows;return r;},
    async requestOldPartRestock(repairId,input){
      const note=String(input.note||'').trim();
      if(!note||note.length>500)throw Error('请填写翻新与检测说明');
      return tx('repair.old_part.restock.request','repairs/'+repairId+'/old-part',async c=>{
        const old=(await c.query('SELECT x.replacement_id AS id,x.status,x.warehouse_id AS warehouse FROM old_part_recoveries x JOIN repair_replacements r ON r.id=x.replacement_id WHERE r.repair_id=$1 FOR UPDATE OF x',[repairId])).rows[0];
        if(!old)throw Error('旧件回收记录不存在');
        const prior=(await c.query('SELECT request_note AS note,requested_by AS "requestedBy",requested_at AS "requestedAt",approved_by AS "approvedBy",approved_at AS "approvedAt",movement_id AS "movementId" FROM old_part_restock_requests WHERE replacement_id=$1 FOR UPDATE',[old.id])).rows[0];
        if(prior){if(prior.note!==note)throw Error('旧件已有不同的入库申请');return{before:null,after:{...prior,replayed:true}};}
        if(!['检测中','返修中'].includes(old.status)||!old.warehouse)throw Error('旧件须先退回并经过检测或返修');
        const row=(await c.query('INSERT INTO old_part_restock_requests(replacement_id,request_note,requested_by) VALUES($1,$2,$3) RETURNING replacement_id AS "replacementId",request_note AS note,requested_by AS "requestedBy",requested_at AS "requestedAt"',[old.id,note,currentActor()])).rows[0];
        return{before:old,after:row};
      });
    },
    async approveOldPartRestock(repairId){
      return tx('repair.old_part.restock.approve','repairs/'+repairId+'/old-part',async c=>{
        const old=(await c.query('SELECT x.replacement_id AS id,x.status,x.warehouse_id AS warehouse,r.old_sku AS sku,r.quantity FROM old_part_recoveries x JOIN repair_replacements r ON r.id=x.replacement_id WHERE r.repair_id=$1 FOR UPDATE OF x',[repairId])).rows[0];
        if(!old)throw Error('旧件回收记录不存在');
        const request=(await c.query('SELECT approved_at AS "approvedAt",approved_by AS "approvedBy",movement_id AS "movementId" FROM old_part_restock_requests WHERE replacement_id=$1 FOR UPDATE',[old.id])).rows[0];
        if(!request)throw Error('旧件尚未申请入库');
        if(request.approvedAt)return{before:old,after:{movementId:request.movementId,sku:old.sku,quantity:old.quantity,warehouseId:old.warehouse,approvedBy:request.approvedBy,replayed:true}};
        if(!['检测中','返修中'].includes(old.status)||!old.warehouse)throw Error('旧件状态不允许入库');
        const sku=await c.query("SELECT s.entity_uuid AS \"skuUuid\",w.entity_uuid AS \"warehouseUuid\" FROM skus s JOIN products p ON p.id=s.product_id JOIN warehouses w ON w.id=$2 WHERE s.code=$1 AND p.kind='part'",[old.sku,old.warehouse]);
        if(!sku.rowCount)throw Error('旧件 SKU 不存在');
        await c.query('INSERT INTO warehouse_stock(warehouse_id,sku_code,quantity) VALUES($1,$2,0) ON CONFLICT DO NOTHING',[old.warehouse,old.sku]);
        const stock=(await c.query('SELECT quantity FROM warehouse_stock WHERE warehouse_uuid=$1 AND sku_uuid=$2 FOR UPDATE',[sku.rows[0].warehouseUuid,sku.rows[0].skuUuid])).rows[0];
        const ledger=Number((await c.query('SELECT COALESCE(sum(quantity_delta),0)::bigint AS n FROM inventory_ledger WHERE warehouse_uuid=$1 AND sku_uuid=$2',[sku.rows[0].warehouseUuid,sku.rows[0].skuUuid])).rows[0].n);
        if(!stock||Number(stock.quantity)!==ledger)throw Error('库存账本与仓库余额不一致，不能入库');
        await c.query('UPDATE warehouse_stock SET quantity=quantity+$1 WHERE warehouse_uuid=$2 AND sku_uuid=$3',[old.quantity,sku.rows[0].warehouseUuid,sku.rows[0].skuUuid]);
        const movementId=uuidv7();
        const restockLocation=(await c.query("SELECT id FROM warehouse_locations WHERE warehouse_uuid=$1 AND is_default AND status='启用' FOR SHARE",[sku.rows[0].warehouseUuid])).rows[0];
        if(!restockLocation)throw Error('旧件入库仓库缺少启用的默认库位');
        await c.query('INSERT INTO stock_movements(id,kind,sku_code,quantity,to_warehouse,to_location_uuid,note,actor) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[movementId,'入库',old.sku,old.quantity,old.warehouse,restockLocation.id,'旧件翻新批准入库，维修工单 '+repairId,currentActor()]);
        await c.query('UPDATE old_part_restock_requests SET approved_by=$1,approved_at=now(),movement_id=$2 WHERE replacement_id=$3',[currentActor(),movementId,old.id]);
        return{before:old,after:{movementId,sku:old.sku,quantity:old.quantity,warehouseId:old.warehouse,approvedBy:currentActor()}};
      });
    },
    async cancelOldPartRestock(repairId){return tx('repair.old_part.restock.cancel',`repairs/${repairId}/old-part`,async c=>{const old=(await c.query('SELECT x.replacement_id AS id FROM old_part_recoveries x JOIN repair_replacements r ON r.id=x.replacement_id WHERE r.repair_id=$1 FOR UPDATE OF x',[repairId])).rows[0];if(!old)throw Error('旧件回收记录不存在');const request=(await c.query('DELETE FROM old_part_restock_requests WHERE replacement_id=$1 AND approved_at IS NULL RETURNING request_note AS note,requested_by AS "requestedBy"',[old.id])).rows[0];if(!request)throw Error('没有可撤销的入库申请');return{before:request,after:{cancelled:true}};});},
    async transitionRecovery(repairId,input){const status=input.status,note=String(input.note||'').trim();if(!note||note.length>500)throw Error('请填写旧件处理说明');return tx('repair.old_part',`repairs/${repairId}/old-part`,async c=>{const old=(await c.query('SELECT x.replacement_id AS "replacementId",x.status,x.warehouse_id AS "warehouseId" FROM old_part_recoveries x JOIN repair_replacements r ON r.id=x.replacement_id WHERE r.repair_id=$1 FOR UPDATE OF x',[repairId])).rows[0];if(!old)throw Error('旧件回收记录不存在');if((await c.query('SELECT 1 FROM old_part_restock_requests WHERE replacement_id=$1',[old.replacementId])).rowCount)throw Error('已有入库申请，不能更改旧件状态');const transitions={'待回收':['已退回'],'已退回':['检测中','返修中','已报废'],'检测中':['返修中','已报废'],'返修中':['检测中','已报废'],'已报废':[]};if(!transitions[old.status]?.includes(status))throw Error('旧件状态流转无效');const warehouse=status==='已退回'?input.warehouseId:old.warehouseId;if(status==='已退回'&&(!warehouse||!(await c.query('SELECT 1 FROM warehouses WHERE id=$1',[warehouse])).rowCount))throw Error('请选择旧件退回仓库');await c.query('UPDATE old_part_recoveries SET status=$1,warehouse_id=$2,updated_at=now() WHERE replacement_id=$3',[status,warehouse,old.replacementId]);const event=(await c.query('INSERT INTO old_part_recovery_events(id,replacement_id,from_status,to_status,warehouse_id,note,actor) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id,from_status AS "fromStatus",to_status AS "toStatus",note,actor,created_at AS "createdAt"',[uuidv7(),old.replacementId,old.status,status,warehouse,note,currentActor()])).rows[0];return{before:old,after:event};});},
    async repairFinance(id){const exists=await pool.query('SELECT entity_uuid FROM repairs WHERE id=$1',[id]);if(!exists.rowCount)throw Error('维修工单不存在');const repairUuid=exists.rows[0].entity_uuid;const quotes=(await pool.query('SELECT id,revision,currency,labor_minor AS "laborMinor",parts_minor AS "partsMinor",other_minor AS "otherMinor",note,created_by AS "createdBy",created_at AS "createdAt" FROM repair_quotes WHERE repair_uuid=$1 ORDER BY revision DESC',[repairUuid])).rows;for(const q of quotes){q.totalMinor=String(BigInt(q.laborMinor)+BigInt(q.partsMinor)+BigInt(q.otherMinor));q.decision=(await pool.query('SELECT decision,note,recorded_by AS "recordedBy",created_at AS "createdAt" FROM repair_quote_decisions WHERE quote_id=$1 ORDER BY created_at DESC LIMIT 1',[q.id])).rows[0]||null;q.payments=(await pool.query('SELECT id,amount_minor AS "amountMinor",method,reference,received_on::text AS "receivedOn",note,recorded_by AS "recordedBy",created_at AS "createdAt" FROM repair_payments WHERE quote_id=$1 ORDER BY created_at,id',[q.id])).rows}return quotes},
    async createRepairQuote(id,b){
      const quoteId=String(b.id||uuidv7()).toLowerCase(),currency=String(b.currency||'').toUpperCase(),labor=Number(b.laborMinor),parts=Number(b.partsMinor),other=Number(b.otherMinor),note=String(b.note||'').trim(),actor=currentActor();
      if(!isUuidv7(quoteId)||!/^[A-Z]{3}$/.test(currency)||![labor,parts,other].every(Number.isSafeInteger)||[labor,parts,other].some(x=>x<0)||!Number.isSafeInteger(labor+parts+other)||note.length>2000)throw Error('维修报价资料无效');
      return tx('repair.quote.create','repairs/'+id+'/quotes',async c=>{
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',[quoteId]);
        const prior=(await c.query('SELECT r.id AS "repairId",q.id,q.revision,q.currency,q.labor_minor AS "laborMinor",q.parts_minor AS "partsMinor",q.other_minor AS "otherMinor",q.note,q.created_by AS "createdBy",q.created_at AS "createdAt" FROM repair_quotes q JOIN repairs r ON r.entity_uuid=q.repair_uuid WHERE q.id=$1',[quoteId])).rows[0];
        if(prior){if(prior.repairId!==id.toLowerCase()||prior.currency!==currency||Number(prior.laborMinor)!==labor||Number(prior.partsMinor)!==parts||Number(prior.otherMinor)!==other||prior.note!==note||prior.createdBy!==actor){const e=Error('报价编号已用于其他内容');e.code='VERSION_CONFLICT';throw e}return{after:prior,replayed:true}}
        const repair=(await c.query('SELECT entity_uuid,status FROM repairs WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!repair)throw Error('维修工单不存在');
        if(['已完成','已关闭'].includes(repair.status))throw Error('已完成或关闭的工单不能报价');
        if((await c.query('SELECT 1 FROM repair_payments p JOIN repair_quotes q ON q.id=p.quote_id WHERE q.repair_uuid=$1 LIMIT 1',[repair.entity_uuid])).rowCount)throw Error('已有维修收款，不能新建报价版本');
        const revision=Number((await c.query('SELECT COALESCE(max(revision),0)+1 AS n FROM repair_quotes WHERE repair_uuid=$1',[repair.entity_uuid])).rows[0].n);
        const quote=(await c.query('INSERT INTO repair_quotes(id,repair_uuid,revision,currency,labor_minor,parts_minor,other_minor,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,revision,currency,labor_minor AS "laborMinor",parts_minor AS "partsMinor",other_minor AS "otherMinor",note,created_at AS "createdAt"',[quoteId,repair.entity_uuid,revision,currency,labor,parts,other,note,actor])).rows[0];
        return{after:quote};
      });
    },
    async decideRepairQuote(id,quoteId,b){
      const decision=b.decision,note=String(b.note||'').trim(),actor=currentActor();
      if(!isUuidv7(quoteId)||!['accepted','declined'].includes(decision)||note.length>2000)throw Error('报价确认资料无效');
      return tx('repair.quote.decision','repairs/'+id+'/quotes/'+quoteId,async c=>{
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1::uuid::text,0))',[quoteId]);
        const repair=(await c.query('SELECT entity_uuid FROM repairs WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!repair)throw Error('维修工单不存在');
        const quote=(await c.query('SELECT id,revision FROM repair_quotes WHERE id=$1 AND repair_uuid=$2',[quoteId,repair.entity_uuid])).rows[0];
        if(!quote)throw Error('维修报价不存在');
        const prior=(await c.query('SELECT id,decision,note,recorded_by AS "recordedBy",created_at AS "createdAt" FROM repair_quote_decisions WHERE quote_id=$1',[quoteId])).rows[0];
        if(prior){if(prior.decision!==decision||prior.note!==note||prior.recordedBy!==actor){const e=Error('该报价已由不同内容确认');e.code='VERSION_CONFLICT';throw e}return{after:prior,replayed:true}}
        const latest=Number((await c.query('SELECT max(revision) AS revision FROM repair_quotes WHERE repair_uuid=$1',[repair.entity_uuid])).rows[0].revision);
        if(quote.revision!==latest)throw Error('只能确认最新报价版本');
        const row=(await c.query('INSERT INTO repair_quote_decisions(id,quote_id,decision,note,recorded_by) VALUES($1,$2,$3,$4,$5) RETURNING id,decision,note,created_at AS "createdAt"',[uuidv7(),quoteId,decision,note,actor])).rows[0];
        return{after:row};
      });
    },
    async recordRepairPayment(id,quoteId,b){const paymentId=b.id,amount=Number(b.amountMinor),method=b.method,reference=String(b.reference||'').trim(),day=b.receivedOn,note=String(b.note||'').trim();if(!isUuidv7(paymentId)||!isUuidv7(quoteId)||!Number.isSafeInteger(amount)||amount<=0||!['bank_transfer','cash','other'].includes(method)||!reference||reference.length>200||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(day||'')||note.length>2000||b.verified!==true)throw Error('请确认实际到账并填写有效收款资料');return tx('repair.payment.record',`repairs/${id}/payments/${paymentId}`,async c=>{await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[paymentId]);const prior=(await c.query('SELECT p.quote_id AS "quoteId",p.amount_minor AS "amountMinor",p.method,p.reference,p.received_on::text AS "receivedOn",p.note,r.id AS "repairId" FROM repair_payments p JOIN repair_quotes q ON q.id=p.quote_id JOIN repairs r ON r.entity_uuid=q.repair_uuid WHERE p.id=$1',[paymentId])).rows[0];if(prior){if(prior.repairId!==id||prior.quoteId!==quoteId||Number(prior.amountMinor)!==amount||prior.method!==method||prior.reference!==reference||prior.receivedOn!==day||prior.note!==note)throw Error('收款编号已用于其他内容');return{before:null,after:prior}}const repair=(await c.query('SELECT entity_uuid FROM repairs WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!repair)throw Error('维修工单不存在');const quote=(await c.query('SELECT q.id,q.revision,q.currency,(q.labor_minor::numeric+q.parts_minor::numeric+q.other_minor::numeric)::text AS total FROM repair_quotes q WHERE q.id=$1 AND q.repair_uuid=$2',[quoteId,repair.entity_uuid])).rows[0];if(!quote)throw Error('维修报价不存在');const latest=Number((await c.query('SELECT max(revision) AS revision FROM repair_quotes WHERE repair_uuid=$1',[repair.entity_uuid])).rows[0].revision);if(quote.revision!==latest)throw Error('只能为最新报价版本登记收款');if((await c.query("SELECT 1 FROM repair_quote_decisions WHERE quote_id=$1 AND decision='accepted'",[quoteId])).rowCount===0)throw Error('客户接受报价后才能登记收款');const paid=BigInt((await c.query('SELECT COALESCE(sum(amount_minor),0)::text AS n FROM repair_payments WHERE quote_id=$1',[quoteId])).rows[0].n);if(paid+BigInt(amount)>BigInt(quote.total))throw Error('收款金额超过报价总额');const row=(await c.query('INSERT INTO repair_payments(id,quote_id,amount_minor,method,reference,received_on,note,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,amount_minor AS "amountMinor",method,reference,received_on::text AS "receivedOn",note,created_at AS "createdAt"',[paymentId,quoteId,amount,method,reference,day,note,currentActor()])).rows[0];return{after:row}})},
    async completeRepair(id,input){return tx('repair.complete',`repairs/${id}`,async c=>{const repair=(await c.query(`SELECT ${repairSql} FROM repairs WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!repair)throw Error('维修工单不存在');if(repair.status!=='维修中')throw Error('只有维修中的工单可以完成更换');if(!repair.sku)throw Error('工单未指定更换配件');const qty=Number(repair.qty);if(!Number.isSafeInteger(qty)||qty<1)throw Error('工单数量无效');const issued=(await c.query("SELECT COALESCE(sum(CASE WHEN kind='领用' THEN quantity ELSE -quantity END),0)::int AS n FROM repair_stock_events WHERE repair_id=$1",[id])).rows[0].n;if(issued!==qty)throw Error('净领用数量须等于工单数量');const vin=(await c.query('SELECT id FROM vins WHERE vin=$1 FOR UPDATE',[repair.vin])).rows[0];if(!vin)throw Error('VIN 档案不存在');const old=(await c.query('SELECT id,sku_code AS sku,quantity,serial_no AS serial,batch_no AS batch FROM vin_installed WHERE id=$1 AND vin_id=$2 FOR UPDATE',[String(input.installedId||''),vin.id])).rows[0];if(!old||Number(old.quantity)<qty)throw Error('所选原装配件不存在或数量不足');const serial=String(input.serial||'').trim(),batch=String(input.batch||'').trim();if(serial&&qty!==1)throw Error('记录序列号时更换数量必须为一');if(old.serial&&qty!==1)throw Error('有序列号的原配件只能逐件更换');if(Number(old.quantity)===qty)await c.query('DELETE FROM vin_installed WHERE id=$1',[old.id]);else await c.query('UPDATE vin_installed SET quantity=quantity-$1 WHERE id=$2',[qty,old.id]);await c.query('INSERT INTO vin_installed(vin_id,sku_code,quantity,serial_no,batch_no,installed_at) VALUES($1,$2,$3,$4,$5,now())',[vin.id,repair.sku,qty,serial,batch]);const replacement=(await c.query('INSERT INTO repair_replacements(id,repair_id,vin_id,old_sku,old_serial,old_batch,new_sku,new_serial,new_batch,quantity,actor) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id,old_sku AS "oldSku",old_serial AS "oldSerial",old_batch AS "oldBatch",new_sku AS "newSku",new_serial AS "newSerial",new_batch AS "newBatch",quantity,actor,created_at AS "createdAt"',[uuidv7(),id,vin.id,old.sku,old.serial,old.batch,repair.sku,serial,batch,qty,currentActor()])).rows[0];await c.query('INSERT INTO old_part_recoveries(replacement_id) VALUES($1)',[replacement.id]);await c.query("UPDATE repairs SET status='已完成' WHERE id=$1",[id]);return{before:repair,after:{status:'已完成',replacement}};});},
    createRepair(b){if(b.status!==undefined&&!['待收货','维修中','待配件','已完成','已关闭'].includes(b.status))throw Error('工单状态无效');if(['已完成','已关闭'].includes(b.status))throw Error('新工单不能直接完成或关闭');if(b.type!==undefined&&!['质保维修','付费维修','返厂检测','售后服务'].includes(b.type))throw Error('工单类型无效');if(!b.fault||!String(b.fault).trim())throw Error('故障描述必填');if(b.qty!==undefined&&(!Number.isInteger(Number(b.qty))||Number(b.qty)<1))throw Error('维修数量必须为正整数');const id=uuidv7(),no=`WO-${uuidv7().slice(0,8).toUpperCase()}`;return tx('repair.create',`repairs/${id}`,async c=>{const vin=await c.query('SELECT 1 FROM vins WHERE vin=$1 FOR SHARE',[b.vin]);if(!vin.rowCount)throw Error('VIN 档案不存在');if(b.sku){const sku=await c.query("SELECT 1 FROM skus s JOIN products p ON p.id=s.product_id WHERE s.code=$1 AND p.kind='part'",[b.sku]);if(!sku.rowCount)throw Error('维修配件 SKU 不存在');}const center=await validServiceCenter(c,b.serviceCenterId);const r=await c.query(`INSERT INTO repairs(id,work_order_no,vin,type,fault,replacement_sku,quantity,repair_store,service_center_uuid,status,old_part) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${repairSql}`,[id,no,b.vin,b.type||'质保维修',b.fault,b.sku||null,Number(b.qty||1),center?.name||b.store||'',center?.id||null,b.status||'待收货',b.oldPart||'']);return{after:r.rows[0]};});},
    async updateRepair(id,b){return tx('repair.update',`repairs/${id}`,async c=>{const old=(await c.query(`SELECT ${repairSql} FROM repairs WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!old)throw Error('维修工单不存在');const n={...old,...b};if(n.status!==undefined&&!['待收货','维修中','待配件','已完成','已关闭'].includes(n.status))throw Error('工单状态无效');if(!String(n.fault||'').trim())throw Error('故障描述必填');if(!Number.isInteger(Number(n.qty))||Number(n.qty)<1)throw Error('维修数量必须为正整数');if(b.type!==undefined&&!['质保维修','付费维修','返厂检测','售后服务'].includes(b.type))throw Error('工单类型无效');if(n.sku){const sku=await c.query("SELECT 1 FROM skus s JOIN products p ON p.id=s.product_id WHERE s.code=$1 AND p.kind='part'",[n.sku]);if(!sku.rowCount)throw Error('维修配件 SKU 不存在');}if(['已完成','已关闭'].includes(old.status)&&['vin','sku','qty','type','fault','store','serviceCenterId','oldPart'].some(k=>String(n[k]??'')!==String(old[k]??'')))throw Error('已完成或关闭的工单不能更改业务信息');if(n.status==='已完成'&&old.status!=='已完成')throw Error('请通过完成更换记录工单');if(['已完成','已关闭'].includes(old.status)&&n.status!==old.status)throw Error('已完成或关闭的工单不能重新打开');if(n.status==='已关闭'&&old.status!=='已完成'&&old.status!=='已关闭')throw Error('工单完成后才能关闭');const vin=await c.query('SELECT 1 FROM vins WHERE vin=$1 FOR SHARE',[n.vin]);if(!vin.rowCount)throw Error('VIN 档案不存在');if((n.sku||'')!==(old.sku||'')||Number(n.qty)!==Number(old.qty)||(n.vin||'')!==(old.vin||'')){const used=await c.query('SELECT 1 FROM repair_stock_events WHERE repair_id=$1 LIMIT 1',[id]);if(used.rowCount)throw Error('已有领退料记录的工单不能更改车辆、配件或数量');}const center=await validServiceCenter(c,n.serviceCenterId,old.serviceCenterId);const r=await c.query(`UPDATE repairs SET vin=$1,type=$2,fault=$3,replacement_sku=$4,quantity=$5,repair_store=$6,service_center_uuid=$7,status=$8,old_part=$9 WHERE id=$10 RETURNING ${repairSql}`,[n.vin,n.type,n.fault,n.sku||null,Number(n.qty||1),center?.name||n.store||'',center?.id||null,n.status,n.oldPart||'',id]);return{before:old,after:r.rows[0]};});},
    async completeRepairService(id,input){const note=String(input.note||'').trim();if(!note||note.length>2000)throw Error('服务完成说明必填');return tx('repair.service.complete',`repairs/${id}`,async c=>{const repair=(await c.query(`SELECT ${repairSql} FROM repairs WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!repair)throw Error('维修工单不存在');if(repair.status!=='维修中')throw Error('只有维修中的工单可以完成服务');if(repair.sku)throw Error('已指定更换配件的工单应记录配件更换');if((await c.query('SELECT 1 FROM repair_stock_events WHERE repair_id=$1 LIMIT 1',[id])).rowCount)throw Error('已有领退料记录的工单不能按无配件服务完成');const after=(await c.query(`UPDATE repairs SET status='已完成' WHERE id=$1 RETURNING ${repairSql}`,[id])).rows[0];return{before:repair,after:{...after,completionNote:note}};});},
    listSubs:async()=>(await pool.query(`SELECT ${subSql} FROM substitutes ORDER BY effective_at DESC NULLS LAST`)).rows,
    createSub(b){const id=uuidv7();return tx('substitute.create',`substitutes/${id}`,async c=>{if(b.originalSku===b.replacementSku)throw Error('替代前后 SKU 不能相同');const r=await c.query(`INSERT INTO substitutes(id,original_sku,replacement_sku,reason,effective_at,status,note) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${subSql}`,[id,b.originalSku,b.replacementSku,b.reason,b.effectiveAt||null,b.status||'启用',b.note||'']);return{after:r.rows[0]};});},
    async updateSub(id,b){return tx('substitute.update',`substitutes/${id}`,async c=>{const old=(await c.query(`SELECT ${subSql} FROM substitutes WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!old)throw Error('替代关系不存在');const n={...old,...b};if(n.originalSku===n.replacementSku)throw Error('替代前后 SKU 不能相同');const r=await c.query(`UPDATE substitutes SET original_sku=$1,replacement_sku=$2,reason=$3,effective_at=$4,status=$5,note=$6 WHERE id=$7 RETURNING ${subSql}`,[n.originalSku,n.replacementSku,n.reason,n.effectiveAt||null,n.status,n.note||'',id]);return{before:old,after:r.rows[0]};});},
    async updateProductionProgressV3(id,b){const actual=Number(b.actualQuantity),note=String(b.note||'').trim();if(!Number.isSafeInteger(actual)||actual<0)throw Error('完成数量必须为非负整数');return tx('production_order.progress_v2',`production_orders/${id}`,async c=>{const old=(await c.query('SELECT id,status,factory_confirmed_at AS "factoryConfirmedAt",planned_quantity AS "plannedQuantity",actual_quantity AS "actualQuantity",production_completed_at AS "productionCompletedAt" FROM production_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old)throw Error('生产订单不存在');if(old.productionCompletedAt||['已取消','已完成','待发货'].includes(old.status))throw Error('已完工、待发货或取消的订单不能更新生产进度');if(!old.factoryConfirmedAt)throw Error('请先确认工厂，再更新生产进度');if(actual>old.plannedQuantity)throw Error('完成数量不能超过计划数量');const after=(await c.query("UPDATE production_orders SET actual_quantity=$1,progress_percent=round($1*100.0/planned_quantity),status=CASE WHEN $1=0 THEN status WHEN $1<planned_quantity THEN '生产中' ELSE '待发货' END,production_started_at=CASE WHEN $1>0 THEN COALESCE(production_started_at,now()) ELSE production_started_at END,production_completed_at=CASE WHEN $1=planned_quantity THEN now() ELSE production_completed_at END,updated_at=now() WHERE id=$2 RETURNING id,actual_quantity AS \"actualQuantity\",status,production_started_at AS \"productionStartedAt\",production_completed_at AS \"productionCompletedAt\",updated_at AS \"updatedAt\"",[actual,id])).rows[0];await c.query("INSERT INTO production_order_events(id,order_id,event_type,actual_quantity,note,actor) VALUES($1,$2,'进度更新',$3,$4,$5)",[uuidv7(),id,actual,note,currentActor()]);return{before:old,after};});},
    async listDeliveryItems(id){return (await pool.query(`SELECT i.id,i.sku_code AS sku,i.planned_quantity AS "plannedQuantity",i.received_quantity AS "receivedQuantity",i.order_item_uuid AS "orderItemUuid" FROM production_delivery_items i JOIN production_deliveries d ON d.entity_uuid=i.delivery_uuid WHERE d.id=$1 ORDER BY i.created_at,i.id`,[String(id||'').toLowerCase()])).rows;},
    async saveDeliveryItems(id,b){const deliveryId=String(id||'').toLowerCase(),items=(Array.isArray(b?.items)?b.items:[]).map(item=>({sku:String(item.sku||'').trim(),plannedQuantity:Number(item.plannedQuantity)}));if(!isUuidv7(deliveryId)||!items.length||items.some(item=>!item.sku||!Number.isSafeInteger(item.plannedQuantity)||item.plannedQuantity<1)||new Set(items.map(item=>item.sku)).size!==items.length)throw Error('车型明细无效');return tx('production_delivery.items.save',`production_deliveries/${deliveryId}/items`,async c=>{const initial=(await c.query('SELECT order_id FROM production_deliveries WHERE id=$1',[deliveryId])).rows[0];if(!initial)throw Error('发运记录不存在');await c.query('SELECT id FROM production_orders WHERE id=$1 FOR UPDATE',[initial.order_id]);const delivery=(await c.query('SELECT d.id,d.entity_uuid AS "deliveryUuid",d.order_id AS "orderId",d.planned_quantity AS "plannedQuantity",d.status,o.entity_uuid AS "orderUuid" FROM production_deliveries d JOIN production_orders o ON o.id=d.order_id WHERE d.id=$1 FOR UPDATE',[deliveryId])).rows[0];if(!delivery)throw Error('发运记录不存在');if(delivery.status!=='待发运')throw Error('只有待发运批次可以修改车型明细');const orderItems=(await c.query('SELECT id,sku_uuid AS "skuUuid",sku_code AS sku,planned_quantity AS "plannedQuantity" FROM production_order_items WHERE order_uuid=$1 FOR SHARE',[delivery.orderUuid])).rows;const bySku=new Map(orderItems.map(item=>[item.sku,item]));if(items.some(item=>!bySku.has(item.sku)))throw Error('车型 SKU 不属于该生产订单');if(items.reduce((sum,item)=>sum+item.plannedQuantity,0)!==Number(delivery.plannedQuantity))throw Error('车型明细合计必须等于批次发运数量');for(const item of items){const orderItem=bySku.get(item.sku);const prior=(await c.query('SELECT COALESCE(sum(i.planned_quantity),0)::int AS quantity FROM production_delivery_items i JOIN production_deliveries d ON d.entity_uuid=i.delivery_uuid LEFT JOIN production_delivery_cancellations x ON x.delivery_uuid=d.entity_uuid WHERE i.sku_code=$1 AND d.order_id=$2 AND i.delivery_uuid<>$3 AND x.id IS NULL',[item.sku,delivery.orderId,delivery.deliveryUuid])).rows[0];if(Number(prior.quantity)+item.plannedQuantity>Number(orderItem.plannedQuantity))throw Error('车型跨批次累计发运数量不能超过订单计划数量');}await c.query('DELETE FROM production_delivery_items WHERE delivery_uuid=$1',[delivery.deliveryUuid]);for(const item of items){const orderItem=bySku.get(item.sku);if(item.plannedQuantity>Number(orderItem.plannedQuantity))throw Error('车型发运数量不能超过订单计划数量');await c.query('INSERT INTO production_delivery_items(delivery_uuid,order_item_uuid,sku_uuid,sku_code,planned_quantity) VALUES($1,$2,$3,$4,$5)',[delivery.deliveryUuid,orderItem.id,orderItem.skuUuid,item.sku,item.plannedQuantity]);}return{after:items};});},
    close:()=>pool.end(),
  };
}
module.exports={createServiceStore};
