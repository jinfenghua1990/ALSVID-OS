BEGIN;

CREATE TABLE alsvid_v2.dealer_order_payments (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  order_id uuid NOT NULL REFERENCES alsvid_v2.dealer_orders(id),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  reference text NOT NULL DEFAULT '' CHECK (length(reference) <= 120),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  recorded_by text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX dealer_order_payments_order_received
  ON alsvid_v2.dealer_order_payments(order_id, received_at, id);

CREATE FUNCTION alsvid_v2.guard_dealer_order_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'dealer order payment records are immutable' USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER guard_dealer_order_payment
BEFORE UPDATE OR DELETE ON alsvid_v2.dealer_order_payments
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_dealer_order_payment();

COMMIT;
