BEGIN;
CREATE TABLE alsvid_v2.vehicle_warranties (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
 vin_uuid uuid NOT NULL REFERENCES alsvid_v2.vins(entity_uuid),
 coverage text NOT NULL CHECK(length(trim(coverage)) BETWEEN 1 AND 300),
 starts_on date NOT NULL, ends_on date NOT NULL CHECK(ends_on>=starts_on),
 note text NOT NULL DEFAULT '', created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), revoked_at timestamptz, revoked_by text, revoke_reason text,
 CHECK ((revoked_at IS NULL AND revoked_by IS NULL AND revoke_reason IS NULL) OR (revoked_at IS NOT NULL AND revoked_by IS NOT NULL AND length(trim(revoke_reason))>0)),
 CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE INDEX vehicle_warranties_vin ON alsvid_v2.vehicle_warranties(vin_uuid,starts_on DESC);
COMMIT;
