'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const Fastify=require('fastify');
const {apiAccessHook}=require('../access-policy');const {registerPortalRoutes}=require('../portal');
test('storefront dealer center exposes only dealer roles and scoped operations',async t=>{
 const app=Fastify(),calls=[];
 const portal={dealerCenterProfile:async u=>({id:u.id}),dealerCenterCatalog:async()=>[],dealerCenterOrders:async()=>[],createDealerOrder:async(u,b,center)=>{calls.push([u.id,b,center]);return {id:'test'}},respondDealerOrder:async(u,id,b,center)=>{calls.push([u.id,id,b,center]);return {ok:true}},receiveDealerOrder:async()=>({ok:true})};
 const auth={user:async role=>role?{id:'test-'+role,role}:null};
 app.addHook('onRequest',apiAccessHook(auth,r=>r.headers['test-role']));registerPortalRoutes(app,{portal,auth});t.after(()=>app.close());
 const path='/api/portal/dealer/center/';
 for(const role of ['owner','supplier','admin','viewer'])assert.equal((await app.inject({url:path+'profile',headers:{'test-role':role}})).statusCode,403);
 assert.equal((await app.inject(path+'profile')).statusCode,401);
 assert.equal((await app.inject({url:path+'profile',headers:{'test-role':'dealer'}})).statusCode,200);
 assert.equal((await app.inject({method:'POST',url:path+'orders',headers:{'test-role':'dealer'},payload:{items:[]}})).statusCode,201);
 assert.equal(calls[0][2],true);
 assert.equal((await app.inject({url:'/api/portal-management/dealer-orders',headers:{'test-role':'dealer'}})).statusCode,403);
});
