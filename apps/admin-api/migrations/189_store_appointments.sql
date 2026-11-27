BEGIN;
CREATE TABLE alsvid_v2.test_ride_slots(
 id uuid PRIMARY KEY,location_id uuid NOT NULL REFERENCES alsvid_v2.public_locations(id),
 dealer_company_id uuid NOT NULL REFERENCES alsvid_v2.dealer_companies(id),
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL CHECK(ends_at>starts_at),
 capacity integer NOT NULL CHECK(capacity BETWEEN 1 AND 20),active boolean NOT NULL DEFAULT true,
 created_by text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX test_ride_slots_location_time ON alsvid_v2.test_ride_slots(location_id,starts_at);
CREATE TABLE alsvid_v2.store_appointments(
 id uuid PRIMARY KEY,slot_id uuid NOT NULL REFERENCES alsvid_v2.test_ride_slots(id),
 purpose text NOT NULL CHECK(purpose IN ('test_ride','store_visit')),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 email text NOT NULL CHECK(length(email) BETWEEN 5 AND 254),model text NOT NULL DEFAULT '' CHECK(length(model)<=80),
 locale text NOT NULL CHECK(locale IN ('zh','de','en')),token_hash text NOT NULL CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','confirmed','cancelled','completed')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),note text NOT NULL DEFAULT '' CHECK(length(note)<=1000),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX store_appointments_slot ON alsvid_v2.store_appointments(slot_id,status);
CREATE INDEX store_appointments_email ON alsvid_v2.store_appointments(email,created_at);
CREATE INDEX store_appointments_recent ON alsvid_v2.store_appointments(created_at);
COMMIT;
