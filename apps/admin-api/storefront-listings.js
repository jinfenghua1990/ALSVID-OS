'use strict';

const { createPool } = require('./db-pool');
const { currentActor } = require('./audit-context');
const { documentOf } = require('./catalog');
const { isUuidv7, uuidv7 } = require('./uuidv7');

function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function sameSkuPrices(current, next) {
  const normalize = rows => JSON.stringify(rows.map(row => ({
    sku: row.sku,
    prices: row.prices.map(price => ({ currency: price.currency, unitPrice: String(price.unitPrice), published: price.published })).sort((a,b) => a.currency.localeCompare(b.currency)),
  })).sort((a,b) => a.sku.localeCompare(b.sku)));
  return normalize(current) === normalize(next);
}
function normalizeListing(input) {
  const channel = typeof input.channel === 'string' ? input.channel.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(channel)) fail('渠道代码无效');
  const document = documentOf(input.document);
  const slug = document.seo?.slug || '';
  if (!slug) fail('请填写 SEO 商品 ID / URL 别名');
  if (!Array.isArray(input.skus) || input.skus.length > 300) fail('商品 SKU 配置无效');
  const seen = new Set();
  const skus = input.skus.map(item => {
    if (!item || typeof item.sku !== 'string' || !item.sku || item.sku.length > 80 || seen.has(item.sku) || !Array.isArray(item.prices) || item.prices.length > 2) fail('商品 SKU 配置无效');
    seen.add(item.sku);
    const currencies = new Set();
    const prices = item.prices.map(price => {
      const amount = typeof price.unitPrice === 'number' || typeof price.unitPrice === 'string' ? String(price.unitPrice).trim() : '';
      if (!['EUR','CNY'].includes(price.currency) || currencies.has(price.currency) || !/^\d+(?:\.\d{1,2})?$/.test(amount) || Number(amount)>100000000 || typeof price.published !== 'boolean') fail('商品价格无效');
      currencies.add(price.currency);
      return { currency: price.currency, unitPrice: amount, published: price.published };
    });
    return { sku:item.sku, prices };
  });
  return { channel, slug, document, skus };
}

