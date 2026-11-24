'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
const {uuidv7}=require('../uuidv7');

const salesOrders=new Map(),productionOrders=new Map(),audits=new Map();
const client={async query(sql,values=[]){
 if(/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())||sql.includes('pg_advisory_xact_lock'))return{rows:[],rowCount:1};
 if(sql.includes("FROM audit_log WHERE action='sales.order.create'")){const row=audits.get(values[0]);return{rows:row?[row]:[],rowCount:row?1:0}}
 if(sql.includes('FROM skus sku JOIN products p'))return{rows:[{code:'A1-STD-BLK-EUR',entity_uuid:uuidv7(),product_name:'A1'}],rowCount:1};
 if(sql.includes('FROM warehouses w LEFT JOIN warehouse_stock'))return{rows:[{id:'warehouse-1',warehouse_code:'EU',entity_uuid:uuidv7(),name:'EU Warehouse',quantity:0}],rowCount:1};
 if(sql.includes('FROM warehouse_stock ws JOIN skus'))return{rows:[],rowCount:0};
 if(sql.includes('SELECT nextval(\'sales_order_no_seq\')'))return{rows:[{n:1}],rowCount:1};
 if(sql.includes('INSERT INTO production_orders')){const row={id:values[0],entity_uuid:uuidv7(),order_no:values[1]};productionOrders.set(row.id,row);return{rows:[row],rowCount:1}}
 if(sql.includes('INSERT INTO sales_orders')){const row={id:values[0],order_no:values[1],customer_name:values[4],sku_code:values[11],quantity:values[13],unit_price:values[14],currency:values[15],note:values[23],production_order_uuid:values[22],fulfillment_type:values[17],po_no:null};salesOrders.set(row.id,row);return{rows:[row],rowCount:1}}
 if(sql.includes('INSERT INTO sales_order_events'))return{rows:[],rowCount:1};
 if(sql.includes('SELECT order_no FROM production_orders WHERE entity_uuid=$1'))return{rows:[{order_no:[...productionOrders.values()][0].order_no}],rowCount:1};
 if(sql.includes('FROM sales_orders o')&&sql.includes('WHERE o.id::text=$1')){const row=salesOrders.get(values[0]);return{rows:row?[row]:[],rowCount:row?1:0}}
 if(sql.includes('INSERT INTO audit_log')){audits.set(JSON.parse(values[3]).idempotencyKey,{before_json:values[3]});return{rows:[],rowCount:1}}
 if(sql.includes('INSERT INTO warehouse_stock'))return{rows:[],rowCount:1};
 throw new Error(`Unexpected query: ${sql}`);
},release(){}};
const pool={connect:async()=>client,query:client.query.bind(client),end:async()=>{}};
const originalLoad=Module._load;
Module._load=function(request,parent,isMain){
 if(parent?.filename===path.resolve(__dirname,'../sales-orders.js')&&request==='./db-pool')return{createPool:()=>pool};
 if(parent?.filename===path.resolve(__dirname,'../sales-orders.js')&&request==='./audit-context')return{currentActor:()=>'test-admin'};
 return originalLoad.call(this,request,parent,isMain);
};
const {createSalesOrderStore}=require('../sales-orders');
Module._load=originalLoad;
const store=createSalesOrderStore('unused');

test('sales order retry replays the original order and its linked production order',async()=>{
 const request={idempotencyKey:uuidv7(),customerName:'Test buyer',skuCode:'A1-STD-BLK-EUR',quantity:2,unitPrice:100,currency:'EUR',factory:'Test factory',note:'seed'};
 const first=await store.create(request),replay=await store.create(request);
 assert.equal(replay.replayed,true);
 assert.equal(first.id,replay.id);
 assert.equal(salesOrders.size,1);
 assert.equal(productionOrders.size,1);
 await assert.rejects(store.create({...request,quantity:3}),error=>error.statusCode===409);
 await assert.rejects(store.create({...request,dueDate:'2026-02-31'}),/日期不是有效日期/);
 assert.equal(salesOrders.size,1);
 assert.equal(productionOrders.size,1);
});
