-- Make catalog publication ownership depend directly on the product UUID.
-- Keep product_id and its sync trigger for existing application compatibility.
BEGIN;

ALTER TABLE alsvid_v2.catalog_publications
  ADD CONSTRAINT catalog_publications_product_uuid_direct_fk
  FOREIGN KEY (product_uuid)
  REFERENCES alsvid_v2.products(entity_uuid)
  NOT VALID;

ALTER TABLE alsvid_v2.catalog_publications
  VALIDATE CONSTRAINT catalog_publications_product_uuid_direct_fk;

ALTER TABLE alsvid_v2.catalog_publications
  DROP CONSTRAINT catalog_publications_product_id_fkey,
  DROP CONSTRAINT catalog_publications_product_identity_fk;

COMMIT;
