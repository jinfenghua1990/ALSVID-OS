'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateParcelPlan,completedLineIds}=require('../storefront-parcel-plan');
const {uuidv7}=require('../uuidv7');
const a=uuidv7(),b=uuidv7(),p=uuidv7(),q=uuidv7(),r=uuidv7(),s=uuidv7();
const line=(itemId,quantity)=>({itemId,quantity});
const parcel=(id,component,items)=>({id,component,items});
test('body and battery must both dispatch before consuming complete SKU quantity',()=>{
 const plan=validateParcelPlan([parcel(p,'body',[line(a,2)]),parcel(q,'battery',[line(a,2)])],[{id:a,quantity:2}]);
 assert.equal(completedLineIds(plan,p).size,0);
 assert.deepEqual([...completedLineIds([{...plan[0],dispatchedAt:'sent'},plan[1]],q)],[a]);
});
test('whole items and split vehicles consume independently',()=>{
 const plan=validateParcelPlan([parcel(p,'body',[line(a,1)]),parcel(q,'battery',[line(a,1)]),parcel(r,'whole',[line(b,3)])],[{id:a,quantity:1},{id:b,quantity:3}]);
 assert.deepEqual([...completedLineIds(plan,r)],[b]);
 assert.deepEqual([...completedLineIds([plan[0],plan[1],{...plan[2],dispatchedAt:'sent'}],p)],[b]);
});
test('reject incomplete, mixed, excessive or duplicated package allocations',()=>{
 const lines=[{id:a,quantity:2}];
 for(const invalid of [[parcel(p,'body',[line(a,2)])],[parcel(p,'whole',[line(a,2)]),parcel(q,'battery',[line(a,2)])],[parcel(p,'whole',[line(a,3)])],[parcel(p,'whole',[line(a,1),line(a,1)])],[parcel(p,'whole',[line(a,1)]),parcel(p,'whole',[line(a,1)])],[parcel(s,'whole',[line(b,2)])]])assert.throws(()=>validateParcelPlan(invalid,lines));
});
test('multiple parcels of the same component conserve the full order quantity',()=>{
 const plan=validateParcelPlan([parcel(p,'body',[line(a,1)]),parcel(q,'body',[line(a,1)]),parcel(r,'battery',[line(a,2)])],[{id:a,quantity:2}]);
 assert.equal(completedLineIds([{...plan[0],dispatchedAt:'sent'},plan[1],{...plan[2],dispatchedAt:'sent'}]).size,0);
 assert.equal(completedLineIds([{...plan[0],dispatchedAt:'sent'},plan[1],{...plan[2],dispatchedAt:'sent'}],q).has(a),true);
});
