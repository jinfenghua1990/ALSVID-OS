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


test('internal keys and structured values never leak into public specifications', () => {
  const extra = [
    { ...fields[0], code: '_internal', shopVisible: true },
    { ...fields[0], code: 'nested' },
    { ...fields[0], code: 'flag' },
  ];
  assert.deepEqual(publicProductSpecifications({ productType: 'EBI', specs: { _internal: 'private', nested: { note: 'private' }, flag: false } }, extra, 'en'), [
    { code: 'flag', label: 'Rated Power', value: 'false', unit: 'W' },
  ]);
});

test('enum options localize properly for de, en and zh', () => {
  const enumFields = [
    {
      code: 'brake_type',
      nameZh: '刹车类型',
      nameEn: 'Brake Type',
      nameDe: 'Bremsentyp',
      level: 'product',
      templates: ['EBI'],
      enabled: true,
      shopVisible: true,
      options: [
        { value: 'hydraulic_disc', labelZh: '油压碟刹', labelEn: 'Hydraulic Disc Brake', labelDe: 'Hydraulische Scheibenbremse' },
        { value: 'mechanical_disc', labelZh: '机械碟刹', labelEn: 'Mechanical Disc Brake', labelDe: 'Mechanische Scheibenbremse' }
      ]
    }
  ];
  const product = { productType: 'EBI', specs: { brake_type: 'hydraulic_disc' } };
  assert.equal(publicProductSpecifications(product, enumFields, 'de')[0].value, 'Hydraulische Scheibenbremse');
  assert.equal(publicProductSpecifications(product, enumFields, 'en')[0].value, 'Hydraulic Disc Brake');
  assert.equal(publicProductSpecifications(product, enumFields, 'zh')[0].value, '油压碟刹');
});

test('boolean field formats correctly per locale', () => {
  const boolFields = [
    { code: 'has_throttle', type: 'boolean', nameZh: '纯电油门', nameEn: 'Throttle', nameDe: 'Gasgriff', level: 'product', templates: ['EBI'], enabled: true, shopVisible: true }
  ];
  const productTrue = { productType: 'EBI', specs: { has_throttle: true } };
  const productFalse = { productType: 'EBI', specs: { has_throttle: false } };
  assert.equal(publicProductSpecifications(productTrue, boolFields, 'de')[0].value, 'Ja');
  assert.equal(publicProductSpecifications(productFalse, boolFields, 'de')[0].value, 'Nein');
  assert.equal(publicProductSpecifications(productTrue, boolFields, 'en')[0].value, 'Yes');
  assert.equal(publicProductSpecifications(productFalse, boolFields, 'en')[0].value, 'No');
  assert.equal(publicProductSpecifications(productTrue, boolFields, 'zh')[0].value, '是');
  assert.equal(publicProductSpecifications(productFalse, boolFields, 'zh')[0].value, '否');
});

test('duplicate units are stripped cleanly from numeric spec values', () => {
  const speedFields = [
    { code: 'max_speed', nameZh: '最高车速', nameEn: 'Max Speed', nameDe: 'Höchstgeschwindigkeit', unit: 'km/h', level: 'product', templates: ['EBI'], enabled: true, shopVisible: true }
  ];
  const product = { productType: 'EBI', specs: { max_speed: '25 km/h' } };
  const res = publicProductSpecifications(product, speedFields, 'en');
  assert.deepEqual(res, [
    { code: 'max_speed', label: 'Max Speed', value: '25', unit: 'km/h' }
  ]);
});

test('preserves custom ordered field codes sequence', () => {
  const orderedFields = [
    { code: 'b_field', nameZh: 'B', nameEn: 'B', nameDe: 'B', level: 'product', templates: ['EBI'], enabled: true, shopVisible: true },
    { code: 'a_field', nameZh: 'A', nameEn: 'A', nameDe: 'A', level: 'product', templates: ['EBI'], enabled: true, shopVisible: true },
  ];
  const product = { productType: 'EBI', specs: { a_field: '1', b_field: '2' } };
  const res = publicProductSpecifications(product, orderedFields, 'zh', ['a_field', 'b_field']);
  assert.equal(res[0].code, 'a_field');
  assert.equal(res[1].code, 'b_field');
});
