'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {mergeCartItems,mergeFingerprint}=require('../storefront-cart');
const item={productId:'bike',sku:'A1',currency:'EUR',quantity:2};
test('merge preserves account items, adds guest quantities and distinguishes currencies',()=>{
 assert.deepEqual(mergeCartItems([item],[{...item,quantity:3},{...item,currency:'CNY'}]),[{...item,quantity:5},{...item,currency:'CNY'}]);
 assert.throws(()=>mergeCartItems([{...item,quantity:99}],[item]),{statusCode:409});
 assert.throws(()=>mergeCartItems(Array.from({length:50},(_,i)=>({...item,sku:String(i)})),[item]),{statusCode:409});
});
test('batch fingerprint is order independent but detects changed items or quantity',()=>{
 const b={...item,sku:'B'};
 assert.equal(mergeFingerprint([item,b]),mergeFingerprint([b,item]));
 assert.notEqual(mergeFingerprint([item,b]),mergeFingerprint([{...item,quantity:3},b]));
 assert.notEqual(mergeFingerprint([item]),mergeFingerprint([{...item,currency:'CNY'}]));
});
