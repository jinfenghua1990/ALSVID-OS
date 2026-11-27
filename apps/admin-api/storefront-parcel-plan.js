'use strict';
const {isUuidv7}=require('./uuidv7');
function fail(message,statusCode=400){throw Object.assign(Error(message),{statusCode})}
function validateParcelPlan(raw,lines){
 if(!Array.isArray(raw)||raw.length<1||raw.length>100||!lines.length)fail('请提供1–100个包裹');
 const required=new Map(lines.map(x=>[x.id,Number(x.quantity)])), totals=new Map(),ids=new Set();
 const parcels=raw.map(p=>{
  const id=typeof p?.id==='string'?p.id.toLowerCase():'',component=p?.component;
  if(!isUuidv7(id)||ids.has(id)||!['whole','body','battery'].includes(component)||!Array.isArray(p.items)||p.items.length<1||p.items.length>50)fail('包裹资料无效');
  ids.add(id);
  const seen=new Set();
  const items=p.items.map(x=>{
   const itemId=typeof x?.itemId==='string'?x.itemId.toLowerCase():'',quantity=x?.quantity;
   if(!required.has(itemId)||seen.has(itemId)||!Number.isSafeInteger(quantity)||quantity<1||quantity>required.get(itemId))fail('包裹商品或数量无效');
   seen.add(itemId);
   const counts=totals.get(itemId)||{whole:0,body:0,battery:0};counts[component]+=quantity;totals.set(itemId,counts);
   return {itemId,quantity};
  });return {id,component,items};
 });
 for(const [id,quantity] of required){const n=totals.get(id)||{whole:0,body:0,battery:0};if(!((n.whole===quantity&&!n.body&&!n.battery)||(!n.whole&&n.body===quantity&&n.battery===quantity)))fail('每个订单商品须完整分配：整件或等量车体及电池',409)}
 return parcels;
}
function completedLineIds(parcels,dispatching=null){
 const covered=new Set(),pending=new Set();
 for(const p of parcels){for(const item of p.items){covered.add(item.itemId);if(!p.dispatchedAt&&p.id!==dispatching)pending.add(item.itemId)}}
 return new Set([...covered].filter(id=>!pending.has(id)));
}
module.exports={validateParcelPlan,completedLineIds};
