const {test}=require('node:test');
const assert=require('node:assert/strict');
const poolPath=require.resolve('../db-pool');
const servicePath=require.resolve('../postgres-service');
const deliveryId='12345678-1234-7234-8234-123456789abd';
const receiptId='12345678-1234-7234-8234-123456789abc';
const vinId='12345678-1234-7234-8234-123456789abe';

function serviceFor(status,prior=null,missing=false){
  const queries=[];
  const client={release(){},async query(sql){
    queries.push(sql);
    if(sql.startsWith('SELECT d.*,w.kind'))return {rows:missing?[]:[{id:deliveryId,status,planned_quantity:2,received_quantity:0,warehouse_id:'w1',warehouseKind:'国内仓',warehouseUuid:'12345678-1234-7234-8234-123456789abf',entity_uuid:'12345678-1234-7234-8234-123456789ac0'}]};
    if(sql.startsWith('SELECT id,entity_uuid AS'))return {rows:prior?[prior]:[]};
    if(sql.startsWith('SELECT v.id FROM production_delivery_receipt_vins'))return {rows:[{id:vinId}]};
    if(sql.startsWith('SELECT 1 FROM production_delivery_receipt_vins'))return {rows:[],rowCount:0};
    if(sql.startsWith('SELECT quantity FROM warehouse_stock'))return {rows:[{quantity:0}]};
    if(sql.startsWith('SELECT COALESCE(sum(quantity_delta)'))return {rows:[{n:0}]};
    if(sql.startsWith('SELECT entity_uuid FROM production_delivery_receipts'))return {rows:[{entityUuid:'12345678-1234-7234-8234-123456789ac4'}]};
    if(sql.startsWith('SELECT id,code,name FROM warehouse_locations'))return {rows:[{id:'12345678-1234-7234-8234-123456789ac1',code:'MAIN',name:'主库位'}]};
    if(sql.startsWith('SELECT v.id,v.entity_uuid'))return {rows:[{id:vinId,vinUuid:'12345678-1234-7234-8234-123456789ac2',sku:'s1',skuUuid:'12345678-1234-7234-8234-123456789ac3'}]};
    if(sql.startsWith('SELECT to_char(now()'))return {rows:[{d:'GRN-20261117-001'}]};
    if(sql.startsWith('UPDATE production_deliveries'))return {rows:[{id:deliveryId,receivedQuantity:1,status:'在途'}]};
    return {rows:[],rowCount:1};
  }};
  const pool={connect:async()=>client,end:async()=>{}};
  require.cache[poolPath]={id:poolPath,filename:poolPath,loaded:true,exports:{createPool:()=>pool}};
  delete require.cache[servicePath];
  return {service:require('../postgres-service').createServiceStore('unused'),queries};
}

test('receipt requires dispatch while retries remain idempotent',async()=>{
  let x=serviceFor('待发运');
  await assert.rejects(x.service.receiveDelivery(deliveryId,{receiptId,receivedQuantity:1,receiptNote:'short',vinIds:[vinId]}),/只有在途发运记录可以签收/);
  assert.equal(x.queries.some(q=>q.startsWith('UPDATE warehouse_stock')),false);
  x=serviceFor('已入库',{id:receiptId,entityUuid:'12345678-1234-7234-8234-123456789ac4',deliveryId,receivedQuantity:1,note:''});
  const retry=await x.service.receiveDelivery(deliveryId,{receiptId,receivedQuantity:1,vinIds:[vinId]});
  assert.equal(retry.id,receiptId);
  assert.equal(x.queries.some(q=>q.startsWith('UPDATE warehouse_stock')),false);
  x=serviceFor('在途');
  const result=await x.service.receiveDelivery(deliveryId,{receiptId,receivedQuantity:1,receiptNote:'short',vinIds:[vinId]});
  assert.equal(result.receivedQuantity,1);
  assert.equal(x.queries.filter(q=>q.startsWith('UPDATE warehouse_stock')).length,1);
});

test('receipt reports missing deliveries and conflicting receipt IDs with HTTP status codes',async()=>{
  let x=serviceFor('在途',null,true);
  await assert.rejects(x.service.receiveDelivery(deliveryId,{receiptId,receivedQuantity:1,receiptNote:'short',vinIds:[vinId]}),error=>error.statusCode===404);
  x=serviceFor('在途',{id:receiptId,entityUuid:'12345678-1234-7234-8234-123456789ac4',deliveryId,receivedQuantity:2,note:'short'});
  await assert.rejects(x.service.receiveDelivery(deliveryId,{receiptId,receivedQuantity:1,receiptNote:'short',vinIds:[vinId]}),error=>error.statusCode===409);
});
