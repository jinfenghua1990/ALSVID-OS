-- 整车产品库回归「物理产品与工程物料主数据」：补技术平台、EAN-13、RAL 色号，
-- 并把认证字段与整车工程参数纳入字段标准库。所有新增列均可为空，不伪造历史数据。

-- 1) 技术平台主档（车型继承平台代号）
CREATE TABLE IF NOT EXISTS alsvid_v2.platforms (
  code text PRIMARY KEY,
  name text NOT NULL,
  material text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO alsvid_v2.platforms(code,name,material) VALUES
  ('FC','碳纤维折叠平台','碳纤维'),
  ('AL','铝合金折叠平台','铝合金')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE alsvid_v2.products ADD COLUMN IF NOT EXISTS platform text REFERENCES alsvid_v2.platforms(code);

-- 2) EAN-13 国际出厂条码：仅存真实分配的条码，格式与唯一性由数据库兜底
ALTER TABLE alsvid_v2.skus ADD COLUMN IF NOT EXISTS ean13 text;
ALTER TABLE alsvid_v2.skus DROP CONSTRAINT IF EXISTS skus_ean13_format;
ALTER TABLE alsvid_v2.skus ADD CONSTRAINT skus_ean13_format CHECK (ean13 IS NULL OR ean13 ~ '^[0-9]{13}$');
CREATE UNIQUE INDEX IF NOT EXISTS skus_ean13_unique ON alsvid_v2.skus(ean13) WHERE ean13 IS NOT NULL;

-- 3) 颜色字典补 RAL 标准色号（由颜色字典维护，不写死在 SKU 上）
ALTER TABLE alsvid_v2.colors ADD COLUMN IF NOT EXISTS ral text NOT NULL DEFAULT '';

-- 4) 字段标准库：认证覆盖整车；车架材质补碳纤维；新增驱动形式与系统电压
UPDATE alsvid_v2.fields
SET templates = templates || '["EBI"]'::jsonb
WHERE code = 'certification' AND NOT (templates @> '["EBI"]'::jsonb);

UPDATE alsvid_v2.fields
SET options = options || '["碳纤维"]'::jsonb
WHERE code = 'frame_material' AND jsonb_typeof(options) = 'array' AND NOT (options @> '["碳纤维"]'::jsonb);

INSERT INTO alsvid_v2.fields(code,name_zh,name_en,name_de,data_type,unit,options,level,templates,required,searchable,sku_gen,shop_visible,enabled)
VALUES
  ('drive_type','驱动形式','Drive Type','Antriebsart','enum','','["后驱","中置电机","前驱"]','product','["EBI"]',false,true,false,false,true),
  ('system_voltage','系统电压','System Voltage','Systemspannung','number','V','[]','product','["EBI"]',false,true,false,false,true)
ON CONFLICT (code) DO NOTHING;
