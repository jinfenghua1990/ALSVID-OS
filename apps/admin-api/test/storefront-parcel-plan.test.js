'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {uuidv7}=require('../uuidv7');const {normalizeParcel,fulfillment}=require('../storefront-parcel-plan');
test('vehicle body and battery can ship independently, with split quantities and no double fulfillment',()=>{
 const id=uuidv7(),lines=[{id,kind:'vehicle',quantity:2}];
 const parcel=(component,quantity)=>({component,items:[{itemId:id,quantity}]});
 const history=[{itemId:id,component:'body',quantity:1}];
 assert.equal(fulfillment(lines,history,parcel('body',1)).all,false);
 history.push({itemId:id,component:'body',quantity:1});
 assert.equal(fulfillment(lines,history,parcel('battery',1)).all,false);
 history.push({itemId:id,component:'battery',quantity:1});
 assert.equal(fulfillment(lines,history,parcel('battery',1)).all,true);
 assert.throws(()=>fulfillment(lines,history,parcel('body',1)),{statusCode:409});
 assert.throws(()=>fulfillment(lines,history,parcel('accessory',1)),{statusCode:409});
});
test('accessories complete without requiring battery and invalid order lines are rejected',()=>{
 const id=uuidv7(),lines=[{id,kind:'part',quantity:1}];
 assert.equal(fulfillment(lines,[],{component:'accessory',items:[{itemId:id,quantity:1}]}).all,true);
 assert.throws(()=>fulfillment(lines,[],{component:'accessory',items:[{itemId:uuidv7(),quantity:1}]}),{statusCode:409});
});
test('battery confirmation and valid unique parcel items required',()=>{
 const input={parcelId:uuidv7(),component:'battery',carrier:'DHL',trackingNo:'T',items:[{itemId:uuidv7(),quantity:1}]};
 assert.throws(()=>normalizeParcel(input),/电池包裹/);
 assert.equal(normalizeParcel({...input,batteryApproved:true}).batteryApproved,true);
 assert.throws(()=>normalizeParcel({...input,batteryApproved:true,items:[...input.items,...input.items]}),/数量无效/);
});
