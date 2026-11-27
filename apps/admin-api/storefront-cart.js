'use strict';
const {createPool}=require('./db-pool');
const {createHash}=require('node:crypto');
const {isUuidv7}=require('./uuidv7');
function fail(message,statusCode=400,code){throw Object.assign(Error(message),{statusCode,code})}
function assertCartAccount(user,input){if(input.expectedAccountId!==undefined&&input.expectedAccountId!==String(user.id))fail('登录账号已变化，请重新载入购物车',409);}
function mergeCartItems(account,guest){
 const rows=new Map();
 for(const item of [...account,...guest]){
  const k=JSON.stringify([item.productId,item.sku,item.currency]),quantity=(rows.get(k)?.quantity||0)+item.quantity;
  if(quantity>100)fail('merge_limit',409,'CART_MERGE_REJECTED');
  rows.set(k,{productId:item.productId,sku:item.sku,currency:item.currency,quantity});
 }
 if(rows.size>50)fail('merge_limit',409,'CART_MERGE_REJECTED');
 return [...rows.values()];
}
function mergeFingerprint(items){
 const canonical=items.map(x=>[x.productId,x.sku,x.currency,x.quantity]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
function createStorefrontCart(url){
 const pool=createPool(url,{max:2,connectionTimeoutMillis:10000});
 async function owner(c,userId){const row=(await c.query("SELECT entity_uuid FROM app_users WHERE id=$1 AND role='owner' AND enabled FOR SHARE",[userId])).rows[0];if(!row)fail('车主账号不可用',403);return row.entity_uuid}
 async function entries(c,id){return (await c.query('SELECT p.id AS "productId",s.code AS sku,i.currency,i.quantity FROM storefront_cart_items i JOIN skus s ON s.entity_uuid=i.sku_uuid JOIN products p ON p.entity_uuid=s.product_uuid WHERE i.cart_id=$1 ORDER BY p.id,s.code,i.currency',[id])).rows}
 return {
  async get(user){const c=await pool.connect();try{await c.query('BEGIN');const uid=await owner(c,user.id);const cart=(await c.query('SELECT id,revision FROM storefront_carts WHERE owner_user_uuid=$1 FOR SHARE',[uid])).rows[0];const result=cart?{revision:cart.revision,items:await entries(c,cart.id)}:{revision:0,items:[]};await c.query('COMMIT');return result}catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}},
  async save(user,input){assertCartAccount(user,input);let items=input.items;const merging=input.mergeId!==undefined;
   if(merging&&(!isUuidv7(input.mergeId)||input.expectedAccountId!==String(user.id)||!Array.isArray(items)||items.length===0))fail('购物车合并资料无效');
   if((!merging&&(!Number.isSafeInteger(input.revision)||input.revision<0))||!Array.isArray(items)||items.length>50)fail('购物车资料无效');const seen=new Set();for(const x of items){if(!x||typeof x.productId!=='string'||!x.productId||x.productId.length>160||typeof x.sku!=='string'||!x.sku||x.sku.length>80||!['EUR','CNY'].includes(x.currency)||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>100)fail('购物车资料无效');const key=JSON.stringify([x.productId,x.sku,x.currency]);if(seen.has(key))fail('购物车商品重复');seen.add(key)}
   const c=await pool.connect();try{await c.query('BEGIN');const uid=await owner(c,user.id);await c.query('INSERT INTO storefront_carts(owner_user_uuid) VALUES($1) ON CONFLICT(owner_user_uuid) DO NOTHING',[uid]);const cart=(await c.query('SELECT id,revision FROM storefront_carts WHERE owner_user_uuid=$1 FOR UPDATE',[uid])).rows[0];if(merging){
     const hash=mergeFingerprint(items);
     // The global batch ID prevents an acknowledged or lost-response batch from being replayed into another account.
     const claim=(await c.query('INSERT INTO storefront_cart_merges(id,cart_id,request_hash) VALUES($1,$2,$3) ON CONFLICT(id) DO NOTHING RETURNING id',[input.mergeId,cart.id,hash])).rows[0];
     if(!claim){
      const prior=(await c.query('SELECT cart_id,request_hash FROM storefront_cart_merges WHERE id=$1',[input.mergeId])).rows[0];
      if(!prior||prior.cart_id!==cart.id||prior.request_hash!==hash)fail('购物车合并编号已使用',409);
      const result={revision:cart.revision,items:await entries(c,cart.id),mergeId:input.mergeId};await c.query('COMMIT');return result;
     }
     items=mergeCartItems(await entries(c,cart.id),items);
    }else if(cart.revision!==input.revision)fail('购物车已在其他设备更新，请重新载入',409);
    const resolved=[];for(const item of items){const offer=(await c.query("SELECT s.entity_uuid FROM products p JOIN skus s ON s.product_uuid=p.entity_uuid WHERE p.id=$1 AND s.code=$2 AND p.status='启用' AND NOT s.disabled AND (EXISTS(SELECT 1 FROM storefront_listings l JOIN storefront_listing_skus ls ON ls.listing_id=l.id AND ls.sku_uuid=s.entity_uuid JOIN storefront_listing_prices lp ON lp.listing_id=l.id AND lp.sku_uuid=s.entity_uuid WHERE l.product_uuid=p.entity_uuid AND l.channel='website' AND l.published IS NOT NULL AND lp.currency=$3 AND lp.published) OR EXISTS(SELECT 1 FROM storefront_offers o JOIN catalog_publications cp ON cp.product_id=p.id WHERE o.sku_uuid=s.entity_uuid AND o.currency=$3 AND o.published AND cp.published IS NOT NULL AND NOT EXISTS(SELECT 1 FROM storefront_listings w WHERE w.product_uuid=p.entity_uuid AND w.channel='website'))) FOR SHARE OF p,s",[item.productId,item.sku,item.currency])).rows[0];if(!offer)fail('购物车中有商品或价格已不可用，请移除后重试',409,merging?'CART_MERGE_REJECTED':undefined);resolved.push({...item,skuUuid:offer.entity_uuid})}
    await c.query('DELETE FROM storefront_cart_items WHERE cart_id=$1',[cart.id]);for(const x of resolved)await c.query('INSERT INTO storefront_cart_items(cart_id,sku_uuid,currency,quantity) VALUES($1,$2,$3,$4)',[cart.id,x.skuUuid,x.currency,x.quantity]);const revision=(await c.query('UPDATE storefront_carts SET revision=revision+1,updated_at=now() WHERE id=$1 RETURNING revision',[cart.id])).rows[0].revision;const result={revision,items:await entries(c,cart.id),...(merging?{mergeId:input.mergeId}:{})};await c.query('COMMIT');return result;
   }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
  },close:()=>pool.end()
 };
}
function registerStorefrontCartRoutes(app,cart){for(const method of ['GET','PUT'])app.route({method,url:'/api/portal/storefront/cart',config:{portalRoles:['owner']},bodyLimit:32768,handler:async(req,reply)=>{reply.header('Cache-Control','no-store');if(!cart)return reply.code(503).send({error:'购物车服务不可用'});try{if(method==='GET')assertCartAccount(req.user,req.query||{});return method==='GET'?await cart.get(req.user):await cart.save(req.user,req.body||{})}catch(e){return reply.code(e.statusCode||500).send({error:e.statusCode?e.message:'购物车操作失败',...(e.code==='CART_MERGE_REJECTED'?{code:e.code}:{})})}}})}
module.exports={createStorefrontCart,registerStorefrontCartRoutes,assertCartAccount,mergeCartItems,mergeFingerprint};
