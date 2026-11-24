BEGIN;
CREATE TABLE alsvid_v2.test_ride_migration_sources (
  source_id uuid PRIMARY KEY,
  target_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.test_ride_enquiries(id) ON DELETE RESTRICT,
  source_location_id uuid,
  target_location_id uuid REFERENCES alsvid_v2.public_locations(id) ON DELETE RESTRICT,
  source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot) = 'object'),
  captured_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_location_id IS NULL) = (target_location_id IS NULL))
);
CREATE TRIGGER test_ride_source_immutable BEFORE UPDATE OR DELETE ON alsvid_v2.test_ride_migration_sources
  FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_migration_source_history();
COMMIT;
