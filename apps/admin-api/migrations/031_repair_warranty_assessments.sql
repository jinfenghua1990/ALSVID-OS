BEGIN;
CREATE TABLE alsvid_v2.repair_warranty_assessments (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
 repair_uuid uuid NOT NULL REFERENCES alsvid_v2.repairs(entity_uuid),
 warranty_id uuid REFERENCES alsvid_v2.vehicle_warranties(id),
 assessed_on date NOT NULL, outcome text NOT NULL CHECK(outcome IN ('covered','not_covered','review')),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
 warranty_snapshot jsonb, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK ((warranty_id IS NULL)=(warranty_snapshot IS NULL)),
 CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE INDEX repair_warranty_assessments_repair ON alsvid_v2.repair_warranty_assessments(repair_uuid,created_at DESC,id DESC);
CREATE FUNCTION alsvid_v2.guard_warranty_assessment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'warranty assessments are append only' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER guard_warranty_assessment BEFORE UPDATE OR DELETE ON alsvid_v2.repair_warranty_assessments FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_warranty_assessment();
COMMIT;
