'use strict';
// UNIT_TEST_NO_DATABASE
const {test}=require('node:test');
const assert=require('node:assert/strict');
const sharp=require('sharp');
const {thumbnailKey,makeThumbnail}=require('../asset-thumbnail');

test('thumbnail keys are stable per object version and thumbnails are bounded WebP images',async()=>{
 const source=await sharp({create:{width:1600,height:800,channels:3,background:'#6b7d68'}}).png().toBuffer();
 const result=await makeThumbnail(source),metadata=await sharp(result).metadata();
 assert.equal(metadata.format,'webp');
 assert.equal(metadata.width,480);
 assert.equal(metadata.height,240);
 assert.ok(result.length<source.length);
 assert.equal(thumbnailKey('media/a'),thumbnailKey('media/a'));
 assert.notEqual(thumbnailKey('media/a'),thumbnailKey('media/b'));
});
