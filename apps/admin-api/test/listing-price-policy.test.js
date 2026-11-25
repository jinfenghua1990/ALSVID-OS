'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {normalizePrice}=require('../listing-price-policy');
const base={sku:'A1-ULT-GRY-EUR',currency:'EUR',revision:1,unitPrice:'1999',promotion:{salePrice:'1799',startsAt:'2026-11-25T00:00:00Z',endsAt:'2026-12-01T00:00:00Z'}};
const now=new Date('2026-11-25T01:00:00Z');
test('scheduled sale and verified reference price are distinct',()=>{
 assert.equal(normalizePrice(base,now).promotion.salePrice,'1799.00');
 assert.equal(normalizePrice(base,now).promotion.referencePrice,null);
 assert.throws(()=>normalizePrice({...base,promotion:{...base.promotion,salePrice:'2000'}},now));
 assert.throws(()=>normalizePrice({...base,promotion:{...base.promotion,referencePrice:'1899'}},now));
 assert.equal(normalizePrice({...base,promotion:{...base.promotion,referencePrice:'1899',referenceEvidence:'价格历史记录编号 123',referenceConfirmed:true}},now).promotion.referencePrice,'1899.00');
 assert.throws(()=>normalizePrice({...base,promotion:{...base.promotion,startsAt:'2026-11-26T00:00:00Z',referencePrice:'1899',referenceEvidence:'记录',referenceConfirmed:true}},now));
 assert.throws(()=>normalizePrice({...base,promotion:{...base.promotion,startsAt:'2026-11-25T00:00:00'}},now));
});
