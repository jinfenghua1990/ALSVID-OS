const { createPool } = require('./db-pool');
const { uuidv7, isUuidv7 } = require('./uuidv7');
const { currentActor } = require('./audit-context');
const fail=(message,statusCode=400)=>{throw Object.assign(Error(message),{statusCode})};

function createTestRideAssignments(url) {
  const pool=createPool(url,{max:2});
  async function transaction(fn){const client=await pool.connect();try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result}catch(e){await client.query('ROLLBACK').catch(()=>{});throw e}finally{client.release()}}
  return {
    async get(id){if(!isUuidv7(id))fail('试骑意向编号无效');const row=(await pool.query('SELECT id,country_code AS country,status,version,assigned_location_id AS "locationId" FROM test_ride_enquiries WHERE id=$1',[id])).rows[0];if(!row)fail('试骑意向不存在',404);return row},
    async list(){return (await pool.query(`SELECT l.id,l.name,l.country_code AS country,l.city,l.approved_for_publication AS "approvedForPublication",l.authorization_active AS "authorizationActive",
      a.dealer_company_id AS "dealerCompanyId",a.partner_active AS "partnerActive",a.dealer_authorized AS "dealerAuthorized",a.test_ride_authorized AS "testRideAuthorized",a.revision
      FROM public_locations l LEFT JOIN test_ride_location_authorizations a ON a.location_id=l.id ORDER BY l.country_code,l.city,l.name,l.id`)).rows},
    async authorize(id,input){
      if(!isUuidv7(id)||!isUuidv7(input?.dealerCompanyId)||!Number.isSafeInteger(input.revision)||input.revision<0||['partnerActive','dealerAuthorized','testRideAuthorized'].some(k=>typeof input[k]!=='boolean'))fail('试骑授权资料无效');
      return transaction(async c=>{
        const location=(await c.query('SELECT approved_for_publication,authorization_active FROM public_locations WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!location)fail('网点不存在',404);
        const old=(await c.query('SELECT revision,dealer_company_id FROM test_ride_location_authorizations WHERE location_id=$1 FOR UPDATE',[id])).rows[0];
        if((old?.revision||0)!==input.revision)fail('授权已更新，请刷新后重试',409);
        if(!(await c.query('SELECT 1 FROM dealer_companies WHERE id=$1',[input.dealerCompanyId])).rowCount)fail('经销商企业不存在',404);
        if(input.testRideAuthorized&&(!location.approved_for_publication||!location.authorization_active||!input.partnerActive||!input.dealerAuthorized))fail('网点或经销商未具备试骑授权条件',409);
        const params=[id,input.dealerCompanyId,input.partnerActive,input.dealerAuthorized,input.testRideAuthorized];
        const result=old?await c.query('UPDATE test_ride_location_authorizations SET dealer_company_id=$2,partner_active=$3,dealer_authorized=$4,test_ride_authorized=$5,revision=revision+1,updated_at=now() WHERE location_id=$1 RETURNING revision',params):await c.query('INSERT INTO test_ride_location_authorizations(location_id,dealer_company_id,partner_active,dealer_authorized,test_ride_authorized) VALUES($1,$2,$3,$4,$5) RETURNING revision',params);
        if(!input.testRideAuthorized||!input.partnerActive||!input.dealerAuthorized||(old&&old.dealer_company_id!==input.dealerCompanyId)){
          const cleared=(await c.query("UPDATE test_ride_enquiries SET assigned_location_id=NULL,version=version+1,updated_at=now() WHERE assigned_location_id=$1 AND status IN ('NEW','REVIEWING','CONTACTED') RETURNING id",[id])).rows;
          for(const row of cleared)await c.query('INSERT INTO test_ride_assignment_events(id,enquiry_id,previous_location_id,location_id,actor) VALUES($1,$2,$3,NULL,$4)',[uuidv7(),row.id,id,currentActor()]);
        }
        await c.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)',[currentActor(),'test_ride.location_authorize',`public-locations/${id}`,JSON.stringify({revision:result.rows[0].revision,testRideAuthorized:input.testRideAuthorized})]);
        return result.rows[0];
      });
    },
    async assign(id,input){
      if(!isUuidv7(id)||!(input?.locationId===null||isUuidv7(input?.locationId))||!Number.isSafeInteger(input.version)||input.version<1)fail('试骑分配资料无效');
      return transaction(async c=>{
        if(input.locationId){
          const eligible=(await c.query(`SELECT l.id,l.country_code FROM public_locations l JOIN test_ride_location_authorizations a ON a.location_id=l.id
            WHERE l.id=$1 AND l.approved_for_publication AND l.authorization_active AND a.partner_active AND a.dealer_authorized AND a.test_ride_authorized FOR UPDATE OF l,a`,[input.locationId])).rows[0];
          if(!eligible)fail('网点未获得试骑授权',409);
          const ride=(await c.query('SELECT country_code,status,version,assigned_location_id FROM test_ride_enquiries WHERE id=$1 FOR UPDATE',[id])).rows[0];
          if(!ride)fail('试骑意向不存在',404);if(ride.version!==input.version)fail('记录已更新，请刷新后重试',409);if(ride.status==='CLOSED'||ride.country_code!==eligible.country_code)fail('网点地区或意向状态不匹配',409);
          if(ride.assigned_location_id===input.locationId)return {version:ride.version};
          const after=(await c.query('UPDATE test_ride_enquiries SET assigned_location_id=$2,version=version+1,updated_at=now() WHERE id=$1 RETURNING version',[id,input.locationId])).rows[0];
          await c.query('INSERT INTO test_ride_assignment_events(id,enquiry_id,previous_location_id,location_id,actor) VALUES($1,$2,$3,$4,$5)',[uuidv7(),id,ride.assigned_location_id,input.locationId,currentActor()]);return after;
        }
        const ride=(await c.query('SELECT status,version,assigned_location_id FROM test_ride_enquiries WHERE id=$1 FOR UPDATE',[id])).rows[0];
        if(!ride)fail('试骑意向不存在',404);if(ride.version!==input.version)fail('记录已更新，请刷新后重试',409);if(ride.status==='CLOSED')fail('已关闭意向不能调整分配',409);
        if(!ride.assigned_location_id)return {version:ride.version};
        const after=(await c.query('UPDATE test_ride_enquiries SET assigned_location_id=NULL,version=version+1,updated_at=now() WHERE id=$1 RETURNING version',[id])).rows[0];
        await c.query('INSERT INTO test_ride_assignment_events(id,enquiry_id,previous_location_id,location_id,actor) VALUES($1,$2,$3,NULL,$4)',[uuidv7(),id,ride.assigned_location_id,currentActor()]);return after;
      });
    },close:()=>pool.end(),
  };
}
function registerTestRideAssignmentRoutes(app,store){
  const route=(method,url,handler)=>app.route({method,url,handler:async(req,reply)=>{
    if(req.user?.role!=='admin')return reply.code(403).send({error:'仅管理员可管理试骑分配'});
    if(!store)return reply.code(503).send({error:'试骑分配暂不可用'});
    try{return {data:await handler(req)}}catch(e){return reply.code(e.statusCode||503).send({error:e.statusCode?e.message:'试骑分配暂不可用'})}
  }});
  route('GET','/api/test-ride-locations',()=>store.list());
  route('GET','/api/test-rides/:id/assignment',req=>store.get(req.params.id));
  route('PUT','/api/test-ride-locations/:id/authorization',req=>store.authorize(req.params.id,req.body||{}));
  route('PUT','/api/test-rides/:id/assignment',req=>store.assign(req.params.id,req.body||{}));
}
module.exports={createTestRideAssignments,registerTestRideAssignmentRoutes};
