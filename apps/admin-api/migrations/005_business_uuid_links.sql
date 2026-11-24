-- Requires migrations 002 and 004. Add UUID relationships beside legacy codes.
BEGIN;
LOCK TABLE alsvid_v2.products, alsvid_v2.skus, alsvid_v2.bom_items,
  alsvid_v2.vins, alsvid_v2.repairs, alsvid_v2.substitutes,
  alsvid_v2.bom_versions, alsvid_v2.bom_version_items, alsvid_v2.vin_installed,
  alsvid_v2.production_orders, alsvid_v2.warehouse_stock, alsvid_v2.stock_movements,
  alsvid_v2.repair_stock_events, alsvid_v2.repair_replacements,
  alsvid_v2.production_order_materials, alsvid_v2.product_media, alsvid_v2.fits
  IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE alsvid_v2.skus ADD CONSTRAINT skus_code_identity_pair_unique UNIQUE(code,entity_uuid);

CREATE OR REPLACE FUNCTION alsvid_v2.sync_identity_uuid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb:=to_jsonb(NEW);
  legacy_value text;
  supplied_uuid uuid;
  expected_uuid uuid;
  id_column text:=TG_ARGV[0];
  uuid_column text:=TG_ARGV[1];
  target_table text:=TG_ARGV[2];
BEGIN
  legacy_value:=row_data->>id_column;
  IF legacy_value IS NULL THEN
    IF row_data->>uuid_column IS NOT NULL THEN
      RAISE EXCEPTION 'legacy and UUID references must both be null' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  BEGIN supplied_uuid:=(row_data->>uuid_column)::uuid; EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid UUID reference' USING ERRCODE='22P02';
  END;
  IF target_table='products' THEN
    SELECT entity_uuid INTO expected_uuid FROM alsvid_v2.products WHERE id=legacy_value;
  ELSE
    SELECT entity_uuid INTO expected_uuid FROM alsvid_v2.skus WHERE code=legacy_value;
  END IF;
  IF expected_uuid IS NULL THEN RAISE EXCEPTION 'referenced business record does not exist' USING ERRCODE='23503'; END IF;
  IF supplied_uuid IS NOT NULL AND supplied_uuid<>expected_uuid THEN
    RAISE EXCEPTION 'legacy and UUID references do not match' USING ERRCODE='23514';
  END IF;
  row_data:=jsonb_set(row_data,ARRAY[uuid_column],to_jsonb(expected_uuid::text),true);
  NEW:=jsonb_populate_record(NEW,row_data);
  RETURN NEW;
END;
$$;

DO $$
DECLARE m record;
BEGIN
  FOR m IN SELECT * FROM (VALUES
    ('bom_items','vehicle_id','vehicle_uuid'),('bom_versions','vehicle_id','vehicle_uuid'),
    ('fits','part_product_id','part_product_uuid'),('fits','vehicle_product_id','vehicle_product_uuid'),
    ('product_media','product_id','product_uuid')
  ) AS x(tab,legacy_col,uuid_col)
  LOOP
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD COLUMN %I uuid',m.tab,m.uuid_col);
    EXECUTE format('UPDATE alsvid_v2.%I r SET %I=p.entity_uuid FROM alsvid_v2.products p WHERE r.%I=p.id',m.tab,m.uuid_col,m.legacy_col);
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD CONSTRAINT %I FOREIGN KEY(%I,%I) REFERENCES alsvid_v2.products(id,entity_uuid)',m.tab,m.tab||'_'||m.uuid_col||'_fk',m.legacy_col,m.uuid_col);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I,%I ON alsvid_v2.%I FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_identity_uuid(%L,%L,%L)',
      'sync_'||m.tab||'_'||m.uuid_col,m.legacy_col,m.uuid_col,m.tab,m.legacy_col,m.uuid_col,'products');
  END LOOP;

  FOR m IN SELECT * FROM (VALUES
    ('bom_items','sku_code','sku_uuid'),('vins','sku_code','sku_uuid'),
    ('repairs','replacement_sku','replacement_sku_uuid'),
    ('substitutes','original_sku','original_sku_uuid'),('substitutes','replacement_sku','replacement_sku_uuid'),
    ('bom_version_items','sku_code','sku_uuid'),('vin_installed','sku_code','sku_uuid'),
    ('production_orders','sku_code','sku_uuid'),('warehouse_stock','sku_code','sku_uuid'),
    ('stock_movements','sku_code','sku_uuid'),('repair_stock_events','sku_code','sku_uuid'),
    ('repair_replacements','old_sku','old_sku_uuid'),('repair_replacements','new_sku','new_sku_uuid'),
    ('production_order_materials','sku_code','sku_uuid')
  ) AS x(tab,legacy_col,uuid_col)
  LOOP
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD COLUMN %I uuid',m.tab,m.uuid_col);
    EXECUTE format('UPDATE alsvid_v2.%I r SET %I=s.entity_uuid FROM alsvid_v2.skus s WHERE r.%I=s.code',m.tab,m.uuid_col,m.legacy_col);
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD CONSTRAINT %I FOREIGN KEY(%I,%I) REFERENCES alsvid_v2.skus(code,entity_uuid)',m.tab,m.tab||'_'||m.uuid_col||'_fk',m.legacy_col,m.uuid_col);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF %I,%I ON alsvid_v2.%I FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_identity_uuid(%L,%L,%L)',
      'sync_'||m.tab||'_'||m.uuid_col,m.legacy_col,m.uuid_col,m.tab,m.legacy_col,m.uuid_col,'skus');
  END LOOP;
END;
$$;

COMMIT;
