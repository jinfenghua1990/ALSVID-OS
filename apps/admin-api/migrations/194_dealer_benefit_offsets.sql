BEGIN;
CREATE TABLE alsvid_v2.dealer_benefit_offsets (
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES alsvid_v2.dealer_companies(id),
 award_id uuid NOT NULL REFERENCES alsvid_v2.dealer_benefit_awards(id),
 order_id uuid NOT NULL REFERENCES alsvid_v2.dealer_orders(id),
 amount numeric(18,2) NOT NULL CHECK(amount>0),
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 1 AND 2000),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE alsvid_v2.dealer_benefit_offset_reversals (
 offset_id uuid PRIMARY KEY REFERENCES alsvid_v2.dealer_benefit_offsets(id),
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 1 AND 2000),
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dealer_benefit_offsets_company_idx ON alsvid_v2.dealer_benefit_offsets(company_id,created_at);
CREATE INDEX dealer_benefit_offsets_order_idx ON alsvid_v2.dealer_benefit_offsets(order_id);
CREATE INDEX dealer_benefit_offsets_award_idx ON alsvid_v2.dealer_benefit_offsets(award_id);
CREATE TRIGGER guard_dealer_benefit_offsets BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_benefit_offsets FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_dealer_invoice_history_mutation();
CREATE TRIGGER guard_dealer_benefit_offset_reversals BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_benefit_offset_reversals FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_dealer_invoice_history_mutation();
COMMIT;
