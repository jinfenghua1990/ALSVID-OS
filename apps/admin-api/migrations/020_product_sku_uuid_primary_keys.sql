-- Promote existing UUID v7 identities while retaining stable business codes.
BEGIN;

LOCK TABLE alsvid_v2.products, alsvid_v2.skus IN ACCESS EXCLUSIVE MODE;

CREATE TEMP TABLE product_sku_fk_restore ON COMMIT DROP AS
SELECT ns.nspname AS schema_name, rel.relname AS table_name, con.conname,
       pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class rel ON rel.oid=con.conrelid
JOIN pg_namespace ns ON ns.oid=rel.relnamespace
WHERE con.contype='f'
  AND con.confrelid IN ('alsvid_v2.products'::regclass, 'alsvid_v2.skus'::regclass);

DO $$
DECLARE fk record;
BEGIN
  IF EXISTS (SELECT 1 FROM product_sku_fk_restore WHERE schema_name<>'alsvid_v2') THEN
    RAISE EXCEPTION 'external product or SKU foreign keys require separate review';
  END IF;
  FOR fk IN SELECT * FROM product_sku_fk_restore ORDER BY schema_name,table_name,conname LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I',fk.schema_name,fk.table_name,fk.conname);
  END LOOP;
END;
$$;

ALTER TABLE alsvid_v2.products ADD CONSTRAINT products_legacy_id_unique UNIQUE (id);
ALTER TABLE alsvid_v2.skus ADD CONSTRAINT skus_legacy_code_unique UNIQUE (code);
ALTER TABLE alsvid_v2.products DROP CONSTRAINT products_pkey;
ALTER TABLE alsvid_v2.skus DROP CONSTRAINT skus_pkey;
ALTER TABLE alsvid_v2.products DROP CONSTRAINT products_entity_uuid_unique;
ALTER TABLE alsvid_v2.skus DROP CONSTRAINT skus_entity_uuid_unique;
ALTER TABLE alsvid_v2.products ADD CONSTRAINT products_pkey PRIMARY KEY (entity_uuid);
ALTER TABLE alsvid_v2.skus ADD CONSTRAINT skus_pkey PRIMARY KEY (entity_uuid);

DO $$
DECLARE fk record;
BEGIN
  FOR fk IN SELECT * FROM product_sku_fk_restore ORDER BY schema_name,table_name,conname LOOP
    EXECUTE format('ALTER TABLE %I.%I ADD CONSTRAINT %I %s',fk.schema_name,fk.table_name,fk.conname,fk.definition);
  END LOOP;
END;
$$;

COMMIT;
