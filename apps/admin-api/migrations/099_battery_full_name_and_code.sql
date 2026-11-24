-- 电池容量改用全称（360Wh 电池），SKU 第 3 段的 3 位编码独立为 battery_code。
INSERT INTO alsvid_v2.fields
  (code, name_zh, name_en, name_de, data_type, unit, level, options, templates, required, searchable, sku_gen, shop_visible, enabled)
VALUES
  ('battery_code', '电池编码', 'Battery Code', 'Batteriecode', 'enum', '', 'sku',
   '["360","450","500"]'::jsonb, '["EBI","BAT"]'::jsonb, false, true, true, false, true)
ON CONFLICT (code) DO UPDATE SET
  name_zh = EXCLUDED.name_zh,
  name_en = EXCLUDED.name_en,
  name_de = EXCLUDED.name_de,
  data_type = EXCLUDED.data_type,
  unit = EXCLUDED.unit,
  level = EXCLUDED.level,
  options = EXCLUDED.options,
  templates = EXCLUDED.templates,
  sku_gen = EXCLUDED.sku_gen,
  enabled = true;

UPDATE alsvid_v2.fields
SET name_zh = '电池配置',
    name_en = 'Battery Pack',
    name_de = 'Batteriekonfiguration',
    data_type = 'enum',
    unit = '',
    level = 'product',
    sku_gen = false,
    options = '["360Wh 电池","450Wh 电池","500Wh 电池"]'::jsonb,
    templates = '["EBI"]'::jsonb
WHERE code = 'battery_capacity';
