'use strict';
const {createPool}=require('./db-pool');
const {uuidv7,isUuidv7}=require('./uuidv7');
const {normalizeTemplate,calculateShipping}=require('./shipping-rate-engine');
function fail(message,statusCode=400){throw Object.assign(new Error(message),{statusCode})}
function asTemplate(row){return {...row.config,id:row.id,revision:row.revision,createdAt:row.created_at}}
function createShippingRateTemplates(url){
 const pool=createPool(url,{max:2,connectionTimeoutMillis:10000});
 return {
   async list(){const {rows}=await pool.query('SELECT DISTINCT ON(id) id,revision,config,created_at FROM shipping_rate_template_versions ORDER BY id,revision DESC');return rows.map(asTemplate)},
   async history(id){if(!isUuidv7(id))fail('模板编号无效');const {rows}=await pool.query('SELECT id,revision,config,created_at FROM shipping_rate_template_versions WHERE id=$1 ORDER BY revision DESC',[id]);return rows.map(asTemplate)},
   async save(id,input,actor){
     const template=normalizeTemplate(input),expected=input.revision??0;
     if(!Number.isSafeInteger(expected)||expected<0||(id&&!isUuidv7(id))||(!id&&expected!==0))fail('模板版本无效');
     id=id||uuidv7();
     const c=await pool.connect();
     try{
       await c.query('BEGIN');
       await c.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[id]);
       const old=(await c.query('SELECT revision FROM shipping_rate_template_versions WHERE id=$1 ORDER BY revision DESC LIMIT 1',[id])).rows[0];
       if((old?.revision??0)!==expected)fail('模板已更新，请重新读取',409);
       const warehouse=(await c.query("SELECT id FROM warehouses WHERE id=$1 AND status='启用' AND business_types ? 'B2C' FOR SHARE",[template.warehouseId])).rows[0];
       if(template.enabled&&!warehouse)fail('请选择已启用且具备 B2C 履约能力的仓库',409);
       const result=(await c.query('INSERT INTO shipping_rate_template_versions(id,revision,warehouse_id,config,created_by) VALUES($1,$2,$3,$4,$5) RETURNING id,revision,config,created_at',[id,expected+1,template.warehouseId,JSON.stringify(template),String(actor||'').slice(0,160)])).rows[0];
       await c.query('COMMIT');return asTemplate(result);
     }catch(error){await c.query('ROLLBACK').catch(()=>{});throw error}finally{c.release()}
   },
   async preview(input){const templates=await this.list();return calculateShipping({templates,lines:input.lines,destination:input.destination})},
   close:()=>pool.end()
 };
}
function registerShippingRateTemplateRoutes(app,store){
 const handler=action=>async(req,reply)=>{
   reply.header('Cache-Control','no-store');
   if(req.user?.role!=='admin')return reply.code(403).send({error:'仅管理员可操作运费模板'});
   if(!store)return reply.code(503).send({error:'运费模板服务不可用'});
   try{return await action(req)}catch(error){
     const status=error.code==='42P01'?503:error.statusCode||500;
     return reply.code(status).send({error:error.code==='42P01'?'运费模板数据库迁移尚未执行':error.statusCode?error.message:'运费模板操作失败'});
   }
 };
 app.get('/api/shipping-rate-templates',handler(()=>store.list()));
 app.get('/api/shipping-rate-templates/:id/history',handler(req=>store.history(req.params.id)));
 app.post('/api/shipping-rate-templates',handler(req=>store.save(null,req.body||{},req.user.id)));
 app.put('/api/shipping-rate-templates/:id',handler(req=>store.save(req.params.id,req.body||{},req.user.id)));
 // Admin simulation only, never a payable customer quote.
 app.post('/api/shipping-rate-templates/preview',handler(req=>store.preview(req.body||{})));
}
module.exports={createShippingRateTemplates,registerShippingRateTemplateRoutes};
