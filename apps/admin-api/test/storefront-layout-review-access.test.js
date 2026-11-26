'use strict';
// UNIT_TEST_NO_DATABASE
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Fastify=require('fastify');
const {apiAccessHook}=require('../access-policy');

test('only the signed homepage review confirmation route may receive an anonymous POST',async t=>{
 const app=Fastify();
 app.addHook('onRequest',apiAccessHook({user:async()=>null},()=>''));
 app.post('/api/site/layout-draft/release-review-confirm',{config:{publicLayoutReviewConfirm:true}},async()=>({ok:true}));
 app.post('/api/site/layout-draft/publish',{config:{publicLayoutReviewConfirm:false}},async()=>({ok:true}));
 t.after(()=>app.close());
 const confirm=await app.inject({method:'POST',url:'/api/site/layout-draft/release-review-confirm',payload:{token:'invalid'}});
 assert.equal(confirm.statusCode,200);
 const publish=await app.inject({method:'POST',url:'/api/site/layout-draft/publish',payload:{}});
 assert.equal(publish.statusCode,401);
});
