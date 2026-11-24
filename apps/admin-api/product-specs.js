// 欧盟 EN 15194 法定红线：服务端强制校验，避免绕过前端直接写入违规车辆。
const EU_LIMITS = {
  rated_power_w: { max: 250, label: '额定功率', unit: 'W' },
  max_assist_speed_kmh: { max: 25, label: '助力切断时速', unit: 'km/h' },
  electrical_voltage: { max: 48, label: '标称电压', unit: 'V' }
};

function validateProductSpecs(specs, fields, productType) {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) throw new Error('产品参数格式无效');
  const applicable = fields.filter(field => field.enabled && field.level === 'product' &&
    (field.templates || []).includes(productType));
  for (const field of applicable) {
    const raw = specs[field.code];
    const value = String(raw ?? '').trim();
    if (field.required && !value) throw new Error('请填写产品必填参数');
    if (!value) continue;
    if (field.type === 'enum' && !(field.options || []).includes(value)) throw new Error('产品参数选项无效');
    if (field.type === 'number' && !Number.isFinite(Number(value))) throw new Error('产品参数必须为数字');
  }
  if (productType === 'EBI') {
    for (const [code, limit] of Object.entries(EU_LIMITS)) {
      const value = String(specs[code] ?? '').trim();
      if (!value) continue;
      const num = Number(value);
      if (Number.isFinite(num) && num > limit.max) {
        throw new Error(`欧盟 EN 15194 合规校验未通过：${limit.label}不得超过 ${limit.max}${limit.unit}`);
      }
    }
  }
}

module.exports = { validateProductSpecs };
