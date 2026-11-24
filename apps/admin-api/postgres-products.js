const { currentActor } = require('./audit-context');
// PostgreSQL resource operations. No connection is opened until configured.
const { createPool } = require('./db-pool');
const { uuidv7, isUuidv7 } = require('./uuidv7');
const { buildSku, buildVehicleSku, skuSpecOptions, validProductSkuBase, isVehicleSku } = require('./sku-code');
const { normalizeSkuAttributes } = require('./sku-attributes');
const { validateProductSpecs } = require('./product-specs');
const { splitVehicleMaster, archiveLegacyMarket, validateVehicleStatus, validatePhysicalSpecs } = require('./product-master');
const { TEMPLATES, OWNERSHIP } = require('./db');
const { isValidEan13 } = require('./ean13');

// 整车封面图：图片实体统一存在素材库 media_assets（文件在 R2），通过 asset_links 关联产品。
// 旧的 product_media 表已不再写入，产品列表/详情用这个字段兜底显示图片，避免改动 BOM 图纸与商城上架的 images 语义。
// :TARGET 由 coverFor() 替换为列表相关子查询的 p.id，或详情查询的参数 $1。
const COVER_IMAGE_SQL = `SELECT json_build_object('id',a.id::text,'url','/api/assets/'||a.id::text||'/file',
  'label',a.label,'contentType',a.content_type) AS cover
  FROM asset_links l JOIN media_assets a ON a.id=l.asset_id
  WHERE l.target_type='product' AND l.target_id=:TARGET AND a.content_type LIKE 'image/%'
  ORDER BY (CASE WHEN l.role='hero' OR a.folder LIKE '%主图' OR a.label LIKE '%主图%' THEN 0 ELSE 1 END),
           l.sort_order, a.created_at, a.id
  LIMIT 1`;
const coverFor = target => COVER_IMAGE_SQL.replace(':TARGET', target);

