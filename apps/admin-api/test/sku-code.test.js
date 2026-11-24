const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildSku, buildVehicleSku, skuSpecOptions, validSkuField, validProductSkuBase, isVehicleSku } = require('../sku-code');

test('builds part SKU from four segments', () => {
  assert.equal(buildSku('UN', 'BAT', '03A', 'STD'), 'UN-BAT-03A-STD');
});

test('builds vehicle SKU as model-trim-color-region', () => {
  assert.equal(buildVehicleSku('A1', 'ULT', 'GRY', 'EUR'), 'A1-ULT-GRY-EUR');
  assert.equal(buildVehicleSku('A1U', 'STD', 'PUR', 'EUR'), 'A1-STD-PUR-EUR');
  // 历史车型段 A1S/A1U 自动取车系代际 A1。
  assert.equal(buildVehicleSku('A1S', 'STD', 'PUR', 'EUR'), 'A1-STD-PUR-EUR');
  assert.equal(buildVehicleSku('A1U', 'ULT', 'GRY', 'EUR'), 'A1-ULT-GRY-EUR');
});

test('product ownership and model form a valid SKU base', () => {
  const templates = [{ code: 'EBI', kind: 'vehicle' }, { code: 'BAT', kind: 'part' }];
  const ownerships = [{ code: 'UN' }];
  assert.equal(validProductSkuBase('vehicle', 'A1', 'EBI', 'A1', templates, ownerships), true);
  assert.equal(validProductSkuBase('vehicle', 'A1U', 'EBI', 'A1U', templates, ownerships), true);
  assert.equal(validProductSkuBase('vehicle', '123', 'EBI', '123', templates, ownerships), true);
  assert.equal(validProductSkuBase('vehicle', 'A1S', 'EBI', 'A1P', templates, ownerships), false);
  assert.equal(validProductSkuBase('vehicle', 'A1U', 'BAT', 'A1U', templates, ownerships), false);
  assert.equal(validProductSkuBase('part', 'UN', 'BAT', '', templates, ownerships), true);
  assert.equal(validProductSkuBase('part', 'XX', 'BAT', '', templates, ownerships), false);
});

test('vehicle SKU is 14 or 15 characters and four segments', () => {
  assert.equal(buildVehicleSku('A1', 'ULT', 'GRY', 'EUR').length, 14);
  assert.equal(buildVehicleSku('A1U', 'ULT', 'GRY', 'EUR').length, 14);
  assert.equal(buildVehicleSku('ABC', 'ULT', 'GRY', 'EUR').length, 15);
  assert.equal(isVehicleSku('A1-ULT-GRY-EUR'), true);
  assert.equal(isVehicleSku('A1U-ULT-GRY-EUR'), true);
  assert.equal(isVehicleSku('A1S-EBI-360-GRY'), false);
  assert.equal(isVehicleSku('A1-ULT-GRY'), false);
  assert.equal(isVehicleSku('A1-UL-GRY-EUR'), false);
  assert.equal(isVehicleSku('A1-ULT-GRY-EURX'), false);
  assert.equal(isVehicleSku('A1-ult-GRY-EUR'), false);
});

test('SKU options follow configured active fields and validate generator settings', () => {
  const field = { level: 'sku', type: 'enum', skuGen: true, enabled: true, templates: ['BAT'], options: ['450', '500'] };
  assert.deepEqual(skuSpecOptions('BAT', [field]), ['450', '500']);
  assert.deepEqual(skuSpecOptions('BAT', [{ ...field, enabled: false }]), []);
  assert.deepEqual(skuSpecOptions('GEN', [field]), ['STD']);
  assert.equal(validSkuField(field, [{ code: 'BAT' }]), true);
  for (const invalid of [{ options: ['450', '450'] }, { options: ['中文'] }, { type: 'text' }, { templates: ['UNKNOWN'] }]) {
    assert.equal(validSkuField({ ...field, ...invalid }, [{ code: 'BAT' }]), false);
  }
});

test('rejects malformed vehicle and part SKUs', () => {
  assert.throws(() => buildVehicleSku('A1', 'UL', 'GRY', 'EUR'));
  assert.throws(() => buildVehicleSku('A1', 'ULT', 'GRY', ''));
  assert.throws(() => buildVehicleSku('', 'ULT', 'GRY', 'EUR'));
  for (const values of [['A-1', 'BAT', '450', 'BLK'], ['UN', 'FE', '450', 'BLK'], ['UN', 'BAT', '45-0', 'BLK'], ['UN', 'BAT', 450, 'BLK']]) {
    assert.throws(() => buildSku(...values), /SKU 四段编码无效/);
  }
});
