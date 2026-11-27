'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomBytes}=require('node:crypto');
const {Pool}=require('pg');
const {createAuth}=require('../auth');
const {createCatalogStore}=require('../catalog');
const {createStorefrontOrders}=require('../storefront-orders');
const {uuidv7}=require('../uuidv7');

test('guest checkout: real prices, idempotency, isolation, admin visibility and quote confirmation',async()=>{
 const url=process.env.TEST_DATABASE_URL;
 assert(url,'isolated database required');
 const pool=new Pool({connectionString:url,options:'-c search_path=alsvid_v2'});
 const orders=createStorefrontOrders(url),catalog=createCatalogStore(url),auth=createAuth(url);
 try{
  const owner=await auth.createPortalUser({username:'guest-checkout-test-owner',password:'password123',role:'owner',reviewNote:'verified'},'test');
  await pool.query("INSERT INTO colors(code,zh,hex) VALUES('GCT','Guest checkout','#000000')");
  await pool.query("INSERT INTO products(id,kind,name,model,product_type,ownership) VALUES('guest-checkout-product','vehicle','Guest bike','A1','EBI','A1')");
  await pool.query("INSERT INTO skus(code,product_id,spec,color_code) VALUES('A1-EBI-STD-GCT','guest-checkout-product','STD','GCT')");
  await pool.query("INSERT INTO catalog_publications(product_id,draft,published) VALUES('guest-checkout-product','{}','{}')");
  await catalog.saveOffer({sku:'A1-EBI-STD-GCT',currency:'EUR',unitPrice:'199.50',published:true});
  const guest={guestOrderToken:randomBytes(32).toString('hex')},other={guestOrderToken:randomBytes(32).toString('hex')};
  const input={id:uuidv7(),delivery:{name:'Guest',email:'guest-checkout@example.test',phone:'123',country:'DE',city:'Berlin',postalCode:'12345',address:'Street 1'},items:[{productId:'guest-checkout-product',sku:'A1-EBI-STD-GCT',currency:'EUR',quantity:2,unitPrice:'199.50'}]};
  await assert.rejects(orders.submit(guest,{...input,items:[{...input.items[0],unitPrice:'1.00'}]}),/价格已变化/);
  const [a,b]=await Promise.all([orders.submit(guest,input),orders.submit(guest,input)]);
  assert.equal(a.id,b.id);assert.equal(a.subtotalMinor,'39900');
  const saved=(await pool.query('SELECT owner_user_uuid,guest_token_hash FROM storefront_orders WHERE id=$1',[input.id])).rows[0];
  assert.equal(saved.owner_user_uuid,null);assert.notEqual(saved.guest_token_hash,guest.guestOrderToken);
  assert.match(saved.guest_token_hash,/^[a-f0-9]{64}$/);
  await assert.rejects(orders.get(other,input.id),/不存在或凭证无效/);
  await assert.rejects(orders.get(owner,input.id),/订单不存在/);
  await assert.rejects(orders.submit(other,input),/编号已用于/);
  assert.equal((await orders.get(guest,input.id)).id,input.id);
  assert.equal((await orders.adminList(1,{q:input.id})).items.find(o=>o.id===input.id)?.username,input.delivery.email);
  const quote=await orders.quote(input.id,{id:uuidv7(),expectedRevision:0,shipping:'10.00',tax:'0'});
  await assert.rejects(orders.respond(other,input.id,{quoteId:quote.id,decision:'accept'}),/不存在或凭证无效/);
  assert.equal((await orders.respond(guest,input.id,{quoteId:quote.id,decision:'accept'})).status,'accepted');
  assert.equal((await orders.get(guest,input.id)).quote.totalMinor,'40900');
  assert.equal((await pool.query('SELECT responded_by FROM storefront_order_responses WHERE quote_id=$1',[quote.id])).rows[0].responded_by,null);
  await assert.rejects(orders.receive(guest,input.id,{}),/已发运/);
 }finally{await Promise.all([orders.close(),catalog.close(),auth.close(),pool.end()]);}
});
