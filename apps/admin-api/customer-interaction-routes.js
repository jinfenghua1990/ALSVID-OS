'use strict';
function registerCustomerInteractionRoutes(app,customers,customerError){
 const allowed=(req,reply)=>{if(req.user.role!=='admin'){reply.code(403).send({error:'仅管理员可查看和维护沟通记录'});return false}if(!customers){reply.code(503).send({error:'客户服务不可用'});return false}return true};
 app.get('/api/customer-followups',async(req,reply)=>{if(!allowed(req,reply))return;try{return await customers.pendingFollowups()}catch(e){return customerError(e,reply)}});
 app.get('/api/customers/:id/interactions',async(req,reply)=>{if(!allowed(req,reply))return;try{return await customers.interactions(req.params.id)}catch(e){return customerError(e,reply)}});
 app.post('/api/customers/:id/interactions',async(req,reply)=>{if(!allowed(req,reply))return;try{return reply.code(201).send(await customers.addInteraction(req.params.id,req.body||{}))}catch(e){return customerError(e,reply)}});
 app.post('/api/customers/:id/interactions/:interactionId/changes',async(req,reply)=>{if(!allowed(req,reply))return;try{return await customers.changeFollowup(req.params.id,req.params.interactionId,req.body||{})}catch(e){return customerError(e,reply)}});
 app.post('/api/customers/:id/interactions/:interactionId/complete',async(req,reply)=>{if(!allowed(req,reply))return;try{return await customers.completeFollowup(req.params.id,req.params.interactionId,req.body||{})}catch(e){return customerError(e,reply)}});
}
module.exports={registerCustomerInteractionRoutes};
