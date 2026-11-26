'use strict';
// UNIT_TEST_NO_DATABASE
const {test}=require('node:test');
const assert=require('node:assert/strict');
const review=require('../storefront-layout-review');

test('homepage release requires six confirmations bound to actor, scope, revision, and exact content',t=>{
 const prior=process.env.ALSVID_PREVIEW_SECRET;
 process.env.ALSVID_PREVIEW_SECRET='unit-test-preview-secret-12345678901234567890';
 t.after(()=>{if(prior===undefined)delete process.env.ALSVID_PREVIEW_SECRET;else process.env.ALSVID_PREVIEW_SECRET=prior});
 const candidate={html:'<main>draft</main>',css:'',locales:{en:{html:'<main>en draft</main>',css:''}}};
 const published={html:'<main>live</main>',css:'',locales:{de:{html:'<main>de live</main>',css:''}}};
 const session=review.start({revision:4,actor:'admin-a',scope:'all',candidate,published});
 assert.equal(session.slots.length,6);
 assert.deepEqual(session.slots.filter(s=>s.draft).map(s=>s.locale).filter((v,i,a)=>a.indexOf(v)===i),['zh','en']);
 const previews=session.slots.map(slot=>review.content(slot.token));
 assert.equal(previews[0].html,candidate.html);
 assert.equal(previews[2].html,candidate.locales.en.html);
 assert.equal(previews[4].html,published.locales.de.html);
 assert.equal(previews[0].receipt,undefined);
 const receipts=session.slots.map(slot=>review.confirm(slot.token).receipt);
 assert.equal(review.approve({revision:4,actor:'admin-a',scope:'all',candidate,session:session.session,receipts}).slots.length,6);
 const other=review.start({revision:4,actor:'admin-a',scope:'all',candidate,published});
 const otherReceipts=other.slots.map(slot=>review.confirm(slot.token).receipt);
 assert.throws(()=>review.approve({revision:4,actor:'admin-b',scope:'all',candidate,session:other.session,receipts:otherReceipts}),/不匹配/);
 assert.throws(()=>review.approve({revision:5,actor:'admin-a',scope:'all',candidate,session:other.session,receipts:otherReceipts}),/不匹配/);
 assert.throws(()=>review.approve({revision:4,actor:'admin-a',scope:'en',candidate,session:other.session,receipts:otherReceipts}),/不匹配/);
 assert.throws(()=>review.approve({revision:4,actor:'admin-a',scope:'all',candidate:{...candidate,css:'changed'},session:other.session,receipts:otherReceipts}),/内容已变化/);
 assert.throws(()=>review.approve({revision:4,actor:'admin-a',scope:'all',candidate,session:other.session,receipts:otherReceipts.slice(0,5)}),/六项/);
 assert.throws(()=>review.content(session.slots[0].token),/失效/);
});
