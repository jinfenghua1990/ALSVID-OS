// ALSVID V2.0 - 云端 PostgreSQL 数据规范与种子定义；本地 JSON 数据库已禁用。

// ---------------- 字典（SKU 四段规则的编码来源） ----------------

// 第一段：归属/车型
const OWNERSHIP = [
  { code: 'A1', label: 'A1 专用', kind: 'model' },
  { code: 'AL', label: 'ALSVID 品牌共用', kind: 'brand' },
  { code: 'UN', label: '通用配件（不限品牌车型）', kind: 'universal' },
];

// 第二段：商品品类编码 + 品类模板
const TEMPLATES = [
  { code: 'EBI', name: 'E-Bike 整车', kind: 'vehicle' },
  { code: 'BAT', name: '电池', kind: 'part' },
  { code: 'CHG', name: '充电器', kind: 'part' },
  { code: 'MOT', name: '电机', kind: 'part' },
  { code: 'CTL', name: '控制器', kind: 'part' },
  { code: 'DSP', name: '显示屏', kind: 'part' },
  { code: 'TIR', name: '轮胎/轮组', kind: 'part' },
  { code: 'BRK', name: '制动系统', kind: 'part' },
  { code: 'RCK', name: '货架', kind: 'part' },
  { code: 'FND', name: '挡泥板', kind: 'part' },
  { code: 'HLM', name: '头盔', kind: 'part' },
  { code: 'LCK', name: '车锁', kind: 'part' },
  { code: 'FRM', name: '车架', kind: 'part' },
  { code: 'GEN', name: '其他配件', kind: 'part' },
];

// 第三段：动态规格（按品类定义）
const SPEC_OPTIONS = {
  EBI: ['450', '500'],
  BAT: ['450', '500'],
  CHG: ['03A'],
  HLM: ['SML', 'MED', 'LRG'],
};

// 第四段：颜色（初始由颜色字典种子提供）

// BOM 初始标准部位（第 9.3 节）
const BOM_SECTIONS = [
  '车架与折叠', '操控与转向', '电池与电控', '轮组与传动',
  '制动系统', '驱动系统', '外设与附件', '紧固与包装',
];

// ---------------- 全局字段标准库种子 ----------------
// level: product=产品级 / sku=SKU 级 / bom=BOM 项目级
function F(code, zh, en, de, type, opts = {}) {
  return {
    code, nameZh: zh, nameEn: en, nameDe: de, type,
    unit: opts.unit || '',
    options: opts.options || [],
    level: opts.level || 'product',
    templates: opts.templates || [],
    required: !!opts.required,
    searchable: opts.searchable !== false,
    skuGen: !!opts.skuGen,
    shopVisible: !!opts.shopVisible,
    enabled: true,
    version: 1,
  };
}

