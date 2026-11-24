BEGIN;
ALTER TABLE alsvid_v2.storefront_orders DROP CONSTRAINT storefront_orders_status_check;
ALTER TABLE alsvid_v2.storefront_orders ADD CONSTRAINT storefront_orders_status_check CHECK(status IN ('submitted','quoted','accepted','declined'));
CREATE TABLE alsvid_v2.storefront_order_quotes (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(), order_id uuid NOT NULL REFERENCES alsvid_v2.storefront_orders(id),
 revision integer NOT NULL CHECK(revision>0), shipping_minor bigint NOT NULL CHECK(shipping_minor>=0), tax_minor bigint NOT NULL CHECK(tax_minor>=0),
 total_minor bigint NOT NULL CHECK(total_minor>=0), note text NOT NULL DEFAULT '', quoted_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(order_id,revision), UNIQUE(id,order_id), CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE TABLE alsvid_v2.storefront_order_responses (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(), order_id uuid NOT NULL REFERENCES alsvid_v2.storefront_orders(id),
 quote_id uuid NOT NULL UNIQUE, decision text NOT NULL CHECK(decision IN ('accept','decline')), responded_by uuid NOT NULL REFERENCES alsvid_v2.app_users(entity_uuid),
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(quote_id,order_id) REFERENCES alsvid_v2.storefront_order_quotes(id,order_id),
 CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE FUNCTION alsvid_v2.guard_storefront_quote_history() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'storefront quote history is immutable' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER guard_storefront_order_quotes BEFORE UPDATE OR DELETE ON alsvid_v2.storefront_order_quotes FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_storefront_quote_history();
CREATE TRIGGER guard_storefront_order_responses BEFORE UPDATE OR DELETE ON alsvid_v2.storefront_order_responses FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_storefront_quote_history();
COMMIT;
