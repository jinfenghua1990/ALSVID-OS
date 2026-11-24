-- 颜色字典补标准 RAL 色号：仅回填为空且可确证的常用色，其他颜色保持待录入由字典维护。
UPDATE alsvid_v2.colors SET ral = 'RAL 9005' WHERE code = 'BLK' AND ral = '';
UPDATE alsvid_v2.colors SET ral = 'RAL 9016' WHERE code = 'WHT' AND ral = '';
UPDATE alsvid_v2.colors SET ral = 'RAL 7016' WHERE code = 'GRY' AND ral = '';
