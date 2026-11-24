-- 整车硬件技术参数补全：电池 / 车架 / 电机 / 传动 / 制动模块所需的可选字段（幂等）
INSERT INTO alsvid_v2.fields(code,name_zh,name_en,name_de,data_type,unit,options,level,templates,required,searchable,sku_gen,shop_visible,enabled) VALUES
('battery_form','电池形式','Battery Form','Batterieform','enum','','["可拆卸可锁座管电池","内置固定电池","后货架电池"]','product','["EBI"]',false,true,false,false,true),
('extended_battery','选配扩展电池','Extended Battery','Zusatzbatterie','enum','','["支持外接水壶扩展电池","不支持扩展"]','product','["EBI"]',false,true,false,false,true),
('surface_finish','表面工艺','Surface Finish','Oberfläche','text','','[]','product','["EBI"]',false,true,false,false,true),
('max_torque','最大扭矩','Max Torque','Max. Drehmoment','number','N·m','[]','product','["EBI"]',false,true,false,false,true),
('transmission_set','变速套件','Transmission Set','Schaltgruppe','text','','[]','product','["EBI"]',false,true,false,false,true),
('brake_model','制动型号','Brake Model','Bremsmodell','text','','[]','product','["EBI"]',false,true,false,false,true),
('rotor_spec','刹车碟片','Rotor Spec','Bremsscheibe','text','','[]','product','["EBI"]',false,true,false,false,true),
('front_suspension','前避震器','Front Suspension','Vorderradfederung','text','','[]','product','["EBI"]',false,true,false,false,true),
('rear_suspension','后避震器','Rear Suspension','Hinterradfederung','text','','[]','product','["EBI"]',false,true,false,false,true),
('tire_spec','轮胎规格','Tire Spec','Reifenspezifikation','text','','[]','product','["EBI"]',false,true,false,false,true)
ON CONFLICT (code) DO NOTHING;
