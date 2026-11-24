-- Promote repair and warehouse references to UUID foreign keys.
-- Existing business-key columns and their synchronization triggers remain in place.
BEGIN;

CREATE TEMP TABLE uuid_fk_targets (
  table_name text NOT NULL,
  legacy_column text NOT NULL,
  uuid_column text NOT NULL,
  target_table text NOT NULL,
  PRIMARY KEY(table_name,uuid_column)
) ON COMMIT DROP;

INSERT INTO uuid_fk_targets(table_name,legacy_column,uuid_column,target_table) VALUES
  ('repair_replacements','repair_id','repair_uuid','repairs'),
  ('repair_replacements','vin_id','vin_uuid','vins'),
  ('repair_stock_events','repair_id','repair_uuid','repairs'),
  ('repair_stock_events','warehouse_id','warehouse_uuid','warehouses'),
  ('repairs','vin','vin_uuid','vins'),
  ('vin_installed','vin_id','vin_uuid','vins'),
  ('old_part_recoveries','replacement_id','replacement_uuid','repair_replacements'),
  ('old_part_recoveries','warehouse_id','warehouse_uuid','warehouses'),
  ('old_part_recovery_events','replacement_id','replacement_uuid','old_part_recoveries'),
  ('old_part_recovery_events','warehouse_id','warehouse_uuid','warehouses'),
  ('old_part_restock_requests','movement_id','movement_uuid','stock_movements'),
  ('old_part_restock_requests','replacement_id','replacement_uuid','old_part_recoveries'),
  ('stock_movements','from_warehouse','from_warehouse_uuid','warehouses'),
  ('stock_movements','to_warehouse','to_warehouse_uuid','warehouses'),
  ('inventory_ledger','warehouse_id','warehouse_uuid','warehouses'),
  ('warehouse_stock','warehouse_id','warehouse_uuid','warehouses');

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
