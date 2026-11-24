-- Promote product, SKU, and color relations to direct UUID foreign keys.
-- Legacy text columns remain for API compatibility; existing sync triggers
-- continue deriving their UUID companion columns from those business keys.
BEGIN;

CREATE TEMP TABLE uuid_fk_targets (
  table_name text NOT NULL,
  legacy_column text NOT NULL,
  uuid_column text NOT NULL,
  target_table text NOT NULL,
  PRIMARY KEY(table_name,uuid_column)
) ON COMMIT DROP;

INSERT INTO uuid_fk_targets(table_name,legacy_column,uuid_column,target_table) VALUES
  ('bom_items','vehicle_id','vehicle_uuid','products'),
  ('bom_versions','vehicle_id','vehicle_uuid','products'),
  ('fits','part_product_id','part_product_uuid','products'),
  ('fits','vehicle_product_id','vehicle_product_uuid','products'),
  ('product_media','product_id','product_uuid','products'),
  ('skus','product_id','product_uuid','products'),
  ('bom_items','sku_code','sku_uuid','skus'),
  ('vins','sku_code','sku_uuid','skus'),
  ('repairs','replacement_sku','replacement_sku_uuid','skus'),
  ('substitutes','original_sku','original_sku_uuid','skus'),
  ('substitutes','replacement_sku','replacement_sku_uuid','skus'),
  ('bom_version_items','sku_code','sku_uuid','skus'),
  ('vin_installed','sku_code','sku_uuid','skus'),
  ('production_orders','sku_code','sku_uuid','skus'),
  ('warehouse_stock','sku_code','sku_uuid','skus'),
  ('stock_movements','sku_code','sku_uuid','skus'),
  ('repair_stock_events','sku_code','sku_uuid','skus'),
  ('repair_replacements','old_sku','old_sku_uuid','skus'),
  ('repair_replacements','new_sku','new_sku_uuid','skus'),
  ('production_order_materials','sku_code','sku_uuid','skus'),
  ('skus','color_code','color_uuid','colors');

DO $$
DECLARE
  relation record;
  source_table regclass;
  target_table regclass;
  legacy_attnum smallint;
  uuid_attnum smallint;
  target_attnum smallint;
  direct_constraint text;
BEGIN
  FOR relation IN SELECT * FROM uuid_fk_targets ORDER BY table_name,uuid_column LOOP
    source_table:=format('alsvid_v2.%I',relation.table_name)::regclass;
    target_table:=format('alsvid_v2.%I',relation.target_table)::regclass;

    SELECT attnum INTO legacy_attnum FROM pg_attribute
      WHERE attrelid=source_table AND attname=relation.legacy_column AND NOT attisdropped;
    SELECT attnum INTO uuid_attnum FROM pg_attribute
      WHERE attrelid=source_table AND attname=relation.uuid_column AND atttypid='uuid'::regtype AND NOT attisdropped;
    SELECT attnum INTO target_attnum FROM pg_attribute
      WHERE attrelid=target_table AND attname='entity_uuid' AND atttypid='uuid'::regtype AND NOT attisdropped;
    IF legacy_attnum IS NULL OR uuid_attnum IS NULL OR target_attnum IS NULL THEN
      RAISE EXCEPTION 'UUID relation prerequisites do not match for %.%',relation.table_name,relation.uuid_column;
    END IF;

    SELECT conname INTO direct_constraint FROM pg_constraint
      WHERE contype='f' AND conrelid=source_table AND confrelid=target_table
        AND conkey=ARRAY[uuid_attnum]::smallint[] AND confkey=ARRAY[target_attnum]::smallint[]
      LIMIT 1;
    IF direct_constraint IS NULL THEN
      direct_constraint:='uuid_fk_'||relation.table_name||'_'||relation.uuid_column;
      EXECUTE format('ALTER TABLE alsvid_v2.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES alsvid_v2.%I (entity_uuid) NOT VALID',
        relation.table_name,direct_constraint,relation.uuid_column,relation.target_table);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=source_table AND conname=direct_constraint AND NOT convalidated) THEN
      EXECUTE format('ALTER TABLE alsvid_v2.%I VALIDATE CONSTRAINT %I',relation.table_name,direct_constraint);
    END IF;
  END LOOP;

  FOR relation IN SELECT * FROM uuid_fk_targets ORDER BY table_name,uuid_column LOOP
    source_table:=format('alsvid_v2.%I',relation.table_name)::regclass;
    target_table:=format('alsvid_v2.%I',relation.target_table)::regclass;
    SELECT attnum INTO legacy_attnum FROM pg_attribute
      WHERE attrelid=source_table AND attname=relation.legacy_column AND NOT attisdropped;
    FOR direct_constraint IN
      SELECT conname FROM pg_constraint
      WHERE contype='f' AND conrelid=source_table AND confrelid=target_table
        AND legacy_attnum=ANY(conkey)
    LOOP
      EXECUTE format('ALTER TABLE alsvid_v2.%I DROP CONSTRAINT %I',relation.table_name,direct_constraint);
    END LOOP;
  END LOOP;
END;
$$;

COMMIT;
