-- Add UUID v7 identities and verified UUID relationships to repair records.
BEGIN;

LOCK TABLE alsvid_v2.vins, alsvid_v2.repairs, alsvid_v2.stock_movements,
  alsvid_v2.repair_stock_events, alsvid_v2.repair_replacements,
  alsvid_v2.old_part_recoveries, alsvid_v2.old_part_recovery_events,
  alsvid_v2.old_part_restock_requests, alsvid_v2.warehouses,
  alsvid_v2.portal_service_requests
  IN SHARE ROW EXCLUSIVE MODE;

-- Backfill identity columns on append-only inventory events while all source
-- tables are locked. The transaction restores the append-only guards below.
DROP TRIGGER stock_movement_ledger_source_immutable ON alsvid_v2.stock_movements;
DROP TRIGGER repair_stock_ledger_source_immutable ON alsvid_v2.repair_stock_events;

DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'repairs','stock_movements','repair_stock_events','repair_replacements',
    'old_part_recoveries','old_part_recovery_events','old_part_restock_requests'
  ] LOOP
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD COLUMN entity_uuid uuid',tab);
    EXECUTE format('ALTER TABLE alsvid_v2.%I ALTER COLUMN entity_uuid SET DEFAULT alsvid_v2.generate_uuid_v7()',tab);
    EXECUTE format('UPDATE alsvid_v2.%I SET entity_uuid=alsvid_v2.generate_uuid_v7() WHERE entity_uuid IS NULL',tab);
    EXECUTE format('ALTER TABLE alsvid_v2.%I ALTER COLUMN entity_uuid SET NOT NULL',tab);
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD CONSTRAINT %I UNIQUE(entity_uuid)',tab,tab||'_entity_uuid_uq');
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD CONSTRAINT %I CHECK(substring(entity_uuid::text,15,1)=''7'' AND substring(entity_uuid::text,20,1) IN (''8'',''9'',''a'',''b''))',tab,tab||'_entity_uuid_v7');
  END LOOP;
END;
$$;

UPDATE alsvid_v2.repairs SET entity_uuid=id::uuid
  WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
UPDATE alsvid_v2.stock_movements SET entity_uuid=id::uuid
  WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
UPDATE alsvid_v2.repair_stock_events SET entity_uuid=id::uuid
  WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
UPDATE alsvid_v2.repair_replacements SET entity_uuid=id::uuid
  WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
UPDATE alsvid_v2.old_part_recovery_events SET entity_uuid=id::uuid
  WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
UPDATE alsvid_v2.old_part_recoveries SET entity_uuid=replacement_id::uuid
  WHERE replacement_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
UPDATE alsvid_v2.old_part_restock_requests SET entity_uuid=replacement_id::uuid
  WHERE replacement_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

CREATE TRIGGER sync_repairs_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.repairs
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');
CREATE TRIGGER sync_stock_movements_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.stock_movements
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');
CREATE TRIGGER sync_repair_stock_events_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.repair_stock_events
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');
CREATE TRIGGER sync_repair_replacements_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.repair_replacements
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');
CREATE TRIGGER sync_old_part_recoveries_uuidv7_identity
BEFORE INSERT OR UPDATE OF replacement_id,entity_uuid ON alsvid_v2.old_part_recoveries
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('replacement_id','entity_uuid');
CREATE TRIGGER sync_old_part_recovery_events_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.old_part_recovery_events
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');
CREATE TRIGGER sync_old_part_restock_requests_uuidv7_identity
BEFORE INSERT OR UPDATE OF replacement_id,entity_uuid ON alsvid_v2.old_part_restock_requests
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('replacement_id','entity_uuid');

ALTER TABLE alsvid_v2.vins
  ADD CONSTRAINT vins_vin_entity_uuid_uq UNIQUE(vin,entity_uuid);
ALTER TABLE alsvid_v2.repairs
  ADD CONSTRAINT repairs_id_entity_uuid_uq UNIQUE(id,entity_uuid);
ALTER TABLE alsvid_v2.stock_movements
  ADD CONSTRAINT stock_movements_id_entity_uuid_uq UNIQUE(id,entity_uuid);
ALTER TABLE alsvid_v2.repair_replacements
  ADD CONSTRAINT repair_replacements_id_entity_uuid_uq UNIQUE(id,entity_uuid);
ALTER TABLE alsvid_v2.old_part_recoveries
  ADD CONSTRAINT old_part_recoveries_replacement_entity_uuid_uq UNIQUE(replacement_id,entity_uuid);

ALTER TABLE alsvid_v2.repairs ADD COLUMN vin_uuid uuid;
UPDATE alsvid_v2.repairs r SET vin_uuid=v.entity_uuid
  FROM alsvid_v2.vins v WHERE v.vin=r.vin;
