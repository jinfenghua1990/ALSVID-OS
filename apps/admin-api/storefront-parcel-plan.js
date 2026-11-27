'use strict';
const {isUuidv7}=require('./uuidv7');
function fail(message,statusCode=400){throw Object.assign(Error(message),{statusCode})}
const componentsFor=kind=>kind==='vehicle'?['body','battery']:['accessory'];
function normalizeParcel(input){
 const id=typeof input.parcelId==='string'?input.parcelId.toLowerCase():'',component=input.component;
 const carrier=typeof input.carrier==='string'?input.carrier.trim():'',trackingNo=typeof input.trackingNo==='string'?input.trackingNo.trim():'';
 if(!isUuidv7(id)||!['body','battery','accessory'].includes(component)||!carrier||carrier.length>120||!trackingNo||trackingNo.length>120||!Array.isArray(input.items)||!input.items.length||input.items.length>50)fail('包裹资料无效');
 if(component==='battery'&&input.batteryApproved!==true)fail('电池包裹须确认承运商接受合规电池运输');
 const items=input.items.map(x=>({itemId:typeof x?.itemId==='string'?x.itemId.toLowerCase():'',quantity:x?.quantity})).sort((a,b)=>a.itemId.localeCompare(b.itemId));
 if(items.some(x=>!isUuidv7(x.itemId)||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>100)||new Set(items.map(x=>x.itemId)).size!==items.length)fail('包裹商品或数量无效');
 return {id,component,carrier,trackingNo,items,batteryApproved:component==='battery'};
}
function fulfillment(lines,history,parcel){
 const byId=new Map(lines.map(l=>[l.id,l])),used=new Map();
 const key=(id,component)=>id+':'+component;
 for(const row of history){const k=key(row.itemId,row.component);used.set(k,(used.get(k)||0)+Number(row.quantity));}
 if(parcel)for(const row of parcel.items){
  const line=byId.get(row.itemId),k=key(row.itemId,parcel.component);
  if(!line||!componentsFor(line.kind).includes(parcel.component))fail('包裹组件不适用于该订单商品',409);
  const total=(used.get(k)||0)+row.quantity;
  if(total>Number(line.quantity))fail('累计发运数量超过订单商品数量',409);
  used.set(k,total);
 }
 const complete=lines.filter(l=>componentsFor(l.kind).every(c=>(used.get(key(l.id,c))||0)===Number(l.quantity)));
 return {complete,all:lines.length>0&&complete.length===lines.length};
}
module.exports={normalizeParcel,fulfillment,componentsFor};
