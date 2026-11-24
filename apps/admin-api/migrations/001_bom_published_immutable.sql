-- Explicit migration: run only after backup/restore verification and review.
-- Does not change existing BOM rows. Daily service startup does not run it.
BEGIN;

CREATE OR REPLACE FUNCTION alsvid_v2.guard_published_bom_version()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' THEN
    RAISE EXCEPTION 'published BOM version is immutable' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION alsvid_v2.guard_published_bom_item()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  version_row record;
  old_version bigint;
  new_version bigint;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_version := OLD.bom_version_id; END IF;
  IF TG_OP <> 'DELETE' THEN new_version := NEW.bom_version_id; END IF;
  -- Lock in stable order to serialize changes with publication and reparenting.
  FOR version_row IN
    SELECT id, status FROM alsvid_v2.bom_versions
    WHERE id = old_version OR id = new_version ORDER BY id FOR UPDATE
  LOOP
    IF version_row.status = 'published' THEN
      RAISE EXCEPTION 'published BOM items are immutable' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_published_bom_version ON alsvid_v2.bom_versions;
CREATE TRIGGER guard_published_bom_version BEFORE UPDATE OR DELETE ON alsvid_v2.bom_versions
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_published_bom_version();

DROP TRIGGER IF EXISTS guard_published_bom_item ON alsvid_v2.bom_version_items;
CREATE TRIGGER guard_published_bom_item BEFORE INSERT OR UPDATE OR DELETE ON alsvid_v2.bom_version_items
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_published_bom_item();

COMMIT;
