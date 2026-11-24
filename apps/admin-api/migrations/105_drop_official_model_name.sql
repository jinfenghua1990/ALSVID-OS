-- 官方型号全称与产品中文名称语义重叠，统一由 products.name 承载。
-- 删除列前先把非空值留档到 audit_log，便于追溯原填写的对外型号名。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'alsvid_v2' AND table_name = 'products' AND column_name = 'official_model_name'
  ) THEN
    INSERT INTO alsvid_v2.audit_log(actor, action, target, after_json)
    SELECT 'system', 'product.drop_official_model_name', 'products/' || id,
           jsonb_build_object('officialModelName', official_model_name)
    FROM alsvid_v2.products
    WHERE btrim(official_model_name) <> '';

    ALTER TABLE alsvid_v2.products DROP COLUMN official_model_name;
  END IF;
END $$;
