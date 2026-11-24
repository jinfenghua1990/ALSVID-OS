BEGIN;
CREATE TABLE alsvid_v2.repair_quotes (
 id uuid PRIMARY KEY CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b')),
 repair_uuid uuid NOT NULL REFERENCES alsvid_v2.repairs(entity_uuid), revision integer NOT NULL CHECK(revision>0),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), labor_minor bigint NOT NULL CHECK(labor_minor>=0), parts_minor bigint NOT NULL CHECK(parts_minor>=0), other_minor bigint NOT NULL CHECK(other_minor>=0),
 note text NOT NULL DEFAULT '', created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(repair_uuid,revision)
);
CREATE TABLE alsvid_v2.repair_quote_decisions (
 id uuid PRIMARY KEY CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b')),
 quote_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.repair_quotes(id), decision text NOT NULL CHECK(decision IN ('accepted','declined')),
 note text NOT NULL DEFAULT '', recorded_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE alsvid_v2.repair_payments (
 id uuid PRIMARY KEY CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b')),
 quote_id uuid NOT NULL REFERENCES alsvid_v2.repair_quotes(id), amount_minor bigint NOT NULL CHECK(amount_minor>0),
 method text NOT NULL CHECK(method IN ('bank_transfer','cash','other')), reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 200),
 received_on date NOT NULL, note text NOT NULL DEFAULT '', recorded_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(method,reference)
);
CREATE FUNCTION alsvid_v2.guard_repair_finance() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'repair financial records are append only' USING ERRCODE='23514'; END; $$;
CREATE TRIGGER guard_repair_quotes BEFORE UPDATE OR DELETE ON alsvid_v2.repair_quotes FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_repair_finance();
CREATE TRIGGER guard_repair_quote_decisions BEFORE UPDATE OR DELETE ON alsvid_v2.repair_quote_decisions FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_repair_finance();
CREATE TRIGGER guard_repair_payments BEFORE UPDATE OR DELETE ON alsvid_v2.repair_payments FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_repair_finance();
COMMIT;
