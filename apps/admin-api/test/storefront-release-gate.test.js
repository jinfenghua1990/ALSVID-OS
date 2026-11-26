'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Fastify=require('fastify');
const {storefrontReleaseGate,isReleaseLocked}=require('../storefront-release-gate');
const {apiAccessHook}=require('../access-policy');
const {registerCmsRoutes}=require('../cms');
const {registerCatalogRoutes}=require('../catalog');
const {registerStorefrontListingRoutes}=require('../storefront-listings');

const id='018e6e58-3921-789a-bcde-1234567890ab';
const locked=[
  '/api/site/layout-draft/publish','/api/site/layout-draft/publish-locale',
  '/api/site/layout-draft/rollback','/api/site/homepage/publish',
  '/api/products/'+id+'/publication/publish','/api/cms/pages/'+id+'/publish',
  '/api/cms/pages/'+id+'/rollback','/api/storefront/listings/'+id+'/publish',
  '/api/storefront/listings/'+id+'/rollback',
];

test('all real legacy release endpoints reject fabricated approval before invoking a store',async t=>{
  const app=Fastify(),calls=[];
  app.addHook('onRequest',apiAccessHook({user:async role=>role?{id:'user',role}:null},req=>req.headers['test-role']));
  app.addHook('preHandler',storefrontReleaseGate);
  const store=new Proxy({}, {get:(_target,key)=>async(...args)=>{calls.push([key,...args]);return {ok:true}}});
  registerCatalogRoutes(app,{catalog:store,objectStorage:null});
  registerCmsRoutes(app,store);
  registerStorefrontListingRoutes(app,store);
  t.after(()=>app.close());
  await app.ready();
  for(const url of locked){
    const response=await app.inject({method:'POST',url:url+'?reviewed=true',headers:{'test-role':'admin'},payload:{revision:1,approved:true,confirmations:['zh-desktop','zh-mobile','en-desktop','en-mobile','de-desktop','de-mobile']}});
    assert.equal(response.statusCode,409,url);
    assert.equal(response.json().code,'STOREFRONT_RELEASE_REVIEW_REQUIRED',url);
  }
  const activate=await app.inject({method:'PATCH',url:'/api/cms/pages/'+id+'/status',headers:{'test-role':'admin'},payload:{status:'active'}});
  assert.equal(activate.statusCode,409);
  assert.equal(calls.length,0,'release guard must run before store mutations');
  const anonymous=await app.inject({method:'POST',url:locked[0],payload:{}});
  assert.equal(anonymous.statusCode,401);
  const viewer=await app.inject({method:'POST',url:locked[0],headers:{'test-role':'viewer'},payload:{}});
  assert.equal(viewer.statusCode,403);
  for(const [method,url,payload] of [
    ['PUT','/api/cms/pages/'+id+'/draft',{revision:1,draft:{blocks:[]}}],
    ['POST','/api/cms/pages/'+id+'/versions/1/restore-draft',{revision:1}],
    ['GET','/api/cms/pages/'+id+'/versions',undefined],
    ['PATCH','/api/cms/pages/'+id+'/status',{status:'disabled'}],
    ['POST','/api/site/layout-draft/unpublish',{}],
    ['POST','/api/storefront/listings/'+id+'/unpublish',{revision:1}],
  ]){
    const response=await app.inject({method,url,headers:{'test-role':'admin'},...(payload===undefined?{}:{payload})});
    assert.equal(response.statusCode,200,url);
  }
  assert.equal(calls.length,6);
});

test('release policy does not freeze independent price operations, withdrawals or reads',()=>{
  assert.equal(isReleaseLocked('PUT','/api/storefront/listings/:id/price',{}),false);
  assert.equal(isReleaseLocked('POST','/api/site/layout-draft/unpublish-locale',{}),false);
  assert.equal(isReleaseLocked('GET','/api/site/layout-draft/versions',{}),false);
  assert.equal(isReleaseLocked('POST','/api/site/layout-draft/production-sync',{}),false);
});
