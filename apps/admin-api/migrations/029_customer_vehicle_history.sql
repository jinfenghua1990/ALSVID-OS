BEGIN;
CREATE TABLE alsvid_v2.customers (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
 name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
 phone text NOT NULL DEFAULT '', email text NOT NULL DEFAULT '', note text NOT NULL DEFAULT '',
 revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE TABLE alsvid_v2.customer_vehicle_history (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
 customer_id uuid NOT NULL REFERENCES alsvid_v2.customers(id),
 vin_uuid uuid NOT NULL REFERENCES alsvid_v2.vins(entity_uuid),
 started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
 actor text NOT NULL, CHECK (ended_at IS NULL OR ended_at >= started_at),
 CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE UNIQUE INDEX customer_vehicle_one_current_owner ON alsvid_v2.customer_vehicle_history(vin_uuid) WHERE ended_at IS NULL;
CREATE INDEX customer_vehicle_history_customer ON alsvid_v2.customer_vehicle_history(customer_id,started_at DESC);
COMMIT;
