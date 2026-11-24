import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readLegacyCart } from '../src/legacy-cart.js';

test('legacy selections are read without modifying browser storage', () => {
  const values = { alsvid_storefront_cart_preview_v1: JSON.stringify({version:1,items:[{product:'FC1',model:'standard',colour:'blue',quantity:2},{product:'FC2',quantity:1}]}) };
  const storage={getItem:key=>values[key]||null};
  const result=readLegacyCart(storage,storage);
  assert.equal(result.available,true);
  assert.equal(result.items.length,2);
  assert.equal(JSON.parse(values.alsvid_storefront_cart_preview_v1).items[0].quantity,2);
  assert.equal(readLegacyCart({getItem:()=>'{bad'},storage).available,false);
  assert.equal(readLegacyCart({getItem:()=>JSON.stringify({version:1,items:[{product:'FC1',model:'unknown',colour:'blue',quantity:1}]})},storage).available,false);
});

test('older session-only selection is visible without being removed', () => {
  const previous=JSON.stringify({version:1,product:'FC1',model:'pro',colour:'silver',quantity:1});
  const result=readLegacyCart({getItem:()=>null},{getItem:()=>previous});
  assert.equal(result.items[0].model,'pro');
});
