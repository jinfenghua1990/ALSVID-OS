const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitVehicleMaster, archiveLegacyMarket } = require('../product-master');

test('legacy sales data is separated without changing physical specifications', () => {
  const original = { specs: { motor: '250W', _officialModelName: ' ALSVID A1 ', _market: { deTitle: 'Marketing', seoSlug: 'a1' } } };
  const result = splitVehicleMaster(original);
  assert.deepEqual(result, { specs: { motor: '250W' }, legacyMarket: { deTitle: 'Marketing', seoSlug: 'a1' } });
  assert.equal(original.specs._market.deTitle, 'Marketing');
  assert.throws(() => splitVehicleMaster({ specs: { _market: 'invalid' } }), /历史商城资料格式无效/);
});

test('legacy sales data is archived only when present', async () => {
  const calls = [];
  const client = { query: async (...args) => { calls.push(args); } };
  await archiveLegacyMarket(client, 'product-1', 'A1', null);
  assert.equal(calls.length, 0);
  await archiveLegacyMarket(client, 'product-1', 'A1', { seoSlug: 'a1' });
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0][1][2]), { seoSlug: 'a1' });
});
