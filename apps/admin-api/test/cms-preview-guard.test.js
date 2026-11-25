'use strict';
// UNIT_TEST_NO_DATABASE
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Fastify=require('fastify');
const {registerCmsRoutes}=require('../cms');
test('public CMS endpoints never expose draft or historical snapshots to anonymous visitors',async t=>{
 const app=Fastify();t.after(()=>app.close());
 app.addHook('onRequest',async req=>{if(req.headers['x-test-admin']==='yes')req.user={role:'admin'}});
 const cms={publicPage:async()=>({ok:true}),publicProductTemplate:async()=>({ok:true})};
 registerCmsRoutes(app,cms);
 for(const url of ['/api/cms/pages/public?locale=de&path=/test','/api/cms/product-template?locale=de']){
  assert.equal((await app.inject(url)).statusCode,200);
  for(const query of ['&draft=1','&version=1']){
   assert.equal((await app.inject(url+query)).statusCode,403);
   const admin=await app.inject({url:url+query,headers:{'x-test-admin':'yes'}});
   assert.equal(admin.statusCode,200);
   assert.equal(admin.headers['cache-control'],'no-store');
  }
 }
});
