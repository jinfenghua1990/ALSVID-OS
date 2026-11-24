BEGIN;

ALTER TABLE alsvid_v2.warehouse_locations
  ADD COLUMN location_type text NOT NULL DEFAULT 'STORAGE'
    CHECK (location_type IN ('RECEIVING','STORAGE','STAGING','PICK','QUARANTINE','DISPATCH')),
  ADD COLUMN parent_location_uuid uuid REFERENCES alsvid_v2.warehouse_locations(id) ON DELETE RESTRICT;

CREATE FUNCTION alsvid_v2.guard_warehouse_location_hierarchy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_warehouse uuid;
BEGIN
  IF NEW.parent_location_uuid IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.warehouse_uuid::text,131));
  IF NEW.parent_location_uuid=NEW.id THEN
    RAISE EXCEPTION 'Warehouse location cannot be its own parent' USING ERRCODE='23514';
  END IF;
  SELECT warehouse_uuid INTO parent_warehouse FROM alsvid_v2.warehouse_locations
    WHERE id=NEW.parent_location_uuid AND status='启用' FOR SHARE;
  IF parent_warehouse IS NULL OR parent_warehouse<>NEW.warehouse_uuid THEN
    RAISE EXCEPTION 'Parent location must be active and belong to the same warehouse' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    WITH RECURSIVE ancestors(id,parent_location_uuid) AS (
      SELECT id,parent_location_uuid FROM alsvid_v2.warehouse_locations WHERE id=NEW.parent_location_uuid
      UNION ALL
      SELECT l.id,l.parent_location_uuid FROM alsvid_v2.warehouse_locations l
        JOIN ancestors a ON l.id=a.parent_location_uuid
    ) SELECT 1 FROM ancestors WHERE id=NEW.id
  ) THEN RAISE EXCEPTION 'Warehouse location hierarchy cannot contain a cycle' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER warehouse_location_hierarchy_guard
BEFORE INSERT OR UPDATE OF warehouse_uuid,parent_location_uuid ON alsvid_v2.warehouse_locations
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_warehouse_location_hierarchy();

COMMIT;
