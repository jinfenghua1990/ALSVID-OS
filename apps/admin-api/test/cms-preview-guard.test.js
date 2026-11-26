'use strict';
// UNIT_TEST_NO_DATABASE
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Fastify=require('fastify');
const {registerCmsRoutes}=require('../cms');

test('public CMS endpoints protect draft and historical snapshots from every non-admin role before reading data',async t=>{
 const app=Fastify();t.after(()=>app.close());
 app.addHook('onRequest',async req=>{
  const role=req.headers['x-test-role'];
  if(role)req.user={role};
 });
 const calls=[];
 const cms={
  publicPage:async(...args)=>{calls.push(['page',...args]);return {ok:true}},
  publicProductTemplate:async(...args)=>{calls.push(['template',...args]);return {ok:true}},
 };
 registerCmsRoutes(app,cms);
 for(const [url,method] of [
  ['/api/cms/pages/public?locale=de&path=/test','page'],
  ['/api/cms/product-template?locale=de','template'],
 ]){
  const published=await app.inject(url);
  assert.equal(published.statusCode,200);
  assert.deepEqual(calls.at(-1).at(-1),{draft:false,version:null});
  for(const [query,draft,version] of [
   ['&draft=1',true,null],
   ['&version=1',false,1],
   ['&draft=1&version=2',true,2],
  ]){
   for(const role of [null,'viewer','owner','dealer']){
    const before=calls.length;
    const response=await app.inject({url:url+query,headers:role?{'x-test-role':role}:{}});
    assert.equal(response.statusCode,403,url+query+' role='+role);
    assert.equal(calls.length,before,'unauthorized preview must never reach CMS storage');
    assert.equal(response.json().ok,undefined);
   }
   const before=calls.length;
   const admin=await app.inject({url:url+query,headers:{'x-test-role':'admin'}});
   assert.equal(admin.statusCode,200);
   assert.equal(admin.headers['cache-control'],'no-store');
   assert.equal(calls.length,before+1);
   assert.equal(calls.at(-1)[0],method);
   assert.deepEqual(calls.at(-1).at(-1),{draft,version});
  }
 }
});
