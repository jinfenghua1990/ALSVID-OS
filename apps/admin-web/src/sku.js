// 整车 SKU：[车型代际 2-3 位]-[配置版本 3 位]-[外观颜色 3 位]-[市场法规 3 位]
const VEHICLE_SKU = /^[A-Z0-9]{2,3}-[A-Z0-9]{3}-[A-Z0-9]{3}-[A-Z0-9]{3}$/;

export function vehicleFamily(model) {
  const value = String(model ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^[A-Z0-9]{2,3}$/.test(value)) return '';
  return value.length === 3 && /^[A-Z][0-9]$/.test(value.slice(0, 2)) && /[SUP]$/.test(value[2]) ? value.slice(0, 2) : value;
}

export function isVehicleSku(code) {
  if (typeof code !== 'string' || (code.length !== 14 && code.length !== 15) || !VEHICLE_SKU.test(code)) return false;
  return code.split('-')[1] !== 'EBI';
}

export function buildVehicleSku(model, trim, color, region) {
  const segments = [vehicleFamily(model), trim, color, region].map(value => String(value ?? '').trim().toUpperCase());
  if (!segments[0] || !segments.slice(1).every(value => /^[A-Z0-9]{3}$/.test(value))) return '';
  const code = segments.join('-');
  return isVehicleSku(code) ? code : '';
}

export function skuSpecOptions(fields, productType) {
  const generators = fields.filter(field => field.level === 'sku' && field.skuGen &&
    (field.templates || []).includes(productType));
  if (!generators.length) return ['STD'];
  return [...new Set(generators.filter(field => field.enabled).flatMap(field => Array.isArray(field.options) ? field.options : []).filter(option => typeof option === 'string' && /^[A-Z0-9]{3}$/.test(option)))];
}
