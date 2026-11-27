'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Fastify=require('fastify');
const {registerAssetLibraryRoutes}=require('../asset-library');const {apiAccessHook}=require('../access-policy');
test('dealer downloads and notices use dedicated routes, not the internal asset library',async t=>{
 const app=Fastify(),calls=[];t.after(()=>app.close());
 app.addHook('onRequest',apiAccessHook({user:async role=>role?{role,id:'test-'+role}:null},r=>r.headers['test-role']));
 registerAssetLibraryRoutes(app,{dealerResources:async u=>({id:u.id}),dealerNotices:async u=>({id:u.id}),dealerPublications:async()=>[],setDealerPublication:async(id,b)=>{calls.push([id,b]);return {ok:true}}});
 const prefix='/api/portal/dealer/center/';
 for(const path of ['resources','notices']){
  assert.equal((await app.inject(prefix+path)).statusCode,401);
  for(const role of ['owner','admin','viewer','supplier'])assert.equal((await app.inject({url:prefix+path,headers:{'test-role':role}})).statusCode,403);
  assert.equal((await app.inject({url:prefix+path,headers:{'test-role':'dealer'}})).statusCode,200);
 }
 assert.equal((await app.inject({url:'/api/assets',headers:{'test-role':'dealer'}})).statusCode,403);
 assert.equal((await app.inject({method:'POST',url:'/api/portal-management/dealer-resources/test',headers:{'test-role':'dealer'},payload:{enabled:true}})).statusCode,403);
 assert.equal((await app.inject({method:'POST',url:'/api/portal-management/dealer-resources/test',headers:{'test-role':'admin'},payload:{enabled:true}})).statusCode,200);
 assert.equal(calls.length,1);
});
