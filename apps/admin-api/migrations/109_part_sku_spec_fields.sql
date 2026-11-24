-- 109：配件规格编码字段（SKU 第三段生成器）+ 车架品类
-- 背景：原有配件模板没有 skuGen 字段时规格段只能固定 STD，多个配件会撞 SKU 编码。
-- 处理：为电池/电机/显示屏/控制器/车架各定义一个 skuGen 枚举字段，作为 SKU 第三段可选项。
INSERT INTO fields (code, name_zh, name_en, name_de, data_type, unit, level, options, templates, required, searchable, sku_gen, shop_visible, enabled)
VALUES
  ('bat_spec', '电池规格编码', 'Battery Spec Code', 'Batterie-Spezifikationscode', 'enum', '', 'sku', '["36S","36W"]', '["BAT"]', false, false, true, false, true),
  ('mot_spec', '电机规格编码', 'Motor Spec Code', 'Motor-Spezifikationscode', 'enum', '', 'sku', '["36V"]', '["MOT"]', false, false, true, false, true),
  ('dsp_spec', '仪表规格编码', 'Display Spec Code', 'Display-Spezifikationscode', 'enum', '', 'sku', '["LCD"]', '["DSP"]', false, false, true, false, true),
  ('ctl_spec', '控制器规格编码', 'Controller Spec Code', 'Controller-Spezifikationscode', 'enum', '', 'sku', '["36V"]', '["CTL"]', false, false, true, false, true),
  ('frm_spec', '车架规格编码', 'Frame Spec Code', 'Rahmen-Spezifikationscode', 'enum', '', 'sku', '["29M","29S","29X","29B","700"]', '["FRM"]', false, false, true, false, true)
ON CONFLICT (code) DO NOTHING;
