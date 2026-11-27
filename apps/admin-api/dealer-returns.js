'use strict';
const { createPool } = require('./db-pool');
const { currentActor } = require('./audit-context');
const {reverseOrderOffsets}=require('./dealer-benefit-offsets');
const { isUuidv7, uuidv7 } = require('./uuidv7');
const { createHash } = require('node:crypto');

function fail(message, statusCode = 400) { throw Object.assign(Error(message), { statusCode }); }
function cents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim();
  if (!/^\d{1,16}(?:\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const amount = BigInt(whole) * 100n + BigInt((fraction + '00').slice(0, 2));
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? amount : null;
}
function decimalCents(value) {
  const match = /^(\d{1,16})(?:\.(\d{1,2}))?$/.exec(String(value ?? ''));
  return match ? BigInt(match[1]) * 100n + BigInt((match[2] || '').padEnd(2, '0')) : null;
}
function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

function createDealerReturns(connectionString) {
  const pool = createPool(connectionString, { max: 2, connectionTimeoutMillis: 10000 });
  async function transaction(action, target, fn) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const result = await fn(c);
      if (!result.replayed) await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)', [currentActor(), action, target, JSON.stringify(result)]);
      await c.query('COMMIT');
      return result;
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
    finally { c.release(); }
  }
  const selection = `r.id,r.order_id AS "orderId",o.currency,r.status,r.reason,r.review_note AS "reviewNote",r.created_at AS "createdAt",r.reviewed_at AS "reviewedAt",u.username,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'orderItemId',i.order_item_id,'sku',oi.sku_code,'productName',oi.product_name,'quantity',i.quantity,'unitPrice',oi.quoted_unit_price) ORDER BY i.id) FROM dealer_order_return_items i JOIN dealer_order_items oi ON oi.id=i.order_item_id WHERE i.request_id=r.id),'[]'::jsonb) AS items,
    (SELECT jsonb_build_object('note',rc.note,'receivedAt',rc.received_at,'items',(SELECT jsonb_agg(jsonb_build_object('returnItemId',ri.return_item_id,'quantity',ri.received_quantity,'disposition',ri.disposition,'warehouseUuid',ri.warehouse_uuid,'warehouseName',w.name,'movementUuid',ri.stock_movement_uuid,'note',ri.note) ORDER BY ri.id) FROM dealer_order_return_receipt_items ri LEFT JOIN warehouses w ON w.entity_uuid=ri.warehouse_uuid WHERE ri.receipt_id=rc.id)) FROM dealer_order_return_receipts rc WHERE rc.request_id=r.id) AS receipt,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id',f.id,'amount',f.amount::text,'reference',f.reference,'note',f.note,'recordedBy',f.recorded_by,'refundedAt',f.refunded_at) ORDER BY f.refunded_at,f.id) FROM dealer_order_return_refunds f WHERE f.return_id=r.id),'[]'::jsonb) AS refunds`;
  async function list(userId = null) {
    return (await pool.query(`SELECT ${selection} FROM dealer_order_return_requests r JOIN dealer_orders o ON o.id=r.order_id JOIN app_users u ON u.entity_uuid=r.dealer_user_uuid WHERE $1::text IS NULL OR u.id=$1 ORDER BY r.created_at DESC,r.id DESC`, [userId])).rows;
  }
  return {
    listDealer: user => list(user.id),
    listAdmin: () => list(),
    async request(user, orderId, input) {
      orderId = String(orderId || '').toLowerCase();
      const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
      if (!isUuidv7(orderId) || !isUuidv7(input.id) || !reason || reason.length > 2000 || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) fail('退货申请资料无效');
      const items = input.items.map(x => ({ itemId: typeof x?.itemId === 'string' ? x.itemId.toLowerCase() : x?.itemId, quantity: x?.quantity }));
      if (items.some(x => !isUuidv7(x.itemId) || !Number.isSafeInteger(x.quantity) || x.quantity < 1 || x.quantity > 100000) || new Set(items.map(x => x.itemId)).size !== items.length) fail('退货商品或数量无效');
      items.sort((a, b) => a.itemId.localeCompare(b.itemId));
      const requestId = input.id.toLowerCase(), requestHash = hash({ orderId: orderId.toLowerCase(), reason, items });
      await transaction('dealer.order.return.request', `dealer-orders/${orderId}/returns/${requestId}`, async c => {
        const dealer = (await c.query("SELECT entity_uuid AS uuid FROM app_users WHERE id=$1 AND role='dealer' AND enabled FOR SHARE", [user.id])).rows[0];
        if (!dealer) fail('经销商账号不可用', 403);
        const order = (await c.query("SELECT id,status FROM dealer_orders WHERE id=$1 AND dealer_user_uuid=$2 FOR UPDATE", [orderId, dealer.uuid])).rows[0];
        if (!order) fail('订货申请不存在', 404);
        const prior = (await c.query('SELECT order_id,request_hash,status FROM dealer_order_return_requests WHERE id=$1', [requestId])).rows[0];
        if (prior) {
          if (prior.order_id !== orderId || prior.request_hash !== requestHash) fail('退货申请编号已用于其他内容', 409);
          return { id: requestId, status: prior.status, replayed: true };
        }
        if (order.status !== 'delivered') fail('只有已确认收货的订单可以申请退货', 409);
        for (const item of items) {
          const row = (await c.query(`SELECT oi.quantity,COALESCE((SELECT sum(CASE WHEN rr.status='received' THEN COALESCE(received.received_quantity,0) ELSE ri.quantity END) FROM dealer_order_return_items ri JOIN dealer_order_return_requests rr ON rr.id=ri.request_id LEFT JOIN dealer_order_return_receipts rc ON rc.request_id=rr.id LEFT JOIN dealer_order_return_receipt_items received ON received.receipt_id=rc.id AND received.return_item_id=ri.id WHERE ri.order_item_id=oi.id AND rr.status IN ('pending','approved','received')),0)::int AS returned FROM dealer_order_items oi WHERE oi.id=$1 AND oi.order_id=$2`, [item.itemId, orderId])).rows[0];
          if (!row || item.quantity > Number(row.quantity) - Number(row.returned)) fail('退货数量超过尚未申请退货的商品数量', 409);
        }
        await c.query('INSERT INTO dealer_order_return_requests(id,order_id,dealer_user_uuid,request_hash,reason) VALUES($1,$2,$3,$4,$5)', [requestId, orderId, dealer.uuid, requestHash, reason]);
        for (const item of items) await c.query('INSERT INTO dealer_order_return_items(request_id,order_item_id,quantity) VALUES($1,$2,$3)', [requestId, item.itemId, item.quantity]);
        return { id: requestId, orderId, status: 'pending', itemCount: items.length };
      });
      return (await list(user.id)).find(x => x.id === requestId);
    },
    async review(id, input) {
      id = String(id || '').toLowerCase();
      const decision = input.decision, note = typeof input.note === 'string' ? input.note.trim() : '';
      if (!isUuidv7(id) || !['approve', 'reject'].includes(decision) || !note || note.length > 2000) fail('退货审核资料无效');
      const result = await transaction(`dealer.order.return.${decision}`, `dealer-order-returns/${id}`, async c => {
        const request = (await c.query('SELECT id,status,review_note AS "reviewNote" FROM dealer_order_return_requests WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!request) fail('退货申请不存在', 404);
        const status = decision === 'approve' ? 'approved' : 'rejected';
        if(request.status===status){if(request.reviewNote!==note)fail('退货申请已处理，请核对原审核记录',409);return{id,status,reviewNote:note,replayed:true}}
        if (request.status !== 'pending') fail('退货申请已处理，请重新载入', 409);
        await c.query('UPDATE dealer_order_return_requests SET status=$1,review_note=$2,reviewed_by=$3,reviewed_at=now(),updated_at=now() WHERE id=$4', [status, note, currentActor(), id]);
        return { id, status, reviewNote: note };
      });
      delete result.replayed;
      return result;
    },
    async receive(id, input) {
      id = String(id || '').toLowerCase();
      const receiptId = String(input.id || '').toLowerCase(), note = typeof input.note === 'string' ? input.note.trim() : '';
      if (!isUuidv7(id) || !isUuidv7(receiptId) || note.length > 2000 || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 50) fail('退货收货资料无效');
      const items = input.items.map(x => ({ returnItemId: typeof x?.returnItemId === 'string' ? x.returnItemId.toLowerCase() : x?.returnItemId, quantity: x?.quantity, disposition: x?.disposition, warehouseId: x?.warehouseId || '', note: typeof x?.note === 'string' ? x.note.trim() : '' }));
      if (items.some(x => !isUuidv7(x.returnItemId) || !Number.isSafeInteger(x.quantity) || x.quantity < 0 || x.quantity > 100000 || !['restocked', 'not_restocked', 'not_received'].includes(x.disposition) || x.note.length > 2000 || (x.disposition === 'restocked' ? (!x.warehouseId || x.warehouseId.length > 160 || x.quantity < 1) : Boolean(x.warehouseId)) || (x.disposition === 'not_received' ? x.quantity !== 0 : x.quantity < 1)) || new Set(items.map(x => x.returnItemId)).size !== items.length) fail('退货实收数量、处置方式或仓库无效');
      items.sort((a, b) => a.returnItemId.localeCompare(b.returnItemId));
      const requestHash = hash({ returnId: id.toLowerCase(), note, items });
      const result = await transaction('dealer.order.return.receive', `dealer-order-returns/${id}/receipt`, async c => {
        const request = (await c.query('SELECT id,order_id,status FROM dealer_order_return_requests WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!request) fail('退货申请不存在', 404);
        const existing = (await c.query('SELECT id,request_hash FROM dealer_order_return_receipts WHERE request_id=$1', [id])).rows[0];
        if (existing) {
          if (existing.id !== receiptId || existing.request_hash !== requestHash) fail('退货收货记录已保存，请核对原记录', 409);
          return { id: existing.id, requestId: id, status: 'received', replayed: true };
        }
        if (request.status !== 'approved') fail('只有已批准的退货申请可以登记收货', 409);
        if (!(await c.query('SELECT id FROM dealer_orders WHERE id=$1 FOR UPDATE',[request.order_id])).rowCount) fail('订单不存在',404);
        const lines = (await c.query(`SELECT ri.id,ri.quantity,oi.sku_uuid AS "skuUuid",oi.sku_code AS sku,oi.order_id AS "orderId" FROM dealer_order_return_items ri JOIN dealer_order_items oi ON oi.id=ri.order_item_id WHERE ri.request_id=$1 ORDER BY ri.id FOR UPDATE OF ri,oi`, [id])).rows;
        if (lines.length !== items.length || lines.some(line => !items.some(item => item.returnItemId === line.id && item.quantity <= Number(line.quantity)))) fail('必须逐项登记申请商品的实收数量');
        if (items.some(item => item.quantity !== Number(lines.find(line => line.id === item.returnItemId).quantity) && !item.note)) fail('实收数量与申请数量不同时必须填写该商品的差异说明');
        const warehouses = [...new Set(items.filter(x => x.disposition === 'restocked').map(x => x.warehouseId))];
        const found = warehouses.length ? (await c.query("SELECT id,entity_uuid AS uuid FROM warehouses WHERE id=ANY($1::text[]) AND status='启用' AND kind IN ('国内仓','海外仓') FOR SHARE", [warehouses])).rows : [];
        const warehouseById = new Map(found.map(x => [x.id, x]));
        if (warehouses.some(x => !warehouseById.has(x))) fail('请选择已启用的国内仓或海外仓');
        await c.query('INSERT INTO dealer_order_return_receipts(id,request_id,request_hash,note,received_by) VALUES($1,$2,$3,$4,$5)', [receiptId, id, requestHash, note, currentActor()]);
        for (const item of items) {
          const line = lines.find(x => x.id === item.returnItemId);
          let warehouseUuid = null, movementUuid = null;
          if (item.disposition === 'restocked') {
            const warehouse = warehouseById.get(item.warehouseId); warehouseUuid = warehouse.uuid;
            const location = (await c.query("SELECT id FROM warehouse_locations WHERE warehouse_uuid=$1 AND is_default AND status='启用' FOR SHARE", [warehouseUuid])).rows[0];
            if (!location) fail('退货入库仓库缺少启用的默认库位', 409);
            const movementId = uuidv7();
            await c.query('INSERT INTO warehouse_stock(warehouse_uuid,sku_uuid,warehouse_id,sku_code,quantity) VALUES($1,$2,$3,$4,0) ON CONFLICT(warehouse_uuid,sku_uuid) DO NOTHING', [warehouseUuid, line.skuUuid, warehouse.id, line.sku]);
            const stock = (await c.query('SELECT quantity FROM warehouse_stock WHERE warehouse_uuid=$1 AND sku_uuid=$2 FOR UPDATE', [warehouseUuid, line.skuUuid])).rows[0];
            const ledger = Number((await c.query('SELECT COALESCE(sum(quantity_delta),0)::bigint AS quantity FROM inventory_ledger WHERE warehouse_uuid=$1 AND sku_uuid=$2', [warehouseUuid, line.skuUuid])).rows[0].quantity);
            if (!stock || Number(stock.quantity) !== ledger) fail('库存账本与仓库余额不一致，不能入库', 409);
            await c.query('UPDATE warehouse_stock SET quantity=quantity+$1 WHERE warehouse_uuid=$2 AND sku_uuid=$3', [item.quantity, warehouseUuid, line.skuUuid]);
            const movement = (await c.query("INSERT INTO stock_movements(id,kind,sku_code,quantity,to_warehouse,to_location_uuid,note,actor) VALUES($1,'入库',$2,$3,$4,$5,$6,$7) RETURNING entity_uuid", [movementId, line.sku, item.quantity, warehouse.id, location.id, `经销商退货 ${id} 收货入库`, currentActor()])).rows[0];
            movementUuid = movement.entity_uuid;
          }
          await c.query('INSERT INTO dealer_order_return_receipt_items(receipt_id,return_item_id,received_quantity,disposition,warehouse_uuid,stock_movement_uuid,note) VALUES($1,$2,$3,$4,$5,$6,$7)', [receiptId, item.returnItemId, item.quantity, item.disposition, warehouseUuid, movementUuid, item.note]);
        }
        if(items.some(item=>item.quantity>0))await reverseOrderOffsets(c,request.order_id,'订单退货收货自动冲销权益抵扣 '+id,currentActor());
        await c.query("UPDATE dealer_order_return_requests SET status='received',updated_at=now() WHERE id=$1", [id]);
        return { id: receiptId, requestId: id, status: 'received' };
      });
      return result;
    },
    async refund(id, input) {
      id = String(id || '').toLowerCase();
      const refundId = String(input.id || '').toLowerCase(), amount = cents(input.amount), reference = typeof input.reference === 'string' ? input.reference.trim() : '', note = typeof input.note === 'string' ? input.note.trim() : '';
      if (!isUuidv7(id) || !isUuidv7(refundId) || amount === null || amount < 1n || !reference || reference.length > 200 || note.length > 2000) fail('退款资料无效');
      const result = await transaction('dealer.order.return.refund', `dealer-order-returns/${id}/refunds/${refundId}`, async c => {
        const request = (await c.query('SELECT id,order_id,status FROM dealer_order_return_requests WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!request) fail('退货申请不存在', 404);
        if (!(await c.query('SELECT id FROM dealer_orders WHERE id=$1 FOR UPDATE', [request.order_id])).rowCount) fail('订货申请不存在', 404);
        if (request.status !== 'received') fail('完成退货收货后才能登记退款', 409);
        const prior = (await c.query('SELECT return_id AS "returnId",amount::text,reference,note,recorded_by AS "recordedBy",refunded_at AS "refundedAt" FROM dealer_order_return_refunds WHERE id=$1', [refundId])).rows[0];
        const amountText = `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`;
        if (prior) {
          if (prior.returnId !== id || prior.amount !== amountText || prior.reference !== reference || prior.note !== note) fail('退款编号已用于其他内容', 409);
          return { id: refundId, ...prior, replayed: true };
        }
        const totals = (await c.query(`SELECT
          COALESCE((SELECT sum(p.amount) FROM dealer_order_payments p WHERE p.order_id=$1 AND NOT EXISTS(SELECT 1 FROM dealer_order_payment_reversals x WHERE x.payment_id=p.id)),0)::numeric(18,2) AS paid,
          COALESCE((SELECT sum(f.amount) FROM dealer_order_return_refunds f JOIN dealer_order_return_requests rr ON rr.id=f.return_id WHERE rr.order_id=$1),0)::numeric(18,2) AS refunded,
          COALESCE((SELECT sum(ri.received_quantity*oi.quoted_unit_price) FROM dealer_order_return_receipt_items ri JOIN dealer_order_return_receipts rc ON rc.id=ri.receipt_id JOIN dealer_order_return_requests rr ON rr.id=rc.request_id JOIN dealer_order_return_items di ON di.id=ri.return_item_id JOIN dealer_order_items oi ON oi.id=di.order_item_id WHERE rr.order_id=$1 AND ri.disposition IN ('restocked','not_restocked')),0)::numeric(18,2) AS eligible`, [request.order_id])).rows[0];
        const paid = decimalCents(totals.paid), refunded = decimalCents(totals.refunded), eligible = decimalCents(totals.eligible);
        if (paid === null || refunded === null || eligible === null) fail('退款金额核对失败，请核对订单金额', 409);
        const paidCapacity = paid - refunded, returnCapacity = eligible - refunded;
        const max = paidCapacity < returnCapacity ? paidCapacity : returnCapacity;
        if (amount > max) fail('退款金额超过已收款或实际退货金额', 409);
        const row = (await c.query('INSERT INTO dealer_order_return_refunds(id,return_id,amount,reference,note,recorded_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id,return_id AS "returnId",amount::text,reference,note,recorded_by AS "recordedBy",refunded_at AS "refundedAt"', [refundId, id, amountText, reference, note, currentActor()])).rows[0];
        return row;
      });
      return result;
    },
  };
}

function registerDealerReturnRoutes(app, service) {
  const route = (method, url, roles, handler) => app.route({ method, url, config: { portalRoles: roles }, bodyLimit: 128 * 1024, handler: async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!service) return reply.code(503).send({ error: '经销商退货服务不可用' });
    if (roles.includes('admin') && req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可处理退货' });
    try { return await handler(req, reply); }
    catch (e) { return reply.code(e.statusCode || (e.code === '23505' ? 409 : 500)).send({ error: e.statusCode ? e.message : e.code === '23505' ? '退货记录已存在，请刷新查看' : '经销商退货操作失败' }); }
  } });
  route('GET', '/api/portal/dealer/returns', ['dealer'], req => service.listDealer(req.user));
  route('POST', '/api/portal/dealer/orders/:id/returns', ['dealer'], (req, reply) => service.request(req.user, req.params.id, req.body || {}).then(row => reply.code(201).send(row)));
  route('GET', '/api/portal-management/dealer-returns', ['admin'], () => service.listAdmin());
  route('POST', '/api/portal-management/dealer-returns/:id/review', ['admin'], req => service.review(req.params.id, req.body || {}));
  route('POST', '/api/portal-management/dealer-returns/:id/receive', ['admin'], req => service.receive(req.params.id, req.body || {}));
  route('POST', '/api/portal-management/dealer-returns/:id/refunds', ['admin'], req => service.refund(req.params.id, req.body || {}));
}

module.exports = { createDealerReturns, registerDealerReturnRoutes };
