'use strict';
function fail(message){throw Object.assign(new Error(message),{statusCode:400})}
function amount(value){const s=typeof value==='number'||typeof value==='string'?String(value).trim():'';if(!/^\d+(?:\.\d{1,2})?$/.test(s)||Number(s)>100000000)fail('价格格式无效');return Number(s).toFixed(2)}
function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))fail('活动时间必须包含时区');return new Date(value).toISOString()}
function normalizePrice(input,now=new Date()){
 if(typeof input.sku!=='string'||!input.sku||input.sku.length>80||!['EUR','CNY'].includes(input.currency)||!Number.isSafeInteger(input.revision)||input.revision<1)fail('SKU、币种或版本无效');
 const unitPrice=amount(input.unitPrice);
 let promotion=null;
 if(input.promotion!=null){
  const p=input.promotion;
  if(typeof p!=='object'||Array.isArray(p))fail('活动配置无效');
  const salePrice=amount(p.salePrice),startsAt=date(p.startsAt),endsAt=date(p.endsAt);
  if(Number(salePrice)>=Number(unitPrice)||Date.parse(endsAt)<=Date.parse(startsAt)||Date.parse(endsAt)<=now.getTime())fail('活动价必须低于售价，结束时间必须晚于开始及当前时间');
  let referencePrice=null,referenceEvidence=null;
  if(p.referencePrice!=null&&p.referencePrice!==''){
   referencePrice=amount(p.referencePrice);referenceEvidence=typeof p.referenceEvidence==='string'?p.referenceEvidence.trim():'';
   if(Date.parse(startsAt)>now.getTime()||Number(referencePrice)<=Number(salePrice)||Number(referencePrice)>Number(unitPrice)||!referenceEvidence||referenceEvidence.length>1000||p.referenceConfirmed!==true)fail('仅活动开始后可确认此前30天最低实际售价，须填写依据且高于活动价');
  }
  promotion={salePrice,startsAt,endsAt,referencePrice,referenceEvidence};
 }
 return {sku:input.sku,currency:input.currency,revision:input.revision,unitPrice,promotion};
}
module.exports={normalizePrice};
