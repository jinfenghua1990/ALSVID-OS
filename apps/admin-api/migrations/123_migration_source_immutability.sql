BEGIN;
CREATE FUNCTION alsvid_v2.guard_migration_source_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'migration source history is retained' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER dealer_application_source_immutable
  BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_application_source_archive
  FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_migration_source_history();
CREATE TRIGGER public_location_source_immutable
  BEFORE UPDATE OR DELETE ON alsvid_v2.public_location_migration_sources
  FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_migration_source_history();
COMMIT;
