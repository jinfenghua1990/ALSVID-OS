'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
const {uuidv7}=require('../uuidv7');

const audits=new Map(),orders=new Map(),orderItems=[];
const client={async query(sql,values=[]){
 if(/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())||sql.includes('pg_advisory_xact_lock'))return{rows:[],rowCount:1};
 if(sql.includes("FROM audit_log WHERE action='production_order.create'")){const row=audits.get(values[0]);return{rows:row?[row]:[],rowCount:row?1:0}}
 if(sql.includes('FROM factories'))return{rows:[{name:'Test Factory'}],rowCount:1};
 if(sql.includes('FROM skus s JOIN products p'))return{rows:[{code:'A1-STD-BLK-EUR',skuUuid:uuidv7()}],rowCount:1};
 if(sql.includes('SELECT COALESCE(max((substring(order_no'))return{rows:[{n:orders.size+1}],rowCount:1};
 if(sql.includes('INSERT INTO production_orders')){const row={id:values[0],entityUuid:uuidv7(),orderNo:values[1],factory:values[3],factoryId:values[4],plannedQuantity:values[5],status:'待工厂确认',orderDate:values[8],currency:values[9],exchangeRate:values[10],exchangeRateSource:values[11],expectedDeliveryDate:values[12],note:values[13]};orders.set(row.id,row);return{rows:[row],rowCount:1}}
 if(sql.includes('INSERT INTO production_order_items')){orderItems.push(values);return{rows:[],rowCount:1}}
 if(sql.includes('INSERT INTO audit_log')){audits.set(JSON.parse(values[3]).idempotencyKey,{before_json:values[3],after_json:values[4]});return{rows:[],rowCount:1}}
 throw new Error(`Unexpected query: ${sql}`);
},release(){}};
const pool={connect:async()=>client,query:client.query.bind(client),end:async()=>{}};
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
 if(parent?.filename===path.resolve(__dirname,'../postgres-service.js')&&request==='./db-pool')return{createPool:()=>pool};
 if(parent?.filename===path.resolve(__dirname,'../postgres-service.js')&&request==='./audit-context')return{currentActor:()=>'test-admin'};
 return originalLoad.call(this,request,parent,isMain);
};
const {createServiceStore}=require('../postgres-service');
Module._load=originalLoad;
const store=createServiceStore('unused');

test('production order creation replays identical request keys and rejects changed payloads',async()=>{
 const request={idempotencyKey:uuidv7(),factoryId:'factory-1',currency:'EUR',exchangeRate:7.8,orderDate:'2026-11-21',expectedDeliveryDate:'2026-12-20',items:[{sku:'A1-STD-BLK-EUR',plannedQuantity:2,unitPrice:'500.00'}],note:'B2B order',exchangeRateSource:'manual'};
 const first=await store.createProductionOrderV3(request),replay=await store.createProductionOrderV3(request);
 assert.equal(replay.replayed,true);
 assert.equal(first.id,replay.id);
 assert.equal(orders.size,1);
 assert.equal(orderItems.length,1);
 await assert.rejects(store.createProductionOrderV3({...request,items:[{...request.items[0],plannedQuantity:3}]}),error=>error.statusCode===409);
 assert.equal(orders.size,1);
 await store.close();
});
