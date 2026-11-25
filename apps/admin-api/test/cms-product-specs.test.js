const { test } = require('node:test');
const assert = require('node:assert/strict');
const { publicProductSpecifications } = require('../cms');

const fields = [
  { code: 'rated_power_w', nameZh: '额定功率', nameEn: 'Rated Power', nameDe: 'Nennleistung', unit: 'W', level: 'product', templates: ['EBI'], enabled: true, shopVisible: true },
  { code: 'battery_capacity', nameZh: '电池容量', nameEn: 'Battery Capacity', nameDe: 'Batteriekapazität', unit: 'Wh', level: 'product', templates: ['EBI'], enabled: true, shopVisible: true },
  { code: 'internal_cost', nameZh: '内部成本', nameEn: 'Internal Cost', nameDe: 'Interne Kosten', unit: 'EUR', level: 'product', templates: ['EBI'], enabled: true, shopVisible: false },
  { code: 'part_only', nameZh: '配件字段', nameEn: 'Part Field', nameDe: 'Teil', unit: '', level: 'product', templates: ['PART'], enabled: true, shopVisible: true },
  { code: 'disabled_field', nameZh: '停用字段', nameEn: 'Disabled', nameDe: 'Deaktiviert', unit: '', level: 'product', templates: ['EBI'], enabled: false, shopVisible: true },
];

test('public product specs read only enabled shop-visible vehicle master fields', () => {
  const product = { productType: 'EBI', specs: { rated_power_w: 250, battery_capacity: '360', internal_cost: 99, part_only: 'ignored' } };
  assert.deepEqual(publicProductSpecifications(product, fields, 'zh'), [
    { code: 'rated_power_w', label: '额定功率', value: '250', unit: 'W' },
    { code: 'battery_capacity', label: '电池容量', value: '360', unit: 'Wh' },
  ]);
});

test('public product specs localize labels and allow selecting a subset', () => {
  const product = { productType: 'EBI', specs: { rated_power_w: 250, battery_capacity: 360 } };
  assert.deepEqual(publicProductSpecifications(product, fields, 'de', new Set(['battery_capacity'])), [
    { code: 'battery_capacity', label: 'Batteriekapazität', value: '360', unit: 'Wh' },
  ]);
});

test('missing values are omitted and real numeric zero is not fabricated or discarded', () => {
  const product = { productType: 'EBI', specs: { rated_power_w: 0, battery_capacity: '' } };
  assert.deepEqual(publicProductSpecifications(product, fields, 'en'), [
    { code: 'rated_power_w', label: 'Rated Power', value: '0', unit: 'W' },
  ]);
});

test('missing product data produces an empty parameter list', () => {
  assert.deepEqual(publicProductSpecifications(null, fields, 'en'), []);
  assert.deepEqual(publicProductSpecifications({ productType: 'EBI', specs: null }, fields, 'en'), []);
});
