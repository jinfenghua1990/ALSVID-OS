const {test}=require('node:test');const assert=require('node:assert/strict');const {Pool}=require('pg');const {createAuth}=require('../auth');const {createCatalogStore}=require('../catalog');const {createStorefrontCart,registerStorefrontCartRoutes}=require('../storefront-cart');const Fastify=require('fastify');const {apiAccessHook}=require('../access-policy');
test('owner cloud cart isolates accounts, rejects stale updates and checks published offers',async()=>{
 const url=process.env.TEST_DATABASE_URL;assert(url,'isolated database required');const pool=new Pool({connectionString:url,options:'-c search_path=alsvid_v2'}),auth=createAuth(url),catalog=createCatalogStore(url),cart=createStorefrontCart(url);
 try{
  const owner=await auth.createPortalUser({username:'cart-owner',password:'password123',role:'owner',reviewNote:'verified'},'test'),other=await auth.createPortalUser({username:'cart-other',password:'password123',role:'owner',reviewNote:'verified'},'test'),dealer=await auth.createPortalUser({username:'cart-dealer',password:'password123',role:'dealer',reviewNote:'verified'},'test');
  await pool.query("INSERT INTO colors(code,zh,hex) VALUES('CRT','Test','#000000')");await pool.query("INSERT INTO products(id,kind,name,model,product_type,ownership) VALUES('cart-product','vehicle','Bike','A1','EBI','A1')");await pool.query("INSERT INTO skus(code,product_id,spec,color_code) VALUES('A1-EBI-STD-CRT','cart-product','STD','CRT')");await pool.query("INSERT INTO catalog_publications(product_id,draft,published) VALUES('cart-product','{}','{\"languages\":{\"en\":{\"title\":\"Bike\"}}}')");
  const app=Fastify();const users={owner,other,dealer};app.addHook('onRequest',apiAccessHook({user:async token=>users[token]||null},req=>req.headers['test-session']));registerStorefrontCartRoutes(app,cart);
  assert.equal((await app.inject({method:'GET',url:'/api/portal/storefront/cart'})).statusCode,401);
  assert.equal((await app.inject({method:'GET',url:'/api/portal/storefront/cart',headers:{'test-session':'dealer'}})).statusCode,403);
  assert.equal((await app.inject({method:'GET',url:'/api/portal/storefront/cart',headers:{'test-session':'owner'}})).statusCode,200);await app.close();
  const offer=await catalog.saveOffer({sku:'A1-EBI-STD-CRT',currency:'EUR',unitPrice:'99.00',published:true});const item={productId:'cart-product',sku:'A1-EBI-STD-CRT',currency:'EUR',quantity:2};
  assert.deepEqual(await cart.get(owner),{revision:0,items:[]});assert.equal((await cart.save(owner,{revision:0,items:[item]})).revision,1);assert.deepEqual((await cart.get(other)).items,[]);
  await assert.rejects(cart.get(dealer),/车主账号不可用/);
  const races=await Promise.allSettled([cart.save(owner,{revision:1,items:[{...item,quantity:3}]}),cart.save(owner,{revision:1,items:[{...item,quantity:4}]})]);assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.filter(r=>r.status==='rejected'&&r.reason.statusCode===409).length,1);
  const before=await cart.get(owner);assert(!JSON.stringify(before).includes('99.00'));await catalog.saveOffer({...offer,sku:item.sku,currency:'EUR',published:false},offer.id);
  await assert.rejects(cart.save(owner,{revision:before.revision,items:before.items}),/不可用/);assert.deepEqual(await cart.get(owner),before);
  assert.deepEqual((await cart.save(owner,{revision:before.revision,items:[]})).items,[]);
 }finally{await cart.close();await catalog.close();await auth.close();await pool.end()}
});
