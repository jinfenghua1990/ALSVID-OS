BEGIN;

-- Keep SKU as the mandatory product identity for production orders.
-- The legacy BOM UUID relationship must be optional together with its text ID.
ALTER TABLE alsvid_v2.production_orders
  ALTER COLUMN bom_version_uuid DROP NOT NULL;

COMMIT;