ALTER TABLE alsvid_v2.repairs
  ALTER COLUMN vin_uuid SET NOT NULL,
  ADD CONSTRAINT repairs_vin_identity_fk FOREIGN KEY(vin,vin_uuid)
    REFERENCES alsvid_v2.vins(vin,entity_uuid);
CREATE TRIGGER sync_repairs_vin_uuid
BEFORE INSERT OR UPDATE OF vin,vin_uuid ON alsvid_v2.repairs
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('vin','vin_uuid','vins','vin');

ALTER TABLE alsvid_v2.repair_stock_events ADD COLUMN repair_uuid uuid;
UPDATE alsvid_v2.repair_stock_events e SET repair_uuid=r.entity_uuid
  FROM alsvid_v2.repairs r WHERE r.id=e.repair_id;
ALTER TABLE alsvid_v2.repair_stock_events
  ALTER COLUMN repair_uuid SET NOT NULL,
  ADD CONSTRAINT repair_stock_events_repair_identity_fk FOREIGN KEY(repair_id,repair_uuid)
    REFERENCES alsvid_v2.repairs(id,entity_uuid);
CREATE TRIGGER sync_repair_stock_events_repair_uuid
BEFORE INSERT OR UPDATE OF repair_id,repair_uuid ON alsvid_v2.repair_stock_events
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('repair_id','repair_uuid','repairs','id');

ALTER TABLE alsvid_v2.repair_replacements
  ADD COLUMN repair_uuid uuid,
  ADD COLUMN vin_uuid uuid;
UPDATE alsvid_v2.repair_replacements x SET repair_uuid=r.entity_uuid
  FROM alsvid_v2.repairs r WHERE r.id=x.repair_id;
UPDATE alsvid_v2.repair_replacements x SET vin_uuid=v.entity_uuid
  FROM alsvid_v2.vins v WHERE v.id=x.vin_id;
ALTER TABLE alsvid_v2.repair_replacements
  ALTER COLUMN repair_uuid SET NOT NULL,
  ALTER COLUMN vin_uuid SET NOT NULL,
  ADD CONSTRAINT repair_replacements_repair_identity_fk FOREIGN KEY(repair_id,repair_uuid)
    REFERENCES alsvid_v2.repairs(id,entity_uuid),
  ADD CONSTRAINT repair_replacements_vin_identity_fk FOREIGN KEY(vin_id,vin_uuid)
    REFERENCES alsvid_v2.vins(id,entity_uuid);
CREATE TRIGGER sync_repair_replacements_repair_uuid
BEFORE INSERT OR UPDATE OF repair_id,repair_uuid ON alsvid_v2.repair_replacements
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('repair_id','repair_uuid','repairs','id');
CREATE TRIGGER sync_repair_replacements_vin_uuid
BEFORE INSERT OR UPDATE OF vin_id,vin_uuid ON alsvid_v2.repair_replacements
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('vin_id','vin_uuid','vins','id');

ALTER TABLE alsvid_v2.old_part_recoveries
  ADD COLUMN replacement_uuid uuid,
  ADD COLUMN warehouse_uuid uuid;
UPDATE alsvid_v2.old_part_recoveries x SET replacement_uuid=r.entity_uuid
  FROM alsvid_v2.repair_replacements r WHERE r.id=x.replacement_id;
UPDATE alsvid_v2.old_part_recoveries x SET warehouse_uuid=w.entity_uuid
  FROM alsvid_v2.warehouses w WHERE w.id=x.warehouse_id;
ALTER TABLE alsvid_v2.old_part_recoveries
  ALTER COLUMN replacement_uuid SET NOT NULL,
  ADD CONSTRAINT old_part_recoveries_replacement_identity_fk FOREIGN KEY(replacement_id,replacement_uuid)
    REFERENCES alsvid_v2.repair_replacements(id,entity_uuid),
  ADD CONSTRAINT old_part_recoveries_warehouse_identity_fk FOREIGN KEY(warehouse_id,warehouse_uuid)
    REFERENCES alsvid_v2.warehouses(id,entity_uuid);
CREATE TRIGGER sync_old_part_recoveries_replacement_uuid
BEFORE INSERT OR UPDATE OF replacement_id,replacement_uuid ON alsvid_v2.old_part_recoveries
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('replacement_id','replacement_uuid','repair_replacements','id');
CREATE TRIGGER sync_old_part_recoveries_warehouse_uuid
BEFORE INSERT OR UPDATE OF warehouse_id,warehouse_uuid ON alsvid_v2.old_part_recoveries
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('warehouse_id','warehouse_uuid','warehouses','id');

