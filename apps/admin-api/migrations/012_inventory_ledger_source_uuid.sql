-- Bind inventory ledger rows to their UUID v7 source records.
BEGIN;

LOCK TABLE alsvid_v2.stock_movements, alsvid_v2.repair_stock_events,
  alsvid_v2.production_order_materials, alsvid_v2.inventory_ledger
  IN SHARE ROW EXCLUSIVE MODE;

DROP TRIGGER inventory_ledger_immutable ON alsvid_v2.inventory_ledger;

ALTER TABLE alsvid_v2.inventory_ledger
  ADD COLUMN stock_movement_uuid uuid REFERENCES alsvid_v2.stock_movements(entity_uuid),
  ADD COLUMN repair_stock_event_uuid uuid REFERENCES alsvid_v2.repair_stock_events(entity_uuid),
  ADD COLUMN production_order_material_uuid uuid REFERENCES alsvid_v2.production_order_materials(entity_uuid);

UPDATE alsvid_v2.inventory_ledger l
SET stock_movement_uuid=m.entity_uuid
FROM alsvid_v2.stock_movements m
WHERE l.source_type='stock_movement' AND l.source_id=m.id;
UPDATE alsvid_v2.inventory_ledger l
SET repair_stock_event_uuid=e.entity_uuid
FROM alsvid_v2.repair_stock_events e
WHERE l.source_type='repair_stock_event' AND l.source_id=e.id;
UPDATE alsvid_v2.inventory_ledger l
SET production_order_material_uuid=m.entity_uuid
FROM alsvid_v2.production_order_materials m
WHERE l.source_type='production_order_material'
  AND l.source_id=m.order_id||':'||m.id::text;

ALTER TABLE alsvid_v2.inventory_ledger
  ADD CONSTRAINT inventory_ledger_source_uuid_check CHECK (
    (source_type='stock_movement' AND stock_movement_uuid IS NOT NULL
      AND repair_stock_event_uuid IS NULL AND production_order_material_uuid IS NULL)
    OR (source_type='repair_stock_event' AND repair_stock_event_uuid IS NOT NULL
      AND stock_movement_uuid IS NULL AND production_order_material_uuid IS NULL)
    OR (source_type='production_order_material' AND production_order_material_uuid IS NOT NULL
      AND stock_movement_uuid IS NULL AND repair_stock_event_uuid IS NULL)
    OR (source_type='opening_balance' AND stock_movement_uuid IS NULL
      AND repair_stock_event_uuid IS NULL AND production_order_material_uuid IS NULL)
  );

CREATE FUNCTION alsvid_v2.sync_inventory_ledger_source_uuid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_uuid uuid;
BEGIN
  IF NEW.source_type='stock_movement' THEN
    SELECT entity_uuid INTO expected_uuid FROM alsvid_v2.stock_movements WHERE id=NEW.source_id;
    IF expected_uuid IS NULL OR (NEW.stock_movement_uuid IS NOT NULL AND NEW.stock_movement_uuid<>expected_uuid) THEN
      RAISE EXCEPTION 'inventory ledger stock movement reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.stock_movement_uuid:=expected_uuid;
    NEW.repair_stock_event_uuid:=NULL;
    NEW.production_order_material_uuid:=NULL;
  ELSIF NEW.source_type='repair_stock_event' THEN
    SELECT entity_uuid INTO expected_uuid FROM alsvid_v2.repair_stock_events WHERE id=NEW.source_id;
    IF expected_uuid IS NULL OR (NEW.repair_stock_event_uuid IS NOT NULL AND NEW.repair_stock_event_uuid<>expected_uuid) THEN
      RAISE EXCEPTION 'inventory ledger repair event reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.stock_movement_uuid:=NULL;
    NEW.repair_stock_event_uuid:=expected_uuid;
    NEW.production_order_material_uuid:=NULL;
  ELSIF NEW.source_type='production_order_material' THEN
    SELECT entity_uuid INTO expected_uuid FROM alsvid_v2.production_order_materials
    WHERE order_id||':'||id::text=NEW.source_id;
    IF expected_uuid IS NULL OR (NEW.production_order_material_uuid IS NOT NULL AND NEW.production_order_material_uuid<>expected_uuid) THEN
      RAISE EXCEPTION 'inventory ledger production material reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.stock_movement_uuid:=NULL;
    NEW.repair_stock_event_uuid:=NULL;
    NEW.production_order_material_uuid:=expected_uuid;
  ELSIF NEW.source_type='opening_balance' THEN
    IF NEW.stock_movement_uuid IS NOT NULL OR NEW.repair_stock_event_uuid IS NOT NULL
       OR NEW.production_order_material_uuid IS NOT NULL THEN
      RAISE EXCEPTION 'opening balance cannot reference a source record' USING ERRCODE='23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported inventory ledger source type' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_inventory_ledger_source_uuid
BEFORE INSERT ON alsvid_v2.inventory_ledger
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_inventory_ledger_source_uuid();

CREATE TRIGGER inventory_ledger_immutable BEFORE UPDATE OR DELETE ON alsvid_v2.inventory_ledger
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_inventory_ledger_mutation();

COMMIT;
