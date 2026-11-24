-- Use the product UUID as the direct SKU relationship while legacy IDs remain usable.
BEGIN;
LOCK TABLE alsvid_v2.products, alsvid_v2.skus IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE alsvid_v2.skus
  ADD CONSTRAINT skus_product_uuid_direct_fk FOREIGN KEY (product_uuid) REFERENCES alsvid_v2.products(entity_uuid);
ALTER TABLE alsvid_v2.skus DROP CONSTRAINT skus_product_identity_fk;
COMMIT;
