BEGIN;
CREATE TABLE alsvid_v2.storefront_return_refunds (
 id uuid PRIMARY KEY, order_id uuid NOT NULL, return_id uuid NOT NULL, request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 amount_minor bigint NOT NULL CHECK(amount_minor>0), method text NOT NULL CHECK(method IN ('bank_transfer','cash','other')),
 reference text NOT NULL CHECK(length(trim(reference)) BETWEEN 1 AND 200), refunded_on date NOT NULL, note text NOT NULL DEFAULT '', recorded_by text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(return_id,order_id) REFERENCES alsvid_v2.storefront_return_requests(id,order_id),
 CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE TABLE alsvid_v2.storefront_refund_reversals (
 id uuid PRIMARY KEY, refund_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.storefront_return_refunds(id),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000), reversed_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE TRIGGER guard_storefront_return_refunds BEFORE UPDATE OR DELETE ON alsvid_v2.storefront_return_refunds FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_storefront_quote_history();
CREATE TRIGGER guard_storefront_refund_reversals BEFORE UPDATE OR DELETE ON alsvid_v2.storefront_refund_reversals FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_storefront_quote_history();
COMMIT;
