BEGIN;
ALTER TABLE alsvid_v2.storefront_orders DROP CONSTRAINT storefront_orders_status_check;
ALTER TABLE alsvid_v2.storefront_orders ADD CONSTRAINT storefront_orders_status_check CHECK(status IN ('submitted','quoted','accepted','allocated','partially_paid','paid','declined','cancelled'));
CREATE TABLE alsvid_v2.storefront_order_payments (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES alsvid_v2.storefront_orders(id), quote_id uuid NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'), amount_minor bigint NOT NULL CHECK(amount_minor>0),
 method text NOT NULL CHECK(method IN ('bank_transfer','cash','other')), reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 200),
 received_on date NOT NULL, note text NOT NULL DEFAULT '', recorded_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(quote_id,order_id) REFERENCES alsvid_v2.storefront_order_quotes(id,order_id),
 CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE TABLE alsvid_v2.storefront_payment_reversals (
 id uuid PRIMARY KEY, payment_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.storefront_order_payments(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000), reversed_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE TRIGGER guard_storefront_order_payments BEFORE UPDATE OR DELETE ON alsvid_v2.storefront_order_payments FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_storefront_quote_history();
CREATE TRIGGER guard_storefront_payment_reversals BEFORE UPDATE OR DELETE ON alsvid_v2.storefront_payment_reversals FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_storefront_quote_history();
COMMIT;
