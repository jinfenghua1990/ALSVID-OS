-- 整车品类编码收敛为定长 3 位 EBI（E-Bike），彻底移除历史 FEB。
-- 只改写字段模板与产品主档品类；历史 SKU 编码属于不可变业务单据，不做改写。

-- 1) 字段标准库：模板数组内的 FEB → EBI（去重，保持数组形态）
UPDATE alsvid_v2.fields
SET templates = to_jsonb(ARRAY(
  SELECT DISTINCT CASE WHEN value = 'FEB' THEN 'EBI' ELSE value END
  FROM jsonb_array_elements_text(templates)
))
WHERE templates @> '["FEB"]'::jsonb;

-- 2) 整车产品主档：product_type FEB → EBI
UPDATE alsvid_v2.products
SET product_type = 'EBI'
WHERE kind = 'vehicle' AND product_type = 'FEB';

-- 3) 续航里程改为参考区间文本，避免与不同电池容量的变体参数冲突
UPDATE alsvid_v2.fields
SET data_type = 'text',
    unit = '',
    name_zh = '续航里程（参考区间）',
    name_en = 'Range (Reference)',
    name_de = 'Reichweite (Referenz)'
WHERE code = 'range' AND data_type = 'number';