function createStorefrontListingStore(url) {
  const pool=createPool(url,{max:3,connectionTimeoutMillis:10000});
  async function load(c,id,lock=false) {
    const row=(await c.query(`SELECT l.id,p.id AS "productId",l.product_uuid AS "productUuid",l.channel,l.slug,l.is_default AS "isDefault",l.draft,l.published,l.revision,l.published_revision AS "publishedRevision",l.legacy_product_market AS "legacyMarket" FROM storefront_listings l JOIN products p ON p.entity_uuid=l.product_uuid WHERE l.id=$1${lock?' FOR UPDATE OF l,p':''}`,[id])).rows[0];
    if(!row)fail('商品不存在',404);
    row.skus=(await c.query(`SELECT s.code AS sku,COALESCE(jsonb_agg(jsonb_build_object('currency',lp.currency,'unitPrice',lp.unit_price::text,'published',lp.published) ORDER BY lp.currency) FILTER(WHERE lp.currency IS NOT NULL),'[]'::jsonb) AS prices FROM storefront_listing_skus ls JOIN skus s ON s.entity_uuid=ls.sku_uuid LEFT JOIN storefront_listing_prices lp ON lp.listing_id=ls.listing_id AND lp.sku_uuid=ls.sku_uuid WHERE ls.listing_id=$1 GROUP BY s.code ORDER BY s.code`,[id])).rows;
    return row;
  }
  async function write(input,id) {
    let candidate=normalizeListing(input);
    if(id&&(!isUuidv7(id)||!Number.isSafeInteger(input.revision)||input.revision<1))fail('商品版本无效');
    const c=await pool.connect();
    try {
      await c.query('BEGIN');
      let before=null, product;
      if(id){
        before=await load(c,id,true);
        if(before.revision!==input.revision)fail('商品已在其他页面更新，请重新加载',409);
        if(before.published&&(candidate.channel!==before.channel||candidate.slug!==before.slug))fail('商品发布中不能修改渠道或 URL 别名；请先下架商品后再修改',409);
        if(before.published&&!sameSkuPrices(before.skus,candidate.skus))fail('商品发布中不能调整 SKU 或价格；请先下架商品后再修改',409);
        product=(await c.query('SELECT id,entity_uuid,status,specs FROM products WHERE entity_uuid=$1 FOR SHARE',[before.productUuid])).rows[0];
      } else {
        if(typeof input.productId!=='string'||!input.productId)fail('请选择关联产品');
        product=(await c.query('SELECT id,entity_uuid,status,specs FROM products WHERE id=$1 FOR UPDATE',[input.productId])).rows[0];
        if(!product)fail('产品不存在',404);
        if(product.status!=='启用')fail('停用产品不能创建商品');
        id=uuidv7();
      }
      const masterSeoId=String(product.specs?._seoProductId||'').trim().toLowerCase();
      if(!before?.published&&candidate.channel==='website'&&masterSeoId&&!/^[a-z][0-9]+-(?:std|ult|pro)-[a-z0-9]+-[a-z0-9]+$/.test(masterSeoId)){
        candidate={...candidate,slug:masterSeoId,document:{...candidate.document,seo:{...candidate.document.seo,slug:masterSeoId}}};
      }
      const detailImageIds=[...new Set(Object.values(candidate.document.languages||{}).flatMap(loc=>(loc.detailBlocks||[]).filter(block=>block.type==='image').map(block=>block.imageId)))];
      const allImageIds=[...new Set([...candidate.document.mediaIds,...detailImageIds])];
      const media=(await c.query("SELECT id FROM product_media WHERE product_id=$1 AND id=ANY($2::text[]) AND content_type IN ('image/jpeg','image/png','image/webp','image/avif')",[product.id,allImageIds])).rows;
      const legacyIds=new Set(media.map(row=>row.id)),assetIds=allImageIds.filter(mediaId=>!legacyIds.has(mediaId));
      const assets=assetIds.length?(await c.query("SELECT id::text AS id FROM media_assets WHERE id::text=ANY($1::text[]) AND kind='image' AND content_type IN ('image/jpeg','image/png','image/webp','image/avif')",[assetIds])).rows:[];
      if(media.length+assets.length!==allImageIds.length)fail('所选图片不存在，请从素材空间重新选择');
      const skuRows=candidate.skus.length?(await c.query('SELECT code,entity_uuid FROM skus WHERE product_uuid=$1 AND code=ANY($2::text[]) FOR SHARE',[product.entity_uuid,candidate.skus.map(row=>row.sku)])).rows:[];
      if(skuRows.length!==candidate.skus.length)fail('所选 SKU 不属于该产品');
      if(before) {
        if(before.published)await c.query('UPDATE storefront_listings SET draft=$1,revision=revision+1,updated_at=now() WHERE id=$2',[JSON.stringify(candidate.document),id]);
        else await c.query('UPDATE storefront_listings SET channel=$1,slug=$2,draft=$3,revision=revision+1,updated_at=now() WHERE id=$4',[candidate.channel,candidate.slug,JSON.stringify(candidate.document),id]);
        if(!before.published){
          await c.query('DELETE FROM storefront_listing_prices WHERE listing_id=$1',[id]);
          await c.query('DELETE FROM storefront_listing_skus WHERE listing_id=$1',[id]);
        }
      } else await c.query('INSERT INTO storefront_listings(id,product_uuid,channel,slug,draft) VALUES($1,$2,$3,$4,$5)',[id,product.entity_uuid,candidate.channel,candidate.slug,JSON.stringify(candidate.document)]);
      if(!before?.published){
        const byCode=new Map(skuRows.map(row=>[row.code,row.entity_uuid]));
        for(const sku of candidate.skus){
          const uuid=byCode.get(sku.sku);
          await c.query('INSERT INTO storefront_listing_skus(listing_id,sku_uuid) VALUES($1,$2)',[id,uuid]);
          for(const price of sku.prices)await c.query('INSERT INTO storefront_listing_prices(listing_id,sku_uuid,currency,unit_price,published) VALUES($1,$2,$3,$4,$5)',[id,uuid,price.currency,price.unitPrice,price.published]);
        }
      }
      const after=await load(c,id);
      await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)',[currentActor(),before?'listing.update':'listing.create',`storefront-listings/${id}`,before?JSON.stringify(before):null,JSON.stringify(after)]);
      await c.query('COMMIT');return after;
    } catch(e){await c.query('ROLLBACK').catch(()=>{});if(e.code==='23505')fail('该渠道的 URL 别名已存在',409);throw e} finally{c.release()}
  }
  async function transition(id,input,publish) {
    if(!isUuidv7(id)||!Number.isSafeInteger(input.revision))fail('商品版本无效');
    const c=await pool.connect();try{await c.query('BEGIN');const before=await load(c,id,true);
      if(before.revision!==input.revision)fail('商品已在其他页面更新，请重新加载',409);
      if(publish){const p=(await c.query('SELECT status FROM products WHERE entity_uuid=$1 FOR SHARE',[before.productUuid])).rows[0];if(p.status!=='启用')fail('请先启用产品');documentOf(before.draft);if(!before.skus.length)fail('请选择至少一个可销售 SKU');}
      else if(!before.published)fail('商品尚未发布');
      await c.query(`UPDATE storefront_listings SET published=${publish?'draft':'NULL'},revision=revision+1,published_revision=${publish?'revision+1':'NULL'},updated_at=now() WHERE id=$1`,[id]);
      const after=await load(c,id);await c.query('INSERT INTO audit_log(actor,action,target,before_json,after_json) VALUES($1,$2,$3,$4,$5)',[currentActor(),publish?'listing.publish':'listing.unpublish',`storefront-listings/${id}`,JSON.stringify(before),JSON.stringify(after)]);await c.query('COMMIT');return after;
    }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
  }
  return {
    async list(productId){const c=await pool.connect();try{const product=(await c.query('SELECT entity_uuid FROM products WHERE id=$1',[productId])).rows[0];if(!product)fail('产品不存在',404);const ids=(await c.query('SELECT id FROM storefront_listings WHERE product_uuid=$1 ORDER BY is_default DESC,created_at,id',[product.entity_uuid])).rows;const rows=[];for(const row of ids)rows.push(await load(c,row.id));return rows}finally{c.release()}},
    create: input=>write(input,null), update:(id,input)=>write(input,id), publish:(id,input)=>transition(id,input,true), unpublish:(id,input)=>transition(id,input,false), close:()=>pool.end(),
  };
}

function registerStorefrontListingRoutes(app,store) {
  const route=(method,url,action)=>app.route({method,url,handler:async(req,reply)=>{if(req.user?.role!=='admin')return reply.code(403).send({error:'仅管理员可管理商品'});if(!store)return reply.code(503).send({error:'商品服务暂不可用'});try{return await action(req,reply)}catch(e){return reply.code(e.statusCode||500).send({error:e.statusCode?e.message:'商品操作失败'})}}});
  route('GET','/api/products/:id/listings',req=>store.list(req.params.id));
  route('POST','/api/storefront/listings',(req,reply)=>store.create(req.body||{}).then(row=>reply.code(201).send(row)));
  route('PUT','/api/storefront/listings/:id',req=>store.update(req.params.id,req.body||{}));
  route('POST','/api/storefront/listings/:id/publish',req=>store.publish(req.params.id,req.body||{}));
  route('POST','/api/storefront/listings/:id/unpublish',req=>store.unpublish(req.params.id,req.body||{}));
}

module.exports={normalizeListing,createStorefrontListingStore,registerStorefrontListingRoutes};
