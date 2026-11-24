const { uuidv7, isUuidv7 } = require('./uuidv7');
const { createPool } = require('./db-pool');
const { currentActor } = require('./audit-context');

function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function noteOf(value) { if (typeof value !== 'string' || !value.trim() || value.length > 2000) fail('请填写说明，最多 2000 个字符'); return value.trim(); }
function createPortalStore(connectionString) {
  const pool = createPool(connectionString, { max: 3, connectionTimeoutMillis: 10000 });
  async function transaction(action, target, fn) {
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const result = await fn(c);
      if (!result.replayed) await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)', [currentActor(), action, target, JSON.stringify(result)]);
      await c.query('COMMIT'); return result;
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; }
    finally { c.release(); }
  }
  const requestFields = 'r.id,r.vin,r.note,r.status,r.decision_note AS "decisionNote",r.created_at AS "createdAt",r.reviewed_at AS "reviewedAt"';
  async function portalUser(c, id) {
    const user = (await c.query("SELECT id,role,entity_uuid AS \"entityUuid\" FROM app_users WHERE id=$1 AND enabled AND role IN ('owner','dealer') FOR SHARE", [id])).rows[0];
    if (!user) fail('门户账号不可用', 403); return user;
  }
  async function authorizedVehicle(c, user, vinId) {
    const row = (await c.query('SELECT v.id,v.vin FROM portal_vehicle_access a JOIN vins v ON v.id=a.vin_id JOIN app_users u ON u.id=a.user_id WHERE a.user_id=$1 AND a.vin_id=$2 AND a.role=$3 AND a.revoked_at IS NULL AND u.enabled AND u.role=a.role FOR SHARE OF a,v,u', [user.id, vinId, user.role])).rows[0];
    if (!row) fail('车辆不可用或尚未获得授权', 403); return row;
  }
  async function fetchDealerOrders(userId = null) {
    return (await pool.query(`SELECT o.id,o.status,o.note,o.admin_note AS "adminNote",o.dealer_response_note AS "dealerResponseNote",o.currency,dr.note AS "receiptNote",dr.received_at AS "receivedAt",sh.carrier AS "carrier",sh.tracking_no AS "trackingNo",sh.shipped_at AS "shippedAt",o.cancel_note AS "cancelNote",o.cancelled_by AS "cancelledBy",o.cancelled_at AS "cancelledAt",o.quoted_by AS "quotedBy",o.quoted_at AS "quotedAt",o.created_at AS "createdAt",u.username,
      (SELECT COALESCE(sum(i.quantity*i.quoted_unit_price),0)::numeric(18,2)::text FROM dealer_order_items i WHERE i.order_id=o.id) AS "orderTotal",
      (SELECT COALESCE(sum(p.amount),0)::numeric(18,2)::text FROM dealer_order_payments p WHERE p.order_id=o.id AND NOT EXISTS(SELECT 1 FROM dealer_order_payment_reversals x WHERE x.payment_id=p.id)) AS "paidTotal",
      (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',p.id,'amount',p.amount::text,'reference',p.reference,'note',p.note,'recordedBy',p.recorded_by,'receivedAt',p.received_at,'reversed',x.id IS NOT NULL,'reversalReason',x.reason,'reversedBy',x.reversed_by,'reversedAt',x.created_at) ORDER BY p.received_at,p.id),'[]'::jsonb) FROM dealer_order_payments p LEFT JOIN dealer_order_payment_reversals x ON x.payment_id=p.id WHERE p.order_id=o.id) AS payments,
      (SELECT jsonb_build_object('id',inv.id,'invoiceNumber',inv.invoice_number,'issuedOn',inv.issued_on,'dueOn',inv.due_on,'currency',inv.currency,'totalAmount',inv.total_amount::text,'note',inv.note,'recordedBy',inv.recorded_by,'createdAt',inv.created_at,'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('sku',ii.sku_code,'productName',ii.product_name,'quantity',ii.quantity,'unitPrice',ii.unit_price::text,'lineTotal',ii.line_total::text) ORDER BY ii.id) FROM dealer_order_invoice_items ii WHERE ii.invoice_id=inv.id),'[]'::jsonb)) FROM dealer_order_invoices inv WHERE inv.order_id=o.id) AS invoice,
      COALESCE((SELECT sum(ri.received_quantity*oi.quoted_unit_price) FROM dealer_order_return_receipt_items ri JOIN dealer_order_return_receipts rc ON rc.id=ri.receipt_id JOIN dealer_order_return_requests rr ON rr.id=rc.request_id JOIN dealer_order_return_items di ON di.id=ri.return_item_id JOIN dealer_order_items oi ON oi.id=di.order_item_id WHERE rr.order_id=o.id AND ri.disposition IN ('restocked','not_restocked')),0)::numeric(18,2)::text AS "returnCreditTotal",
      COALESCE((SELECT sum(f.amount) FROM dealer_order_return_refunds f JOIN dealer_order_return_requests rr ON rr.id=f.return_id WHERE rr.order_id=o.id),0)::numeric(18,2)::text AS "refundTotal",
      COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'sku',i.sku_code,'productName',i.product_name,'quantity',i.quantity,'quotedUnitPrice',i.quoted_unit_price,'quoteNote',i.quote_note,'warehouseName',w.name) ORDER BY i.id) FILTER(WHERE i.id IS NOT NULL),'[]'::jsonb) AS items
      FROM dealer_orders o JOIN app_users u ON u.entity_uuid=o.dealer_user_uuid
      LEFT JOIN dealer_order_receipts dr ON dr.order_id=o.id
      LEFT JOIN dealer_order_shipments sh ON sh.order_id=o.id
      LEFT JOIN dealer_order_items i ON i.order_id=o.id
      LEFT JOIN dealer_order_allocations a ON a.item_id=i.id
      LEFT JOIN warehouses w ON w.entity_uuid=a.warehouse_uuid
      WHERE $1::text IS NULL OR u.id=$1
      GROUP BY o.id,u.username,sh.id,dr.id ORDER BY o.created_at DESC`, [userId])).rows;
  }
  return {
    async accounts() {
      try { return (await pool.query("SELECT u.id,u.username,u.role,u.enabled,r.note AS \"reviewNote\",r.reviewed_by AS \"reviewedBy\",r.reviewed_at AS \"reviewedAt\",p.display_name AS \"partnerName\" FROM app_users u JOIN portal_account_reviews r ON r.user_id=u.id LEFT JOIN supplier_portal_memberships m ON m.user_id=u.id AND m.status='ACTIVE' LEFT JOIN partners p ON p.id=m.partner_id WHERE u.role IN ('owner','dealer','supplier') ORDER BY r.reviewed_at DESC")).rows; }
      catch (e) { if (e.code !== '42P01') throw e; return (await pool.query("SELECT u.id,u.username,u.role,u.enabled,r.note AS \"reviewNote\",r.reviewed_by AS \"reviewedBy\",r.reviewed_at AS \"reviewedAt\",NULL::text AS \"partnerName\" FROM app_users u JOIN portal_account_reviews r ON r.user_id=u.id WHERE u.role IN ('owner','dealer','supplier') ORDER BY r.reviewed_at DESC")).rows; }
    },
    async account(id) { return (await pool.query("SELECT id FROM app_users WHERE id=$1 AND role IN ('owner','dealer','supplier')", [id])).rows[0]; },
    async requests(user) {
      return (await pool.query(`SELECT ${requestFields}${user ? '' : ',u.username,u.role'} FROM portal_vehicle_requests r JOIN app_users u ON u.id=r.user_id ${user ? 'WHERE r.user_id=$1' : ''} ORDER BY r.created_at DESC`, user ? [user.id] : [])).rows;
    },
    async requestVehicle(user, input) {
      const vin = String(input.vin || '').trim().toUpperCase(), note = noteOf(input.note), id = uuidv7();
      if (!/^[A-HJ-NPR-Z0-9]{11,20}$/.test(vin)) fail('VIN 格式无效');
      // Do not look up the VIN before review: a request must not reveal whether a vehicle exists.
      return transaction('portal.vehicle.request', `portal-requests/${id}`, async c => {
        await portalUser(c, user.id);
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['portal-vehicle-request',user.id,vin])]);
        const pending=(await c.query("SELECT id,vin,note,status,decision_note AS \"decisionNote\",created_at AS \"createdAt\",reviewed_at AS \"reviewedAt\" FROM portal_vehicle_requests WHERE user_id=$1 AND vin=$2 AND status='pending' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[user.id,vin])).rows[0];
        if(pending){if(pending.note!==note)fail('该车辆已有待审核申请，请等待管理员处理后再提交',409);return{...pending,replayed:true};}
        return (await c.query("INSERT INTO portal_vehicle_requests(id,user_id,vin,note) VALUES($1,$2,$3,$4) RETURNING id,vin,note,status,created_at AS \"createdAt\"", [id, user.id, vin, note])).rows[0];
      });
    },
    async review(id, input) {
      const decision = input.decision, note = noteOf(input.note);
      if (!['approve', 'reject', 'revoke'].includes(decision)||!isUuidv7(id)) fail('审核操作无效');
      id=String(id).toLowerCase();
      const status={approve:'approved',reject:'rejected',revoke:'revoked'}[decision];
      const result=await transaction(`portal.vehicle.${decision}`, `portal-requests/${id}`, async c => {
        const request = (await c.query('SELECT id,user_id,vin,status,decision_note AS "decisionNote" FROM portal_vehicle_requests WHERE id=$1 FOR UPDATE', [id])).rows[0];
        if (!request) fail('申请不存在', 404);
        if(request.status===status){if(request.decisionNote!==note)fail('申请已处理，请核对原审核记录',409);return{id,vin:request.vin,status,decisionNote:request.decisionNote,replayed:true}}
        if (decision === 'revoke') {
          if (request.status !== 'approved') fail('只有已批准申请可以撤销', 409);
          await c.query('UPDATE portal_vehicle_access SET revoked_at=now() WHERE request_id=$1', [id]);
        } else {
          if (request.status !== 'pending') fail('申请已被处理，请刷新', 409);
          if (decision === 'approve') {
            const user = await portalUser(c, request.user_id);
            const vin = (await c.query('SELECT id FROM vins WHERE vin=$1 FOR UPDATE', [request.vin])).rows[0];
            if (!vin) fail('车辆档案不存在，请先核实并建立档案');
            if (user.role === 'owner' && (await c.query("SELECT 1 FROM portal_vehicle_access WHERE vin_id=$1 AND role='owner' AND revoked_at IS NULL", [vin.id])).rowCount) fail('车辆已有车主授权，请先核实并撤销原授权', 409);
            await c.query('INSERT INTO portal_vehicle_access(request_id,user_id,vin_id,role) VALUES($1,$2,$3,$4)', [id, user.id, vin.id, user.role]);
          }
        }
        return (await c.query('UPDATE portal_vehicle_requests SET status=$1,decision_note=$2,reviewed_by=$3,reviewed_at=now() WHERE id=$4 RETURNING id,vin,status,decision_note AS "decisionNote"', [status, note, currentActor(), id])).rows[0];
      });
      delete result.replayed;
      return result;
    },
    async vehicles(user) {
      return (await pool.query(`SELECT v.id,v.vin,v.model,v.produced_at AS "producedAt",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',w.id,'coverage',w.coverage,'startsOn',w.starts_on::text,'endsOn',w.ends_on::text,'revoked',w.revoked_at IS NOT NULL) ORDER BY w.starts_on DESC,w.id DESC)
          FROM vehicle_warranties w WHERE w.vin_uuid=v.entity_uuid),'[]'::jsonb) AS warranties
        FROM portal_vehicle_access a JOIN vins v ON v.id=a.vin_id JOIN app_users u ON u.id=a.user_id
        WHERE a.user_id=$1 AND a.role=$2 AND a.revoked_at IS NULL AND u.enabled AND u.role=a.role ORDER BY v.vin`, [user.id, user.role])).rows;
    },
    async repairHistory(user) {
      if(user.role!=='owner')fail('仅车主账号可查看维修履历',403);
      return (await pool.query(`SELECT r.id,r.vin,r.work_order_no AS "workOrderNo",r.type,r.fault,r.status,r.created_at::text AS "createdAt",sc.name AS "serviceCenterName",
          COALESCE((SELECT jsonb_agg(jsonb_build_object('id',q.id,'revision',q.revision,'currency',q.currency,'laborMinor',q.labor_minor::text,'partsMinor',q.parts_minor::text,'otherMinor',q.other_minor::text,'totalMinor',(q.labor_minor::numeric+q.parts_minor::numeric+q.other_minor::numeric)::text,'note',q.note,'createdAt',q.created_at,'decision',d.decision,'decisionNote',d.note,'payments',(SELECT COALESCE(jsonb_agg(jsonb_build_object('amountMinor',p.amount_minor::text,'method',p.method,'receivedOn',p.received_on::text) ORDER BY p.received_on,p.id),'[]'::jsonb) FROM repair_payments p WHERE p.quote_id=q.id)) ORDER BY q.revision DESC)
            FROM repair_quotes q LEFT JOIN repair_quote_decisions d ON d.quote_id=q.id WHERE q.repair_uuid=r.entity_uuid),'[]'::jsonb) AS quotes,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('fromStatus',a.before_json->>'status','toStatus',a.after_json->>'status','changedAt',a.created_at) ORDER BY a.created_at,a.id)
            FROM audit_log a WHERE a.target='repairs/'||r.id AND a.action IN ('repair.create','repair.update','repair.complete','repair.service.complete')
              AND a.after_json ? 'status' AND (a.action='repair.create' OR a.before_json->>'status' IS DISTINCT FROM a.after_json->>'status')),'[]'::jsonb) AS "statusHistory"
        FROM repairs r JOIN vins v ON v.vin=r.vin LEFT JOIN service_centers sc ON sc.id=r.service_center_uuid
        WHERE EXISTS(SELECT 1 FROM portal_vehicle_access a JOIN app_users u ON u.id=a.user_id
          WHERE a.user_id=$1 AND a.role='owner' AND a.vin_id=v.id
            AND a.revoked_at IS NULL AND u.enabled AND u.role='owner')
        ORDER BY r.created_at DESC,r.id DESC LIMIT 200`,[user.id])).rows;
    },
    async respondToRepairQuote(user,repairId,quoteId,input) {
      const decision=input.decision,note=typeof input.note==='string'?input.note.trim():'';
      if(user.role!=='owner')fail('仅车主账号可确认维修报价',403);
      if(!isUuidv7(repairId)||!isUuidv7(quoteId)||!['accepted','declined'].includes(decision)||note.length>2000)fail('报价确认资料无效');
      const repairKey=repairId.toLowerCase(),quoteKey=quoteId.toLowerCase();
      return transaction('portal.repair.quote.decision',`repairs/${repairKey}/quotes/${quoteKey}`,async c=>{
        await portalUser(c,user.id);
        const repair=(await c.query('SELECT r.entity_uuid,r.status,v.id AS "vinId" FROM repairs r JOIN vins v ON v.vin=r.vin WHERE r.id=$1 FOR UPDATE OF r',[repairKey])).rows[0];
        if(!repair)fail('维修工单不存在',404);
        await authorizedVehicle(c,user,repair.vinId);
        const quote=(await c.query('SELECT id FROM repair_quotes WHERE id=$1 AND repair_uuid=$2',[quoteKey,repair.entity_uuid])).rows[0];
        if(!quote)fail('维修报价不存在',404);
        const prior=(await c.query('SELECT id,decision,note,recorded_by AS "recordedBy",created_at AS "createdAt" FROM repair_quote_decisions WHERE quote_id=$1',[quoteKey])).rows[0];
        if(prior){if(prior.decision!==decision||prior.note!==note||prior.recordedBy!==currentActor())fail('该报价已确认，不能重复更改',409);return{after:prior,replayed:true};}
        const latest=(await c.query('SELECT id FROM repair_quotes WHERE repair_uuid=$1 ORDER BY revision DESC LIMIT 1',[repair.entity_uuid])).rows[0];
        if(latest?.id!==quoteKey)fail('已有更新报价，请确认最新版本',409);
        if(['已完成','已关闭'].includes(repair.status))fail('已完成或关闭的工单不能确认报价',409);
        const row=(await c.query('INSERT INTO repair_quote_decisions(id,quote_id,decision,note,recorded_by) VALUES($1,$2,$3,$4,$5) RETURNING id,decision,note,created_at AS "createdAt"',[uuidv7(),quoteKey,decision,note,currentActor()])).rows[0];
        return{after:row};
      });
    },
    async services(user) {
      const scope = user ? 'WHERE s.user_id=$1 AND EXISTS(SELECT 1 FROM portal_vehicle_access a WHERE a.user_id=$1 AND a.vin_id=s.vin_id AND a.role=$2 AND a.revoked_at IS NULL) AND u.enabled AND u.role=$2' : '';
      return (await pool.query(`SELECT s.id,s.vin_id AS "vinId",v.vin,s.description,s.status,s.reply_note AS "replyNote",s.created_at AS "createdAt",sc.name AS "serviceCenterName",r.work_order_no AS "workOrderNo",r.status AS "repairStatus"${user ? '' : ',u.username,u.role'} FROM portal_service_requests s JOIN vins v ON v.id=s.vin_id JOIN app_users u ON u.id=s.user_id LEFT JOIN service_centers sc ON sc.id=s.service_center_uuid LEFT JOIN repairs r ON r.id=s.repair_id ${scope} ORDER BY s.created_at DESC`, user ? [user.id, user.role] : [])).rows;
    },
    async requestService(user, input) {
      const description = noteOf(input.description), id = String(input.id || ''), vinId = String(input.vinId || '').toLowerCase(), serviceCenterId = input.serviceCenterId ? String(input.serviceCenterId).toLowerCase() : null;
      if (!isUuidv7(id)) fail('申请编号无效，请刷新后重试');
      if (!isUuidv7(vinId)) fail('车辆不可用或尚未获得授权',403);
      if (serviceCenterId && !isUuidv7(serviceCenterId)) fail('服务网点无效，请重新选择');
      return transaction('portal.service.request', `portal-services/${id}`, async c => {
        await authorizedVehicle(c, user, vinId);
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['portal-service-request',user.id,vinId,description,serviceCenterId])]);
        const pending=(await c.query("SELECT id,vin_id AS \"vinId\",description,status,service_center_uuid AS \"serviceCenterId\" FROM portal_service_requests WHERE user_id=$1 AND vin_id=$2 AND description=$3 AND service_center_uuid IS NOT DISTINCT FROM $4::uuid AND status='submitted' ORDER BY created_at DESC LIMIT 1 FOR UPDATE",[user.id,vinId,description,serviceCenterId])).rows[0];
        if(pending)return{...pending,replayed:true};
        if (serviceCenterId && !(await c.query("SELECT 1 FROM service_centers WHERE id=$1 AND status='启用' FOR SHARE",[serviceCenterId])).rowCount) fail('所选服务网点当前不可受理，请重新选择');
        await c.query('INSERT INTO portal_service_requests(id,user_id,vin_id,description,service_center_uuid) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING', [id, user.id, vinId, description, serviceCenterId]);
        const row = (await c.query('SELECT id,vin_id AS \"vinId\",description,status,service_center_uuid AS \"serviceCenterId\" FROM portal_service_requests WHERE id=$1 AND user_id=$2', [id, user.id])).rows[0];
        if (!row || row.vinId !== vinId || row.description !== description || row.serviceCenterId !== serviceCenterId) fail('申请编号已使用，请刷新后重试', 409);
        return row;
      });
    },
    async reviewService(id, input) {
      const note = noteOf(input.note), decision = input.decision;
      if (!['accept', 'reject'].includes(decision)) fail('审核操作无效');
      return transaction(`portal.service.${decision}`, `portal-services/${id}`, async c => {
        const old = (await c.query('SELECT s.*,u.role FROM portal_service_requests s JOIN app_users u ON u.id=s.user_id WHERE s.id=$1 FOR UPDATE OF s', [id])).rows[0];
        if (!old) fail('服务申请不存在', 404);
        if (old.status !== 'submitted') {
          const status=decision==='accept'?'accepted':'rejected';
          if(old.status===status&&old.reply_note===note)return{id:old.id,status:old.status,replyNote:old.reply_note,repairId:old.repair_id,replayed:true};
          fail('申请已被处理，请刷新', 409);
        }
        let repairId = null;
        if (decision === 'accept') {
          const vin = await authorizedVehicle(c, { id: old.user_id, role: old.role }, old.vin_id);
          repairId = uuidv7();
          const center=old.service_center_uuid?(await c.query('SELECT id,name,status FROM service_centers WHERE id=$1 FOR SHARE',[old.service_center_uuid])).rows[0]:null;
          const activeCenter=center?.status==='启用'?center:null;
          await c.query("INSERT INTO repairs(id,work_order_no,vin,type,fault,quantity,repair_store,service_center_uuid,status) VALUES($1,$2,$3,'售后服务',$4,1,$5,$6,'待收货')", [repairId, `WO-${uuidv7().slice(0, 8).toUpperCase()}`, vin.vin, old.description, activeCenter?.name||'',activeCenter?.id||null]);
        }
        return (await c.query('UPDATE portal_service_requests SET status=$1,reply_note=$2,repair_id=$3 WHERE id=$4 RETURNING id,status,reply_note AS "replyNote",repair_id AS "repairId"', [decision === 'accept' ? 'accepted' : 'rejected', note, repairId, id])).rows[0];
      });
    },
    async companies() {return (await pool.query('SELECT id,name,country,tax_id AS "taxId",address,contact_name AS "contactName",contact_phone AS "contactPhone",contact_email AS "contactEmail",note,revision FROM dealer_companies ORDER BY name,id')).rows;},
    async saveCompany(input,id=null) {
      const keys=['name','country','taxId','address','contactName','contactPhone','contactEmail','note'],limits=[200,100,100,500,120,80,254,2000];
      const v=Object.fromEntries(keys.map(k=>[k,String(input[k]||'').trim()]));
      const projection='id,name,country,tax_id AS "taxId",address,contact_name AS "contactName",contact_phone AS "contactPhone",contact_email AS "contactEmail",note,revision';
      if(!v.name||keys.some((k,i)=>v[k].length>limits[i])||(id&&(!isUuidv7(id)||!Number.isInteger(input.revision))))fail('企业资料无效');
      return transaction(id?'dealer.company.update':'dealer.company.create',id?`dealer-companies/${id}`:'dealer-companies',async c=>{
        const params=keys.map(k=>v[k]);let old=null,row;
        if(id){old=(await c.query(`SELECT ${projection} FROM dealer_companies WHERE id=$1 FOR UPDATE`,[id])).rows[0];if(!old)fail('企业不存在',404);if(old.revision!==input.revision)fail('企业资料已更新，请重新载入',409);
          row=(await c.query(`UPDATE dealer_companies SET name=$1,country=$2,tax_id=$3,address=$4,contact_name=$5,contact_phone=$6,contact_email=$7,note=$8,revision=revision+1,updated_at=now() WHERE id=$9 RETURNING ${projection}`,[...params,id])).rows[0];
        }else row=(await c.query(`INSERT INTO dealer_companies(name,country,tax_id,address,contact_name,contact_phone,contact_email,note) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${projection}`,params)).rows[0];
        return {before:old,after:row};
      });
    },
    async companyMemberships() {return (await pool.query('SELECT m.id,u.id AS "userId",u.username,m.company_id AS "companyId",c.name AS "companyName",m.reason,m.assigned_by AS "assignedBy",m.started_at AS "startedAt",m.ended_at AS "endedAt" FROM dealer_company_memberships m JOIN app_users u ON u.entity_uuid=m.dealer_user_uuid JOIN dealer_companies c ON c.id=m.company_id ORDER BY m.started_at DESC,m.id DESC')).rows;},
    async assignCompany(userId,input) {
      const companyId=input.companyId,expected=input.expectedCompanyId,reason=noteOf(input.reason);if(!isUuidv7(companyId)||!(expected===null||isUuidv7(expected)))fail('企业关联资料无效');
      return transaction('dealer.company.assign',`dealer-accounts/${userId}/company`,async c=>{
        const user=(await c.query("SELECT entity_uuid FROM app_users WHERE id=$1 AND role='dealer' AND enabled FOR UPDATE",[userId])).rows[0];if(!user)fail('经销商账号不存在或已停用',404);
        if(!(await c.query('SELECT 1 FROM dealer_companies WHERE id=$1',[companyId])).rowCount)fail('企业不存在',404);
        const old=(await c.query('SELECT id,company_id AS "companyId" FROM dealer_company_memberships WHERE dealer_user_uuid=$1 AND ended_at IS NULL',[user.entity_uuid])).rows[0]||null;
        if((old?.companyId||null)!==expected)fail('企业关联已更新，请重新载入',409);if(old?.companyId===companyId)fail('该账号已关联此企业',409);
        if(old)await c.query('UPDATE dealer_company_memberships SET ended_at=now() WHERE id=$1',[old.id]);
        const row=(await c.query('INSERT INTO dealer_company_memberships(dealer_user_uuid,company_id,reason,assigned_by) VALUES($1,$2,$3,$4) RETURNING id,company_id AS "companyId",started_at AS "startedAt"',[user.entity_uuid,companyId,reason,currentActor()])).rows[0];
        return {before:old,after:row};
      });
    },
    async companyPrices() {return (await pool.query('SELECT x.id,x.company_id AS "companyId",c.name AS "companyName",s.code AS sku,x.currency,x.unit_price::text AS "unitPrice",x.enabled,x.revision FROM dealer_company_prices x JOIN dealer_companies c ON c.id=x.company_id JOIN skus s ON s.entity_uuid=x.sku_uuid ORDER BY c.name,s.code,x.currency')).rows;},
    async saveCompanyPrice(input,id=null) {
      const companyId=input.companyId,sku=String(input.sku||'').trim(),currency=input.currency,price=typeof input.unitPrice==='number'||typeof input.unitPrice==='string'?String(input.unitPrice).trim():'',enabled=input.enabled;
      if(!isUuidv7(companyId)||!sku||sku.length>80||!['EUR','CNY'].includes(currency)||!/^\d+(?:\.\d{1,2})?$/.test(price)||Number(price)>100000000||typeof enabled!=='boolean'||(id&&(!isUuidv7(id)||!Number.isInteger(input.revision))))fail('企业价格资料无效');
      return transaction(id?'dealer.company_price.update':'dealer.company_price.create',id?`dealer-company-prices/${id}`:'dealer-company-prices',async c=>{
        if(!(await c.query('SELECT 1 FROM dealer_companies WHERE id=$1',[companyId])).rowCount)fail('企业不存在',404);
        const product=(await c.query('SELECT entity_uuid FROM skus WHERE code=$1 FOR SHARE',[sku])).rows[0];if(!product)fail('SKU 不存在',404);
        let old=null,row;
        if(id){old=(await c.query('SELECT id,company_id AS "companyId",sku_uuid AS "skuUuid",currency,unit_price::text AS "unitPrice",enabled,revision FROM dealer_company_prices WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!old)fail('企业价格不存在',404);if(old.revision!==input.revision)fail('企业价格已更新，请重新载入',409);if(old.companyId!==companyId||old.skuUuid!==product.entity_uuid||old.currency!==currency)fail('不能修改价格所属企业、SKU 或币种');
          row=(await c.query('UPDATE dealer_company_prices SET unit_price=$1,enabled=$2,revision=revision+1,updated_at=now() WHERE id=$3 RETURNING id,unit_price::text AS "unitPrice",enabled,revision',[price,enabled,id])).rows[0];
        }else row=(await c.query('INSERT INTO dealer_company_prices(company_id,sku_uuid,currency,unit_price,enabled) VALUES($1,$2,$3,$4,$5) RETURNING id,unit_price::text AS "unitPrice",enabled,revision',[companyId,product.entity_uuid,currency,price,enabled])).rows[0];
        return {before:old,after:{...row,companyId,sku,currency}};
      });
    },
    async dealerCatalog(user) {
      return (await pool.query(`SELECT s.code AS sku,s.spec,s.color_code AS color,c.en AS "colorEn",c.de AS "colorDe",p.kind,
        COALESCE(cp.published->'languages'->'en'->>'title',cp.published->'languages'->'de'->>'title',cp.published->'languages'->'zh'->>'title',p.name) AS "productName",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('currency',pr.currency,'unitPrice',pr.unit_price::text) ORDER BY pr.currency) FROM dealer_company_prices pr JOIN dealer_company_memberships m ON m.company_id=pr.company_id JOIN app_users u ON u.entity_uuid=m.dealer_user_uuid WHERE u.id=$1 AND u.role='dealer' AND u.enabled AND m.ended_at IS NULL AND pr.sku_uuid=s.entity_uuid AND pr.enabled),'[]'::jsonb) AS prices
        FROM skus s JOIN products p ON p.id=s.product_id JOIN colors c ON c.code=s.color_code
        JOIN catalog_publications cp ON cp.product_id=p.id
        WHERE p.status='启用' AND cp.published IS NOT NULL ORDER BY p.name,s.code`,[user.id])).rows;
    },
    async dealerOrders(user) { if(user!==undefined&&(user?.role!=='dealer'||!user.id))fail('经销商账号不可用',403);return fetchDealerOrders(user===undefined?null:user.id); },
    async recordDealerPayment(id,input) {
      id=String(id||'').toLowerCase();
      if(!isUuidv7(id))fail('订货申请编号无效');
      const paymentId=String(input.paymentId||'').toLowerCase(),amountText=typeof input.amount==='number'||typeof input.amount==='string'?String(input.amount).trim():'';
      const [amountWhole,amountFraction='']=amountText.split('.');
      const normalizedAmount=amountWhole?`${amountWhole.replace(/^0+(?=\d)/,'')}.${amountFraction.padEnd(2,'0')}`:'';
      const reference=String(input.reference||'').trim(),note=String(input.note||'').trim();
      if(!isUuidv7(paymentId)||!/^\d{1,16}(?:\.\d{1,2})?$/.test(amountText)||Number(amountText)<=0||reference.length>120||note.length>2000)fail('收款记录内容无效');
      await transaction('dealer.order.payment.record',`dealer-orders/${id}/payments/${paymentId}`,async c=>{
        const order=(await c.query('SELECT id,status FROM dealer_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!order)fail('订货申请不存在',404);
        const prior=(await c.query('SELECT order_id AS "orderId",amount::text,reference,note FROM dealer_order_payments WHERE id=$1',[paymentId])).rows[0];
        if(prior){if(prior.orderId!==id||prior.amount!==normalizedAmount||prior.reference!==reference||prior.note!==note)fail('收款编号已用于其他记录',409);return{after:{id:paymentId,orderId:id,amount:prior.amount,reference,note},replayed:true};}
        if(reference){
          await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['dealer-payment-reference',reference])]);
          if((await c.query('SELECT p.id FROM dealer_order_payments p WHERE p.reference=$1 AND NOT EXISTS(SELECT 1 FROM dealer_order_payment_reversals x WHERE x.payment_id=p.id) LIMIT 1',[reference])).rowCount)fail('银行流水/参考号已登记过收款，请核对是否重复到账',409);
        }
        if(!['delivered'].includes(order.status))fail('经销商确认收货后才能登记收款',409);
        const totals=(await c.query(`SELECT COALESCE(sum(quantity*quoted_unit_price),0)::numeric(18,2)::text AS total,
          COALESCE((SELECT sum(p.amount) FROM dealer_order_payments p WHERE p.order_id=$1 AND NOT EXISTS(SELECT 1 FROM dealer_order_payment_reversals x WHERE x.payment_id=p.id)),0)::numeric(18,2)::text AS paid,
          COALESCE((SELECT sum(ri.received_quantity*oi.quoted_unit_price)
            FROM dealer_order_return_receipt_items ri
            JOIN dealer_order_return_receipts rc ON rc.id=ri.receipt_id
            JOIN dealer_order_return_requests rr ON rr.id=rc.request_id
            JOIN dealer_order_return_items di ON di.id=ri.return_item_id
            JOIN dealer_order_items oi ON oi.id=di.order_item_id
            WHERE rr.order_id=$1 AND ri.disposition IN ('restocked','not_restocked')),0)::numeric(18,2)::text AS returned,
          COALESCE((SELECT sum(f.amount) FROM dealer_order_return_refunds f
            JOIN dealer_order_return_requests rr ON rr.id=f.return_id WHERE rr.order_id=$1),0)::numeric(18,2)::text AS refunded,
          count(*) FILTER(WHERE quoted_unit_price IS NULL)::int AS "unquotedCount"
          FROM dealer_order_items WHERE order_id=$1`,[id])).rows[0];
        if(totals.unquotedCount)fail('订单报价未完成，不能登记收款',409);
        const inserted=(await c.query(`INSERT INTO dealer_order_payments(id,order_id,amount,reference,note,recorded_by)
          SELECT $1,$2,$3::numeric,$4,$5,$6
          WHERE $3::numeric<=($7::numeric-$8::numeric-$9::numeric+$10::numeric)
          RETURNING id,order_id AS "orderId",amount::text,reference,note,recorded_by AS "recordedBy",received_at AS "receivedAt"`,[paymentId,id,amountText,reference,note,currentActor(),totals.total,totals.paid,totals.returned,totals.refunded])).rows[0];
        if(!inserted)fail('收款金额超过订单未结余额',409);
        return{after:inserted};
      });
      return (await fetchDealerOrders()).find(row=>row.id===id);
    },
    async reverseDealerPayment(id,paymentId,input) {
      id=String(id||'').toLowerCase();paymentId=String(paymentId||'').toLowerCase();
      if(!isUuidv7(id)||!isUuidv7(paymentId))fail('收款冲正内容无效');
      const reason=noteOf(input.reason);
      await transaction('dealer.order.payment.reverse',`dealer-orders/${id}/payments/${paymentId}/reverse`,async c=>{
        const order=(await c.query('SELECT id FROM dealer_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!order)fail('订货申请不存在',404);
        const payment=(await c.query('SELECT id FROM dealer_order_payments WHERE id=$1 AND order_id=$2 FOR UPDATE',[paymentId,id])).rows[0];
        if(!payment)fail('收款记录不存在',404);
        const prior=(await c.query('SELECT id,reason,reversed_by AS "reversedBy",created_at AS "reversedAt" FROM dealer_order_payment_reversals WHERE payment_id=$1',[paymentId])).rows[0];
        if(prior){if(prior.reason!==reason)fail('该收款已冲正，请核对原冲正记录',409);return{after:{paymentId,reversalId:prior.id,reason:prior.reason,reversedBy:prior.reversedBy,reversedAt:prior.reversedAt},replayed:true};}
        const inserted=(await c.query('INSERT INTO dealer_order_payment_reversals(payment_id,reason,reversed_by) VALUES($1,$2,$3) RETURNING id,reason,reversed_by AS "reversedBy",created_at AS "reversedAt"',[paymentId,reason,currentActor()])).rows[0];
        return{after:{paymentId,reversalId:inserted.id,reason:inserted.reason,reversedBy:inserted.reversedBy,reversedAt:inserted.reversedAt}};
      });
      return (await fetchDealerOrders()).find(row=>row.id===id);
    },
    async recordDealerInvoice(id,input) {
      id=String(id||'').toLowerCase();
      if(!isUuidv7(id))fail('订货申请编号无效');
      const invoiceId=String(input.id||'').toLowerCase(),invoiceNumber=String(input.invoiceNumber||'').trim(),issuedOn=String(input.issuedOn||''),dueOn=String(input.dueOn||'').trim()||null,note=String(input.note||'').trim();
      const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(`${value}T00:00:00Z`))&&new Date(`${value}T00:00:00Z`).toISOString().slice(0,10)===value;
      if(!isUuidv7(invoiceId)||!invoiceNumber||invoiceNumber.length>120||!validDate(issuedOn)||(dueOn&&!validDate(dueOn))||(dueOn&&dueOn<issuedOn)||note.length>2000)fail('发票登记内容无效');
      try { await transaction('dealer.order.invoice.record',`dealer-orders/${id}/invoices/${invoiceId}`,async c=>{
        const order=(await c.query('SELECT id,status,currency FROM dealer_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!order)fail('订货申请不存在',404);
        const prior=(await c.query('SELECT id,order_id AS "orderId",invoice_number AS "invoiceNumber",issued_on::text AS "issuedOn",due_on::text AS "dueOn",currency,note FROM dealer_order_invoices WHERE order_id=$1 OR id=$2 FOR UPDATE',[id,invoiceId])).rows[0];
        if(prior){if(prior.id!==invoiceId||prior.orderId!==id||prior.invoiceNumber!==invoiceNumber||prior.issuedOn!==issuedOn||prior.dueOn!==dueOn||prior.currency!==order.currency||prior.note!==note)fail('该订单或发票编号已登记，请核对原记录',409);return{after:{id:invoiceId,orderId:id,invoiceNumber},replayed:true};}
        if(order.status!=='delivered')fail('订单签收后才能登记发票',409);
        const items=(await c.query('SELECT id,sku_code AS sku,product_name AS "productName",quantity,quoted_unit_price::text AS "unitPrice" FROM dealer_order_items WHERE order_id=$1 ORDER BY id FOR SHARE',[id])).rows;
        if(!items.length||items.some(item=>item.unitPrice===null))fail('订单报价未完成，不能登记发票',409);
        const itemCents=item=>{const [whole,fraction='']=item.unitPrice.split('.');return BigInt(whole)*100n+BigInt((fraction+'00').slice(0,2));};
        const amountCents=items.reduce((sum,item)=>sum+BigInt(item.quantity)*itemCents(item),0n);
        if(amountCents<=0n)fail('订单金额无效，不能登记发票',409);
        const amount=`${amountCents/100n}.${String(amountCents%100n).padStart(2,'0')}`;
        const invoice=(await c.query('INSERT INTO dealer_order_invoices(id,order_id,invoice_number,issued_on,due_on,currency,total_amount,note,recorded_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,invoice_number AS "invoiceNumber",issued_on::text AS "issuedOn",due_on::text AS "dueOn",currency,total_amount::text AS "totalAmount",note,recorded_by AS "recordedBy",created_at AS "createdAt"',[invoiceId,id,invoiceNumber,issuedOn,dueOn,order.currency,amount,note,currentActor()])).rows[0];
        for(const item of items){const lineCents=BigInt(item.quantity)*itemCents(item),lineTotal=`${lineCents/100n}.${String(lineCents%100n).padStart(2,'0')}`;await c.query('INSERT INTO dealer_order_invoice_items(invoice_id,order_item_id,sku_code,product_name,quantity,unit_price,line_total) VALUES($1,$2,$3,$4,$5,$6,$7)',[invoiceId,item.id,item.sku,item.productName,item.quantity,item.unitPrice,lineTotal]);}
        return{after:invoice};
      }); } catch(e) { if(e.code==='23505')fail('发票号码已登记，或该订单已有发票',409); throw e; }
      return (await fetchDealerOrders()).find(row=>row.id===id);
    },
    async createDealerOrder(user, input) {
      const note=String(input.note||'').trim(),items=input.items;
      if(note.length>2000||!Array.isArray(items)||items.length<1||items.length>100)fail('订货内容无效');
      const requested=items.map(item=>({sku:String(item?.sku||'').trim(),quantity:Number(item?.quantity)}));
      if(requested.some(item=>!item.sku||item.sku.length>80||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>100000)||new Set(requested.map(item=>item.sku)).size!==requested.length)fail('SKU、数量无效或有重复 SKU');
      const orderId=input.id==null?uuidv7():String(input.id).toLowerCase();
      if(!isUuidv7(orderId))fail('订货编号无效');
      await transaction('dealer.order.submit',`dealer-orders/${orderId}`,async c=>{
        const dealer=await portalUser(c,user.id);
        if(dealer.role!=='dealer')fail('只有经销商账号可以提交订货申请',403);
        await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[orderId]);
        const prior=(await c.query('SELECT id,dealer_user_uuid AS "dealerUserUuid",note,status FROM dealer_orders WHERE id=$1',[orderId])).rows[0];
        if(prior){
          const priorItems=(await c.query('SELECT sku_code AS sku,quantity FROM dealer_order_items WHERE order_id=$1',[orderId])).rows;
          const expected=new Map(requested.map(item=>[item.sku,item.quantity]));
          if(prior.dealerUserUuid!==dealer.entityUuid||prior.note!==note||priorItems.length!==expected.size||priorItems.some(item=>expected.get(item.sku)!==item.quantity))fail('订货编号已用于其他申请',409);
          return{before:null,after:{id:orderId,status:prior.status,itemCount:priorItems.length},replayed:true};
        }
        const rows=(await c.query(`SELECT s.code,s.entity_uuid AS "skuUuid",p.kind,
          COALESCE(cp.published->'languages'->'en'->>'title',cp.published->'languages'->'de'->>'title',cp.published->'languages'->'zh'->>'title',p.name) AS "productName"
          FROM skus s JOIN products p ON p.id=s.product_id JOIN catalog_publications cp ON cp.product_id=p.id
          WHERE s.code=ANY($1::text[]) AND p.status='启用' AND cp.published IS NOT NULL FOR SHARE OF s,p`,[requested.map(item=>item.sku)])).rows;
        if(rows.length!==requested.length)fail('部分 SKU 不存在、未启用或尚未发布',404);
        const bySku=new Map(rows.map(row=>[row.code,row]));
        await c.query('INSERT INTO dealer_orders(id,dealer_user_uuid,note) VALUES($1,$2,$3)',[orderId,dealer.entityUuid,note]);
        for(const item of requested){const product=bySku.get(item.sku);await c.query('INSERT INTO dealer_order_items(order_id,sku_uuid,sku_code,product_name,quantity) VALUES($1,$2,$3,$4,$5)',[orderId,product.skuUuid,item.sku,product.productName,item.quantity]);}
        return{after:{id:orderId,status:'submitted',itemCount:requested.length}};
      });
      return (await fetchDealerOrders(user.id)).find(row=>row.id===orderId);
    },
    async quoteDealerOrder(id,input) {
      if(!isUuidv7(id)||!['CNY','EUR'].includes(input.currency)||!Array.isArray(input.items))fail('报价内容无效');
      const note=String(input.note||'').trim(),items=input.items.map(item=>({id:String(item?.id||''),priceText:typeof item?.price==='number'||typeof item?.price==='string'?String(item.price).trim():'',note:String(item?.note||'').trim()}));
      if(note.length>2000||items.some(item=>!isUuidv7(item.id)||!/^\d+(?:\.\d{1,2})?$/.test(item.priceText)||Number(item.priceText)>100000000||item.note.length>1000)||new Set(items.map(item=>item.id)).size!==items.length)fail('报价内容无效');
      if(!isUuidv7(id))fail('订货申请编号无效');
      await transaction('dealer.order.quote',`dealer-orders/${id}`,async c=>{
        const order=(await c.query('SELECT id,status FROM dealer_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!order)fail('订货申请不存在',404);
        if(!['submitted','declined'].includes(order.status))fail('只有待报价或经销商已拒绝的申请可以报价',409);
        const lines=(await c.query('SELECT id FROM dealer_order_items WHERE order_id=$1 FOR UPDATE',[id])).rows;
        if(lines.length!==items.length||lines.some(line=>!items.some(item=>item.id===line.id)))fail('报价必须包含全部申请商品',400);
        for(const item of items)await c.query('UPDATE dealer_order_items SET quoted_unit_price=$1,quote_note=$2 WHERE id=$3 AND order_id=$4',[item.priceText,item.note,item.id,id]);
        await c.query("UPDATE dealer_orders SET status='quoted',currency=$1,admin_note=$2,quoted_by=$3,quoted_at=now(),dealer_response_note='',updated_at=now() WHERE id=$4",[input.currency,note,currentActor(),id]);
        return{after:{id,status:'quoted',currency:input.currency}};
      });
      return (await fetchDealerOrders()).find(row=>row.id===id);
    },
    async rejectDealerOrder(id,input) {
      if(!isUuidv7(id))fail('订货申请编号无效');
      const note=noteOf(input.note);
      return transaction('dealer.order.reject',`dealer-orders/${id}`,async c=>{
        const old=(await c.query('SELECT id,status FROM dealer_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!old)fail('订货申请不存在',404);
        if(old.status!=='submitted')fail('只有待报价申请可以拒绝',409);
        await c.query("UPDATE dealer_orders SET status='rejected',admin_note=$1,quoted_by=$2,quoted_at=now(),updated_at=now() WHERE id=$3",[note,currentActor(),id]);
        return{before:old,after:{id,status:'rejected',adminNote:note}};
      });
    },
    async allocateDealerOrder(id,input) {
      id=String(id||'').toLowerCase();
      if(!isUuidv7(id)||!Array.isArray(input.items))fail('库存分配内容无效');
      const allocations=input.items.map(item=>({itemId:String(item?.itemId||'').toLowerCase(),warehouseId:String(item?.warehouseId||'')}));
      if(allocations.some(item=>!isUuidv7(item.itemId)||!item.warehouseId)||new Set(allocations.map(item=>item.itemId)).size!==allocations.length)fail('库存分配内容无效');
      await transaction('dealer.order.allocate',`dealer-orders/${id}`,async c=>{
        const order=(await c.query('SELECT id,status FROM dealer_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!order)fail('订货申请不存在',404);
        const lines=(await c.query('SELECT id,sku_uuid AS "skuUuid",sku_code AS sku,quantity FROM dealer_order_items WHERE order_id=$1 ORDER BY id FOR UPDATE',[id])).rows;
        if(lines.length!==allocations.length||lines.some(line=>!allocations.some(item=>item.itemId===line.id)))fail('必须为每个订货 SKU 分配一个仓库');
        if(order.status==='allocated'){
          const existing=(await c.query('SELECT i.id AS "itemId",w.id AS "warehouseId",r.status AS "reservationStatus" FROM dealer_order_items i JOIN dealer_order_allocations a ON a.item_id=i.id JOIN warehouses w ON w.entity_uuid=a.warehouse_uuid JOIN inventory_reservations r ON r.id=a.reservation_id WHERE i.order_id=$1',[id])).rows;
          if(existing.length===allocations.length&&existing.every(item=>item.reservationStatus==='reserved'&&allocations.some(allocation=>allocation.itemId===item.itemId&&allocation.warehouseId===item.warehouseId)))return{after:{id,status:'allocated',itemCount:lines.length},replayed:true};
          fail('订单已分配库存，分配内容不一致',409);
        }
        if(order.status!=='accepted')fail('经销商接受报价后才能分配库存',409);
        const warehouses=(await c.query("SELECT id,entity_uuid AS \"warehouseUuid\",kind,status FROM warehouses WHERE id=ANY($1::text[]) ORDER BY entity_uuid FOR SHARE",[[...new Set(allocations.map(item=>item.warehouseId))]])).rows;
        const warehouseById=new Map(warehouses.map(warehouse=>[warehouse.id,warehouse]));
        const planned=lines.map(line=>({...line,warehouse:warehouseById.get(allocations.find(item=>item.itemId===line.id).warehouseId)}))
          .sort((a,b)=>(`${a.warehouse?.warehouseUuid||''}:${a.skuUuid}`).localeCompare(`${b.warehouse?.warehouseUuid||''}:${b.skuUuid}`));
        for(const line of planned){
          const warehouse=line.warehouse;
          if(!warehouse||warehouse.status!=='启用'||!['国内仓','海外仓'].includes(warehouse.kind))fail('请选择已启用的国内仓或海外仓');
          const stock=(await c.query('SELECT quantity FROM warehouse_stock WHERE warehouse_id=$1 AND sku_code=$2 FOR UPDATE',[warehouse.id,line.sku])).rows[0];
          if(!stock)fail('所选仓库没有该 SKU 库存');
          const ledger=Number((await c.query('SELECT COALESCE(sum(quantity_delta),0)::bigint AS quantity FROM inventory_ledger WHERE sku_uuid=$1 AND warehouse_uuid=$2',[line.skuUuid,warehouse.warehouseUuid])).rows[0].quantity);
          if(ledger!==Number(stock.quantity))fail('库存账本与仓库余额不一致，已暂停经销商配货',409);
          const available=Number((await c.query('SELECT available_quantity AS quantity FROM inventory_available_balances WHERE sku_uuid=$1 AND warehouse_uuid=$2',[line.skuUuid,warehouse.warehouseUuid])).rows[0]?.quantity||0);
          if(available<Number(line.quantity))fail('可用库存不足，无法完成经销商配货',409);
          const sourceId=id+':'+line.id;
          const reservation=(await c.query("INSERT INTO inventory_reservations(sku_uuid,warehouse_uuid,quantity,source_type,source_id,created_by,note) VALUES($1,$2,$3,'sales_order',$4,$5,$6) RETURNING id",[line.skuUuid,warehouse.warehouseUuid,line.quantity,sourceId,currentActor(),'经销商订单库存预占'])).rows[0];
          await c.query('INSERT INTO dealer_order_allocations(item_id,warehouse_uuid,reservation_id) VALUES($1,$2,$3)',[line.id,warehouse.warehouseUuid,reservation.id]);
        }
        await c.query("UPDATE dealer_orders SET status='allocated',updated_at=now() WHERE id=$1",[id]);
        return{after:{id,status:'allocated',itemCount:lines.length}};
      });
      return (await fetchDealerOrders()).find(row=>row.id===id);
    },
    async shipDealerOrder(id,input) {
      const carrier=String(input.carrier||'').trim(),tracking=String(input.trackingNo||'').trim();
      if(!isUuidv7(id)||!carrier||carrier.length>120||!tracking||tracking.length>120)fail('承运商和运单号必填');
      const result=await transaction('dealer.order.ship',`dealer-orders/${id}`,async c=>{
        const order=(await c.query('SELECT id,status FROM dealer_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!order)fail('订货申请不存在',404);
        if(order.status==='shipped'){
          const prior=(await c.query('SELECT carrier,tracking_no AS "trackingNo" FROM dealer_order_shipments WHERE order_id=$1',[id])).rows[0];
          if(!prior||prior.carrier!==carrier||prior.trackingNo!==tracking)fail('订单已发运，请核对原运单',409);
          return {after:{id,status:'shipped',...prior},replayed:true};
        }
        if(order.status!=='allocated')fail('只有已预占库存的订单可以发运',409);
        const lines=(await c.query(`SELECT i.id,i.sku_uuid AS "skuUuid",i.sku_code AS sku,i.quantity,a.warehouse_uuid AS "warehouseUuid",w.id AS "warehouseId",r.id AS "reservationId",r.quantity AS "reservedQuantity",r.status AS "reservationStatus" FROM dealer_order_items i JOIN dealer_order_allocations a ON a.item_id=i.id JOIN warehouses w ON w.entity_uuid=a.warehouse_uuid JOIN inventory_reservations r ON r.id=a.reservation_id WHERE i.order_id=$1 ORDER BY a.warehouse_uuid,i.sku_uuid`,[id])).rows;
        const total=Number((await c.query('SELECT count(*)::int AS n FROM dealer_order_items WHERE order_id=$1',[id])).rows[0].n);
        if(!total||lines.length!==total||lines.some(l=>l.reservationStatus!=='reserved'||Number(l.reservedQuantity)!==Number(l.quantity)))fail('库存预占状态异常，不能发运',409);
        for(const line of lines){
          const stock=(await c.query('SELECT quantity FROM warehouse_stock WHERE warehouse_uuid=$1 AND sku_uuid=$2 FOR UPDATE',[line.warehouseUuid,line.skuUuid])).rows[0];
          const ledger=Number((await c.query('SELECT COALESCE(sum(quantity_delta),0)::bigint AS n FROM inventory_ledger WHERE warehouse_uuid=$1 AND sku_uuid=$2',[line.warehouseUuid,line.skuUuid])).rows[0].n);
          const reserved=Number((await c.query("SELECT COALESCE(sum(quantity),0)::bigint AS n FROM inventory_reservations WHERE warehouse_uuid=$1 AND sku_uuid=$2 AND status='reserved'",[line.warehouseUuid,line.skuUuid])).rows[0].n);
          if(!stock||Number(stock.quantity)!==ledger||ledger<Number(line.quantity)||reserved>ledger)fail('库存账本与余额不一致或库存不足，不能发运',409);
          const locked=(await c.query('SELECT status,quantity FROM inventory_reservations WHERE id=$1 FOR UPDATE',[line.reservationId])).rows[0];if(!locked||locked.status!=='reserved'||Number(locked.quantity)!==Number(line.quantity))fail('库存预占状态异常，不能发运',409);
          await c.query('UPDATE warehouse_stock SET quantity=quantity-$1 WHERE warehouse_uuid=$2 AND sku_uuid=$3',[line.quantity,line.warehouseUuid,line.skuUuid]);
          await c.query("INSERT INTO inventory_ledger(source_type,source_id,sku_uuid,warehouse_id,quantity_delta,dealer_order_item_uuid) VALUES('dealer_order_item',$1,$2,$3,$4,$5)",[line.id,line.skuUuid,line.warehouseId,-Number(line.quantity),line.id]);
          await c.query("UPDATE inventory_reservations SET status='consumed',consumed_by=$1,consumed_at=now() WHERE id=$2",[currentActor(),line.reservationId]);
        }
        await c.query('INSERT INTO dealer_order_shipments(order_id,carrier,tracking_no,shipped_by) VALUES($1,$2,$3,$4)',[id,carrier,tracking,currentActor()]);
        await c.query("UPDATE dealer_orders SET status='shipped',updated_at=now() WHERE id=$1",[id]);
        return {before:order,after:{id,status:'shipped',carrier,trackingNo:tracking}};
      });
      return result.after;
    },
    async cancelDealerOrder(id,input) {
      if(!isUuidv7(id))fail('订货申请编号无效');
      id=String(id).toLowerCase();
      const note=noteOf(input.note);
      const result=await transaction('dealer.order.cancel',`dealer-orders/${id}`,async c=>{
        const order=(await c.query('SELECT id,status,cancel_note AS "cancelNote",cancelled_at AS "cancelledAt" FROM dealer_orders WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!order)fail('订货申请不存在',404);
        if(order.status==='cancelled'){
          if(order.cancelNote!==note)fail('订单已取消，请核对原取消记录',409);
          return {after:{id,status:'cancelled',cancelNote:order.cancelNote,cancelledAt:order.cancelledAt},replayed:true};
        }
        if(!['submitted','quoted','accepted','allocated','declined'].includes(order.status))fail('该订单状态不能取消',409);
        if(order.status==='allocated'){
          const lines=(await c.query('SELECT i.id,a.reservation_id,r.status FROM dealer_order_items i LEFT JOIN dealer_order_allocations a ON a.item_id=i.id LEFT JOIN inventory_reservations r ON r.id=a.reservation_id WHERE i.order_id=$1 ORDER BY i.id',[id])).rows;
          if(!lines.length||lines.some(line=>!line.reservation_id||line.status!=='reserved'))fail('库存预占状态异常，不能取消订单',409);
          for(const line of lines){const released=await c.query("UPDATE inventory_reservations SET status='released',released_by=$1,released_at=now() WHERE id=$2 AND status='reserved' RETURNING id",[currentActor(),line.reservation_id]);if(!released.rowCount)fail('库存预占状态已变化，请重新核对',409);}
        }
        const after=(await c.query("UPDATE dealer_orders SET status='cancelled',cancel_note=$1,cancelled_by=$2,cancelled_at=now(),updated_at=now() WHERE id=$3 RETURNING id,status,cancel_note AS \"cancelNote\",cancelled_at AS \"cancelledAt\"",[note,currentActor(),id])).rows[0];
        return {before:order,after};
      });
      return result.after;
    },
    async receiveDealerOrder(user,id,input) {
      if(!isUuidv7(id))fail('收货资料无效');
      id=String(id).toLowerCase();
      const note=String(input.note||'').trim();if(note.length>2000)fail('收货资料无效');
      const result=await transaction('dealer.order.receive',`dealer-orders/${id}`,async c=>{
        const dealer=await portalUser(c,user.id);if(dealer.role!=='dealer')fail('只有经销商账号可以确认收货',403);
        const order=(await c.query('SELECT id,status FROM dealer_orders WHERE id=$1 AND dealer_user_uuid=$2 FOR UPDATE',[id,dealer.entityUuid])).rows[0];
        if(!order)fail('订货申请不存在',404);
        if(order.status==='delivered'){
          const previous=(await c.query('SELECT note,received_at AS "receivedAt" FROM dealer_order_receipts WHERE order_id=$1',[id])).rows[0];
          if(!previous||previous.note!==note)fail('订单已确认收货，请核对原记录',409);
          return {after:{id,status:'delivered',...previous},replayed:true};
        }
        if(order.status!=='shipped')fail('只有已发运订单可以确认收货',409);
        const shipment=(await c.query('SELECT id FROM dealer_order_shipments WHERE order_id=$1',[id])).rows[0];
        if(!shipment)fail('未找到发运记录',409);
        const receipt=(await c.query('INSERT INTO dealer_order_receipts(order_id,shipment_id,confirmed_by,note) VALUES($1,$2,$3,$4) RETURNING note,received_at AS "receivedAt"',[id,shipment.id,dealer.entityUuid,note])).rows[0];
        await c.query("UPDATE dealer_orders SET status='delivered',updated_at=now() WHERE id=$1",[id]);
        return {after:{id,status:'delivered',...receipt}};
      });
      return result.after;
    },
    async respondDealerOrder(user,id,input) {
      if(!isUuidv7(id)||!['accept','decline'].includes(input.decision))fail('报价回复无效');
      id=String(id).toLowerCase();
      const note=String(input.note||'').trim();if(note.length>2000)fail('回复不能超过 2000 个字符');
      const result=await transaction(`dealer.order.${input.decision}`,`dealer-orders/${id}`,async c=>{
        const dealer=await portalUser(c,user.id);if(dealer.role!=='dealer')fail('只有经销商账号可以回复报价',403);
        const order=(await c.query('SELECT id,status,dealer_response_note AS "dealerResponseNote" FROM dealer_orders WHERE id=$1 AND dealer_user_uuid=$2 FOR UPDATE',[id,dealer.entityUuid])).rows[0];
        if(!order)fail('订货申请不存在',404);
        const status=input.decision==='accept'?'accepted':'declined';
        if(order.status===status){
          if(order.dealerResponseNote!==note)fail('订单已回复报价，请核对原回复',409);
          return {before:{id:order.id,status:order.status},after:{id,status,dealerResponseNote:note},replayed:true};
        }
        if(order.status!=='quoted')fail('只有已报价申请可以回复',409);
        await c.query('UPDATE dealer_orders SET status=$1,dealer_response_note=$2,updated_at=now() WHERE id=$3',[status,note,id]);
        return{before:{id:order.id,status:order.status},after:{id,status,dealerResponseNote:note}};
      });
      delete result.replayed;
      return result;
    },
    close: () => pool.end(),
  };
}
function registerPortalRoutes(app, { portal, auth }) {
  function route(method, url, handler, external = false, roles = ['owner', 'dealer']) {
    app.route({ method, url, config: external ? { portalRoles: roles } : {}, bodyLimit: 128 * 1024, handler: async (req, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!external && req.user?.role !== 'admin') return reply.code(403).send({ error: '仅管理员可审核门户权限' });
      if (!portal || !auth) return reply.code(503).send({ error: '门户服务暂时不可用' });
      try { return await handler(req, reply); }
      catch (e) {
        if (e.code === '23505') return reply.code(409).send({ error: '账号、待处理申请或授权已存在，请刷新查看' });
        const known = ['请输入有效邮箱或 3–64 位字母、数字、. _ - 账号', '密码须为 8–20 个字符', '请填写已核实身份或合作资格的审核说明', '请选择有效供应商', '供应商不存在或未启用', '角色无效', '状态无效', '原密码不正确','订货申请编号无效','收款记录内容无效','发票登记内容无效'];
        return reply.code(e.statusCode || (known.includes(e.message) ? 400 : 500)).send({ error: e.statusCode || known.includes(e.message) ? e.message : '门户操作失败' });
      }
    } });
  }
  route('GET', '/api/portal-management/accounts', () => portal.accounts());
  route('POST', '/api/portal-management/accounts', (req, reply) => auth.createPortalUser(req.body || {}, req.user.username).then(user => reply.code(201).send(user)));
  route('PATCH', '/api/portal-management/accounts/:id', async req => {
    if (!(await portal.account(req.params.id))) fail('门户账号不存在', 404);
    if (typeof req.body?.enabled !== 'boolean') fail('状态无效');
    return auth.updateUser(req.params.id, { enabled: req.body.enabled }, req.user.username);
  });
  route('POST', '/api/portal-management/accounts/:id/password', async req => {
    if (!(await portal.account(req.params.id))) fail('门户账号不存在', 404);
    await auth.setPassword(req.params.id, req.body?.newPassword, req.user.username);
    return { ok: true };
  });
  route('GET', '/api/portal-management/vehicle-requests', () => portal.requests());
  route('POST', '/api/portal-management/vehicle-requests/:id/review', req => portal.review(req.params.id, req.body || {}));
  route('GET', '/api/portal/vehicle-requests', req => portal.requests(req.user), true);
  route('POST', '/api/portal/vehicle-requests', (req, reply) => portal.requestVehicle(req.user, req.body || {}).then(row => reply.code(201).send(row)), true);
  route('GET', '/api/portal/vehicles', req => portal.vehicles(req.user), true);
  route('GET', '/api/portal/repair-history', req => portal.repairHistory(req.user), true, ['owner']);
  route('POST', '/api/portal/repairs/:id/quotes/:quoteId/decision', req => portal.respondToRepairQuote(req.user,req.params.id,req.params.quoteId,req.body||{}), true, ['owner']);
  route('GET', '/api/portal-management/service-requests', () => portal.services());
  route('POST', '/api/portal-management/service-requests/:id/review', req => portal.reviewService(req.params.id, req.body || {}));
  route('GET', '/api/portal-management/dealer-company-prices', () => portal.companyPrices());
  route('POST', '/api/portal-management/dealer-company-prices', req => portal.saveCompanyPrice(req.body || {}));
  route('PUT', '/api/portal-management/dealer-company-prices/:id', req => portal.saveCompanyPrice(req.body || {},req.params.id));
  route('GET', '/api/portal-management/dealer-companies', () => portal.companies());
  route('POST', '/api/portal-management/dealer-companies', req => portal.saveCompany(req.body || {}));
  route('PUT', '/api/portal-management/dealer-companies/:id', req => portal.saveCompany(req.body || {},req.params.id));
  route('GET', '/api/portal-management/dealer-company-memberships', () => portal.companyMemberships());
  route('POST', '/api/portal-management/dealer-accounts/:id/company', req => portal.assignCompany(req.params.id,req.body || {}));
  route('GET', '/api/portal-management/dealer-orders', () => portal.dealerOrders());
  route('POST', '/api/portal-management/dealer-orders/:id/quote', req => portal.quoteDealerOrder(req.params.id, req.body || {}));
  route('POST', '/api/portal-management/dealer-orders/:id/reject', req => portal.rejectDealerOrder(req.params.id, req.body || {}));
  route('POST', '/api/portal-management/dealer-orders/:id/ship', req => portal.shipDealerOrder(req.params.id, req.body || {}));
  route('POST', '/api/portal-management/dealer-orders/:id/cancel', req => portal.cancelDealerOrder(req.params.id, req.body || {}));
  route('POST', '/api/portal-management/dealer-orders/:id/allocate', req => portal.allocateDealerOrder(req.params.id, req.body || {}));
  route('POST', '/api/portal-management/dealer-orders/:id/payments', req => portal.recordDealerPayment(req.params.id, req.body || {}));
  route('POST', '/api/portal-management/dealer-orders/:id/payments/:paymentId/reverse', req => portal.reverseDealerPayment(req.params.id, req.params.paymentId, req.body || {}));
  route('POST', '/api/portal-management/dealer-orders/:id/invoices', req => portal.recordDealerInvoice(req.params.id, req.body || {}));
  route('GET', '/api/portal/dealer/catalog', req => portal.dealerCatalog(req.user), true, ['dealer']);
  route('GET', '/api/portal/dealer/orders', req => portal.dealerOrders(req.user), true, ['dealer']);
  route('POST', '/api/portal/dealer/orders', (req, reply) => portal.createDealerOrder(req.user, req.body || {}).then(row => reply.code(201).send(row)), true, ['dealer']);
  route('POST', '/api/portal/dealer/orders/:id/receive', req => portal.receiveDealerOrder(req.user, req.params.id, req.body || {}), true, ['dealer']);
  route('POST', '/api/portal/dealer/orders/:id/respond', req => portal.respondDealerOrder(req.user, req.params.id, req.body || {}), true, ['dealer']);
  route('GET', '/api/portal/service-requests', req => portal.services(req.user), true);
  route('POST', '/api/portal/service-requests', (req, reply) => portal.requestService(req.user, req.body || {}).then(row => reply.code(201).send(row)), true);
  route('POST', '/api/portal/password', async (req, reply) => {
    if (typeof req.body?.oldPassword !== 'string') fail('请输入原密码');
    await auth.setPassword(req.user.id, req.body.newPassword, req.user.username, req.body.oldPassword);
    // The session is deleted server-side, including sessions on other portal hosts.
    return { ok: true };
  }, true, ['owner', 'dealer', 'supplier']);
}
module.exports = { createPortalStore, registerPortalRoutes };
