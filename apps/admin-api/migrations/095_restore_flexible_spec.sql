-- 第 3 段是「机动规格」：既可以是电池容量，也可以是配置包或其他 3 位编码。
-- 恢复 battery_capacity 作为整车 SKU 的可选来源，与 config_kit 并存。
UPDATE alsvid_v2.fields
SET templates = '["EBI","BAT"]'::jsonb
WHERE code = 'battery_capacity';
