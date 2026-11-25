'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {paymentAmount,settlementInput}=require('../payment-safety');
const {uuidv7}=require('../uuidv7');
test('payment amount uses accepted quote less actual receipts',()=>{
 assert.equal(paymentAmount('199900','10000',189900,'EUR','EUR'),189900);
 assert.throws(()=>paymentAmount('199900','10000',1,'EUR','EUR'));
 assert.throws(()=>paymentAmount('199900','10000',189900,'CNY','EUR'));
 assert.throws(()=>paymentAmount('199900','199900',0,'EUR','EUR'));
});
test('settlement identity and date remain stable across retries',()=>{
 const intent={id:uuidv7(),amount_minor:'189900',confirmed_at:'2026-11-25T00:00:00Z'};
 const first=settlementInput('paypal',intent),second=settlementInput('paypal',intent);
 assert.deepEqual(first,second);assert.equal(first.id,intent.id);assert.equal(first.amount,'1899.00');assert.equal(first.receivedOn,'2026-11-25');
});
