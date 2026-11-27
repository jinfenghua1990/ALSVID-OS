'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStorefrontCart}=require('../storefront-cart');
test('stale account cart write is rejected before querying the database',async()=>{
 const cart=createStorefrontCart('postgresql://unused:unused@127.0.0.1:1/unused');
 try{await assert.rejects(cart.save({id:'new-account'},{expectedAccountId:'old-account',revision:0,items:[]}),e=>e.statusCode===409&&/账号已变化/.test(e.message));}
 finally{await cart.close();}
});
