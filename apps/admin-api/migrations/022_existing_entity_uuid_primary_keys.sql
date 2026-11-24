-- Promote existing UUID v7 identities without rewriting legacy business IDs.
BEGIN;

CREATE TEMP TABLE entity_primary_targets(table_name text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO entity_primary_targets(table_name) VALUES
  ('app_users'),('audit_log'),('bom_items'),('bom_version_items'),('bom_versions'),
  ('old_part_recoveries'),('old_part_recovery_events'),('old_part_restock_requests'),
  ('portal_service_requests'),('portal_vehicle_requests'),('product_media'),
  ('production_deliveries'),('production_delivery_receipts'),('production_order_attachments'),
  ('production_order_events'),('production_order_materials'),('production_orders'),
  ('repair_replacements'),('repair_stock_events'),('repairs'),('stock_movements'),
  ('substitutes'),('vin_installed'),('vins');

DO $$
DECLARE target record;
BEGIN
  FOR target IN SELECT table_name FROM entity_primary_targets ORDER BY table_name LOOP
    EXECUTE format('LOCK TABLE alsvid_v2.%I IN ACCESS EXCLUSIVE MODE',target.table_name);
  END LOOP;
END;
$$;

CREATE TEMP TABLE entity_primary_metadata ON COMMIT DROP AS
SELECT target.table_name, pk.conname AS primary_name, key_column.attname AS legacy_column,
       uuid_unique.conname AS uuid_unique_name
FROM entity_primary_targets target
JOIN pg_namespace ns ON ns.nspname='alsvid_v2'
JOIN pg_class rel ON rel.relnamespace=ns.oid AND rel.relname=target.table_name
JOIN pg_constraint pk ON pk.conrelid=rel.oid AND pk.contype='p' AND cardinality(pk.conkey)=1
JOIN pg_attribute key_column ON key_column.attrelid=rel.oid AND key_column.attnum=pk.conkey[1]
JOIN pg_attribute uuid_column ON uuid_column.attrelid=rel.oid AND uuid_column.attname='entity_uuid'
  AND uuid_column.atttypid='uuid'::regtype AND uuid_column.attnotnull AND NOT uuid_column.attisdropped
JOIN pg_constraint uuid_unique ON uuid_unique.conrelid=rel.oid AND uuid_unique.contype='u'
  AND uuid_unique.conkey=ARRAY[uuid_column.attnum]::smallint[];

DO $$
BEGIN
  IF (SELECT count(*) FROM entity_primary_metadata)<>(SELECT count(*) FROM entity_primary_targets) THEN
    RAISE EXCEPTION 'entity UUID primary key preconditions do not match';
  END IF;
END;
$$;

CREATE TEMP TABLE entity_primary_fk_restore ON COMMIT DROP AS
SELECT ns.nspname AS schema_name, rel.relname AS table_name, con.conname,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid=con.conrelid
JOIN pg_namespace ns ON ns.oid=rel.relnamespace
JOIN pg_class target_rel ON target_rel.oid=con.confrelid
JOIN pg_namespace target_ns ON target_ns.oid=target_rel.relnamespace
JOIN entity_primary_targets target ON target.table_name=target_rel.relname
WHERE con.contype='f' AND target_ns.nspname='alsvid_v2';

DO $$
DECLARE fk record;
BEGIN
  IF EXISTS (SELECT 1 FROM entity_primary_fk_restore WHERE schema_name<>'alsvid_v2') THEN
    RAISE EXCEPTION 'external entity foreign keys require separate review';
  END IF;
  FOR fk IN SELECT * FROM entity_primary_fk_restore ORDER BY schema_name,table_name,conname LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',fk.schema_name,fk.table_name,fk.conname);
  END LOOP;
END;
$$;

DO $$
DECLARE target record;
BEGIN
  FOR target IN SELECT * FROM entity_primary_metadata ORDER BY table_name LOOP
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD CONSTRAINT %I UNIQUE (%I)',
      target.table_name,target.table_name||'_legacy_key_unique',target.legacy_column);
    EXECUTE format('ALTER TABLE alsvid_v2.%I DROP CONSTRAINT %I',target.table_name,target.primary_name);
    EXECUTE format('ALTER TABLE alsvid_v2.%I DROP CONSTRAINT %I',target.table_name,target.uuid_unique_name);
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD CONSTRAINT %I PRIMARY KEY (entity_uuid)',
      target.table_name,target.table_name||'_pkey');
  END LOOP;
END;
$$;

DO $$
DECLARE fk record;
BEGIN
  FOR fk IN SELECT * FROM entity_primary_fk_restore ORDER BY schema_name,table_name,conname LOOP
    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',fk.schema_name,fk.table_name,fk.conname,fk.definition);
  END LOOP;
END;
$$;

COMMIT;
