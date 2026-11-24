-- Replace transitional mixed identity references with UUID foreign keys.
-- Legacy references and synchronization triggers remain during compatibility rollout.
BEGIN;
LOCK TABLE alsvid_v2.products, alsvid_v2.fits IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE alsvid_v2.fits
  ADD CONSTRAINT fits_part_product_uuid_direct_fk FOREIGN KEY (part_product_uuid) REFERENCES alsvid_v2.products(entity_uuid),
  ADD CONSTRAINT fits_vehicle_product_uuid_direct_fk FOREIGN KEY (vehicle_product_uuid) REFERENCES alsvid_v2.products(entity_uuid);
ALTER TABLE alsvid_v2.fits
  DROP CONSTRAINT fits_part_product_uuid_fk,
  DROP CONSTRAINT fits_vehicle_product_uuid_fk;
COMMIT;