const SEED_FIELDS = [
  // —— 折叠电动自行车 ——
  F('frame_material', '车架材质', 'Frame Material', 'Rahmenmaterial', 'enum', {
    options: ['铝合金', '铝合金+镁合金', '钛合金', '碳纤维'], templates: ['EBI'], required: true }),
  F('folding_structure', '折叠结构', 'Folding Structure', 'Faltmechanismus', 'enum', {
    options: ['中折', '竖折', '横折'], templates: ['EBI'], required: true }),
  F('motor_power', '电机功率', 'Motor Power', 'Motorleistung', 'number', {
    unit: 'W', templates: ['EBI', 'MOT'] }),
  F('wheel_size', '轮径', 'Wheel Size', 'Radgröße', 'enum', {
    options: ['14寸', '16寸', '20寸'], templates: ['EBI', 'TIR'] }),
  F('max_speed', '最高时速', 'Max Speed', 'Höchstgeschwindigkeit', 'number', {
    unit: 'km/h', templates: ['EBI'] }),
  F('range', '续航里程（参考区间）', 'Range (Reference)', 'Reichweite (Referenz)', 'text', {
    templates: ['EBI'], shopVisible: true }),
  F('drive_type', '驱动形式', 'Drive Type', 'Antriebsart', 'enum', {
    options: ['后驱', '中置电机', '前驱'], templates: ['EBI'] }),
  F('system_voltage', '系统电压', 'System Voltage', 'Systemspannung', 'number', {
    unit: 'V', templates: ['EBI'] }),
  // —— 欧盟法定合规（EN 15194 / EPAC） ——
  F('compliance_standard', '执行标准', 'Compliance Standard', 'Konformitätsstandard', 'text', {
    templates: ['EBI'], required: true }),
  F('rated_power_w', '额定功率', 'Rated Power', 'Nennleistung', 'number', {
    unit: 'W', templates: ['EBI'], required: true }),
  F('max_assist_speed_kmh', '助力切断时速', 'Assist Cut-off Speed', 'Abschaltgeschwindigkeit', 'number', {
    unit: 'km/h', templates: ['EBI'], required: true }),
  F('throttle_mode', '纯电油门模式', 'Throttle Mode', 'Gasgriff-Modus', 'enum', {
    options: ['无油门（纯踏板助力）', '仅 6 km/h 助推模式 (Walk Assist)'], templates: ['EBI'], required: true }),
  F('pedal_sensor', '传感方式', 'Pedal Sensor', 'Pedalsensor', 'enum', {
    options: ['双边力矩传感 (Torque Sensor)', '单边力矩传感', '踏频传感 (Cadence Sensor)'], templates: ['EBI'], required: true }),
  F('electrical_voltage', '标称电压', 'Nominal Voltage', 'Nennspannung', 'number', {
    unit: 'V', templates: ['EBI'], required: true }),
  F('battery_certs', '电池认证', 'Battery Certifications', 'Batteriezertifikate', 'text', {
    templates: ['EBI'], required: true }),
  F('street_legal_eu', '道路准行合规', 'EU Street Legal', 'EU-Straßenzulassung', 'enum', {
    options: ['是', '否'], templates: ['EBI'] }),
  // —— 物理几何与重量 ——
  F('standover_height', '低跨跨高', 'Standover Height', 'Überstandshöhe', 'number', {
    unit: 'cm', templates: ['EBI'] }),
  F('folded_size', '折叠尺寸', 'Folded Size', 'Faltmaß', 'text', { templates: ['EBI'] }),
  F('weight_belt', '整备重量（皮带款）', 'Weight (Belt)', 'Gewicht (Riemen)', 'number', {
    unit: 'kg', templates: ['EBI'] }),
  F('weight_chain', '整备重量（链条款）', 'Weight (Chain)', 'Gewicht (Kette)', 'number', {
    unit: 'kg', templates: ['EBI'] }),
  F('rider_height', '建议身高', 'Rider Height', 'Körpergröße', 'text', { templates: ['EBI'] }),
  F('max_rider_load', '最大骑手承重', 'Max Rider Load', 'Max. Zuladung', 'number', {
    unit: 'kg', templates: ['EBI'] }),
  // —— 传动与制动 ——
  F('transmission', '传动系统', 'Transmission', 'Antrieb', 'text', { templates: ['EBI'] }),
  F('brakes', '制动系统', 'Brakes', 'Bremsen', 'text', { templates: ['EBI'] }),
  F('battery_charge_time', '充电时间', 'Charge Time', 'Ladezeit', 'text', { templates: ['EBI'] }),
  // —— SKU 级 ——
  F('battery_code', '电池编码', 'Battery Code', 'Batteriecode', 'enum', {
    options: ['360', '450', '500'], level: 'sku', templates: ['EBI', 'BAT'], skuGen: true }),
  F('battery_capacity', '电池配置', 'Battery Pack', 'Batteriekonfiguration', 'enum', {
    options: ['360Wh 电池', '450Wh 电池', '500Wh 电池'], level: 'product', templates: ['EBI'],
    searchable: true, shopVisible: true }),
  F('charger_current', '充电电流', 'Charging Current', 'Ladestrom', 'enum', {
    options: ['03A'], unit: 'A', level: 'sku', templates: ['CHG'], skuGen: true }),
  F('helmet_size', '头盔尺码', 'Helmet Size', 'Helmgröße', 'enum', {
    options: ['SML', 'MED', 'LRG'], level: 'sku', templates: ['HLM'], skuGen: true }),
  F('rated_voltage', '额定电压', 'Rated Voltage', 'Nennspannung', 'number', {
    unit: 'V', level: 'sku', templates: ['BAT', 'CHG', 'MOT', 'CTL'] }),
  // —— 配件通用 ——
  F('net_weight', '净重', 'Net Weight', 'Nettogewicht', 'number', {
    unit: 'kg', templates: ['BAT', 'CHG', 'MOT', 'CTL', 'DSP', 'TIR', 'BRK', 'RCK', 'FND', 'HLM', 'LCK', 'GEN'] }),
  F('gross_weight', '包装毛重', 'Gross Weight', 'Bruttogewicht', 'number', {
    unit: 'kg', level: 'sku', templates: ['BAT', 'CHG', 'MOT', 'CTL', 'DSP', 'TIR', 'BRK', 'RCK', 'FND', 'HLM', 'LCK', 'GEN'] }),
  F('package_size', '包装尺寸', 'Package Size', 'Paketmaß', 'text', {
    level: 'sku', templates: ['BAT', 'CHG', 'MOT', 'CTL', 'DSP', 'TIR', 'BRK', 'RCK', 'FND', 'HLM', 'LCK', 'GEN'] }),
  F('connector_type', '接口类型', 'Connector Type', 'Anschlusstyp', 'text', {
    templates: ['BAT', 'CHG', 'MOT', 'CTL'] }),
  F('certification', '适用认证', 'Certification', 'Zertifizierung', 'text', {
    templates: ['EBI', 'HLM', 'BRK'] }),
];

// ---------------- 颜色字典种子（6.2） ----------------
const SEED_COLORS = [
  { code: 'BLK', zh: '黑色', en: 'Black', de: 'Schwarz', hex: '#1f1f1f', ral: 'RAL 9005', sort: 1, enabled: true },
  { code: 'WHT', zh: '白色', en: 'White', de: 'Weiß', hex: '#f2f2f2', ral: 'RAL 9016', sort: 2, enabled: true },
  { code: 'GRY', zh: '石墨灰', en: 'Grey', de: 'Grau', hex: '#64748B', ral: 'RAL 7024', sort: 3, enabled: true },
  { code: 'STD', zh: '标准色/不分色', en: 'Standard', de: 'Standard', hex: '#c9cdd4', ral: '', sort: 99, enabled: true },
];

function load() {
  throw new Error('本地 JSON 数据库已禁用；业务数据必须使用 ALSVID Production 云端 PostgreSQL。');
}

function save() {
  throw new Error('本地 JSON 数据库已禁用；业务数据必须写入 ALSVID Production 云端 PostgreSQL。');
}

module.exports = { load, save, OWNERSHIP, TEMPLATES, SPEC_OPTIONS, BOM_SECTIONS, SEED_FIELDS, SEED_COLORS };
