-- B2B 经销商收款冲正：收款记录不可变（059），错账通过追加冲正记录纠正。
-- 冲正后该笔收款不再计入订单已收款（portal.js / dealer-returns.js 的余额口径同步排除）。
BEGIN;

CREATE TABLE alsvid_v2.dealer_order_payment_reversals (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  payment_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.dealer_order_payments(id),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 2000),
  reversed_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION alsvid_v2.guard_dealer_order_payment_reversal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'dealer order payment reversal records are immutable' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER guard_dealer_order_payment_reversal
BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_order_payment_reversals
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_dealer_order_payment_reversal();

COMMIT;