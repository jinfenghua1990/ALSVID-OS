-- Expand-only migration. Review and restore a backup before applying.
-- Execute once with psql as one transaction; this is not run by service startup.
-- Old IDs and SKU codes remain authoritative for existing API clients.
BEGIN;
LOCK TABLE alsvid_v2.products, alsvid_v2.skus IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION alsvid_v2.generate_uuid_v7()
RETURNS uuid LANGUAGE sql VOLATILE AS $$
  SELECT (lpad(to_hex(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint),12,'0') ||
          '7' || substr(replace(gen_random_uuid()::text,'-',''),14))::uuid;
$$;

ALTER TABLE alsvid_v2.products ADD COLUMN entity_uuid uuid;
ALTER TABLE alsvid_v2.products ALTER COLUMN entity_uuid SET DEFAULT alsvid_v2.generate_uuid_v7();
UPDATE alsvid_v2.products SET entity_uuid=alsvid_v2.generate_uuid_v7() WHERE entity_uuid IS NULL;
ALTER TABLE alsvid_v2.products ALTER COLUMN entity_uuid SET NOT NULL;
ALTER TABLE alsvid_v2.products ADD CONSTRAINT products_entity_uuid_unique UNIQUE (entity_uuid);
ALTER TABLE alsvid_v2.products ADD CONSTRAINT products_id_entity_uuid_unique UNIQUE (id,entity_uuid);
ALTER TABLE alsvid_v2.products ADD CONSTRAINT products_entity_uuid_v7 CHECK (substring(entity_uuid::text,15,1)='7' AND substring(entity_uuid::text,20,1) IN ('8','9','a','b'));

ALTER TABLE alsvid_v2.skus ADD COLUMN entity_uuid uuid;
ALTER TABLE alsvid_v2.skus ADD COLUMN product_uuid uuid;
ALTER TABLE alsvid_v2.skus ALTER COLUMN entity_uuid SET DEFAULT alsvid_v2.generate_uuid_v7();
UPDATE alsvid_v2.skus s SET entity_uuid=alsvid_v2.generate_uuid_v7(), product_uuid=p.entity_uuid
  FROM alsvid_v2.products p WHERE s.product_id=p.id;
ALTER TABLE alsvid_v2.skus ALTER COLUMN entity_uuid SET NOT NULL;
ALTER TABLE alsvid_v2.skus ALTER COLUMN product_uuid SET NOT NULL;
ALTER TABLE alsvid_v2.skus ADD CONSTRAINT skus_entity_uuid_unique UNIQUE (entity_uuid);
ALTER TABLE alsvid_v2.skus ADD CONSTRAINT skus_entity_uuid_v7 CHECK (substring(entity_uuid::text,15,1)='7' AND substring(entity_uuid::text,20,1) IN ('8','9','a','b'));
ALTER TABLE alsvid_v2.skus ADD CONSTRAINT skus_product_identity_fk FOREIGN KEY (product_id,product_uuid) REFERENCES alsvid_v2.products(id,entity_uuid);

CREATE OR REPLACE FUNCTION alsvid_v2.sync_sku_product_uuid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected uuid;
BEGIN
  SELECT entity_uuid INTO expected FROM alsvid_v2.products WHERE id=NEW.product_id;
  IF expected IS NULL THEN RAISE EXCEPTION 'SKU product does not exist' USING ERRCODE='23503'; END IF;
  IF TG_OP='INSERT' AND NEW.product_uuid IS NOT NULL AND NEW.product_uuid<>expected THEN
    RAISE EXCEPTION 'SKU product identities do not match' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.product_id=OLD.product_id AND NEW.product_uuid IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'SKU product identities do not match' USING ERRCODE='23514';
  END IF;
  IF TG_OP='UPDATE' AND NEW.product_id<>OLD.product_id AND NEW.product_uuid IS DISTINCT FROM OLD.product_uuid AND NEW.product_uuid IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'SKU product identities do not match' USING ERRCODE='23514';
  END IF;
  NEW.product_uuid := expected;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sync_sku_product_uuid BEFORE INSERT OR UPDATE OF product_id,product_uuid ON alsvid_v2.skus
  FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_sku_product_uuid();
COMMIT;
