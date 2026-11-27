const {test}=require('node:test');const assert=require('node:assert/strict');const {Pool}=require('pg');const {createAuth}=require('../auth');const {createPortalStore}=require('../portal');
test('dealer requests require explicit prices and allocate only available inventory',async()=>{
 const url=process.env.TEST_DATABASE_URL;assert(url,'isolated database required');const pool=new Pool({connectionString:url,options:'-c search_path=alsvid_v2'}),auth=createAuth(url),portal=createPortalStore(url);
 try{
  const dealer=await auth.createPortalUser({username:'dealer-test',password:'password123',role:'dealer',reviewNote:'checked'},'test');
  const other=await auth.createPortalUser({username:'dealer-other',password:'password123',role:'dealer',reviewNote:'checked'},'test');
  const company=(await portal.saveCompany({name:'Company A',country:'DE',taxId:'DE123'})).after;
  const secondCompany=(await portal.saveCompany({name:'Company B'})).after;
  const edited=(await portal.saveCompany({...company,name:'Company A updated'},company.id)).after;assert.equal(edited.revision,2);
  await assert.rejects(portal.saveCompany({...company,name:'stale'},company.id),/已更新/);
  await assert.rejects(portal.dealerCenterProfile(dealer),/尚未关联/);
  await portal.assignCompany(dealer.id,{companyId:company.id,expectedCompanyId:null,reason:'verified'});
  const formerMembership=await portal.dealerCenterProfile(dealer);
  await assert.rejects(portal.assignCompany(dealer.id,{companyId:secondCompany.id,expectedCompanyId:null,reason:'stale'}),/已更新/);
  await portal.assignCompany(dealer.id,{companyId:secondCompany.id,expectedCompanyId:company.id,reason:'transfer'});
  const links=await portal.companyMemberships();assert.equal(links.length,2);assert.equal(links.filter(x=>!x.endedAt)[0].companyId,secondCompany.id);
  await assert.rejects(pool.query('DELETE FROM dealer_company_memberships WHERE id=$1',[links[0].id]),{code:'23514'});

  await pool.query("INSERT INTO colors(code,zh,hex) VALUES('TST','Test','#000000')");
  await pool.query("INSERT INTO products(id,kind,name,model,product_type,ownership) VALUES('dealer-vehicle','vehicle','Bike','D1','EBI','D1')");
  await pool.query("INSERT INTO skus(code,product_id,spec,color_code) VALUES('D1-EBI-STD-TST','dealer-vehicle','STD','TST')");
  await pool.query("INSERT INTO catalog_publications(product_id,draft,published) VALUES('dealer-vehicle','{}','{\"languages\":{\"en\":{\"title\":\"Bike\"}}}')");
  await portal.assignCompany(other.id,{companyId:company.id,expectedCompanyId:null,reason:'verified'});
  const p1=(await portal.saveCompanyPrice({companyId:company.id,sku:'D1-EBI-STD-TST',currency:'EUR',unitPrice:'9.00',enabled:true})).after;
  const p2=(await portal.saveCompanyPrice({companyId:secondCompany.id,sku:'D1-EBI-STD-TST',currency:'EUR',unitPrice:'20.00',enabled:true})).after;
  assert.deepEqual((await portal.dealerCatalog(dealer))[0].prices,[{currency:'EUR',unitPrice:'20.00'}]);
  assert.deepEqual((await portal.dealerCatalog(other))[0].prices,[{currency:'EUR',unitPrice:'9.00'}]);
  assert.deepEqual((await portal.dealerCenterCatalog(dealer))[0].prices,[{currency:'EUR',unitPrice:'20.00'}]);
  assert.deepEqual((await portal.dealerCenterCatalog(other))[0].prices,[{currency:'EUR',unitPrice:'9.00'}]);
  await assert.rejects(portal.createDealerOrder({...dealer,centerMembershipId:formerMembership.id},{items:[{sku:'D1-EBI-STD-TST',quantity:1}]},true),/企业关联已变化/);
  await assert.rejects(portal.saveCompanyPrice({...p2,unitPrice:''},p2.id),/价格资料无效/);
  await portal.saveCompanyPrice({...p2,unitPrice:'21.50',enabled:false},p2.id);
  await assert.rejects(portal.saveCompanyPrice({...p2,unitPrice:'1.00'},p2.id),/已更新/);
  assert.deepEqual((await portal.dealerCatalog(dealer))[0].prices,[]);
  assert.deepEqual((await portal.dealerCatalog(other))[0].prices,[{currency:'EUR',unitPrice:'9.00'}]);

  await pool.query("INSERT INTO warehouses(id,name,kind,warehouse_code) VALUES('dealer-warehouse','Dealer warehouse','国内仓','DEALER')");
  await pool.query("INSERT INTO warehouse_stock(warehouse_id,sku_code,quantity) VALUES('dealer-warehouse','D1-EBI-STD-TST',5)");
  await pool.query("INSERT INTO inventory_ledger(source_type,source_id,sku_uuid,warehouse_id,quantity_delta) SELECT 'opening_balance','dealer-test',entity_uuid,'dealer-warehouse',5 FROM skus WHERE code='D1-EBI-STD-TST'");
  const order=await portal.createDealerOrder(dealer,{items:[{sku:'D1-EBI-STD-TST',quantity:3}]});const line=order.items[0];
  assert.equal((await portal.dealerOrders(other)).length,0);
  assert.equal((await portal.dealerCenterOrders(other)).length,0);
  assert.equal((await portal.dealerCenterOrders(dealer))[0].id,order.id);
  for(const price of ['',null,'1.234','-1'])await assert.rejects(portal.quoteDealerOrder(order.id,{currency:'EUR',items:[{id:line.id,price}]}),/报价内容无效/);
  assert.equal((await portal.dealerOrders(dealer))[0].status,'submitted');
  const quote=await portal.quoteDealerOrder(order.id,{currency:'EUR',items:[{id:line.id,price:'12.34'}]});assert.equal(quote.items[0].quotedUnitPrice,12.34);
  await assert.rejects(portal.respondDealerOrder(other,order.id,{decision:'accept'}),/不存在/);
  await assert.rejects(portal.respondDealerOrder(other,order.id,{decision:'accept'},true),/不存在/);
  await portal.respondDealerOrder(dealer,order.id,{decision:'accept'},true);
  const allocated=await portal.allocateDealerOrder(order.id,{items:[{itemId:line.id,warehouseId:'dealer-warehouse'}]});assert.equal(allocated.status,'allocated');
  const reservation=await pool.query("SELECT quantity,status FROM inventory_reservations WHERE source_type='sales_order'");assert.equal(reservation.rows[0].quantity,3);assert.equal(reservation.rows[0].status,'reserved');
  await assert.rejects(portal.allocateDealerOrder(order.id,{items:[{itemId:line.id,warehouseId:'dealer-warehouse'}]}),/接受报价后/);
  const second=await portal.createDealerOrder(dealer,{items:[{sku:'D1-EBI-STD-TST',quantity:3}]});
  await portal.quoteDealerOrder(second.id,{currency:'EUR',items:[{id:second.items[0].id,price:0}]});
  await portal.respondDealerOrder(dealer,second.id,{decision:'accept'});
  await assert.rejects(portal.allocateDealerOrder(second.id,{items:[{itemId:second.items[0].id,warehouseId:'dealer-warehouse'}]}),/可用库存不足/);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM inventory_reservations WHERE source_type='sales_order'")).rows[0].n,1);
  await assert.rejects(portal.cancelDealerOrder(order.id,{note:''}),/请填写说明/);
  const cancelled=await portal.cancelDealerOrder(order.id,{note:'Customer cancelled'});assert.equal(cancelled.status,'cancelled');
  assert.equal((await pool.query("SELECT status FROM inventory_reservations WHERE source_type='sales_order'")).rows[0].status,'released');
  assert.equal((await portal.dealerOrders(dealer)).find(x=>x.id===order.id).cancelNote,'Customer cancelled');
  await assert.rejects(portal.cancelDealerOrder(order.id,{note:'again'}),/不能取消/);
  assert.equal((await portal.allocateDealerOrder(second.id,{items:[{itemId:second.items[0].id,warehouseId:'dealer-warehouse'}]})).status,'allocated');
  await pool.query("UPDATE warehouse_stock SET quantity=4 WHERE warehouse_id='dealer-warehouse'");
  await assert.rejects(portal.shipDealerOrder(second.id,{carrier:'Carrier',trackingNo:'TRACK-1'}),/账本与余额不一致/);
  assert.equal((await portal.dealerOrders(dealer)).find(x=>x.id===second.id).status,'allocated');
  await pool.query("UPDATE warehouse_stock SET quantity=5 WHERE warehouse_id='dealer-warehouse'");
  assert.equal((await portal.shipDealerOrder(second.id,{carrier:'Carrier',trackingNo:'TRACK-1'})).status,'shipped');
  assert.equal((await portal.shipDealerOrder(second.id,{carrier:'Carrier',trackingNo:'TRACK-1'})).status,'shipped');
  await assert.rejects(portal.shipDealerOrder(second.id,{carrier:'Carrier',trackingNo:'OTHER'}),/已发运/);
  assert.equal((await pool.query("SELECT quantity FROM warehouse_stock WHERE warehouse_id='dealer-warehouse'")).rows[0].quantity,2);
  assert.equal((await pool.query("SELECT sum(quantity_delta)::int AS n FROM inventory_ledger WHERE source_type='dealer_order_item'")).rows[0].n,-3);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM inventory_reservations WHERE status='consumed'")).rows[0].n,1);
  await assert.rejects(portal.cancelDealerOrder(second.id,{note:'too late'}),/不能取消/);
  await assert.rejects(portal.receiveDealerOrder(other,second.id,{note:'received'}),/不存在/);
  const receipt=await portal.receiveDealerOrder(dealer,second.id,{note:'received'});assert.equal(receipt.status,'delivered');
  assert.equal((await portal.receiveDealerOrder(dealer,second.id,{note:'received'})).status,'delivered');
  await assert.rejects(portal.receiveDealerOrder(dealer,second.id,{note:'different'}),/已确认收货/);
  await assert.rejects(pool.query("UPDATE dealer_order_receipts SET note='edited' WHERE order_id=$1",[second.id]),{code:'23514'});
  assert.equal((await pool.query("SELECT quantity FROM warehouse_stock WHERE warehouse_id='dealer-warehouse'")).rows[0].quantity,2);

  await assert.rejects(pool.query("UPDATE dealer_order_shipments SET tracking_no='edited' WHERE order_id=$1",[second.id]),{code:'23514'});
  await pool.query("INSERT INTO skus(code,product_id,spec,color_code) VALUES('D1-EBI-ABC-TST','dealer-vehicle','ABC','TST')");
  await pool.query("INSERT INTO warehouse_stock(warehouse_id,sku_code,quantity) VALUES('dealer-warehouse','D1-EBI-ABC-TST',4)");
  await pool.query("INSERT INTO inventory_ledger(source_type,source_id,sku_uuid,warehouse_id,quantity_delta) SELECT 'opening_balance','dealer-second-sku',entity_uuid,'dealer-warehouse',4 FROM skus WHERE code='D1-EBI-ABC-TST'");
  const multi=await portal.createDealerOrder(dealer,{items:[{sku:'D1-EBI-STD-TST',quantity:1},{sku:'D1-EBI-ABC-TST',quantity:1}]});
  await portal.quoteDealerOrder(multi.id,{currency:'EUR',items:multi.items.map(i=>({id:i.id,price:'1.00'}))});
  await portal.respondDealerOrder(dealer,multi.id,{decision:'accept'});
  await portal.allocateDealerOrder(multi.id,{items:multi.items.map(i=>({itemId:i.id,warehouseId:'dealer-warehouse'}))});
  const last=(await pool.query("SELECT code AS sku_code FROM skus WHERE code IN ('D1-EBI-STD-TST','D1-EBI-ABC-TST') ORDER BY entity_uuid DESC LIMIT 1")).rows[0].sku_code;
  await pool.query("UPDATE warehouse_stock SET quantity=quantity+1 WHERE warehouse_id='dealer-warehouse' AND sku_code=$1",[last]);
  await assert.rejects(portal.shipDealerOrder(multi.id,{carrier:'Carrier',trackingNo:'MULTI'}),/账本与余额不一致/);
  assert.equal((await pool.query("SELECT count(*)::int n FROM inventory_ledger WHERE source_type='dealer_order_item'")).rows[0].n,1);
  assert.equal((await pool.query("SELECT count(*)::int n FROM inventory_reservations WHERE source_id LIKE $1 AND status='reserved'",[multi.id+':%'])).rows[0].n,2);
  await pool.query("UPDATE warehouse_stock SET quantity=quantity-1 WHERE warehouse_id='dealer-warehouse' AND sku_code=$1",[last]);
  assert.equal((await portal.shipDealerOrder(multi.id,{carrier:'Carrier',trackingNo:'MULTI'})).status,'shipped');
  await portal.assignCompany(dealer.id,{companyId:company.id,expectedCompanyId:secondCompany.id,reason:'new membership'});
  assert.equal((await portal.dealerCenterOrders(dealer)).length,0);
  await assert.rejects(portal.receiveDealerOrder(dealer,multi.id,{note:'received'},true),/不存在/);




 }finally{await portal.close();await auth.close();await pool.end()}
});