function createProductStore(connectionString) {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  const pool = createPool(connectionString, { max: 3, connectionTimeoutMillis: 10000 });
  const projection = `id,entity_uuid AS "entityUuid",kind,name,model,product_type AS "productType",platform,status,ownership,uses,specs,version`;
  async function withAudit(action, target, fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { before, after } = await fn(client);
      await client.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(),action,target,before == null ? null : JSON.stringify(before),after == null ? null : JSON.stringify(after)]);
      await client.query('COMMIT');
      return after;
    } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
    finally { client.release(); }
  }
  async function resolveFitments(client, fitments) {
    const resolved = [], seen = new Set();
    for (const fit of fitments) {
      let result;
      if (fit.vehicleUuid) {
        if (!isUuidv7(fit.vehicleUuid)) throw new Error('适配整车编号无效');
        result = await client.query("SELECT id,entity_uuid FROM products WHERE kind='vehicle' AND entity_uuid=$1 FOR SHARE", [fit.vehicleUuid]);
      } else {
        const model = String(fit.vehicleModel || '').trim();
        if (!model) throw new Error('请选择适配整车');
        result = await client.query("SELECT id,entity_uuid FROM products WHERE kind='vehicle' AND model=$1 FOR SHARE", [model]);
      }
      if (!result.rows.length) throw new Error('适配整车不存在');
      if (result.rows.length !== 1) throw new Error('车型对应多辆整车，请明确选择整车产品');
      const vehicle = result.rows[0];
      if (seen.has(vehicle.entity_uuid)) throw new Error('适配整车重复');
      seen.add(vehicle.entity_uuid);
      resolved.push({ id: vehicle.id, uuid: vehicle.entity_uuid, note: String(fit.note || '').trim() });
    }
    return resolved;
  }
  async function hydrate(client, product) {
    if (!product) return null;
    const skus = await client.query(`SELECT s.entity_uuid AS "entityUuid",s.code AS sku,s.spec,s.color_code AS color,s.region_code AS region,(SELECT ral FROM colors WHERE code=s.color_code) AS "colorRal",s.ean13,s.price,s.note,s.disabled,s.safety_stock AS "safetyStock",COALESCE(to_jsonb(s)->'attributes','{}'::jsonb) AS attributes,
      k.code AS "kitCode",k.name AS "kitName",NULLIF(btrim(concat_ws(' · ',NULLIF(btrim(k.battery_spec),''),NULLIF(btrim(k.drivetrain),''))),'') AS "kitSummary"
      FROM skus s LEFT JOIN config_kits k ON k.code=s.spec WHERE s.product_uuid=$1 ORDER BY s.code`, [product.entityUuid]);
    // 整车价格存放在 storefront_offers(EUR)，回填给编辑界面做价格预填。
    if (product.kind === 'vehicle' && skus.rowCount) {
      const offers = await client.query(`SELECT s.code AS sku,o.unit_price AS price FROM storefront_offers o JOIN skus s ON s.entity_uuid=o.sku_uuid WHERE s.product_uuid=$1 AND o.currency='EUR'`, [product.entityUuid]);
      const eur = new Map(offers.rows.map(row => [row.sku, row.price]));
      skus.rows.forEach(row => { row.eurPrice = eur.has(row.sku) ? eur.get(row.sku) : null; });
    }
    const fits = await client.query('SELECT v.entity_uuid AS "vehicleUuid",v.model AS "vehicleModel",f.note FROM fits f JOIN products v ON v.entity_uuid=f.vehicle_product_uuid WHERE f.part_product_uuid=$1 ORDER BY v.model,v.id', [product.entityUuid]);
    const items = await client.query('SELECT id,parent_item_id AS "parentItemId",drawing_media_id AS "drawingMediaId",drawing_x AS "drawingX",drawing_y AS "drawingY",section,drawing_no AS "drawingNo",sku_code AS sku,quantity AS qty,unit,position,supplier,spec_requirement AS "specRequirement",key_control AS "keyControl" FROM bom_version_items WHERE bom_version_id=(SELECT id FROM bom_versions WHERE vehicle_id=$1 AND version=$2) ORDER BY id', [product.id,product.bomVersion || '']);
    const media = await client.query('SELECT id,object_key AS key,content_type AS "contentType",label,created_at AS "createdAt" FROM product_media WHERE product_id=$1 ORDER BY created_at DESC', [product.id]);
    const cover = await client.query(coverFor('$1'), [product.id]);
    let modelLocked = skus.rowCount > 0;
    if (product.kind === 'vehicle' && !modelLocked) {
      const linked = await client.query(`SELECT EXISTS(SELECT 1 FROM bom_versions WHERE vehicle_id=$1)
        OR EXISTS(SELECT 1 FROM fits WHERE vehicle_product_uuid=$2)
        OR EXISTS(SELECT 1 FROM catalog_publications WHERE product_uuid=$2)
        OR EXISTS(SELECT 1 FROM product_media WHERE product_id=$1) AS linked`, [product.id, product.entityUuid]);
      modelLocked = linked.rows[0].linked;
    }
    const activeSkus = skus.rows.filter(s => !s.disabled);
    return { ...product,modelLocked,skus:skus.rows,fitments:fits.rows,bom:product.kind === 'vehicle' ? {version: product.bomVersion || '',items:items.rows} : undefined,images:media.rows,coverImage:cover.rows[0]?.cover||null,skuCount:activeSkus.length,colorCount:new Set(activeSkus.map(s => s.color)).size,disabledSkuCount:skus.rows.length-activeSkus.length };
  }
  async function productReferences(client, id, skuUuid = null) {
    const product = (await client.query('SELECT entity_uuid FROM products WHERE id=$1', [id])).rows[0];
    if (!product) throw new Error('产品不存在');
    const rows = await client.query(`
      WITH product_skus AS (SELECT entity_uuid,code FROM skus WHERE product_uuid=$1 AND ($3::uuid IS NULL OR entity_uuid=$3)), product_identity AS (SELECT entity_uuid FROM products WHERE id=$2)
      SELECT type,document_no AS "documentNo",created_at AS "createdAt",detail
      FROM (
        SELECT '采购订单'::text type,o.po_number document_no,o.created_at,
          string_agg(DISTINCT l.sku_code,', ' ORDER BY l.sku_code) detail
        FROM procurement_purchase_order_lines l JOIN procurement_purchase_orders o ON o.id=l.purchase_order_id
        WHERE l.sku_uuid IN (SELECT entity_uuid FROM product_skus) GROUP BY o.id
        UNION ALL
        SELECT '采购询价'::text,q.quotation_no,q.created_at,string_agg(DISTINCT l.sku_code,', ' ORDER BY l.sku_code)
        FROM procurement_quotation_lines l JOIN procurement_quotations q ON q.id=l.quotation_id
        WHERE l.sku_uuid IN (SELECT entity_uuid FROM product_skus) GROUP BY q.id
        UNION ALL
        SELECT '采购收货'::text,'收货记录 '||r.id::text,r.created_at,
          string_agg(DISTINCT l.sku_code,', ' ORDER BY l.sku_code)
        FROM procurement_receipt_lines rl JOIN procurement_receipts r ON r.id=rl.receipt_id
        JOIN procurement_purchase_order_lines l ON l.id=rl.purchase_order_line_id
        WHERE l.sku_uuid IN (SELECT entity_uuid FROM product_skus) GROUP BY r.id
        UNION ALL
        SELECT 'B2B 销售订单'::text,o.order_no,o.created_at,string_agg(DISTINCT l.code,', ' ORDER BY l.code)
        FROM sales_orders o LEFT JOIN product_skus l ON l.entity_uuid=o.sku_uuid
        WHERE o.sku_uuid IN (SELECT entity_uuid FROM product_skus) GROUP BY o.id
        UNION ALL
        SELECT '库存出入账'::text,COALESCE(l.source_type,'库存流水')||' · '||l.source_id,l.created_at,
          string_agg(DISTINCT s.code,', ' ORDER BY s.code)
        FROM inventory_ledger l JOIN product_skus s ON s.entity_uuid=l.sku_uuid GROUP BY l.id
        UNION ALL
        SELECT '销售出库单'::text,o.outbound_no,o.created_at,i.sku_code
        FROM inventory_outbound_items i JOIN inventory_outbound_orders o ON o.id=i.outbound_id
        WHERE i.sku_code IN (SELECT code FROM product_skus)
        UNION ALL
        SELECT '当前库存'::text,w.name||' · '||s.code,now(),'余额 '||ws.quantity::text
        FROM warehouse_stock ws JOIN warehouses w ON w.id=ws.warehouse_id
        JOIN product_skus s ON s.code=ws.sku_code WHERE ws.quantity<>0
        UNION ALL
        SELECT '整车 VIN'::text,v.vin,COALESCE(v.created_at,now()),v.sku_code
        FROM vins v WHERE v.sku_uuid IN (SELECT entity_uuid FROM product_skus)
        UNION ALL
        SELECT '生产订单'::text,p.order_no,p.created_at,p.sku_code
        FROM production_orders p WHERE p.sku_uuid IN (SELECT entity_uuid FROM product_skus)
        UNION ALL
        SELECT '生产订单明细'::text,p.order_no,p.created_at,i.sku_code||' × '||i.planned_quantity::text
        FROM production_order_items i JOIN production_orders p ON p.entity_uuid=i.order_uuid
        WHERE i.sku_uuid IN (SELECT entity_uuid FROM product_skus)
        UNION ALL
        SELECT '库存预留'::text,COALESCE(r.source_type,'预留')||' · '||r.source_id,r.created_at,s.code||' × '||r.quantity::text
        FROM inventory_reservations r JOIN product_skus s ON s.entity_uuid=r.sku_uuid
        UNION ALL
        SELECT '生产物料'::text,o.order_no,o.created_at,m.sku_code
        FROM production_order_materials m JOIN production_orders o ON o.id=m.order_id
        WHERE m.sku_uuid IN (SELECT entity_uuid FROM product_skus)
        UNION ALL
        SELECT '维修替换件'::text,r.work_order_no,r.created_at,r.replacement_sku
        FROM repairs r WHERE r.replacement_sku_uuid IN (SELECT entity_uuid FROM product_skus)
        UNION ALL
        SELECT '维修换件记录'::text,rr.repair_id,rr.created_at,rr.old_sku||' → '||rr.new_sku
        FROM repair_replacements rr
        WHERE rr.old_sku_uuid IN (SELECT entity_uuid FROM product_skus)
           OR rr.new_sku_uuid IN (SELECT entity_uuid FROM product_skus)
        UNION ALL
        SELECT '维修库存流水'::text,e.repair_id,e.created_at,e.sku_code
        FROM repair_stock_events e WHERE e.sku_uuid IN (SELECT entity_uuid FROM product_skus)
        UNION ALL
        SELECT 'VIN 装配明细'::text,v.vin,COALESCE(i.installed_at,v.created_at),i.sku_code||' × '||i.quantity::text
        FROM vin_installed i JOIN vins v ON v.id=i.vin_id
        WHERE i.sku_uuid IN (SELECT entity_uuid FROM product_skus)
        UNION ALL
        SELECT '车型 BOM'::text,p.model,now(),b.sku_code
        FROM bom_items b JOIN products p ON p.id=b.vehicle_id
        WHERE b.sku_uuid IN (SELECT entity_uuid FROM product_skus)
        UNION ALL
        SELECT '已发布 BOM'::text,p.model,now(),b.sku_code
        FROM bom_version_items b JOIN bom_versions v ON v.id=b.bom_version_id
        JOIN products p ON p.id=v.vehicle_id
        WHERE b.sku_uuid IN (SELECT entity_uuid FROM product_skus)
        UNION ALL
        SELECT '产品版本快照'::text,pv.label,pv.created_at,p.name
        FROM product_versions pv JOIN products p ON p.entity_uuid=pv.product_uuid
        WHERE p.entity_uuid IN (SELECT entity_uuid FROM product_identity) AND $3::uuid IS NULL
        UNION ALL
        SELECT '其他车型 BOM 图纸引用'::text,p.model,bv.created_at,COALESCE(bi.drawing_no,'')
        FROM bom_version_items bi JOIN bom_versions bv ON bv.id=bi.bom_version_id
        JOIN products p ON p.id=bv.vehicle_id
        JOIN product_media pm ON pm.id=bi.drawing_media_id
        WHERE pm.product_uuid IN (SELECT entity_uuid FROM product_identity)
          AND bv.vehicle_id<>$2 AND $3::uuid IS NULL
        UNION ALL
        SELECT '已发布车型 BOM 版本'::text,bv.version,bv.created_at,p.model
        FROM bom_versions bv JOIN products p ON p.id=bv.vehicle_id
        WHERE p.entity_uuid IN (SELECT entity_uuid FROM product_identity) AND bv.status='published' AND $3::uuid IS NULL
        UNION ALL
        SELECT '替代件关系'::text,s.id,now(),s.original_sku||' → '||s.replacement_sku
        FROM substitutes s
        WHERE s.original_sku_uuid IN (SELECT entity_uuid FROM product_skus)
           OR s.replacement_sku_uuid IN (SELECT entity_uuid FROM product_skus)
        UNION ALL
        SELECT '库存移动记录'::text,m.id,m.created_at,m.sku_code
        FROM stock_movements m WHERE m.sku_uuid IN (SELECT entity_uuid FROM product_skus)
        UNION ALL
        SELECT '经销商订单'::text,o.id::text,o.created_at,string_agg(DISTINCT s.code,', ' ORDER BY s.code)
        FROM dealer_order_items i JOIN dealer_orders o ON o.id=i.order_id
        JOIN product_skus s ON s.entity_uuid=i.sku_uuid GROUP BY o.id
        UNION ALL
        SELECT '商城订单'::text,o.id::text,o.created_at,string_agg(DISTINCT s.code,', ' ORDER BY s.code)
        FROM storefront_order_items i JOIN storefront_orders o ON o.id=i.order_id
        JOIN product_skus s ON s.entity_uuid=i.sku_uuid GROUP BY o.id
        UNION ALL
        SELECT '库存盘点'::text,t.stocktake_number,c.counted_at,s.code||' · 数量 '||c.counted_quantity::text
        FROM inventory_stocktake_counts c JOIN inventory_stocktakes t ON t.id=c.stocktake_id
        JOIN product_skus s ON s.entity_uuid=c.sku_uuid
        UNION ALL
        SELECT '库位库存流水'::text,COALESCE(l.source_type,'库存流水')||' · '||l.source_id,l.created_at,s.code
        FROM inventory_location_ledger l JOIN product_skus s ON s.entity_uuid=l.sku_uuid
        UNION ALL
        SELECT '库存状态流水'::text,COALESCE(l.source_type,'状态流水')||' · '||l.source_id,l.created_at,s.code
        FROM inventory_condition_ledger l JOIN product_skus s ON s.entity_uuid=l.sku_uuid
        UNION ALL
        SELECT '库存状态调整'::text,t.id::text,t.created_at,s.code||' · '||t.from_condition||' → '||t.to_condition
        FROM inventory_condition_transfers t JOIN product_skus s ON s.entity_uuid=t.sku_uuid
        UNION ALL
        SELECT '库存调整'::text,a.id::text,a.created_at,s.code||' · 变动 '||a.quantity_delta::text
        FROM inventory_adjustments a JOIN product_skus s ON s.entity_uuid=a.sku_uuid
        UNION ALL
        SELECT '财务单据'::text,d.document_number,d.created_at,s.code
        FROM finance_document_lines l JOIN finance_documents d ON d.id=l.document_id
        JOIN product_skus s ON s.entity_uuid=l.sku_uuid
        UNION ALL
        SELECT '生产发货单'::text,d.id,d.created_at,string_agg(DISTINCT s.code,', ' ORDER BY s.code)
        FROM production_delivery_items i JOIN production_deliveries d ON d.entity_uuid=i.delivery_uuid
        JOIN product_skus s ON s.entity_uuid=i.sku_uuid GROUP BY d.entity_uuid
        UNION ALL
        SELECT '生产规格'::text,b.code,b.created_at,s.code
        FROM engineering_build_specs b JOIN product_skus s ON s.entity_uuid=b.sku_uuid
        UNION ALL
        SELECT '车辆资产流水'::text,l.source_type||' · '||l.source_id,l.received_at,COALESCE(s.code,v.vin)
        FROM vehicle_asset_ledger l JOIN vins v ON v.entity_uuid=l.vin_uuid
        LEFT JOIN product_skus s ON s.entity_uuid=l.sku_uuid
        WHERE l.sku_uuid IN (SELECT entity_uuid FROM product_skus)
        UNION ALL
        SELECT '财务成本分摊'::text,batch.batch_number,batch.created_at,v.vin
        FROM finance_landed_cost_allocations a JOIN finance_landed_cost_components c ON c.id=a.component_id
        JOIN finance_landed_cost_batches batch ON batch.id=c.batch_id JOIN vins v ON v.entity_uuid=a.cargo_vin_uuid
        WHERE v.sku_uuid IN (SELECT entity_uuid FROM product_skus)
        UNION ALL
        SELECT '生产发货明细'::text,d.id,d.created_at,s.code||' × '||i.quantity::text
        FROM delivery_items i JOIN production_deliveries d ON d.id=i.delivery_id
        JOIN product_skus s ON s.code=i.sku_code
        UNION ALL
        SELECT '配件/车辆库存流水'::text,l.source_type||' · '||l.source_id,l.created_at,COALESCE(l.product_uuid::text,'')
        FROM inventory_non_sku_ledger l WHERE l.product_uuid IN (SELECT entity_uuid FROM product_identity) AND $3::uuid IS NULL
        UNION ALL
        SELECT '配件/车辆库存预留'::text,r.reference_type||' · '||COALESCE(r.reference_id::text,r.id::text),r.created_at,r.quantity::text
        FROM inventory_non_sku_reservations r WHERE r.product_uuid IN (SELECT entity_uuid FROM product_identity) AND $3::uuid IS NULL
        UNION ALL
        SELECT '配件库存移动'::text,m.movement_type||' · '||COALESCE(m.reference_type,'库存移动'),m.created_at,m.quantity::text
        FROM inventory_non_sku_movements m WHERE m.product_uuid IN (SELECT entity_uuid FROM product_identity) AND $3::uuid IS NULL
        UNION ALL
        SELECT '库存盘点'::text,t.stocktake_number,c.counted_at,c.counted_quantity::text
        FROM inventory_stocktake_counts c JOIN inventory_stocktakes t ON t.id=c.stocktake_id
        WHERE c.product_uuid IN (SELECT entity_uuid FROM product_identity) AND $3::uuid IS NULL
      ) refs ORDER BY created_at DESC LIMIT 100`, [product.entity_uuid, id, skuUuid]);
    return rows.rows;
  }
  return {
    referencesForSku: productReferences,
    // 第三方链接（工厂产品资料入口）存放在 specs._externalLinks，读写独立于产品版本与 SKU 业务字段。
    async getExternalLinks(id) {
      const r = await pool.query('SELECT specs FROM products WHERE id=$1', [id]);
      if (!r.rowCount) return null;
      const links = r.rows[0].specs?._externalLinks;
      return Array.isArray(links) ? links : [];
    },
    async setExternalLinks(id, links) {
      return withAudit('product.external-links.update', `products/${id}/external-links`, async c => {
        const r = await c.query('SELECT specs FROM products WHERE id=$1 FOR UPDATE', [id]);
        if (!r.rowCount) throw new Error('产品不存在');
        const current = r.rows[0].specs || {};
        const before = Array.isArray(current._externalLinks) ? current._externalLinks : [];
        const specs = links.length ? { ...current, _externalLinks: links } : { ...current };
        if (!links.length) delete specs._externalLinks;
        await c.query('UPDATE products SET specs=$2,updated_at=now() WHERE id=$1', [id, JSON.stringify(specs)]);
        return { before, after: links };
      });
    },
    async list(kind, includeDeleted = false) {
      // 列表一次性取回产品及其 SKU/适配/BOM 物料/图片，避免逐个产品再查 4 次（跨区数据库下单次请求可省数秒）。
      const r = await pool.query(`SELECT p.id,p.entity_uuid AS "entityUuid",p.kind,p.name,
        p.model,p.product_type AS "productType",p.platform,p.status,p.ownership,p.deleted_at AS "deletedAt",
        p.uses,p.specs,p.version,p.bom_version AS "bomVersion",p.created_at AS "createdAt",
        EXISTS(SELECT 1 FROM catalog_publications cp WHERE cp.product_uuid=p.entity_uuid AND cp.published IS NOT NULL) AS "catalogPublished",
        EXISTS(SELECT 1 FROM storefront_listings sl WHERE sl.product_uuid=p.entity_uuid AND sl.published IS NOT NULL) AS "storefrontPublished",
        COALESCE((SELECT json_agg(json_build_object('entityUuid',s.entity_uuid,'sku',s.code,'spec',s.spec,'region',s.region_code,'color',s.color_code,'colorName',c.zh,'colorRal',c.ral,'ean13',s.ean13,
          'kitCode',k.code,'kitName',k.name,
          'kitSummary',NULLIF(btrim(concat_ws(' · ',NULLIF(btrim(k.battery_spec),''),NULLIF(btrim(k.drivetrain),''))),''),
          'price',COALESCE((SELECT o.unit_price::text FROM storefront_offers o WHERE o.sku_uuid=s.entity_uuid AND o.currency='EUR'),s.price::text),
          'note',s.note,'disabled',s.disabled,'safetyStock',s.safety_stock,'attributes',COALESCE(to_jsonb(s)->'attributes','{}'::jsonb)) ORDER BY s.code)
          FROM skus s LEFT JOIN colors c ON c.code=s.color_code LEFT JOIN config_kits k ON k.code=s.spec WHERE s.product_uuid=p.entity_uuid),'[]'::json) AS skus,
        COALESCE((SELECT json_agg(json_build_object('vehicleUuid',v.entity_uuid,'vehicleModel',v.model,'note',f.note) ORDER BY v.model,v.id)
          FROM fits f JOIN products v ON v.entity_uuid=f.vehicle_product_uuid WHERE f.part_product_uuid=p.entity_uuid),'[]'::json) AS fitments,
        COALESCE((SELECT json_agg(json_build_object('id',b.id::text,'parentItemId',b.parent_item_id::text,
          'drawingMediaId',b.drawing_media_id,'drawingX',b.drawing_x,'drawingY',b.drawing_y,'section',b.section,
          'drawingNo',b.drawing_no,'sku',b.sku_code,'qty',b.quantity::text,'unit',b.unit,'position',b.position,'supplier',b.supplier,'specRequirement',b.spec_requirement,'keyControl',b.key_control) ORDER BY b.id)
          FROM bom_version_items b WHERE b.bom_version_id=(SELECT id FROM bom_versions WHERE vehicle_id=p.id AND version=p.bom_version)),'[]'::json) AS "bomItems",
        COALESCE((SELECT json_agg(json_build_object('id',m.id,'key',m.object_key,'contentType',m.content_type,
          'label',m.label,'createdAt',m.created_at) ORDER BY m.created_at DESC)
          FROM product_media m WHERE m.product_id=p.id),'[]'::json) AS images,
        (${coverFor('p.id')}) AS "coverImage",
        (EXISTS(SELECT 1 FROM bom_versions WHERE vehicle_id=p.id)
          OR EXISTS(SELECT 1 FROM fits WHERE vehicle_product_uuid=p.entity_uuid)
          OR EXISTS(SELECT 1 FROM catalog_publications WHERE product_uuid=p.entity_uuid)
          OR EXISTS(SELECT 1 FROM product_media WHERE product_id=p.id)) AS linked
        FROM products p WHERE ($1::text IS NULL OR p.kind=$1) AND ($2::boolean OR p.deleted_at IS NULL) ORDER BY p.name,p.id`, [kind || null, includeDeleted]);
      return r.rows.map(row => {
        const { bomItems, linked, ...product } = row;
        const skus = row.skus || [];
        const active = skus.filter(s => !s.disabled);
        return { ...product, skus, fitments: row.fitments || [], images: row.images || [],
          bom: row.kind === 'vehicle' ? { version: row.bomVersion || '', items: bomItems || [] } : undefined,
          modelLocked: skus.length > 0 || (row.kind === 'vehicle' && Boolean(linked)),
          skuCount: active.length, colorCount: new Set(active.map(s => s.color)).size, disabledSkuCount: skus.length - active.length };
      });
    },
    async get(id) { const c=await pool.connect(); try { const r=await c.query(`SELECT ${projection},bom_version AS "bomVersion" FROM products WHERE id=$1`,[id]); return await hydrate(c,r.rows[0]); } finally { c.release(); } },
    async listProductVersions(id) {
      const product=(await pool.query('SELECT entity_uuid FROM products WHERE id=$1',[id])).rows[0];
      if(!product)return null;
      return (await pool.query('SELECT id,label,snapshot,created_by AS "createdBy",created_at AS "createdAt" FROM product_versions WHERE product_uuid=$1 ORDER BY created_at DESC,id DESC',[product.entity_uuid])).rows;
    },
    async createProductVersion(id,input) {
      const label=typeof input.label==='string'?input.label.trim():'';
      if(!label||label.length>80||!Number.isInteger(input.version))throw new Error('版本名称或产品版本无效');
      return withAudit('product.version.create',`products/${id}/versions`,async c=>{
        const product=(await c.query(`SELECT ${projection},bom_version AS "bomVersion" FROM products WHERE id=$1 FOR UPDATE`,[id])).rows[0];
        if(!product)throw new Error('产品不存在');
        if(product.version!==input.version){const e=new Error('数据已被其他操作更新');e.code='VERSION_CONFLICT';throw e;}
        const snapshot=await hydrate(c,product);
        const row=(await c.query('INSERT INTO product_versions(product_uuid,label,snapshot,created_by) VALUES($1,$2,$3,$4) RETURNING id,label,snapshot,created_by AS "createdBy",created_at AS "createdAt"',[product.entityUuid,label,JSON.stringify(snapshot),currentActor()])).rows[0];
        return {before:null,after:row};
      });
    },
    async listProductHistory(id,beforeId) {
      const c=await pool.connect();
      try {
        const product=await c.query('SELECT 1 FROM products WHERE id=$1',[id]);
        if(!product.rowCount)return null;
        const target=`products/${id}`;
        const rows=await c.query(`SELECT id,actor,action,target,before_json AS "before",after_json AS "after",created_at AS "at"
          FROM audit_log WHERE (target=$1 OR target LIKE $1||'/%') AND ($2::bigint IS NULL OR id<$2::bigint) ORDER BY id DESC LIMIT 101`,[target,beforeId||null]);
        return {items:rows.rows.slice(0,100),hasMore:rows.rowCount>100};
      } finally { c.release(); }
    },
    async create(input) {
      const master = input.kind === 'vehicle' ? splitVehicleMaster(input) : null;
      if (master) validateVehicleStatus(input.status);
      if (master) input = { ...input, specs: master.specs };
      const id = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(input.id||'')) ? input.id.toLowerCase() : uuidv7();
      if (!['vehicle','part'].includes(input.kind) || !input.name || !input.productType || !input.ownership) throw new Error('产品类型、名称、品类与归属必填');
      if (!validProductSkuBase(input.kind,input.ownership,input.productType,input.model,TEMPLATES,OWNERSHIP) || input.kind === 'vehicle' && (input.productType !== 'EBI')) throw new Error('产品型号或归属编码无效');
      return withAudit('product.create',`products/${id}`,async c=>{ const fields=(await c.query('SELECT code,data_type AS type,options,level,templates,enabled,required FROM fields')).rows;const specs=input.specs||{};if(input.kind==='vehicle'&&input.productType==='EBI')specs.compliance_standard='EN 15194:2017+A1:2023';validateProductSpecs(specs,fields,input.productType);const platform=String(input.platform||'').trim().toUpperCase()||null;const r=await c.query(`INSERT INTO products(id,kind,name,model,product_type,status,ownership,uses,specs,platform) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${projection},bom_version AS "bomVersion"`,[id,input.kind,input.name,input.model || '',input.productType,input.status || '启用',input.ownership,JSON.stringify(input.uses || []),JSON.stringify(specs),platform]); if(master)await archiveLegacyMarket(c,id,input.name,master.legacyMarket); return {before:null,after:await hydrate(c,r.rows[0])}; });
    },
    async update(id,input) {
      if (!Number.isInteger(input.version)) throw new Error('必须提供产品版本');
      return withAudit('product.update',`products/${id}`,async c=>{
        const old=(await c.query(`SELECT ${projection},bom_version AS "bomVersion",deleted_at FROM products WHERE id=$1 FOR UPDATE`,[id])).rows[0];
        if (!old) throw new Error('产品不存在');
        if (old.deleted_at) { const e=new Error('已删除商品请先恢复，再编辑'); e.code='PRODUCT_DELETED'; throw e; }
        if (old.kind === 'vehicle') { validateVehicleStatus(input.status); if (input.specs !== undefined) validatePhysicalSpecs(input.specs); }
        if (old.version !== input.version) { const e=new Error('数据已被其他操作更新'); e.code='VERSION_CONFLICT'; throw e; }
        const before=await hydrate(c,old);
        if (before.skus.length && ((input.ownership && input.ownership!==old.ownership) || (input.productType && input.productType!==old.productType) || (old.kind==='vehicle' && input.model!==undefined && input.model!==old.model))) throw new Error('已存在 SKU 的产品不能修改归属、型号或品类');
        if (old.kind==='vehicle' && before.modelLocked && ((input.model!==undefined && input.model!==old.model) || (input.ownership!==undefined && input.ownership!==old.ownership))) throw new Error('已建立业务关联的产品不能修改车型代号');
        const next={...old,...Object.fromEntries(Object.entries(input).filter(([k])=>['name','model','productType','platform','status','ownership','uses','specs'].includes(k)))};
        next.platform=String(next.platform||'').trim().toUpperCase()||null;
        if (['model','productType','ownership'].some(key=>input[key]!==undefined && input[key]!==old[key]) && !validProductSkuBase(next.kind,next.ownership,next.productType,next.model,TEMPLATES,OWNERSHIP)) throw new Error('产品型号或归属编码无效');
        if (next.kind==='vehicle'&&next.productType==='EBI') next.specs.compliance_standard='EN 15194:2017+A1:2023';
        if (input.specs !== undefined || (input.productType !== undefined && input.productType !== old.productType) || (next.kind==='vehicle'&&next.productType==='EBI')) {
          const fields=(await c.query('SELECT code,data_type AS type,options,level,templates,enabled,required FROM fields')).rows;
          validateProductSpecs(next.specs,fields,next.productType);
        }
        const r=await c.query(`UPDATE products SET name=$1,model=$2,product_type=$3,status=$4,ownership=$5,uses=$6,specs=$7,version=version+1,updated_at=now(),platform=$9 WHERE id=$8 RETURNING ${projection},bom_version AS "bomVersion"`,[next.name,next.model,next.productType,next.status,next.ownership,JSON.stringify(next.uses),JSON.stringify(next.specs),id,next.platform]);
        if (Array.isArray(input.fitments)) {
          if (next.kind !== 'part') throw new Error('只有零配件可以设置车型适配');
          const resolved = await resolveFitments(c, input.fitments);
          await c.query('DELETE FROM fits WHERE part_product_uuid=$1',[old.entityUuid]);
          for (const fit of resolved) await c.query('INSERT INTO fits(part_product_id,part_product_uuid,vehicle_product_id,vehicle_product_uuid,note) VALUES($1,$2,$3,$4,$5)',[id,old.entityUuid,fit.id,fit.uuid,fit.note]);
        }
        return {before,after:await hydrate(c,r.rows[0])};
      });
    },
    async addSku(id,entry) {
      return withAudit('sku.create',`products/${id}/skus`,async c=>{
        const p=(await c.query(`SELECT ${projection},bom_version AS "bomVersion" FROM products WHERE id=$1 FOR UPDATE`,[id])).rows[0];
        if (!p) throw new Error('产品不存在');
        if (p.status !== '启用') throw new Error('停用产品不能新增 SKU');
        if (p.kind === 'vehicle' && entry.price != null && entry.price !== '') throw new Error('整车售价请在商城运营中维护');
        const fields=(await c.query('SELECT level,options,templates,sku_gen AS "skuGen",enabled FROM fields')).rows;
        const colors=await c.query('SELECT code FROM colors WHERE code=$1 AND enabled',[entry.color]);
        const region=String(entry.region||'EUR').trim().toUpperCase();
        if((p.kind==='vehicle'?(!/^[A-Z0-9]{3}$/.test(entry.spec||'')||!/^[A-Z0-9]{3}$/.test(region)):(!skuSpecOptions(p.productType,fields).includes(entry.spec)))||!/^[A-Z0-9]{3}$/.test(entry.color||'')||!colors.rowCount)throw Error('配置版本、颜色或法规不可用');
        const code=p.kind==='vehicle'?buildVehicleSku(p.model,entry.spec,entry.color,region):buildSku(p.ownership,p.productType,entry.spec,entry.color);
        if(p.kind==='vehicle'&&!isVehicleSku(code))throw Error('整车 SKU 必须为 14/15 位编码');
        const r=await c.query('INSERT INTO skus(code,product_id,spec,color_code,region_code,price,note,product_uuid) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING entity_uuid AS "entityUuid",code AS sku,spec,color_code AS color,region_code AS region,price,note',[code,id,entry.spec,entry.color,p.kind==='vehicle'?region:'EUR',entry.price === '' || entry.price == null ? null : entry.price,entry.note || '',p.entityUuid]);
        await c.query('UPDATE products SET version=version+1,updated_at=now() WHERE id=$1',[id]);
        return {before:null,after:r.rows[0]};
      });
    },
    async addSkus(id, entries) {
      return withAudit('sku.create',`products/${id}/skus`,async c=>{
        const p=(await c.query(`SELECT ${projection} FROM products WHERE id=$1 FOR UPDATE`,[id])).rows[0];
        if (!p) throw new Error('产品不存在');
        if (p.status !== '启用') throw new Error('停用产品不能新增 SKU');
        if (p.kind === 'vehicle' && entries.some(entry => entry?.price != null && entry.price !== '')) throw new Error('整车售价请在商城运营中维护');
        const fields=(await c.query('SELECT level,options,templates,sku_gen AS "skuGen",enabled FROM fields')).rows;
        const colors=new Set((await c.query('SELECT code FROM colors WHERE enabled')).rows.map(row=>row.code));
        const specs=skuSpecOptions(p.productType,fields);
        const added=[],skipped=[];
        for (const entry of entries) {
          const region=String(entry?.region||'EUR').trim().toUpperCase();
          if((p.kind==='vehicle'?(!/^[A-Z0-9]{3}$/.test(entry?.spec||'')||!/^[A-Z0-9]{3}$/.test(region)):!specs.includes(entry?.spec))||!colors.has(entry?.color)){skipped.push({reason:'配置版本、颜色或法规不可用'});continue;}
          let code;
          try { code=p.kind==='vehicle'?buildVehicleSku(p.model,entry.spec,entry.color,region):buildSku(p.ownership,p.productType,entry?.spec,entry?.color);if(p.kind==='vehicle'&&!isVehicleSku(code))throw Error('整车 SKU 必须为 14/15 位编码'); }
          catch { skipped.push({reason:'SKU 四段编码无效'}); continue; }
          const r=await c.query('INSERT INTO skus(code,product_id,spec,color_code,region_code,price,note,product_uuid) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (code) DO NOTHING RETURNING entity_uuid AS "entityUuid",code AS sku,spec,color_code AS color,region_code AS region,price,note',[code,id,entry.spec,entry.color,p.kind==='vehicle'?region:'EUR',entry.price === '' || entry.price == null ? null : entry.price,entry.note || '',p.entityUuid]);
          if (r.rowCount) added.push(r.rows[0]);
          else skipped.push({sku:code,reason:'编码已存在'});
        }
        if (added.length) await c.query('UPDATE products SET version=version+1,updated_at=now() WHERE id=$1',[id]);
        return {before:null,after:{added,skipped}};
      });
    },
    async deleteSku(id, sku) {
      return withAudit('sku.delete',`products/${id}/skus/${sku}`,async c=>{
        const target=await c.query('SELECT entity_uuid FROM skus WHERE product_id=$1 AND code=$2',[id,sku]);
        if(!target.rowCount) throw new Error('SKU 不存在');
        const references=await productReferences(c,id,target.rows[0].entity_uuid);
        if(references.length){const error=new Error('该 SKU 已被业务数据引用，无法删除');error.code='ENTITY_REFERENCED';error.references=references;throw error;}
        await c.query("DELETE FROM asset_links WHERE target_type='sku' AND target_id=$1",[sku]);
        await c.query('DELETE FROM storefront_listing_prices WHERE sku_uuid=$1',[target.rows[0].entity_uuid]);
        await c.query('DELETE FROM storefront_listing_skus WHERE sku_uuid=$1',[target.rows[0].entity_uuid]);
        await c.query('DELETE FROM storefront_offers WHERE sku_uuid=$1',[target.rows[0].entity_uuid]);
        await c.query('DELETE FROM legacy_vehicle_sku_prices WHERE sku_uuid=$1',[target.rows[0].entity_uuid]);
        await c.query(`DELETE FROM warehouse_stock WHERE sku_uuid=$1 AND quantity=0
          AND NOT EXISTS (SELECT 1 FROM inventory_ledger l WHERE l.sku_uuid=warehouse_stock.sku_uuid AND l.warehouse_uuid=warehouse_stock.warehouse_uuid)`,[target.rows[0].entity_uuid]);
        const r=await c.query('DELETE FROM skus WHERE product_id=$1 AND code=$2 RETURNING code AS sku', [id,sku]);
        if (!r.rowCount) throw new Error('SKU 不存在');
        await c.query('UPDATE products SET version=version+1,updated_at=now() WHERE id=$1',[id]);
        return {before:r.rows[0],after:null};
      });
    },
    async deleteProduct(id) {
      return withAudit('product.delete', `products/${id}`, async c => {
      const product = (await c.query('SELECT id,entity_uuid,kind,name,model,status,deleted_at AS "deletedAt" FROM products WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!product) throw new Error('产品不存在');
        if (product.status !== '停用') {
          const error = new Error('请先下架商品，再删除');
          error.code = 'PRODUCT_NOT_DELISTED';
          throw error;
        }
        const references = await productReferences(c, id);
        if (references.length) {
          const error = new Error('商品仍被业务单据或配置引用，无法物理删除；请先处理下列关联记录');
          error.code = 'ENTITY_REFERENCED';
          error.references = references;
          throw error;
        }
        const skus = await c.query('SELECT entity_uuid,code FROM skus WHERE product_uuid=$1', [product.entity_uuid]);
        for (const sku of skus.rows) {
          await c.query("DELETE FROM asset_links WHERE target_type='sku' AND target_id=$1", [sku.code]);
          await c.query('DELETE FROM storefront_listing_prices WHERE sku_uuid=$1', [sku.entity_uuid]);
          await c.query('DELETE FROM storefront_listing_skus WHERE sku_uuid=$1', [sku.entity_uuid]);
          await c.query('DELETE FROM storefront_offers WHERE sku_uuid=$1', [sku.entity_uuid]);
          await c.query('DELETE FROM legacy_vehicle_sku_prices WHERE sku_uuid=$1', [sku.entity_uuid]);
          await c.query('DELETE FROM dealer_company_prices WHERE sku_uuid=$1', [sku.entity_uuid]);
          await c.query('DELETE FROM warehouse_stock WHERE sku_uuid=$1 AND quantity=0', [sku.entity_uuid]);
        }
        await c.query('DELETE FROM bom_items WHERE vehicle_id=$1 OR vehicle_uuid=$2', [String(product.id), product.entity_uuid]);
        await c.query('DELETE FROM dealer_company_prices WHERE sku_uuid IN (SELECT entity_uuid FROM skus WHERE product_uuid=$1)', [product.entity_uuid]);
        await c.query('DELETE FROM skus WHERE product_uuid=$1', [product.entity_uuid]);
        await c.query('DELETE FROM storefront_listing_prices WHERE listing_id IN (SELECT id FROM storefront_listings WHERE product_uuid=$1)', [product.entity_uuid]);
        await c.query('DELETE FROM storefront_listing_skus WHERE listing_id IN (SELECT id FROM storefront_listings WHERE product_uuid=$1)', [product.entity_uuid]);
        await c.query('DELETE FROM storefront_listings WHERE product_uuid=$1', [product.entity_uuid]);
        await c.query('DELETE FROM catalog_publications WHERE product_uuid=$1', [product.entity_uuid]);
        await c.query('DELETE FROM fits WHERE vehicle_product_uuid=$1 OR part_product_uuid=$1', [product.entity_uuid]);
        await c.query('DELETE FROM asset_links WHERE target_type IN (\'product\',\'part\') AND target_id IN ($1,$2)', [String(id), product.entity_uuid]);
        await c.query("DELETE FROM bom_version_items WHERE bom_version_id IN (SELECT id FROM bom_versions WHERE vehicle_id=$1 AND status<>'published')", [String(product.id)]);
        await c.query("DELETE FROM bom_versions WHERE vehicle_id=$1 AND status<>'published'", [String(product.id)]);
        await c.query('DELETE FROM product_media WHERE product_uuid=$1', [product.entity_uuid]);
        const deleted = (await c.query('DELETE FROM products WHERE id=$1 RETURNING id', [id])).rows[0];
        return { before: { id: product.id, name: product.name, model: product.model, kind: product.kind }, after: deleted };
      });
    },
    async restoreProduct(id) {
      return withAudit('product.restore', `products/${id}`, async c => {
        const row = (await c.query("UPDATE products SET deleted_at=NULL,status='停用',version=version+1,updated_at=now() WHERE id=$1 AND deleted_at IS NOT NULL RETURNING id,name,deleted_at AS \"deletedAt\"", [id])).rows[0];
        if (!row) throw new Error('已删除商品不存在');
        return row;
      });
    },
    async references(id) {
      const client = await pool.connect();
      try { return await productReferences(client, id); }
      finally { client.release(); }
    },
    async updateSkuDetail(id, sku, input) {
      return withAudit('sku.update', `products/${id}/skus/${sku}`, async c => {
        const product = (await c.query('SELECT id,kind FROM products WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!product) throw new Error('产品不存在');
        const row = (await c.query('SELECT entity_uuid,note,safety_stock,ean13 FROM skus WHERE product_id=$1 AND code=$2', [id, sku])).rows[0];
        if (!row) throw new Error('SKU 不存在');
        const note = input.note === undefined ? row.note : String(input.note || '').slice(0, 200);
        const stock = input.safetyStock === undefined ? row.safety_stock : Math.max(0, Math.trunc(Number(input.safetyStock) || 0));
        let ean13 = row.ean13;
        if (input.ean13 !== undefined) {
          const raw = String(input.ean13 || '').trim();
          if (!raw) ean13 = null;
          else if (!isValidEan13(raw)) throw new Error('EAN-13 条码无效');
          else ean13 = raw;
        }
        await c.query('UPDATE skus SET note=$2,safety_stock=$3,ean13=$4 WHERE entity_uuid=$1', [row.entity_uuid, note, stock, ean13]);
        let price;
        if (input.price !== undefined && input.price !== null && String(input.price).trim() !== '') {
          const raw = String(input.price).trim();
          if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || Number(raw) > 100000000) throw new Error('价格格式无效');
          price = raw;
          if (product.kind === 'vehicle') await c.query("INSERT INTO storefront_offers(sku_uuid,currency,unit_price,published) VALUES($1,'EUR',$2,false) ON CONFLICT (sku_uuid,currency) DO UPDATE SET unit_price=EXCLUDED.unit_price,updated_at=now()", [row.entity_uuid, raw]);
          else await c.query('UPDATE skus SET price=$2 WHERE entity_uuid=$1', [row.entity_uuid, raw]);
        }
        await c.query('UPDATE products SET version=version+1,updated_at=now() WHERE id=$1', [id]);
        return { before: { note: row.note, safetyStock: row.safety_stock, ean13: row.ean13 }, after: { note, safetyStock: stock, ean13, price } };
      });
    },
    async setSkuDisabled(id, sku, disabled) {
      return withAudit(disabled ? 'sku.disable' : 'sku.enable', `products/${id}/skus/${sku}`, async c => {
        const r = await c.query('UPDATE skus SET disabled=$3 WHERE product_id=$1 AND code=$2 RETURNING code AS sku, disabled', [id, sku, Boolean(disabled)]);
        if (!r.rowCount) throw new Error('SKU 不存在');
        await c.query('UPDATE products SET version=version+1,updated_at=now() WHERE id=$1', [id]);
        return { before: null, after: r.rows[0] };
      });
    },
    async setStatus(id, status) {
      return withAudit('product.status', `products/${id}`, async c => {
        const product = (await c.query('SELECT id,entity_uuid,status,deleted_at AS "deletedAt" FROM products WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!product) throw new Error('产品不存在');
        if (product.deletedAt) { const e=new Error('已删除商品请先恢复，再启用'); e.code='PRODUCT_DELETED'; throw e; }
        if (status !== '启用') {
          const publications = (await c.query('SELECT product_id,draft,published,revision,published_revision AS "publishedRevision",legacy_product_market AS "legacyMarket" FROM catalog_publications WHERE product_uuid=$1 AND published IS NOT NULL FOR UPDATE', [product.entity_uuid])).rows;
          for (const publication of publications) {
            const after = (await c.query('UPDATE catalog_publications SET published=NULL,published_revision=NULL,revision=revision+1 WHERE product_id=$1 RETURNING product_id,draft,published,revision,published_revision AS "publishedRevision",legacy_product_market AS "legacyMarket"', [publication.product_id])).rows[0];
            await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'catalog.unpublish', `products/${id}/publication`, JSON.stringify(publication), JSON.stringify(after)]);
          }
          const listings = (await c.query('SELECT id,product_uuid AS "productUuid",channel,slug,draft,published,revision,published_revision AS "publishedRevision" FROM storefront_listings WHERE product_uuid=$1 AND published IS NOT NULL FOR UPDATE', [product.entity_uuid])).rows;
          for (const listing of listings) {
            const after = (await c.query('UPDATE storefront_listings SET published=NULL,published_revision=NULL,revision=revision+1,updated_at=now() WHERE id=$1 RETURNING id,product_uuid AS "productUuid",channel,slug,draft,published,revision,published_revision AS "publishedRevision"', [listing.id])).rows[0];
            await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)', [currentActor(), 'listing.unpublish', `storefront-listings/${listing.id}`, JSON.stringify(listing), JSON.stringify(after)]);
          }
        }
        const r = await c.query('UPDATE products SET status=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING id,status', [id, status]);
        return { before: { id: product.id, status: product.status }, after: r.rows[0] };
      });
    },
    async updateSkuAttributes(id, sku, input) {
      return withAudit('sku.attributes.update',`products/${id}/skus/${sku}/attributes`,async c=>{
        const product=(await c.query(`SELECT ${projection} FROM products WHERE id=$1 FOR UPDATE`,[id])).rows[0];
        if(!product)throw new Error('产品不存在');
        const columns=await c.query("SELECT 1 FROM pg_attribute WHERE attrelid=to_regclass('alsvid_v2.skus') AND attname='attributes' AND NOT attisdropped");
        if(!columns.rowCount)throw new Error('SKU 参数字段尚未启用，请先应用数据库迁移 074');
        const current=(await c.query('SELECT attributes FROM skus WHERE product_uuid=$1 AND code=$2 FOR UPDATE',[product.entityUuid,sku])).rows[0];
        if(!current)throw new Error('SKU 不存在');
        const fields=(await c.query('SELECT code,data_type AS type,options,level,templates,required,sku_gen AS "skuGen",enabled FROM fields')).rows;
        const attributes=normalizeSkuAttributes(input.attributes,fields,product.productType,current.attributes||{});
        const before={sku,attributes:current.attributes||{}};
        const after=(await c.query('UPDATE skus SET attributes=$1 WHERE product_uuid=$2 AND code=$3 RETURNING code AS sku,attributes',[JSON.stringify(attributes),product.entityUuid,sku])).rows[0];
        await c.query('UPDATE products SET version=version+1,updated_at=now() WHERE id=$1',[id]);
        return {before,after};
      });
    },
    async addMedia(id,media) { return withAudit('product.media.add',`products/${id}/media`,async c=>{const exists=await c.query('SELECT id FROM products WHERE id=$1',[id]);if(!exists.rowCount)throw new Error('产品不存在');const r=await c.query('INSERT INTO product_media(id,product_id,object_key,content_type,label) VALUES($1,$2,$3,$4,$5) RETURNING id,object_key AS key,content_type AS "contentType",label,created_at AS "createdAt"',[uuidv7(),id,media.key,media.contentType,media.label||'']);return{after:r.rows[0]};});},
    async listBomVersions(id) {
      const vehicle=await pool.query("SELECT id FROM products WHERE id=$1 AND kind='vehicle'",[id]);
      if(!vehicle.rowCount)return null;
      return (await pool.query('SELECT version,status,draft_revision AS "draftRevision",change_reason AS "changeReason",effective_at AS "effectiveAt",created_at AS "createdAt" FROM bom_versions WHERE vehicle_id=$1 ORDER BY created_at DESC,id DESC',[id])).rows;
    },
    async getBomVersion(id,version) {
      const c=await pool.connect();
      try {
        const h=(await c.query('SELECT id,version,status,draft_revision AS "draftRevision",change_reason AS "changeReason",effective_at AS "effectiveAt",created_at AS "createdAt" FROM bom_versions WHERE vehicle_id=$1 AND version=$2',[id,version])).rows[0];
        if(!h)return null;
        const items=(await c.query('SELECT id,parent_item_id AS "parentItemId",drawing_media_id AS "drawingMediaId",drawing_x AS "drawingX",drawing_y AS "drawingY",section,drawing_no AS "drawingNo",sku_code AS sku,quantity AS qty,unit,position,supplier,spec_requirement AS "specRequirement",key_control AS "keyControl" FROM bom_version_items WHERE bom_version_id=$1 ORDER BY id',[h.id])).rows;
        return {...h,items};
      } finally { c.release(); }
    },
    async saveBom(id,bom) {
      return withAudit(bom.draftRevision == null ? 'bom.version.create' : 'bom.version.update',`products/${id}/bom`,async c=>{
        if (bom.status && bom.status !== 'draft') throw new Error('BOM 版本须先保存为草稿');
        const vehicle=(await c.query('SELECT id,kind,bom_version AS version FROM products WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if (!vehicle || vehicle.kind!=='vehicle') throw new Error('整车产品不存在');
        const version=String(bom.version || `V${Date.now()}`);
        let header, before={version:vehicle.version};
        if (bom.draftRevision != null) {
          if (!Number.isInteger(bom.draftRevision)) throw new Error('BOM 草稿版本无效');
          const existing=(await c.query('SELECT id,status,draft_revision AS "draftRevision" FROM bom_versions WHERE vehicle_id=$1 AND version=$2 FOR UPDATE',[id,version])).rows[0];
          if (!existing) throw new Error('BOM 版本不存在');
          if (existing.status !== 'draft') throw new Error('只有草稿可以修改');
          if (existing.draftRevision !== bom.draftRevision) { const e=new Error('BOM 草稿已被其他操作更新，请重新载入');e.code='VERSION_CONFLICT';throw e; }
          before={...existing,items:(await c.query('SELECT * FROM bom_version_items WHERE bom_version_id=$1 ORDER BY id',[existing.id])).rows};
          await c.query('DELETE FROM bom_version_items WHERE bom_version_id=$1',[existing.id]);
          header=await c.query('UPDATE bom_versions SET draft_revision=draft_revision+1,change_reason=$1,effective_at=$2 WHERE id=$3 RETURNING id,version,status,draft_revision AS "draftRevision",change_reason AS "changeReason",effective_at AS "effectiveAt"',[bom.changeReason||'',bom.effectiveAt||null,existing.id]);
        } else {
          header=await c.query('INSERT INTO bom_versions(vehicle_id,version,status,change_reason,effective_at) VALUES($1,$2,$3,$4,$5) RETURNING id,version,status,draft_revision AS "draftRevision",change_reason AS "changeReason",effective_at AS "effectiveAt"',[id,version,bom.status||'draft',bom.changeReason||'',bom.effectiveAt||null]);
        }
        const pending=(bom.items||[]).map((item,i)=>({item,key:item.id==null?`__row_${i}`:String(item.id),parent:item.parentItemId==null||item.parentItemId===''?null:String(item.parentItemId)}));
        const keys=new Set(pending.map(x=>x.key));
        if(keys.size!==pending.length||pending.some(x=>x.parent&&!keys.has(x.parent)))throw new Error('BOM 物料层级引用无效');
        const ids=new Map();
        while(pending.length){
          const index=pending.findIndex(x=>!x.parent||ids.has(x.parent));
          if(index<0)throw new Error('BOM 物料层级存在循环');
          const {item,key,parent}=pending.splice(index,1)[0];
          const qty=Number(item.qty??1);if(!Number.isFinite(qty)||qty<=0)throw new Error('BOM 物料用量必须大于零');
          const r=await c.query('INSERT INTO bom_version_items(bom_version_id,sku_code,section,drawing_no,quantity,unit,position,parent_item_id,supplier,spec_requirement,key_control) SELECT $1,s.code,$3,$4,$5,$6,$7,$8,$9,$10,$11 FROM skus s JOIN products p ON p.entity_uuid=s.product_uuid WHERE s.code=$2 AND p.kind=\'part\' RETURNING id',[header.rows[0].id,item.sku,item.section||'',item.drawingNo||'',qty,item.unit||'件',item.position||'',parent?ids.get(parent):null,item.supplier||'',item.specRequirement||'',Boolean(item.keyControl)]);
          if (!r.rowCount) throw new Error(`零配件 SKU 不存在：${item.sku}`);
          if(item.drawingMediaId){const x=Number(item.drawingX),y=Number(item.drawingY);if(item.drawingX==null||item.drawingY==null||!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1)throw Error('BOM 图纸标记坐标无效');const image=await c.query('SELECT 1 FROM product_media WHERE id=$1 AND product_id=$2',[item.drawingMediaId,id]);if(!image.rowCount)throw Error('BOM 图纸不属于该整车');await c.query('UPDATE bom_version_items SET drawing_media_id=$1,drawing_x=$2,drawing_y=$3 WHERE id=$4',[item.drawingMediaId,x,y,r.rows[0].id]);}
          ids.set(key,r.rows[0].id);
        }
        await c.query('UPDATE products SET bom_version=CASE WHEN $3::boolean THEN bom_version ELSE $1 END,version=version+1,updated_at=now() WHERE id=$2',[version,id,bom.draftRevision != null]);
        const items=await c.query('SELECT id,parent_item_id AS "parentItemId",drawing_media_id AS "drawingMediaId",drawing_x AS "drawingX",drawing_y AS "drawingY",section,drawing_no AS "drawingNo",sku_code AS sku,quantity AS qty,unit,position,supplier,spec_requirement AS "specRequirement",key_control AS "keyControl" FROM bom_version_items WHERE bom_version_id=$1 ORDER BY id',[header.rows[0].id]);
        return {before,after:{...header.rows[0],items:items.rows}};
      });
    },
    async publishBom(id, version, checkDrawing, draftRevision) {
      return withAudit('bom.version.publish', `products/${id}/bom/${version}`, async c => {
        const header=(await c.query('SELECT id,version,status,draft_revision AS "draftRevision" FROM bom_versions WHERE vehicle_id=$1 AND version=$2 FOR UPDATE',[id,version])).rows[0];
        if (!header) throw new Error('BOM 版本不存在');
        if (header.status !== 'draft') throw new Error('只有草稿可以发布');
        if (!Number.isInteger(draftRevision)) throw new Error('请重新载入 BOM 草稿后发布');
        if (header.draftRevision !== draftRevision) { const e=new Error('BOM 草稿已被其他操作更新，请重新载入');e.code='VERSION_CONFLICT';throw e; }
        const check=(await c.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE trim(i.drawing_no)='' OR i.quantity<=0 OR trim(i.unit)='' OR p.kind IS DISTINCT FROM 'part')::int AS invalid FROM bom_version_items i LEFT JOIN skus s ON s.code=i.sku_code LEFT JOIN products p ON p.entity_uuid=s.product_uuid WHERE i.bom_version_id=$1",[header.id])).rows[0];
        if (!check.total || check.invalid) throw new Error('BOM 须包含有效配件、正数用量、单位和图纸编号');
        // Lock each part while checking fitments: fitment updates lock the same product row.
        await c.query('SELECT p.entity_uuid FROM bom_version_items i JOIN skus s ON s.entity_uuid=i.sku_uuid JOIN products p ON p.entity_uuid=s.product_uuid WHERE i.bom_version_id=$1 ORDER BY p.entity_uuid FOR SHARE OF p',[header.id]);
        const missingFit=(await c.query('SELECT 1 FROM bom_version_items i JOIN skus s ON s.entity_uuid=i.sku_uuid JOIN products p ON p.entity_uuid=s.product_uuid JOIN bom_versions b ON b.id=i.bom_version_id WHERE i.bom_version_id=$1 AND NOT EXISTS (SELECT 1 FROM fits f WHERE f.part_product_uuid=p.entity_uuid AND f.vehicle_product_uuid=b.vehicle_uuid) LIMIT 1',[header.id])).rowCount;
        if (missingFit) throw new Error('BOM 中有配件未设置为适配该整车');
        const missingDrawing=(await c.query('SELECT 1 FROM bom_version_items i JOIN bom_versions b ON b.id=i.bom_version_id LEFT JOIN product_media m ON m.entity_uuid=i.drawing_media_uuid AND m.product_uuid=b.vehicle_uuid WHERE i.bom_version_id=$1 AND (m.entity_uuid IS NULL OR i.drawing_x IS NULL OR i.drawing_y IS NULL OR i.drawing_x<0 OR i.drawing_x>1 OR i.drawing_y<0 OR i.drawing_y>1) LIMIT 1',[header.id])).rowCount;
        if (missingDrawing) throw new Error('BOM 中有物料缺少该整车的图纸或有效位置');
        if (typeof checkDrawing !== 'function') throw new Error('图纸存储不可用，无法验证文件');
        const drawings=(await c.query('SELECT DISTINCT m.object_key FROM bom_version_items i JOIN product_media m ON m.entity_uuid=i.drawing_media_uuid WHERE i.bom_version_id=$1',[header.id])).rows;
        try { for (const drawing of drawings) if (!await checkDrawing(drawing.object_key)) throw new Error('missing'); }
        catch (e) { if (e.message==='missing') throw new Error('BOM 中有图纸文件不存在'); throw new Error('图纸存储不可用，无法验证文件'); }
        const after=(await c.query("UPDATE bom_versions SET status='published',effective_at=COALESCE(effective_at,now()) WHERE id=$1 RETURNING version,status,effective_at AS \"effectiveAt\"",[header.id])).rows[0];
        return {before:header,after};
      });
    },
    async setFitments(partId,fitments) {
      return withAudit('fitments.update',`products/${partId}/fitments`,async c=>{
        const part=(await c.query("SELECT id,entity_uuid AS \"entityUuid\" FROM products WHERE id=$1 AND kind='part' FOR UPDATE",[partId])).rows[0];
        if (!part) throw new Error('零配件不存在');
        const before=(await c.query('SELECT v.entity_uuid AS "vehicleUuid",v.model AS "vehicleModel",f.note FROM fits f JOIN products v ON v.entity_uuid=f.vehicle_product_uuid WHERE f.part_product_uuid=$1 ORDER BY v.model,v.id',[part.entityUuid])).rows;
        const resolved = await resolveFitments(c, fitments);
        await c.query('DELETE FROM fits WHERE part_product_uuid=$1',[part.entityUuid]);
        for (const fit of resolved) await c.query('INSERT INTO fits(part_product_id,part_product_uuid,vehicle_product_id,vehicle_product_uuid,note) VALUES($1,$2,$3,$4,$5)',[partId,part.entityUuid,fit.id,fit.uuid,fit.note]);
        return {before,after:fitments};
      });
    },
    close:()=>pool.end(),
  };
}
module.exports={createProductStore};
