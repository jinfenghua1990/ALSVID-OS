BEGIN;

CREATE TABLE alsvid_v2.warehouse_locations (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  warehouse_uuid uuid NOT NULL REFERENCES alsvid_v2.warehouses(entity_uuid),
  code text NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 40),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT '启用' CHECK (status IN ('启用','停用')),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (warehouse_uuid,code),
  CHECK (NOT is_default OR code='MAIN'),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE UNIQUE INDEX warehouse_locations_one_default
  ON alsvid_v2.warehouse_locations(warehouse_uuid) WHERE is_default;

INSERT INTO alsvid_v2.warehouse_locations(warehouse_uuid,code,name,is_default,created_by)
SELECT entity_uuid,'MAIN','主库位',true,'system' FROM alsvid_v2.warehouses;

CREATE FUNCTION alsvid_v2.create_default_warehouse_location() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO alsvid_v2.warehouse_locations(warehouse_uuid,code,name,is_default,created_by)
  VALUES(NEW.entity_uuid,'MAIN','主库位',true,'system');
  RETURN NEW;
END;
$$;
CREATE TRIGGER warehouse_default_location AFTER INSERT ON alsvid_v2.warehouses
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.create_default_warehouse_location();

ALTER TABLE alsvid_v2.stock_movements
  ADD COLUMN from_location_uuid uuid REFERENCES alsvid_v2.warehouse_locations(id),
  ADD COLUMN to_location_uuid uuid REFERENCES alsvid_v2.warehouse_locations(id);
DROP TRIGGER stock_movement_ledger_source_immutable ON alsvid_v2.stock_movements;
UPDATE alsvid_v2.stock_movements m SET
  from_location_uuid=CASE WHEN m.kind='调拨' THEN (
    SELECT loc.id FROM alsvid_v2.warehouses w JOIN alsvid_v2.warehouse_locations loc
      ON loc.warehouse_uuid=w.entity_uuid AND loc.is_default WHERE w.id=m.from_warehouse
  ) ELSE NULL END,
  to_location_uuid=(
    SELECT loc.id FROM alsvid_v2.warehouses w JOIN alsvid_v2.warehouse_locations loc
      ON loc.warehouse_uuid=w.entity_uuid AND loc.is_default WHERE w.id=m.to_warehouse
  );
CREATE TRIGGER stock_movement_ledger_source_immutable BEFORE UPDATE OR DELETE ON alsvid_v2.stock_movements
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_inventory_ledger_mutation();
ALTER TABLE alsvid_v2.stock_movements
  ALTER COLUMN to_location_uuid SET NOT NULL,
  ADD CONSTRAINT stock_movements_location_check CHECK (
    (kind='入库' AND from_location_uuid IS NULL)
    OR (kind='调拨' AND from_location_uuid IS NOT NULL AND from_location_uuid<>to_location_uuid)
  );

CREATE TABLE alsvid_v2.inventory_location_ledger (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  inventory_ledger_uuid uuid NOT NULL UNIQUE REFERENCES alsvid_v2.inventory_ledger(id),
  location_uuid uuid NOT NULL REFERENCES alsvid_v2.warehouse_locations(id),
  sku_uuid uuid NOT NULL REFERENCES alsvid_v2.skus(entity_uuid),
  quantity_delta integer NOT NULL CHECK (quantity_delta<>0),
  source_type text NOT NULL,
  source_id text NOT NULL,
  line_no smallint NOT NULL CHECK (line_no>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE INDEX inventory_location_ledger_balance_idx
  ON alsvid_v2.inventory_location_ledger(location_uuid,sku_uuid,created_at,id);

INSERT INTO alsvid_v2.inventory_location_ledger(
  inventory_ledger_uuid,location_uuid,sku_uuid,quantity_delta,source_type,source_id,line_no,created_at
)
SELECT l.id,
  CASE WHEN l.source_type='stock_movement' AND sm.kind='调拨' AND l.line_no=1
    THEN sm.from_location_uuid ELSE sm.to_location_uuid END,
  l.sku_uuid,l.quantity_delta,l.source_type,l.source_id,l.line_no,l.created_at
FROM alsvid_v2.inventory_ledger l
JOIN alsvid_v2.stock_movements sm ON l.source_type='stock_movement' AND sm.id=l.source_id
ON CONFLICT(inventory_ledger_uuid) DO NOTHING;

INSERT INTO alsvid_v2.inventory_location_ledger(
  inventory_ledger_uuid,location_uuid,sku_uuid,quantity_delta,source_type,source_id,line_no,created_at
)
SELECT l.id,loc.id,l.sku_uuid,l.quantity_delta,l.source_type,l.source_id,l.line_no,l.created_at
FROM alsvid_v2.inventory_ledger l
JOIN alsvid_v2.warehouse_locations loc ON loc.warehouse_uuid=l.warehouse_uuid AND loc.is_default
WHERE l.source_type<>'stock_movement'
ON CONFLICT(inventory_ledger_uuid) DO NOTHING;

CREATE FUNCTION alsvid_v2.record_inventory_location_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE location_id uuid; movement record;
BEGIN
  IF NEW.source_type='stock_movement' THEN
    SELECT kind,from_location_uuid,to_location_uuid INTO movement
    FROM alsvid_v2.stock_movements WHERE id=NEW.source_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'inventory movement source is missing' USING ERRCODE='23503'; END IF;
    IF movement.kind='调拨' AND NEW.line_no=1 THEN location_id:=movement.from_location_uuid;
    ELSE location_id:=movement.to_location_uuid; END IF;
  ELSE
    SELECT id INTO location_id FROM alsvid_v2.warehouse_locations
    WHERE warehouse_uuid=NEW.warehouse_uuid AND is_default AND status='启用';
  END IF;
  IF location_id IS NULL THEN RAISE EXCEPTION 'inventory warehouse location is missing' USING ERRCODE='23503'; END IF;
  INSERT INTO alsvid_v2.inventory_location_ledger(
    inventory_ledger_uuid,location_uuid,sku_uuid,quantity_delta,source_type,source_id,line_no,created_at
  ) VALUES(NEW.id,location_id,NEW.sku_uuid,NEW.quantity_delta,NEW.source_type,NEW.source_id,NEW.line_no,NEW.created_at);
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_location_ledger_insert AFTER INSERT ON alsvid_v2.inventory_ledger
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.record_inventory_location_ledger();

CREATE FUNCTION alsvid_v2.reject_inventory_location_ledger_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'inventory location ledger is append-only' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER inventory_location_ledger_immutable BEFORE UPDATE OR DELETE ON alsvid_v2.inventory_location_ledger
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_inventory_location_ledger_mutation();

COMMIT;
