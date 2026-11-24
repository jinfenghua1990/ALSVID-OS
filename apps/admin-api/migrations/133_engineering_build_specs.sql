BEGIN;

CREATE TABLE alsvid_v2.engineering_build_specs (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  code text NOT NULL UNIQUE CHECK (code = upper(code) AND length(trim(code)) > 0),
  sku_uuid uuid NOT NULL REFERENCES alsvid_v2.skus(entity_uuid) ON DELETE RESTRICT,
  bom_version_uuid uuid NOT NULL REFERENCES alsvid_v2.bom_versions(entity_uuid) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','RELEASED')),
  notes text NOT NULL DEFAULT '',
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object'),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  effective_from timestamptz,
  released_at timestamptz,
  released_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,
  created_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,
  updated_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION alsvid_v2.guard_engineering_build_spec() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sku_product uuid; bom_product uuid; bom_status text;
BEGIN
  IF TG_OP <> 'INSERT' AND OLD.status = 'RELEASED' THEN
    RAISE EXCEPTION '已发布的生产规格不可修改';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'DRAFT' THEN
    RAISE EXCEPTION '生产规格必须先创建草稿';
  END IF;
  SELECT product_uuid INTO sku_product FROM alsvid_v2.skus WHERE entity_uuid=NEW.sku_uuid;
  SELECT vehicle_uuid,status INTO bom_product,bom_status FROM alsvid_v2.bom_versions WHERE entity_uuid=NEW.bom_version_uuid;
  IF sku_product IS NULL OR bom_product IS NULL OR sku_product <> bom_product THEN
    RAISE EXCEPTION 'SKU 与 BOM 必须属于同一整车产品';
  END IF;
  IF NEW.status = 'RELEASED' AND bom_status <> 'published' THEN
    RAISE EXCEPTION '生产规格只能关联已发布的 BOM';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_engineering_build_spec
BEFORE INSERT OR UPDATE OR DELETE ON alsvid_v2.engineering_build_specs
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_engineering_build_spec();

COMMIT;
