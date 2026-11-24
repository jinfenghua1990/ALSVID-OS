-- Requires migrations 002 and 003. Legacy text IDs remain in service.
BEGIN;
LOCK TABLE alsvid_v2.warehouses, alsvid_v2.inventory_ledger IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE alsvid_v2.warehouses ADD COLUMN entity_uuid uuid;
ALTER TABLE alsvid_v2.warehouses ALTER COLUMN entity_uuid SET DEFAULT alsvid_v2.generate_uuid_v7();
UPDATE alsvid_v2.warehouses SET entity_uuid=alsvid_v2.generate_uuid_v7() WHERE entity_uuid IS NULL;
ALTER TABLE alsvid_v2.warehouses ALTER COLUMN entity_uuid SET NOT NULL;
ALTER TABLE alsvid_v2.warehouses ADD CONSTRAINT warehouses_entity_uuid_unique UNIQUE(entity_uuid);
ALTER TABLE alsvid_v2.warehouses ADD CONSTRAINT warehouses_identity_pair_unique UNIQUE(id,entity_uuid);
ALTER TABLE alsvid_v2.warehouses ADD CONSTRAINT warehouses_entity_uuid_v7 CHECK(substring(entity_uuid::text,15,1)='7' AND substring(entity_uuid::text,20,1) IN ('8','9','a','b'));

ALTER TABLE alsvid_v2.inventory_ledger ADD COLUMN warehouse_uuid uuid;
UPDATE alsvid_v2.inventory_ledger l SET warehouse_uuid=w.entity_uuid
FROM alsvid_v2.warehouses w WHERE l.warehouse_id=w.id;
ALTER TABLE alsvid_v2.inventory_ledger ALTER COLUMN warehouse_uuid SET NOT NULL;
ALTER TABLE alsvid_v2.inventory_ledger ADD CONSTRAINT inventory_ledger_warehouse_fk
  FOREIGN KEY(warehouse_id,warehouse_uuid) REFERENCES alsvid_v2.warehouses(id,entity_uuid);

CREATE OR REPLACE FUNCTION alsvid_v2.sync_inventory_ledger_warehouse_uuid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected uuid;
BEGIN
  SELECT entity_uuid INTO expected FROM alsvid_v2.warehouses WHERE id=NEW.warehouse_id;
  IF expected IS NULL THEN RAISE EXCEPTION 'inventory warehouse identity is missing' USING ERRCODE='23503'; END IF;
  IF NEW.warehouse_uuid IS NOT NULL AND NEW.warehouse_uuid<>expected THEN
    RAISE EXCEPTION 'inventory warehouse identities do not match' USING ERRCODE='23514';
  END IF;
  NEW.warehouse_uuid:=expected;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sync_inventory_ledger_warehouse_uuid BEFORE INSERT OR UPDATE OF warehouse_id,warehouse_uuid
ON alsvid_v2.inventory_ledger FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_inventory_ledger_warehouse_uuid();

CREATE OR REPLACE FUNCTION alsvid_v2.sync_inventory_source_warehouse_uuid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected uuid;
BEGIN
  SELECT entity_uuid INTO expected FROM alsvid_v2.warehouses WHERE id=NEW.warehouse_id;
  IF expected IS NULL THEN RAISE EXCEPTION 'inventory warehouse identity is missing' USING ERRCODE='23503'; END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.warehouse_uuid IS NOT NULL AND NEW.warehouse_uuid<>expected THEN
      RAISE EXCEPTION 'inventory warehouse identities do not match' USING ERRCODE='23514';
    END IF;
  ELSIF NEW.warehouse_id=OLD.warehouse_id AND NEW.warehouse_uuid IS DISTINCT FROM expected THEN
    RAISE EXCEPTION 'inventory warehouse identities do not match' USING ERRCODE='23514';
  END IF;
  NEW.warehouse_uuid:=expected;
  RETURN NEW;
END;
$$;

ALTER TABLE alsvid_v2.stock_movements ADD COLUMN from_warehouse_uuid uuid;
ALTER TABLE alsvid_v2.stock_movements ADD COLUMN to_warehouse_uuid uuid;
UPDATE alsvid_v2.stock_movements m SET to_warehouse_uuid=w.entity_uuid
FROM alsvid_v2.warehouses w WHERE w.id=m.to_warehouse;
UPDATE alsvid_v2.stock_movements m SET from_warehouse_uuid=w.entity_uuid
FROM alsvid_v2.warehouses w WHERE w.id=m.from_warehouse;
ALTER TABLE alsvid_v2.stock_movements ADD CONSTRAINT stock_movement_from_identity_fk
  FOREIGN KEY(from_warehouse,from_warehouse_uuid) REFERENCES alsvid_v2.warehouses(id,entity_uuid);
ALTER TABLE alsvid_v2.stock_movements ADD CONSTRAINT stock_movement_to_identity_fk
  FOREIGN KEY(to_warehouse,to_warehouse_uuid) REFERENCES alsvid_v2.warehouses(id,entity_uuid);
CREATE OR REPLACE FUNCTION alsvid_v2.sync_stock_movement_warehouse_uuid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected uuid;
BEGIN
  SELECT entity_uuid INTO expected FROM alsvid_v2.warehouses WHERE id=NEW.to_warehouse;
  IF expected IS NULL THEN RAISE EXCEPTION 'inventory destination identity is missing' USING ERRCODE='23503'; END IF;
  IF NEW.to_warehouse_uuid IS NOT NULL AND NEW.to_warehouse_uuid<>expected THEN
    RAISE EXCEPTION 'inventory destination identities do not match' USING ERRCODE='23514';
  END IF;
  NEW.to_warehouse_uuid:=expected;
  IF NEW.from_warehouse IS NULL THEN
    NEW.from_warehouse_uuid:=NULL;
  ELSE
    SELECT entity_uuid INTO expected FROM alsvid_v2.warehouses WHERE id=NEW.from_warehouse;
    IF expected IS NULL THEN RAISE EXCEPTION 'inventory source identity is missing' USING ERRCODE='23503'; END IF;
    IF NEW.from_warehouse_uuid IS NOT NULL AND NEW.from_warehouse_uuid<>expected THEN
      RAISE EXCEPTION 'inventory source identities do not match' USING ERRCODE='23514';
    END IF;
    NEW.from_warehouse_uuid:=expected;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sync_stock_movement_warehouse_uuid BEFORE INSERT OR UPDATE OF from_warehouse,to_warehouse,from_warehouse_uuid,to_warehouse_uuid
ON alsvid_v2.stock_movements FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_stock_movement_warehouse_uuid();

ALTER TABLE alsvid_v2.repair_stock_events ADD COLUMN warehouse_uuid uuid;
UPDATE alsvid_v2.repair_stock_events e SET warehouse_uuid=w.entity_uuid
FROM alsvid_v2.warehouses w WHERE e.warehouse_id=w.id;
ALTER TABLE alsvid_v2.repair_stock_events ADD CONSTRAINT repair_stock_warehouse_identity_fk
  FOREIGN KEY(warehouse_id,warehouse_uuid) REFERENCES alsvid_v2.warehouses(id,entity_uuid);
CREATE TRIGGER sync_repair_stock_warehouse_uuid BEFORE INSERT OR UPDATE OF warehouse_id,warehouse_uuid
ON alsvid_v2.repair_stock_events FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_inventory_source_warehouse_uuid();

COMMIT;
