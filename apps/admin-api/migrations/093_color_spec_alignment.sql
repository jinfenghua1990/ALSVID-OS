-- 按工业色卡对齐 BLK / WHT 的名称与色值（GRY 已在 091 校准为 RAL 7024）。
UPDATE alsvid_v2.colors SET zh = '哑光黑', hex = '#1C1917' WHERE code = 'BLK';
UPDATE alsvid_v2.colors SET zh = '极光白', hex = '#F8FAFC' WHERE code = 'WHT';
