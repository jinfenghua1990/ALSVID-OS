BEGIN;
CREATE TABLE alsvid_v2.storefront_orders (
 id uuid PRIMARY KEY, owner_user_uuid uuid NOT NULL REFERENCES alsvid_v2.app_users(entity_uuid),
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 status text NOT NULL DEFAULT 'submitted' CHECK(status='submitted'),
 currency text NOT NULL CHECK(currency IN ('CNY','EUR')),
 subtotal_minor bigint NOT NULL CHECK(subtotal_minor>=0), delivery jsonb NOT NULL, items jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE INDEX storefront_orders_owner ON alsvid_v2.storefront_orders(owner_user_uuid,created_at DESC);
CREATE FUNCTION alsvid_v2.guard_storefront_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
  RAISE EXCEPTION 'storefront order request details are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_storefront_order BEFORE UPDATE OR DELETE ON alsvid_v2.storefront_orders FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_storefront_order();
COMMIT;
