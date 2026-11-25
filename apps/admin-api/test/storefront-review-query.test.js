'use strict';
// UNIT_TEST_NO_DATABASE
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validProductId,publicReviewQuery,registerStorefrontReviewRoutes}=require('../storefront-reviews');
const Fastify=require('fastify');
test('review query uses existing business product identifiers and safe filters',async t=>{
 assert.equal(validProductId('100006'),true);
 assert.equal(validProductId(''),false);
 assert.equal(validProductId('x'.repeat(161)),false);
 assert.throws(()=>publicReviewQuery({sort:'rating;DROP TABLE'}));
 assert.throws(()=>publicReviewQuery({rating:6}));
 const app=Fastify();t.after(()=>app.close());let received;
 registerStorefrontReviewRoutes(app,{publicList:async(...args)=>{received=args;return {items:[]}}});
 const response=await app.inject('/api/site/reviews?productId=100006&page=2&rating=5&sort=highest');
 assert.equal(response.statusCode,200);assert.equal(response.headers['cache-control'],'no-store');
 assert.deepEqual(received,[20,'100006',{page:2,rating:5,sort:'highest'}]);
 assert.equal((await app.inject('/api/site/reviews?rating=6')).statusCode,400);
});
