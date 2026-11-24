-- Bind production inventory reservations to their production material UUID.
BEGIN;

LOCK TABLE alsvid_v2.production_order_materials, alsvid_v2.inventory_reservations
  IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE alsvid_v2.inventory_reservations
  ADD COLUMN production_order_material_uuid uuid
    REFERENCES alsvid_v2.production_order_materials(entity_uuid);

DROP TRIGGER inventory_reservations_immutable ON alsvid_v2.inventory_reservations;

UPDATE alsvid_v2.inventory_reservations r
SET production_order_material_uuid=m.entity_uuid
FROM alsvid_v2.production_order_materials m
WHERE r.source_type='production_order'
  AND r.source_id=m.order_id||':'||m.id::text;

ALTER TABLE alsvid_v2.inventory_reservations
  ADD CONSTRAINT inventory_reservations_source_uuid_check CHECK (
    (source_type='production_order' AND production_order_material_uuid IS NOT NULL)
    OR (source_type IN ('sales_order','repair','manual') AND production_order_material_uuid IS NULL)
  );

CREATE FUNCTION alsvid_v2.sync_inventory_reservation_source_uuid()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_uuid uuid;
BEGIN
  IF NEW.source_type='production_order' THEN
    SELECT entity_uuid INTO expected_uuid FROM alsvid_v2.production_order_materials
    WHERE order_id||':'||id::text=NEW.source_id;
    IF expected_uuid IS NULL
       OR (NEW.production_order_material_uuid IS NOT NULL AND NEW.production_order_material_uuid<>expected_uuid) THEN
      RAISE EXCEPTION 'inventory reservation production material reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.production_order_material_uuid:=expected_uuid;
  ELSIF NEW.source_type IN ('sales_order','repair','manual') THEN
    IF NEW.production_order_material_uuid IS NOT NULL THEN
      RAISE EXCEPTION 'inventory reservation source UUID does not match its type' USING ERRCODE='23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'unsupported inventory reservation source type' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_inventory_reservation_source_uuid
BEFORE INSERT OR UPDATE OF source_type,source_id,production_order_material_uuid
ON alsvid_v2.inventory_reservations
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_inventory_reservation_source_uuid();

CREATE TRIGGER inventory_reservations_immutable
BEFORE UPDATE OR DELETE ON alsvid_v2.inventory_reservations
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.protect_inventory_reservation();

COMMIT;
