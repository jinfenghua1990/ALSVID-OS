'use strict';
// Pure server-side rate engine. Only trusted inventory allocation and priced SKU rows
// may be passed to calculateShipping in a customer transaction. Never trust client totals.
function fail(message,statusCode=400){throw Object.assign(new Error(message),{statusCode})}
function int(value,min,max,label){if(!Number.isSafeInteger(value)||value<min||value>max)fail(label+'无效');return value}
function str(value,max,label,required=true){if(typeof value!=='string'||value.trim().length>max||(required&&!value.trim()))fail(label+'无效');return value.trim()}
const LIMIT=10000000000;
function normalizeTemplate(input){
 if(!input||typeof input!=='object'||Array.isArray(input))fail('运费模板格式无效');
 const warehouseId=str(input.warehouseId,128,'仓库'),name=str(input.name,120,'模板名称');
 const country=str(input.country,2,'配送国家').toUpperCase();if(!/^[A-Z]{2}$/.test(country))fail('国家必须使用两位 ISO 代码');
 const region=str(input.region??'',120,'地区',false).toUpperCase(),postalPrefix=str(input.postalPrefix??'',20,'邮编前缀',false).toUpperCase().replace(/\s+/g,'');
 if(postalPrefix&&!/^[A-Z0-9-]+$/.test(postalPrefix))fail('邮编前缀无效');
 const method=str(input.method,60,'配送方式'),currency=input.currency;
 if(!['EUR','CNY'].includes(currency))fail('币种无效');
 if(typeof input.enabled!=='boolean')fail('启用状态无效');
 const priority=int(input.priority,1,9999,'模板优先级'),mode=input.mode;
 if(!['fixed','per_item','weight','amount'].includes(mode))fail('计费方式无效');
 const rateMinor=['fixed','per_item'].includes(mode)?int(input.rateMinor,0,LIMIT,'运费金额'):null;
 const bands=[];
 if(mode==='weight'||mode==='amount'){
   if(!Array.isArray(input.bands)||!input.bands.length||input.bands.length>50)fail('阶梯计费必须配置范围');
   let prior=-1;
   for(let i=0;i<input.bands.length;i++){
     const band=input.bands[i],last=i===input.bands.length-1;
     if(!band||typeof band!=='object')fail('阶梯无效');
     const upTo=band.upTo===null?null:int(band.upTo,0,LIMIT,'阶梯上限');
     if((last&&upTo!==null)||(!last&&(upTo===null||upTo<=prior)))fail('阶梯上限必须严格递增，最后一档不限上限');
     bands.push({upTo,rateMinor:int(band.rateMinor,0,LIMIT,'阶梯运费')});
     if(upTo!==null)prior=upTo;
   }
 }
 const freeAboveMinor=input.freeAboveMinor==null?null:int(input.freeAboveMinor,1,LIMIT,'包邮金额');
 if(!Array.isArray(input.freeSkus??[])||(input.freeSkus??[]).length>500)fail('包邮 SKU 列表无效');
 const freeSkus=[...new Set((input.freeSkus??[]).map(x=>str(x,80,'包邮 SKU')))].sort();
 return {warehouseId,name,country,region,postalPrefix,method,currency,enabled:input.enabled,priority,mode,rateMinor,bands,freeAboveMinor,freeSkus};
}
function calculateShipping({templates,lines,destination}){
 if(!Array.isArray(templates)||!Array.isArray(lines)||!lines.length)fail('计费资料无效');
 const country=str(destination?.country,2,'配送国家').toUpperCase();if(!/^[A-Z]{2}$/.test(country))fail('配送国家无效');
 const region=str(destination?.region??'',120,'配送地区',false).toUpperCase(),postal=str(destination?.postalCode??'',40,'配送邮编',false).toUpperCase().replace(/\s+/g,'');
 const groups=new Map();
 for(const row of lines){
   if(!row||!['physical','virtual'].includes(row.fulfillment))fail('商品履约类型未明确',409);
   if(row.fulfillment==='virtual')continue;
   const warehouseId=str(row.warehouseId,128,'发货仓库'),method=str(row.method,60,'配送方式'),sku=str(row.sku,80,'SKU');
   if(!['EUR','CNY'].includes(row.currency))fail('币种无效');
   const quantity=int(row.quantity,1,100,'商品数量'),unitPriceMinor=int(row.unitPriceMinor,0,LIMIT,'商品成交单价');
   if(unitPriceMinor===0&&row.authorizedGift!==true)fail('普通购买行不得零元成交',409);
   const key=JSON.stringify([warehouseId,method,row.currency]);
   if(!groups.has(key))groups.set(key,{warehouseId,method,currency:row.currency,lines:[]});
   groups.get(key).lines.push({...row,sku,quantity,unitPriceMinor});
 }
 const result=[];
 for(const group of groups.values()){
   if(!postal)fail('请填写配送邮编后计算运费',409);
   const candidates=templates.filter(t=>t.enabled&&t.warehouseId===group.warehouseId&&t.currency===group.currency&&t.method===group.method&&t.country===country&&(!t.region||t.region===region)&&(!t.postalPrefix||postal.startsWith(t.postalPrefix))).sort((a,b)=>a.priority-b.priority);
   if(!candidates.length)fail('发货组没有有效运费模板',409);
   if(candidates.length>1&&candidates[0].priority===candidates[1].priority)fail('运费模板优先级冲突',409);
   const template=candidates[0],charged=group.lines.filter(row=>!template.freeSkus.includes(row.sku));
   const subtotal=group.lines.reduce((sum,row)=>sum+row.unitPriceMinor*row.quantity,0);int(subtotal,0,LIMIT,'发货组商品金额');
   let amountMinor=0,reason='template';
   if(!charged.length){reason='free_sku'}
   else if(template.freeAboveMinor!==null&&subtotal>=template.freeAboveMinor){reason='free_threshold'}
   else if(template.mode==='fixed')amountMinor=template.rateMinor;
   else if(template.mode==='per_item')amountMinor=template.rateMinor*charged.reduce((sum,row)=>sum+row.quantity,0);
   else{
     const metric=charged.reduce((sum,row)=>sum+(template.mode==='weight'?int(row.weightGrams,1,LIMIT,'商品包装重量'):row.unitPriceMinor)*row.quantity,0);
     int(metric,0,LIMIT,'计费基数');
     const band=template.bands.find(band=>band.upTo===null||metric<=band.upTo);
     if(!band)fail('没有匹配的运费阶梯',409);
     amountMinor=band.rateMinor;
   }
   int(amountMinor,0,LIMIT,'运费');
   result.push({warehouseId:group.warehouseId,method:group.method,currency:group.currency,templateId:template.id,templateRevision:template.revision,amountMinor,reason,lines:group.lines.map(({sku,quantity})=>({sku,quantity}))});
 }
 const totals={};for(const group of result){totals[group.currency]=(totals[group.currency]||0)+group.amountMinor;int(totals[group.currency],0,LIMIT,'总运费')}
 return {groups:result,totals};
}
module.exports={normalizeTemplate,calculateShipping};
