-- 整车 SKU 第 3 段锁定为实物配置包（K 码），不再使用电池容量。
-- battery_capacity 仍保留在字段库，但只作为电池品类（BAT）的 SKU 段。
UPDATE alsvid_v2.fields
SET templates = '["BAT"]'::jsonb
WHERE code = 'battery_capacity' AND templates ? 'EBI';
