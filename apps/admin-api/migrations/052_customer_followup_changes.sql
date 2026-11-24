BEGIN;
CREATE TABLE alsvid_v2.customer_followup_changes (
 id uuid PRIMARY KEY CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b')),
 interaction_id uuid NOT NULL REFERENCES alsvid_v2.customer_interactions(id),
 revision integer NOT NULL CHECK(revision>0),
 kind text NOT NULL CHECK(kind IN ('rescheduled','cancelled')),
 followup_on date, reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
 actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='rescheduled' AND followup_on IS NOT NULL) OR (kind='cancelled' AND followup_on IS NULL)),
 UNIQUE(interaction_id,revision)
);
CREATE TRIGGER guard_customer_followup_changes BEFORE UPDATE OR DELETE ON alsvid_v2.customer_followup_changes FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_customer_interaction();
COMMIT;
