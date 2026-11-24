-- Enforce UUID v7 for entity tables that previously relied only on defaults.
BEGIN;

ALTER TABLE alsvid_v2.inventory_ledger ADD CONSTRAINT inventory_ledger_id_uuid_v7
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'));
ALTER TABLE alsvid_v2.inventory_reservations ADD CONSTRAINT inventory_reservations_id_uuid_v7
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'));
ALTER TABLE alsvid_v2.dealer_orders ADD CONSTRAINT dealer_orders_id_uuid_v7
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'));
ALTER TABLE alsvid_v2.dealer_order_items ADD CONSTRAINT dealer_order_items_id_uuid_v7
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'));

COMMIT;
