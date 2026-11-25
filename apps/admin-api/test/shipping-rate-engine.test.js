'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {normalizeTemplate,calculateShipping}=require('../shipping-rate-engine');
const make=(overrides={})=>({...normalizeTemplate({warehouseId:'DE-A',name:'DE shipping',country:'DE',method:'standard',currency:'EUR',enabled:true,priority:100,mode:'fixed',rateMinor:900,...overrides}),id:'template-1',revision:1});
const line=(overrides={})=>({warehouseId:'DE-A',method:'standard',sku:'BIKE',currency:'EUR',quantity:1,unitPriceMinor:100000,fulfillment:'physical',...overrides});
const dest={country:'DE',postalCode:'10115'};
const quote=(templates,lines,destination=dest)=>calculateShipping({templates,lines,destination});
test('same warehouse grouped once; two warehouses add their own fees',()=>{
 const a=make(),b=make({warehouseId:'DE-B',rateMinor:500});
 const result=quote([a,b],[line(),line({sku:'LOCK',unitPriceMinor:1500}),line({warehouseId:'DE-B',sku:'HELMET',unitPriceMinor:2500})]);
 assert.equal(result.totals.EUR,1400);assert.equal(result.groups.length,2);assert.equal(result.groups[0].templateRevision,1);
});
test('missing and ambiguous rates fail closed',()=>{
 assert.throws(()=>quote([],[line()]),/没有有效/);
 assert.throws(()=>quote([make(),make()],[line()]),/冲突/);
 assert.throws(()=>quote([make()],[line()],{country:'DE'}),/邮编/);
 assert.equal(quote([make(),make({priority:10,rateMinor:200})],[line()]).totals.EUR,200);
});
test('virtual, zero gift, free SKU and group threshold',()=>{
 assert.deepEqual(quote([],[line({fulfillment:'virtual'})]).totals,{});
 assert.throws(()=>quote([make()],[line({unitPriceMinor:0})]),/零元/);
 const gift=line({sku:'GIFT',unitPriceMinor:0,authorizedGift:true});
 assert.equal(quote([make({freeAboveMinor:100001})],[line(),gift]).totals.EUR,900);
 assert.equal(quote([make({freeSkus:['GIFT']})],[gift]).totals.EUR,0);
 assert.equal(quote([make({freeAboveMinor:100000})],[line(),gift]).totals.EUR,0);
});
test('quantity, packaging weight, order amount bands',()=>{
 assert.equal(quote([make({mode:'per_item',rateMinor:500})],[line({quantity:3})]).totals.EUR,1500);
 const weight=make({mode:'weight',bands:[{upTo:20000,rateMinor:1000},{upTo:null,rateMinor:2000}]});
 assert.throws(()=>quote([weight],[line()]),/包装重量/);
 assert.equal(quote([weight],[line({weightGrams:16000,quantity:2})]).totals.EUR,2000);
 const amount=make({mode:'amount',bands:[{upTo:100000,rateMinor:500},{upTo:null,rateMinor:0}]});
 assert.equal(quote([amount],[line({quantity:2})]).totals.EUR,0);
 assert.throws(()=>make({mode:'weight',bands:[{upTo:10,rateMinor:10}]}),/最后一档/);
});
