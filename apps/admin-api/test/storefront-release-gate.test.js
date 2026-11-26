'use strict';
// UNIT_TEST_NO_DATABASE
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {start,read,rendered,approve,requireReviewedRelease}=require('../shell-release-review');
const page={id:'018e6e58-3921-789a-bcde-1234567890ab',path:'/site-shell/header',pageType:'shared_module',status:'active',locale:'de',revision:7,draft:{siteShell:{kind:'header',brand:'ALSVID',links:[]}}};
test('six scoped signed preview receipts are required; stale, fake, duplicate and cross-account receipts fail',t=>{
 const prior=process.env.ALSVID_PREVIEW_SECRET;
 process.env.ALSVID_PREVIEW_SECRET='unit-test-preview-secret-12345678901234567890';
 t.after(()=>{if(prior===undefined)delete process.env.ALSVID_PREVIEW_SECRET;else process.env.ALSVID_PREVIEW_SECRET=prior});
 const session=start(page,'admin-a');
 assert.equal(session.slots.length,6);
 assert.equal(session.slots.filter(s=>s.draft).length,2);
 const receipts=session.slots.map(s=>rendered(read(s.token),page));
 const input={session:session.session,receipts};
 assert.equal(requireReviewedRelease(page,'admin-a',input).slots.length,6);
 assert.throws(()=>requireReviewedRelease(page,null,{...input,approved:true}),/必须通过/);
 assert.throws(()=>approve(page,'admin-b',session.session,receipts),/不匹配/);
 assert.throws(()=>approve({...page,revision:8},'admin-a',session.session,receipts),/不匹配/);
 assert.throws(()=>approve(page,'admin-a',session.session,receipts.slice(0,5)),/六项/);
 assert.throws(()=>approve(page,'admin-a',session.session,Array(6).fill(receipts[0])),/六种/);
 assert.throws(()=>approve(page,'admin-a',session.session,session.slots.map(s=>s.token)),/失效|无效/);
 assert.throws(()=>rendered(read(session.slots[0].token),{...page,revision:8}),/草稿已修改/);
 assert.throws(()=>read(session.slots[0].token+'x'),/无效/);
 const disabled={...page,status:'disabled',revision:9};
 const reenable=start(disabled,'admin-a');
 assert.equal(approve(disabled,'admin-a',reenable.session,reenable.slots.map(s=>rendered(read(s.token),disabled))).slots.length,6);
 assert.equal(requireReviewedRelease({...page,path:'/',pageType:'home'},null,{}),null);
 assert.throws(()=>start({...page,path:'/',pageType:'home'},'admin-a'),/公共草稿/);
});
test('missing preview secret fails closed',t=>{
 const prior=process.env.ALSVID_PREVIEW_SECRET;delete process.env.ALSVID_PREVIEW_SECRET;
 t.after(()=>{if(prior!==undefined)process.env.ALSVID_PREVIEW_SECRET=prior});
 assert.throws(()=>start(page,'admin-a'),/密钥/);
});
