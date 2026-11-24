-- 整车 SKU 升级为四段：[车型代际 2-3 位]-[配置版本 3 位]-[外观颜色 3 位]-[市场法规 3 位]
-- 例：A1-ULT-GRY-EUR（14 位）、A1U-ULT-GRY-EUR（15 位）。
ALTER TABLE alsvid_v2.skus ADD COLUMN IF NOT EXISTS region_code text NOT NULL DEFAULT 'EUR';

INSERT INTO alsvid_v2.fields (code, name_zh, name_en, name_de, data_type, unit, level, options, templates, required, searchable, sku_gen, shop_visible, enabled)
VALUES
  ('trim_code', '配置版本', 'Trim', 'Ausstattung', 'enum', '', 'sku', '["ULT","PRO","STD"]'::jsonb, '["EBI"]'::jsonb, false, true, false, false, true),
  ('region_code', '市场法规', 'Market / Regulation', 'Markt / Regelung', 'enum', '', 'sku', '["EUR","GBR","USA"]'::jsonb, '["EBI"]'::jsonb, false, true, false, false, true)
ON CONFLICT (code) DO NOTHING;

-- 电池容量不再参与 SKU 编码，避免 360Wh/450Wh/500Wh 伪选项进入物料码。
UPDATE alsvid_v2.fields SET sku_gen = false WHERE code = 'battery_code';

-- 存量整车 SKU 迁移：A1S/A1U 为旧版本梯队，新码把版本移到第二段。
UPDATE alsvid_v2.skus
SET code = 'A1-STD-PUR-EUR', spec = 'STD', region_code = 'EUR'
WHERE code = 'A1S-EBI-360-PUR';

UPDATE alsvid_v2.skus
SET code = 'A1-ULT-GRY-EUR', spec = 'ULT', region_code = 'EUR'
WHERE code = 'A1U-EBI-360-GRY';
