'use strict';
// UNIT_TEST_NO_DATABASE
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {saveMemory}=require('../translation-memory');
test('translation memory protects manual values and deduplicates a batch',async()=>{
 let call;
 const client={query:async(sql,args)=>{call={sql,args};return {rowCount:1}}};
 assert.equal(await saveMemory(client,[{source:'折叠车',locale:'de',target:'Faltrad',engine:'manual'},{source:'折叠车',locale:'de',target:'Automatic',engine:'mock'}]),1);
 assert.deepEqual(call.args[3],['Faltrad']);
 assert.match(call.sql,/translation_memory\.engine IS DISTINCT FROM 'manual'/);
});
