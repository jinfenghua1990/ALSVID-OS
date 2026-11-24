function invalidSkuAttributes(message) {
  const error = new Error(message);
  error.code = 'SKU_ATTRIBUTES_INVALID';
  return error;
}

function normalizeSkuAttributes(input, fields, productType, existing = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalidSkuAttributes('SKU 参数格式无效');
  const applicable = fields.filter(field => field.level === 'sku' && !field.skuGen && (field.templates || []).includes(productType));
  const byCode = new Map(applicable.map(field => [field.code, field]));
  const result = { ...existing };
  for (const [code, raw] of Object.entries(input)) {
    const field = byCode.get(code);
    if (!field) throw invalidSkuAttributes('SKU 参数字段无效');
    const value = String(raw ?? '').trim();
    if (value.length > 2000) throw invalidSkuAttributes(`${field.nameZh}不能超过 2000 个字符`);
    if (value && field.type === 'enum' && !(field.options || []).includes(value)) throw invalidSkuAttributes(`${field.nameZh}选项无效`);
    if (value && field.type === 'number' && !Number.isFinite(Number(value))) throw invalidSkuAttributes(`${field.nameZh}必须为数字`);
    result[code] = value;
  }
  for (const field of applicable) {
    if (field.enabled && field.required && !String(result[field.code] ?? '').trim()) throw invalidSkuAttributes(`请填写${field.nameZh}`);
  }
  return result;
}

module.exports = { normalizeSkuAttributes };