ALTER TABLE alsvid_v2.old_part_recovery_events
  ADD COLUMN replacement_uuid uuid,
  ADD COLUMN warehouse_uuid uuid;
UPDATE alsvid_v2.old_part_recovery_events e SET replacement_uuid=x.entity_uuid
  FROM alsvid_v2.old_part_recoveries x WHERE x.replacement_id=e.replacement_id;
UPDATE alsvid_v2.old_part_recovery_events e SET warehouse_uuid=w.entity_uuid
  FROM alsvid_v2.warehouses w WHERE w.id=e.warehouse_id;
ALTER TABLE alsvid_v2.old_part_recovery_events
  ALTER COLUMN replacement_uuid SET NOT NULL,
  ADD CONSTRAINT old_part_recovery_events_replacement_identity_fk FOREIGN KEY(replacement_id,replacement_uuid)
    REFERENCES alsvid_v2.old_part_recoveries(replacement_id,entity_uuid),
  ADD CONSTRAINT old_part_recovery_events_warehouse_identity_fk FOREIGN KEY(warehouse_id,warehouse_uuid)
    REFERENCES alsvid_v2.warehouses(id,entity_uuid);
CREATE TRIGGER sync_old_part_recovery_events_replacement_uuid
BEFORE INSERT OR UPDATE OF replacement_id,replacement_uuid ON alsvid_v2.old_part_recovery_events
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('replacement_id','replacement_uuid','old_part_recoveries','replacement_id');
CREATE TRIGGER sync_old_part_recovery_events_warehouse_uuid
BEFORE INSERT OR UPDATE OF warehouse_id,warehouse_uuid ON alsvid_v2.old_part_recovery_events
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('warehouse_id','warehouse_uuid','warehouses','id');

ALTER TABLE alsvid_v2.old_part_restock_requests
  ADD COLUMN replacement_uuid uuid,
  ADD COLUMN movement_uuid uuid;
UPDATE alsvid_v2.old_part_restock_requests x SET replacement_uuid=r.entity_uuid
  FROM alsvid_v2.old_part_recoveries r WHERE r.replacement_id=x.replacement_id;
UPDATE alsvid_v2.old_part_restock_requests x SET movement_uuid=m.entity_uuid
  FROM alsvid_v2.stock_movements m WHERE m.id=x.movement_id;
ALTER TABLE alsvid_v2.old_part_restock_requests
  ALTER COLUMN replacement_uuid SET NOT NULL,
  ADD CONSTRAINT old_part_restock_requests_replacement_identity_fk FOREIGN KEY(replacement_id,replacement_uuid)
    REFERENCES alsvid_v2.old_part_recoveries(replacement_id,entity_uuid),
  ADD CONSTRAINT old_part_restock_requests_movement_identity_fk FOREIGN KEY(movement_id,movement_uuid)
    REFERENCES alsvid_v2.stock_movements(id,entity_uuid);
CREATE TRIGGER sync_old_part_restock_requests_replacement_uuid
BEFORE INSERT OR UPDATE OF replacement_id,replacement_uuid ON alsvid_v2.old_part_restock_requests
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('replacement_id','replacement_uuid','old_part_recoveries','replacement_id');
CREATE TRIGGER sync_old_part_restock_requests_movement_uuid
BEFORE INSERT OR UPDATE OF movement_id,movement_uuid ON alsvid_v2.old_part_restock_requests
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('movement_id','movement_uuid','stock_movements','id');

ALTER TABLE alsvid_v2.portal_service_requests ADD COLUMN repair_uuid uuid;
UPDATE alsvid_v2.portal_service_requests p SET repair_uuid=r.entity_uuid
  FROM alsvid_v2.repairs r WHERE r.id=p.repair_id;
ALTER TABLE alsvid_v2.portal_service_requests
  ADD CONSTRAINT portal_service_requests_repair_identity_fk FOREIGN KEY(repair_id,repair_uuid)
    REFERENCES alsvid_v2.repairs(id,entity_uuid);
CREATE TRIGGER sync_portal_service_requests_repair_uuid
BEFORE INSERT OR UPDATE OF repair_id,repair_uuid ON alsvid_v2.portal_service_requests
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('repair_id','repair_uuid','repairs','id');

CREATE TRIGGER stock_movement_ledger_source_immutable
BEFORE UPDATE OR DELETE ON alsvid_v2.stock_movements
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_inventory_ledger_mutation();
CREATE TRIGGER repair_stock_ledger_source_immutable
BEFORE UPDATE OR DELETE ON alsvid_v2.repair_stock_events
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_inventory_ledger_mutation();

COMMIT;
