'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {emailOf,codeHash,config,sendCode}=require('../consumer-registration');
test('registration disabled unless explicitly configured; normalize emails and bind code to challenge',()=>{
 assert.equal(config({}),null);
 assert.equal(config({ALSVID_CONSUMER_REGISTRATION:'1',RESEND_API_KEY:'x',ALSVID_MAIL_FROM:'x',ALSVID_REGISTRATION_SECRET:'short'}),null);
 assert.equal(emailOf(' User@Example.com '),'user@example.com');
 assert.throws(()=>emailOf('admin'));
 assert.notEqual(codeHash('secret','id1','user@example.com','12345678'),codeHash('secret','id2','user@example.com','12345678'));
});
test('mail request requires provider acknowledgement and never sends passwords',async()=>{
 let body;await sendCode({apiKey:'test',from:'sender@example.com'},'user@example.com','id','12345678','de',async(url,opts)=>{assert.equal(url,'https://api.resend.com/emails');body=JSON.parse(opts.body);return {ok:true,json:async()=>({id:'mail'})}});
 assert.match(body.text,/12345678/);assert.equal(body.to[0],'user@example.com');
 await assert.rejects(sendCode({apiKey:'test',from:'sender@example.com'},'user@example.com','id','12345678','en',async()=>({ok:false})),/邮件服务/);
});
