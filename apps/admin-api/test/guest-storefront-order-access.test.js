'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Fastify=require('fastify');
const {apiAccessHook}=require('../access-policy');
const {registerStorefrontOrderRoutes}=require('../storefront-orders');
test('guest endpoints require high-entropy credential format and never expose member or admin routes',async t=>{
 const calls=[],app=Fastify();
 app.addHook('onRequest',apiAccessHook({user:async()=>null},()=>null));
 registerStorefrontOrderRoutes(app,{
  async submit(user,body){calls.push(['submit',user,body.id]);return {id:body.id,status:'submitted'}},
  async get(user,id){calls.push(['lookup',user,id]);return {id,status:'submitted'}}
 });
 t.after(()=>app.close());
 const id='018e6e58-3921-789a-bcde-1234567890ab',token='ab'.repeat(32);
 const post=(url,payload)=>app.inject({method:'POST',url,payload});
 assert.equal((await post('/api/guest/storefront/orders/submit',{id,token:'short'})).statusCode,404);
 assert.equal((await post('/api/guest/storefront/orders/submit',{id,token})).statusCode,200);
 assert.equal((await post('/api/guest/storefront/orders/lookup',{id,token})).statusCode,200);
 assert.equal((await post('/api/portal/storefront/orders',{id,token})).statusCode,401);
 assert.equal((await post('/api/storefront/orders/'+id+'/ship',{id,token})).statusCode,401);
 assert.deepEqual(calls,[['submit',{guestOrderToken:token},id],['lookup',{guestOrderToken:token},id]]);
});
