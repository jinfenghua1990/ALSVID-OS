const { test } = require('node:test');
const assert = require('node:assert/strict');
const { uuidv7 } = require('../uuidv7');

test('UUID v7 contains current timestamp, correct version and variant', () => {
  const before=Date.now(), value=uuidv7(), after=Date.now();
  assert.match(value,/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const timestamp=parseInt(value.slice(0,8)+value.slice(9,13),16);
  assert.ok(timestamp>=before && timestamp<=after);
});

test('UUID v7 values do not collide in a sample', () => {
  assert.equal(new Set(Array.from({length:10000},uuidv7)).size,10000);
});
