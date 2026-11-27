'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {assertCartAccount}=require('../storefront-cart');
test('stale account cart write is rejected without requiring a database',()=>{
 assert.throws(()=>assertCartAccount({id:'new-account'},{expectedAccountId:'old-account'}),e=>e.statusCode===409&&/账号已变化/.test(e.message));
 assert.doesNotThrow(()=>assertCartAccount({id:'new-account'},{expectedAccountId:'new-account'}));
 assert.doesNotThrow(()=>assertCartAccount({id:'new-account'},{}));
 assert.throws(()=>assertCartAccount({id:'new-account'},{expectedAccountId:null}),e=>e.statusCode===409);
});
