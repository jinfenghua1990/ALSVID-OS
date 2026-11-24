-- New production orders retain the BOM details captured when they were created.
BEGIN;
ALTER TABLE alsvid_v2.production_orders ADD COLUMN bom_snapshot jsonb;
CREATE FUNCTION alsvid_v2.guard_production_bom_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.bom_snapshot IS DISTINCT FROM OLD.bom_snapshot THEN
    RAISE EXCEPTION 'production order BOM snapshot is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_production_bom_snapshot BEFORE UPDATE OF bom_snapshot ON alsvid_v2.production_orders
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_production_bom_snapshot();
COMMIT;
