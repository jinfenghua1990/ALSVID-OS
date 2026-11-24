BEGIN;
CREATE TABLE alsvid_v2.production_delivery_cancellations (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
 delivery_uuid uuid NOT NULL UNIQUE REFERENCES alsvid_v2.production_deliveries(entity_uuid),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
 actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE FUNCTION alsvid_v2.guard_delivery_cancellation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'delivery cancellations are append only' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER guard_delivery_cancellation BEFORE UPDATE OR DELETE ON alsvid_v2.production_delivery_cancellations FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_delivery_cancellation();
COMMIT;
