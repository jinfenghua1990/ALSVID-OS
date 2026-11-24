BEGIN;
CREATE TABLE alsvid_v2.customer_interactions (
 id uuid PRIMARY KEY CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b')),
 customer_id uuid NOT NULL REFERENCES alsvid_v2.customers(id),
 vin_uuid uuid REFERENCES alsvid_v2.vins(entity_uuid),
 method text NOT NULL CHECK(method IN ('phone','email','in_person','other')),
 direction text NOT NULL CHECK(direction IN ('inbound','outbound','internal')),
 occurred_on date NOT NULL, summary text NOT NULL CHECK(length(trim(summary)) BETWEEN 1 AND 2000),
 followup_on date, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customer_interactions_customer ON alsvid_v2.customer_interactions(customer_id,occurred_on DESC,id DESC);
CREATE TABLE alsvid_v2.customer_followup_completions (
 interaction_id uuid PRIMARY KEY REFERENCES alsvid_v2.customer_interactions(id),
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 1 AND 2000),
 actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION alsvid_v2.guard_customer_interaction() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'customer interactions are append only' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER guard_customer_interactions BEFORE UPDATE OR DELETE ON alsvid_v2.customer_interactions FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_customer_interaction();
CREATE TRIGGER guard_customer_followup_completions BEFORE UPDATE OR DELETE ON alsvid_v2.customer_followup_completions FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_customer_interaction();
COMMIT;
