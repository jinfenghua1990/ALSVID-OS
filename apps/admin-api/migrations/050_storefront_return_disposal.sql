BEGIN;
CREATE TABLE alsvid_v2.storefront_return_disposal_events (
 id uuid PRIMARY KEY, receipt_item_id uuid NOT NULL REFERENCES alsvid_v2.storefront_return_receipt_items(id),
 quantity integer NOT NULL CHECK(quantity>0), disposition text NOT NULL CHECK(disposition IN ('scrapped','returned_to_supplier')),
 reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000), reference text NOT NULL DEFAULT '', disposed_on date NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'), recorded_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(disposition<>'returned_to_supplier' OR length(trim(reference))>0),
 CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE TRIGGER guard_storefront_return_disposal BEFORE UPDATE OR DELETE ON alsvid_v2.storefront_return_disposal_events FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_storefront_quote_history();
COMMIT;
