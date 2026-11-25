'use strict';
// 官网商城评价：买家签收后一单一评，卖家可回复与隐藏。
// 评价不改动订单、库存与资金状态，只是售后口碑记录。
const {createPool}=require('./db-pool');
const {currentActor}=require('./audit-context');
const {isUuidv7}=require('./uuidv7');

function fail(message,statusCode=400){throw Object.assign(Error(message),{statusCode})}
function text(value,max){return typeof value==='string'?value.trim().slice(0,max):''}

const BUCKETS={
  all:'TRUE',
  pending:'r.reply IS NULL AND NOT r.hidden',
  replied:'r.reply IS NOT NULL AND NOT r.hidden',
  bad:'r.rating<=2 AND NOT r.hidden',
  hidden:'r.hidden'
};

function createStorefrontReviews(url){
  const pool=createPool(url,{max:2,connectionTimeoutMillis:10000});
  const projection=`r.id,r.order_id AS "orderId",r.rating,r.content,r.reply,r.replied_at AS "repliedAt",r.replied_by AS "repliedBy",r.hidden,r.created_at AS "createdAt",u.username,o.currency,o.subtotal_minor::text AS "subtotalMinor",o.items,o.delivery,o.status AS "orderStatus"`;

  // 卖家账号：app_users.id -> entity_uuid（与订单模块一致的门户账号模型）
  async function owner(c,id){const u=(await c.query("SELECT entity_uuid FROM app_users WHERE id=$1 AND role='owner' AND enabled FOR SHARE",[id])).rows[0];if(!u)fail('车主账号不可用',403);return u.entity_uuid}

  async function summary(c){const row=(await c.query(`SELECT count(*)::int AS total,count(*) FILTER (WHERE r.reply IS NULL AND NOT r.hidden)::int AS pending,count(*) FILTER (WHERE r.reply IS NOT NULL AND NOT r.hidden)::int AS replied,count(*) FILTER (WHERE r.rating<=2 AND NOT r.hidden)::int AS bad,count(*) FILTER (WHERE r.hidden)::int AS hidden,count(*) FILTER (WHERE NOT r.hidden)::int AS visible,COALESCE(round(avg(r.rating) FILTER (WHERE NOT r.hidden)::numeric,2),0)::text AS average,count(*) FILTER (WHERE r.rating>=4 AND NOT r.hidden)::int AS good FROM storefront_reviews r`)).rows[0];return row}

  return {
    // 后台列表：状态分组 + 关键词 + 分页
    async adminList({page=1,status='all',q=''}={}){
      const bucket=BUCKETS[status]||BUCKETS.all;
      const keyword=q.trim();
      const params=[];
      let where=`(${bucket})`;
      if(keyword){params.push('%'+keyword+'%');where+=` AND (r.content ILIKE $${params.length} OR COALESCE(r.reply,'') ILIKE $${params.length} OR u.username ILIKE $${params.length} OR r.order_id::text ILIKE $${params.length})`}
      const offset=(page-1)*20;
      const rows=(await pool.query(`SELECT ${projection} FROM storefront_reviews r JOIN app_users u ON u.entity_uuid=r.owner_user_uuid JOIN storefront_orders o ON o.id=r.order_id WHERE ${where} ORDER BY r.created_at DESC,r.id DESC LIMIT 21 OFFSET $${params.length+1}`,[...params,offset])).rows;
      const counts=await summary(pool);
      return {items:rows.slice(0,20),hasMore:rows.length>20,counts};
    },

    async adminCounts(){return summary(pool)},

    // 卖家回复（可修改；修改后记录审计）
    async reply(id,input){
      if(!isUuidv7(id))fail('评价编号无效');
      const reply=text(input.reply,2000);
      if(!reply)fail('请填写回复内容');
      const c=await pool.connect();
      try{
        await c.query('BEGIN');
        const row=(await c.query('SELECT id,reply FROM storefront_reviews WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!row)fail('评价不存在',404);
        if(row.reply===reply){await c.query('COMMIT');return {id,reply,replayed:true}}
        await c.query('UPDATE storefront_reviews SET reply=$1,replied_by=$2,replied_at=now() WHERE id=$3',[reply,currentActor(),id]);
        await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',[currentActor(),'storefront.review.reply',`storefront-reviews/${id}`,JSON.stringify({replaced:Boolean(row.reply),length:reply.length})]);
        await c.query('COMMIT');
        return {id,reply};
      }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
    },

    // 卖家隐藏/恢复展示
    async setVisibility(id,input){
      if(!isUuidv7(id)||typeof input.hidden!=='boolean')fail('显示设置无效');
      const c=await pool.connect();
      try{
        await c.query('BEGIN');
        const row=(await c.query('SELECT id,hidden FROM storefront_reviews WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!row)fail('评价不存在',404);
        if(row.hidden===input.hidden){await c.query('COMMIT');return {id,hidden:row.hidden,replayed:true}}
        await c.query('UPDATE storefront_reviews SET hidden=$1 WHERE id=$2',[input.hidden,id]);
        await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',[currentActor(),'storefront.review.visibility',`storefront-reviews/${id}`,JSON.stringify({hidden:input.hidden})]);
        await c.query('COMMIT');
        return {id,hidden:input.hidden};
      }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
    },

    // 买家提交评价：仅本人已签收订单，一单一评
    async submit(user,orderId,input){
      if(!isUuidv7(orderId))fail('订单编号无效');
      if(!isUuidv7(input.id))fail('评价编号无效');
      const rating=Number(input.rating);
      if(!Number.isInteger(rating)||rating<1||rating>5)fail('请选择 1-5 星评分');
      const content=text(input.content,2000);
      const reviewId=input.id.toLowerCase();
      const c=await pool.connect();
      try{
        await c.query('BEGIN');
        const uid=await owner(c,user.id);
        const order=(await c.query('SELECT id,status FROM storefront_orders WHERE id=$1 AND owner_user_uuid=$2 FOR SHARE',[orderId,uid])).rows[0];
        if(!order)fail('订单不存在',404);
        const prior=(await c.query('SELECT id,rating,content FROM storefront_reviews WHERE order_id=$1',[orderId])).rows[0];
        if(prior){
          if(prior.id===reviewId&&prior.rating===rating&&prior.content===content){await c.query('COMMIT');return {id:prior.id,rating,content,replayed:true}}
          fail('该订单已评价',409);
        }
        if(order.status!=='delivered')fail('订单签收后才能评价',409);
        await c.query('INSERT INTO storefront_reviews(id,order_id,owner_user_uuid,rating,content) VALUES($1,$2,$3,$4,$5)',[reviewId,orderId,uid,rating,content]);
        await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',[currentActor(),'storefront.review.submit',`storefront-orders/${orderId}`,JSON.stringify({reviewId,rating})]);
        await c.query('COMMIT');
        return {id:reviewId,rating,content};
      }catch(e){await c.query('ROLLBACK').catch(()=>{});throw e}finally{c.release()}
    },

    // 公开展示：只出未隐藏评价，隐去买家账号只留脱敏用户名
    async publicList(limit=20,productId=null){
      const size=Number.isSafeInteger(limit)&&limit>0&&limit<=50?limit:20;
      if(productId!==null&&!isUuidv7(productId))fail('商品编号无效');
      const params=productId===null?[size]:[size,productId];
      const productFilter=productId===null?'':` AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.items) item WHERE item->>'productId'=$2)`;
      const rows=(await pool.query(`SELECT r.id,r.rating,r.content,r.reply,r.replied_at AS "repliedAt",r.created_at AS "createdAt",o.items FROM storefront_reviews r JOIN storefront_orders o ON o.id=r.order_id WHERE NOT r.hidden${productFilter} ORDER BY r.created_at DESC,r.id DESC LIMIT $1`,params)).rows;
      const countFilter=productId===null?'':` AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.items) item WHERE item->>'productId'=$1)`;
      const countRows=(await pool.query(`SELECT count(*)::int AS total,COALESCE(round(avg(r.rating)::numeric,2),0)::text AS average,count(*) FILTER(WHERE r.rating>=4)::int AS good,jsonb_build_object('1',count(*) FILTER(WHERE r.rating=1),'2',count(*) FILTER(WHERE r.rating=2),'3',count(*) FILTER(WHERE r.rating=3),'4',count(*) FILTER(WHERE r.rating=4),'5',count(*) FILTER(WHERE r.rating=5)) AS distribution FROM storefront_reviews r JOIN storefront_orders o ON o.id=r.order_id WHERE NOT r.hidden${countFilter}`,productId===null?[]:[productId])).rows[0];
      return {items:rows.map(row=>({...row,items:(row.items||[]).filter(item=>productId===null||item.productId===productId).map(item=>({productId:item.productId,productName:item.productNames?.zh||item.productName,sku:item.sku}))})),counts:{average:countRows.average,total:countRows.total,distribution:countRows.distribution,goodRate:countRows.total?Math.round(countRows.good*100/countRows.total):0}};
    },

    close:()=>pool.end()
  };
}

function registerStorefrontReviewRoutes(app,reviews){
  const guard=(req,reply)=>req.user?.role!=='admin'?(reply.code(403).send({error:'仅管理员可管理评价'}),false):true;

  app.get('/api/storefront/reviews',async(req,reply)=>{
    reply.header('Cache-Control','no-store');
    if(!guard(req,reply))return;
    if(!reviews)return reply.code(503).send({error:'评价服务不可用'});
    const page=Number(req.query.page||1);
    if(!Number.isSafeInteger(page)||page<1||page>10000)return reply.code(400).send({error:'页码无效'});
    const status=typeof req.query.status==='string'&&req.query.status?req.query.status:'all';
    const q=typeof req.query.q==='string'?req.query.q.slice(0,120):'';
    try{const result=await reviews.adminList({page,status,q});reply.header('X-Has-More',String(result.hasMore));return result}
    catch(_){return reply.code(500).send({error:'评价读取失败'})}
  });

  app.post('/api/storefront/reviews/:id/reply',async(req,reply)=>{
    reply.header('Cache-Control','no-store');
    if(!guard(req,reply))return;
    if(!reviews)return reply.code(503).send({error:'评价服务不可用'});
    try{return await reviews.reply(req.params.id,req.body||{})}
    catch(e){return reply.code(e.statusCode||500).send({error:e.statusCode?e.message:'回复失败'})}
  });

  app.post('/api/storefront/reviews/:id/visibility',async(req,reply)=>{
    reply.header('Cache-Control','no-store');
    if(!guard(req,reply))return;
    if(!reviews)return reply.code(503).send({error:'评价服务不可用'});
    try{return await reviews.setVisibility(req.params.id,req.body||{})}
    catch(e){return reply.code(e.statusCode||500).send({error:e.statusCode?e.message:'设置失败'})}
  });

  app.post('/api/portal/storefront/orders/:id/reviews',{config:{portalRoles:['owner']}},async(req,reply)=>{
    reply.header('Cache-Control','no-store');
    if(!reviews)return reply.code(503).send({error:'评价服务不可用'});
    try{return await reviews.submit(req.user,req.params.id,req.body||{})}
    catch(e){return reply.code(e.statusCode||500).send({error:e.statusCode?e.message:'评价提交失败'})}
  });

  app.get('/api/site/reviews',{config:{publicCatalog:true}},async(req,reply)=>{
    reply.header('Cache-Control','public, max-age=120');
    if(!reviews)return reply.code(503).send({error:'评价服务不可用'});
    const productId=typeof req.query.productId==='string'?req.query.productId:null;
    if(productId!==null&&!isUuidv7(productId))return reply.code(400).send({error:'商品编号无效'});
    try{return await reviews.publicList(Number(req.query.limit||20),productId)}
    catch(_){return reply.code(500).send({error:'评价读取失败'})}
  });
}

module.exports={createStorefrontReviews,registerStorefrontReviewRoutes};
