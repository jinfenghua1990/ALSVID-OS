-- Promote warehouse and factory UUID v7 identities while keeping legacy IDs unique.
BEGIN;

LOCK TABLE alsvid_v2.warehouses, alsvid_v2.factories IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE warehouse_factory_fk_restore ON COMMIT DROP AS
SELECT ns.nspname AS schema_name, rel.relname AS table_name, con.conname,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid=con.conrelid
JOIN pg_namespace ns ON ns.oid=rel.relnamespace
WHERE con.contype='f'
  AND con.confrelid IN ('alsvid_v2.warehouses'::regclass, 'alsvid_v2.factories'::regclass);

DO $$
DECLARE fk record;
BEGIN
  IF EXISTS (SELECT 1 FROM warehouse_factory_fk_restore WHERE schema_name<>'alsvid_v2') THEN
    RAISE EXCEPTION 'external warehouse or factory foreign keys require separate review';
  END IF;
  FOR fk IN SELECT * FROM warehouse_factory_fk_restore ORDER BY schema_name,table_name,conname LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',fk.schema_name,fk.table_name,fk.conname);
  END LOOP;
END;
$$;

ALTER TABLE alsvid_v2.warehouses ADD CONSTRAINT warehouses_legacy_id_unique UNIQUE (id);
ALTER TABLE alsvid_v2.factories ADD CONSTRAINT factories_legacy_id_unique UNIQUE (id);
ALTER TABLE alsvid_v2.warehouses DROP CONSTRAINT warehouses_pkey;
ALTER TABLE alsvid_v2.factories DROP CONSTRAINT factories_pkey;
ALTER TABLE alsvid_v2.warehouses DROP CONSTRAINT warehouses_entity_uuid_unique;
ALTER TABLE alsvid_v2.factories DROP CONSTRAINT factories_entity_uuid_uq;
ALTER TABLE alsvid_v2.warehouses ADD CONSTRAINT warehouses_pkey PRIMARY KEY (entity_uuid);
ALTER TABLE alsvid_v2.factories ADD CONSTRAINT factories_pkey PRIMARY KEY (entity_uuid);

DO $$
DECLARE fk record;
BEGIN
  FOR fk IN SELECT * FROM warehouse_factory_fk_restore ORDER BY schema_name,table_name,conname LOOP
    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',fk.schema_name,fk.table_name,fk.conname,fk.definition);
  END LOOP;
END;
$$;

COMMIT;
