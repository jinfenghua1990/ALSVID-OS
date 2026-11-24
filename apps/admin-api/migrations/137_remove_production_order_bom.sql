BEGIN;

DROP TRIGGER IF EXISTS sync_production_orders_bom_version_uuid ON alsvid_v2.production_orders;

ALTER TABLE alsvid_v2.production_orders
  DROP COLUMN bom_version_uuid,
  DROP COLUMN bom_version_id;

COMMIT;
