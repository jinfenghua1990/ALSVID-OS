'use strict';

// 整车 SKU：[车型代际 2-3 位]-[配置版本 3 位]-[外观颜色 3 位]-[市场法规 3 位]
// 例：A1-ULT-GRY-EUR（14 位）或 A1U-ULT-GRY-EUR（15 位）。
const VEHICLE_SKU = /^[A-Z0-9]{2,3}-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;
const PART_SKU = /^[A-Z0-9]{1,8}-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;

function isVehicleSku(code) {
  if (typeof code !== 'string' || (code.length !== 14 && code.length !== 15) || !VEHICLE_SKU.test(code)) return false;
  return code.split('-')[1] !== 'EBI';
}

// 兼容历史车型段 A1S/A1U/A1P：前两位是车系代际，最后一位是旧版本梯队。
function vehicleFamily(model) {
  const value = String(model ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{2,3}$/.test(value)) return '';
  return value.length === 3 && /^[A-Z][0-9]$/.test(value.slice(0, 2)) && /[SUP]$/.test(value[2]) ? value.slice(0, 2) : value;
}

function buildVehicleSku(model, trim, color, region) {
  const segments = [vehicleFamily(model), trim, color, region].map((value) => String(value ?? '').trim().toUpperCase());
  if (!segments[0] || !segments.slice(1).every((value) => /^[A-Z0-9]{3}$/.test(value))) throw new Error('整车 SKU 四段编码无效');
  const code = segments.join('-');
  if (!isVehicleSku(code)) throw new Error('整车 SKU 四段编码无效');
  return code;
}

// 配件仍沿用旧四段：[归属]-[品类]-[规格]-[颜色]。
function buildSku(ownership, productType, spec, color) {
  if (typeof ownership !== 'string' || !/^[A-Z0-9]{1,8}$/.test(ownership) ||
      typeof productType !== 'string' || !/^[A-Z0-9]{3}$/.test(productType) ||
      typeof spec !== 'string' || !/^[A-Z0-9]{3}$/.test(spec) ||
      typeof color !== 'string' || !/^[A-Z0-9]{3}$/.test(color)) {
    throw new Error('SKU 四段编码无效');
  }
  const code = `${ownership}-${productType}-${spec}-${color}`;
  if (!PART_SKU.test(code)) throw new Error('SKU 四段编码无效');
  return code;
}

function skuSpecOptions(productType, fields) {
  const generators = fields.filter(field => field.level === 'sku' && field.skuGen &&
    (field.templates || []).includes(productType));
  if (!generators.length) return ['STD'];
  return [...new Set(generators.filter(field => field.enabled).flatMap(field => Array.isArray(field.options) ? field.options : []).filter(option => typeof option === 'string' && /^[A-Z0-9]{3}$/.test(option)))];
}

function validSkuField(field, templates) {
  if (!field.skuGen || field.enabled === false) return true;
  return field.level === 'sku' && field.type === 'enum' && Array.isArray(field.options) && field.options.length > 0 && new Set(field.options).size === field.options.length && field.options.every(value => typeof value === 'string' && /^[A-Z0-9]{1,8}$/.test(value)) && Array.isArray(field.templates) && field.templates.length > 0 && field.templates.every(code => templates.some(template => template.code === code));
}
function validProductSkuBase(kind, ownership, productType, model, templates, ownerships) {
  if (!templates.some(template => template.kind === kind && template.code === productType)) return false;
  if (typeof ownership !== 'string' || !/^[A-Z0-9]{1,8}$/.test(ownership)) return false;
  return kind === 'vehicle'
    ? ownership === model && /^[A-Z0-9]{2,3}$/.test(model) && productType === 'EBI'
    : kind === 'part' && ownerships.some(item => item.code === ownership);
}
module.exports = { buildSku, buildVehicleSku, vehicleFamily, skuSpecOptions, validSkuField, validProductSkuBase, isVehicleSku };
