-- Requires migrations 002_product_sku_uuid_expand.sql first.
-- Expand-only: balance tables and existing event records remain unchanged.
BEGIN;

CREATE TABLE alsvid_v2.inventory_ledger (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  source_type text NOT NULL CHECK (source_type IN ('stock_movement','repair_stock_event','opening_balance')),
  source_id text NOT NULL,
  line_no smallint NOT NULL DEFAULT 1 CHECK (line_no > 0),
  sku_uuid uuid NOT NULL REFERENCES alsvid_v2.skus(entity_uuid),
  warehouse_id text NOT NULL REFERENCES alsvid_v2.warehouses(id),
  quantity_delta integer NOT NULL CHECK (quantity_delta <> 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_type,source_id,line_no)
);
CREATE INDEX inventory_ledger_sku_warehouse_idx ON alsvid_v2.inventory_ledger(sku_uuid,warehouse_id,created_at,id);

INSERT INTO alsvid_v2.inventory_ledger(source_type,source_id,line_no,sku_uuid,warehouse_id,quantity_delta,created_at)
SELECT 'stock_movement',m.id,1,s.entity_uuid,m.to_warehouse,m.quantity,m.created_at
FROM alsvid_v2.stock_movements m JOIN alsvid_v2.skus s ON s.code=m.sku_code
WHERE m.kind='入库' ON CONFLICT(source_type,source_id,line_no) DO NOTHING;
INSERT INTO alsvid_v2.inventory_ledger(source_type,source_id,line_no,sku_uuid,warehouse_id,quantity_delta,created_at)
SELECT 'stock_movement',m.id,1,s.entity_uuid,m.from_warehouse,-m.quantity,m.created_at
FROM alsvid_v2.stock_movements m JOIN alsvid_v2.skus s ON s.code=m.sku_code
WHERE m.kind='调拨' AND m.from_warehouse IS NOT NULL ON CONFLICT(source_type,source_id,line_no) DO NOTHING;
INSERT INTO alsvid_v2.inventory_ledger(source_type,source_id,line_no,sku_uuid,warehouse_id,quantity_delta,created_at)
SELECT 'stock_movement',m.id,2,s.entity_uuid,m.to_warehouse,m.quantity,m.created_at
FROM alsvid_v2.stock_movements m JOIN alsvid_v2.skus s ON s.code=m.sku_code
WHERE m.kind='调拨' ON CONFLICT(source_type,source_id,line_no) DO NOTHING;
INSERT INTO alsvid_v2.inventory_ledger(source_type,source_id,line_no,sku_uuid,warehouse_id,quantity_delta,created_at)
SELECT 'repair_stock_event',e.id,1,s.entity_uuid,e.warehouse_id,
       CASE WHEN e.kind='领用' THEN -e.quantity ELSE e.quantity END,e.created_at
FROM alsvid_v2.repair_stock_events e JOIN alsvid_v2.skus s ON s.code=e.sku_code
ON CONFLICT(source_type,source_id,line_no) DO NOTHING;
INSERT INTO alsvid_v2.inventory_ledger(source_type,source_id,line_no,sku_uuid,warehouse_id,quantity_delta,created_at)
SELECT 'opening_balance',w.warehouse_id||':'||w.sku_code,1,s.entity_uuid,w.warehouse_id,
       w.quantity-COALESCE((SELECT sum(l.quantity_delta) FROM alsvid_v2.inventory_ledger l
         WHERE l.sku_uuid=s.entity_uuid AND l.warehouse_id=w.warehouse_id),0),now()
FROM alsvid_v2.warehouse_stock w JOIN alsvid_v2.skus s ON s.code=w.sku_code
WHERE w.quantity-COALESCE((SELECT sum(l.quantity_delta) FROM alsvid_v2.inventory_ledger l
         WHERE l.sku_uuid=s.entity_uuid AND l.warehouse_id=w.warehouse_id),0)<>0
ON CONFLICT(source_type,source_id,line_no) DO NOTHING;

CREATE OR REPLACE FUNCTION alsvid_v2.record_stock_movement_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sku_id uuid;
BEGIN
  SELECT entity_uuid INTO sku_id FROM alsvid_v2.skus WHERE code=NEW.sku_code;
  IF sku_id IS NULL THEN RAISE EXCEPTION 'inventory SKU identity is missing' USING ERRCODE='23503'; END IF;
  IF NEW.kind='入库' THEN
    INSERT INTO alsvid_v2.inventory_ledger(source_type,source_id,line_no,sku_uuid,warehouse_id,quantity_delta,created_at)
    VALUES('stock_movement',NEW.id,1,sku_id,NEW.to_warehouse,NEW.quantity,NEW.created_at);
  ELSIF NEW.kind='调拨' THEN
    INSERT INTO alsvid_v2.inventory_ledger(source_type,source_id,line_no,sku_uuid,warehouse_id,quantity_delta,created_at)
    VALUES('stock_movement',NEW.id,1,sku_id,NEW.from_warehouse,-NEW.quantity,NEW.created_at),
          ('stock_movement',NEW.id,2,sku_id,NEW.to_warehouse,NEW.quantity,NEW.created_at);
  ELSE RAISE EXCEPTION 'unsupported stock movement kind' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stock_movement_ledger AFTER INSERT ON alsvid_v2.stock_movements
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.record_stock_movement_ledger();

CREATE OR REPLACE FUNCTION alsvid_v2.record_repair_stock_ledger()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE sku_id uuid;
BEGIN
  SELECT entity_uuid INTO sku_id FROM alsvid_v2.skus WHERE code=NEW.sku_code;
  IF sku_id IS NULL THEN RAISE EXCEPTION 'inventory SKU identity is missing' USING ERRCODE='23503'; END IF;
  INSERT INTO alsvid_v2.inventory_ledger(source_type,source_id,line_no,sku_uuid,warehouse_id,quantity_delta,created_at)
  VALUES('repair_stock_event',NEW.id,1,sku_id,NEW.warehouse_id,
         CASE WHEN NEW.kind='领用' THEN -NEW.quantity ELSE NEW.quantity END,NEW.created_at);
  RETURN NEW;
END;
$$;
CREATE TRIGGER repair_stock_ledger AFTER INSERT ON alsvid_v2.repair_stock_events
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.record_repair_stock_ledger();

CREATE OR REPLACE FUNCTION alsvid_v2.reject_inventory_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory ledger is append-only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER inventory_ledger_immutable BEFORE UPDATE OR DELETE ON alsvid_v2.inventory_ledger
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_inventory_ledger_mutation();

CREATE TRIGGER stock_movement_ledger_source_immutable BEFORE UPDATE OR DELETE ON alsvid_v2.stock_movements
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_inventory_ledger_mutation();
CREATE TRIGGER repair_stock_ledger_source_immutable BEFORE UPDATE OR DELETE ON alsvid_v2.repair_stock_events
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_inventory_ledger_mutation();

COMMIT;
