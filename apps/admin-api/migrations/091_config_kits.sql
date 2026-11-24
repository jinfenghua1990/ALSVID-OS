-- 15 位 3-3-3-3 工业 SKU：第 3 段在电池规格之外，新增「实物配置包」可选来源。
-- 配置包承载电池、传动与制动的真实硬件摘要，SKU 上只保存 3 位代号。

CREATE TABLE IF NOT EXISTS alsvid_v2.config_kits (
  code text PRIMARY KEY,
  name text NOT NULL,
  battery_spec text NOT NULL DEFAULT '',
  drivetrain text NOT NULL DEFAULT '',
  brakes text NOT NULL DEFAULT '',
  sort integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO alsvid_v2.config_kits(code,name,battery_spec,drivetrain,brakes,sort) VALUES
  ('K01','标准工程包','360Wh (36V 10Ah)','Shimano 7速链条','Shimano MT200 油碟',1),
  ('K02','长续航工程包','500Wh (36V 14Ah)','Shimano 7速链条','Shimano MT200 油碟',2),
  ('K03','静音皮带包','360Wh (36V 10Ah)','Gates CDN 碳纤皮带','Shimano MT200 油碟',3),
  ('K04','全避震旗舰包','360Wh (36V 10Ah)','Gates CDN 皮带 / 7速可选','Shimano MT200 油碟 (160mm)',4)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  battery_spec = EXCLUDED.battery_spec,
  drivetrain = EXCLUDED.drivetrain,
  brakes = EXCLUDED.brakes,
  sort = EXCLUDED.sort;

-- 字段标准库：实物配置包作为整车 SKU 生成字段，与电池规格并存。
INSERT INTO alsvid_v2.fields(code,name_zh,name_en,name_de,data_type,unit,options,level,templates,required,searchable,sku_gen,shop_visible,enabled)
VALUES ('config_kit','实物配置包','Config Kit','Konfigurationspaket','enum','','["K01","K02","K03","K04"]','sku','["EBI"]',false,true,true,false,true)
ON CONFLICT (code) DO UPDATE SET
  name_zh = EXCLUDED.name_zh,
  name_en = EXCLUDED.name_en,
  name_de = EXCLUDED.name_de,
  options = EXCLUDED.options,
  level = 'sku',
  templates = '["EBI"]',
  sku_gen = true,
  enabled = true;

-- 石墨灰按工业色卡校准为 RAL 7024。
UPDATE alsvid_v2.colors SET ral = 'RAL 7024', zh = '石墨灰', hex = '#64748B' WHERE code = 'GRY';
