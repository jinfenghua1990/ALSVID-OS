BEGIN;
-- An enabled website listing alone does not grant test-ride authority.
CREATE TABLE alsvid_v2.test_ride_location_authorizations (
  location_id uuid PRIMARY KEY REFERENCES alsvid_v2.public_locations(id) ON DELETE RESTRICT,
  dealer_company_id uuid NOT NULL REFERENCES alsvid_v2.dealer_companies(id) ON DELETE RESTRICT,
  partner_active boolean NOT NULL DEFAULT false,
  dealer_authorized boolean NOT NULL DEFAULT false,
  test_ride_authorized boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE alsvid_v2.test_ride_enquiries ADD COLUMN assigned_location_id uuid REFERENCES alsvid_v2.public_locations(id) ON DELETE RESTRICT;
CREATE TABLE alsvid_v2.test_ride_assignment_events (
  id uuid PRIMARY KEY,
  enquiry_id uuid NOT NULL REFERENCES alsvid_v2.test_ride_enquiries(id) ON DELETE RESTRICT,
  previous_location_id uuid REFERENCES alsvid_v2.public_locations(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES alsvid_v2.public_locations(id) ON DELETE RESTRICT,
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER test_ride_assignment_immutable BEFORE UPDATE OR DELETE ON alsvid_v2.test_ride_assignment_events
  FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_migration_source_history();
COMMIT;
