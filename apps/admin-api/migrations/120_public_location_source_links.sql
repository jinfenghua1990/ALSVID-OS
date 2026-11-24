BEGIN;
-- Preserve the V1 identity and relationship separately from current V2 publication decisions.
CREATE TABLE alsvid_v2.public_location_migration_sources (
  source_id uuid PRIMARY KEY,
  target_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.public_locations(id) ON DELETE RESTRICT,
  source_partner_id uuid,
  source_test_ride_authorized boolean NOT NULL,
  source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot) = 'object'),
  captured_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
