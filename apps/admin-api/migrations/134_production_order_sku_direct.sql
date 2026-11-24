BEGIN;

-- Production orders are created from an enabled vehicle SKU.  BOM remains a
-- product-engineering record and is no longer mandatory for an order.
ALTER TABLE alsvid_v2.production_orders
  ALTER COLUMN bom_version_id DROP NOT NULL;

COMMIT;
