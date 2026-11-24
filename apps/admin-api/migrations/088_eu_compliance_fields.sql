-- 欧盟 EN 15194 合规字段与规格字典补齐
-- 电池容量加入真实 36V 10Ah = 360Wh 选项
UPDATE alsvid_v2.fields SET options = '["360","450","500"]'::jsonb WHERE code = 'battery_capacity';
-- 旧字段收敛：整车改用 rated_power_w / max_assist_speed_kmh / electrical_voltage
UPDATE alsvid_v2.fields SET templates = '["MOT"]'::jsonb WHERE code = 'motor_power';
UPDATE alsvid_v2.fields SET templates = '[]'::jsonb WHERE code = 'max_speed';
UPDATE alsvid_v2.fields SET templates = '["BAT","CHG","MOT","CTL"]'::jsonb WHERE code = 'system_voltage';
