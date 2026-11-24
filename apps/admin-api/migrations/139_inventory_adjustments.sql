BEGIN;

ALTER TABLE alsvid_v2.inventory_ledger
  DROP CONSTRAINT IF EXISTS inventory_ledger_source_type_check;
ALTER TABLE alsvid_v2.inventory_ledger
  ADD CONSTRAINT inventory_ledger_source_type_check
  CHECK (source_type IN ('stock_movement','repair_stock_event','opening_balance','production_order_material','sales_order','manual_adjustment'));

CREATE TABLE alsvid_v2.inventory_adjustments (
  id uuid PRIMARY KEY,
  warehouse_uuid uuid NOT NULL REFERENCES alsvid_v2.warehouses(entity_uuid),
  sku_uuid uuid NOT NULL REFERENCES alsvid_v2.skus(entity_uuid),
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  note text NOT NULL CHECK (length(trim(note)) BETWEEN 1 AND 500),
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE INDEX inventory_adjustments_warehouse_sku_idx
  ON alsvid_v2.inventory_adjustments(warehouse_uuid,sku_uuid,created_at,id);

CREATE FUNCTION alsvid_v2.reject_inventory_adjustment_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory adjustments are append-only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER inventory_adjustments_immutable
  BEFORE UPDATE OR DELETE ON alsvid_v2.inventory_adjustments
  FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_inventory_adjustment_mutation();

COMMIT;
