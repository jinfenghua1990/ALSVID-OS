-- 颜色字典由用户自主维护：撤销 093 对 BLK / WHT 展示名称与色值的改动。
-- GRY 的 RAL 7024 校准保留（091 已确认）。
UPDATE alsvid_v2.colors SET zh = '黑色', hex = '#1f1f1f' WHERE code = 'BLK';
UPDATE alsvid_v2.colors SET zh = '白色', hex = '#f2f2f2' WHERE code = 'WHT';
