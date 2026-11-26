'use strict';

const {createHash}=require('node:crypto');
const sharp=require('sharp');

function thumbnailKey(objectKey){
 return `media-thumbnails/${createHash('sha256').update(objectKey).digest('hex')}.webp`;
}

function makeThumbnail(body){
 return sharp(body).rotate().resize({width:480,height:480,fit:'inside',withoutEnlargement:true}).webp({quality:74,effort:4}).toBuffer();
}

module.exports={thumbnailKey,makeThumbnail};
