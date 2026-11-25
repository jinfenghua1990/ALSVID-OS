'use strict';
const {isUuidv7}=require('./uuidv7');
function fail(message,statusCode=409){throw Object.assign(new Error(message),{statusCode})}
function paymentAmount(total,paid,expected,currency,actualCurrency){
 const amount=Number(total)-Number(paid);
 if(!Number.isSafeInteger(Number(total))||!Number.isSafeInteger(Number(paid))||Number(paid)<0||!Number.isSafeInteger(amount)||amount<=0||amount>10000000000)fail('订单应收余额无效');
 if(!['EUR','CNY'].includes(actualCurrency)||expected!=null&&(!Number.isSafeInteger(expected)||expected!==amount)||currency!=null&&currency!==actualCurrency)fail('应收金额或币种已变化，请重新核对');
 return amount;
}
function settlementInput(provider,intent){
 if(!isUuidv7(intent.id)||!Number.isSafeInteger(Number(intent.amount_minor))||Number(intent.amount_minor)<=0||!intent.confirmed_at||!Number.isFinite(Date.parse(intent.confirmed_at)))fail('支付确认资料无效');
 return {id:intent.id,amount:(Number(intent.amount_minor)/100).toFixed(2),method:'other',reference:'online:'+provider+':'+intent.id,receivedOn:new Date(intent.confirmed_at).toISOString().slice(0,10),note:'线上支付确认（'+provider+'）',verified:true};
}
module.exports={paymentAmount,settlementInput};
