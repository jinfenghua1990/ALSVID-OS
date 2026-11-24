import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequestIds} from '../src/request-ids.js';

const storageFor=()=>{
 const values=new Map();
 return{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
};

test('finance request IDs survive a page instance restart and clear only after success',()=>{
 const storage=storageFor(),request={amount:'25',currency:'EUR'},first=createRequestIds(()=>storage,()=> 'request-1');
 const id=first.get('payment',request),nextPage=createRequestIds(()=>storage,()=> 'request-2');
 assert.equal(nextPage.get('payment',request),id);
 assert.notEqual(nextPage.get('payment',{...request,amount:'26'}),id);
 nextPage.clear('payment',request);
 const retryPage=createRequestIds(()=>storage,()=> 'request-3');
 assert.equal(retryPage.get('payment',request),'request-3');
});

test('finance request ID storage failures fall back to in-memory retry keys',()=>{
 const ids=createRequestIds(()=>{throw new Error('storage disabled')},()=> 'fallback-key');
 const request={amount:'10'};
 assert.equal(ids.get('allocation',request),'fallback-key');
 assert.equal(ids.get('allocation',request),'fallback-key');
});
