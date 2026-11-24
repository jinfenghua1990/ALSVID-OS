-- 欧盟 EN 15194 合规 / 几何重量 / 传动制动字段入库（幂等）
INSERT INTO alsvid_v2.fields(code,name_zh,name_en,name_de,data_type,unit,options,level,templates,required,searchable,sku_gen,shop_visible,enabled) VALUES
('compliance_standard','执行标准','Compliance Standard','Konformitätsstandard','text','','[]','product','["EBI"]',true,true,false,false,true),
('rated_power_w','额定功率','Rated Power','Nennleistung','number','W','[]','product','["EBI"]',true,true,false,false,true),
('max_assist_speed_kmh','助力切断时速','Assist Cut-off Speed','Abschaltgeschwindigkeit','number','km/h','[]','product','["EBI"]',true,true,false,false,true),
('throttle_mode','纯电油门模式','Throttle Mode','Gasgriff-Modus','enum','','["无油门（纯踏板助力）","仅 6 km/h 助推模式 (Walk Assist)"]','product','["EBI"]',true,true,false,false,true),
('pedal_sensor','传感方式','Pedal Sensor','Pedalsensor','enum','','["双边力矩传感 (Torque Sensor)","单边力矩传感","踏频传感 (Cadence Sensor)"]','product','["EBI"]',true,true,false,false,true),
('electrical_voltage','标称电压','Nominal Voltage','Nennspannung','number','V','[]','product','["EBI"]',true,true,false,false,true),
('battery_certs','电池认证','Battery Certifications','Batteriezertifikate','text','','[]','product','["EBI"]',true,true,false,false,true),
('street_legal_eu','道路准行合规','EU Street Legal','EU-Straßenzulassung','enum','','["是","否"]','product','["EBI"]',false,true,false,false,true),
('standover_height','低跨跨高','Standover Height','Überstandshöhe','number','cm','[]','product','["EBI"]',false,true,false,false,true),
('folded_size','折叠尺寸','Folded Size','Faltmaß','text','','[]','product','["EBI"]',false,true,false,false,true),
('weight_belt','整备重量（皮带款）','Weight (Belt)','Gewicht (Riemen)','number','kg','[]','product','["EBI"]',false,true,false,false,true),
('weight_chain','整备重量（链条款）','Weight (Chain)','Gewicht (Kette)','number','kg','[]','product','["EBI"]',false,true,false,false,true),
('rider_height','建议身高','Rider Height','Körpergröße','text','','[]','product','["EBI"]',false,true,false,false,true),
('max_rider_load','最大骑手承重','Max Rider Load','Max. Zuladung','number','kg','[]','product','["EBI"]',false,true,false,false,true),
('transmission','传动系统','Transmission','Antrieb','text','','[]','product','["EBI"]',false,true,false,false,true),
('brakes','制动系统','Brakes','Bremsen','text','','[]','product','["EBI"]',false,true,false,false,true),
('battery_charge_time','充电时间','Charge Time','Ladezeit','text','','[]','product','["EBI"]',false,true,false,false,true)
ON CONFLICT (code) DO NOTHING;
