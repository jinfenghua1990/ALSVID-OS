BEGIN;
CREATE TABLE alsvid_v2.dealer_rebate_policies (
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES alsvid_v2.dealer_companies(id),
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 160),
 rate_bps integer NOT NULL CHECK(rate_bps BETWEEN 0 AND 10000),
 starts_on date NOT NULL, ends_on date NOT NULL CHECK(ends_on>=starts_on),
 enabled boolean NOT NULL DEFAULT false, note text NOT NULL DEFAULT '',
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE alsvid_v2.dealer_benefit_awards (
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES alsvid_v2.dealer_companies(id),
 policy_id uuid REFERENCES alsvid_v2.dealer_rebate_policies(id),
 order_id uuid REFERENCES alsvid_v2.dealer_orders(id),
 kind text NOT NULL CHECK(kind IN ('rebate','demo','exhibition','marketing')),
 basis numeric(18,2), amount numeric(18,2) NOT NULL CHECK(amount>0),
 note text NOT NULL CHECK(length(trim(note)) BETWEEN 1 AND 2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','void')),
 review_note text NOT NULL DEFAULT '', created_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, reviewed_by text,
 CHECK((kind='rebate' AND order_id IS NOT NULL AND policy_id IS NOT NULL AND basis>0) OR (kind<>'rebate' AND order_id IS NULL AND policy_id IS NULL AND basis IS NULL))
);
CREATE UNIQUE INDEX dealer_rebate_one_live_order ON alsvid_v2.dealer_benefit_awards(order_id) WHERE kind='rebate' AND status IN ('pending','approved');
CREATE INDEX dealer_awards_company ON alsvid_v2.dealer_benefit_awards(company_id,created_at DESC);
CREATE TABLE alsvid_v2.dealer_benefit_ledger (
 id uuid PRIMARY KEY, company_id uuid NOT NULL REFERENCES alsvid_v2.dealer_companies(id),
 award_id uuid NOT NULL REFERENCES alsvid_v2.dealer_benefit_awards(id),
 kind text NOT NULL CHECK(kind IN ('credit','reversal')),
 amount numeric(18,2) NOT NULL CHECK((kind='credit' AND amount>0) OR (kind='reversal' AND amount<0)),
 note text NOT NULL, created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(award_id,kind)
);
CREATE TRIGGER guard_dealer_benefit_ledger BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_benefit_ledger FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_dealer_invoice_history_mutation();
COMMIT;
