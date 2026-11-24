BEGIN;
ALTER TABLE alsvid_v2.storefront_order_items ADD CONSTRAINT storefront_order_items_id_order_unique UNIQUE(id,order_id);
CREATE TABLE alsvid_v2.storefront_return_requests (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES alsvid_v2.storefront_orders(id), owner_user_uuid uuid NOT NULL REFERENCES alsvid_v2.app_users(entity_uuid),
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'), reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 2000),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), review_note text NOT NULL DEFAULT '', reviewed_by text NOT NULL DEFAULT '', reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,order_id),
 CHECK((status='pending' AND review_note='' AND reviewed_by='' AND reviewed_at IS NULL) OR (status IN ('approved','rejected') AND length(trim(review_note))>0 AND length(trim(reviewed_by))>0 AND reviewed_at IS NOT NULL)),
 CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE UNIQUE INDEX storefront_return_one_pending ON alsvid_v2.storefront_return_requests(order_id) WHERE status='pending';
CREATE TABLE alsvid_v2.storefront_return_items (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(), request_id uuid NOT NULL, order_id uuid NOT NULL, order_item_id uuid NOT NULL,
 quantity integer NOT NULL CHECK(quantity>0), UNIQUE(request_id,order_item_id),
 FOREIGN KEY(request_id,order_id) REFERENCES alsvid_v2.storefront_return_requests(id,order_id),
 FOREIGN KEY(order_item_id,order_id) REFERENCES alsvid_v2.storefront_order_items(id,order_id),
 CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE FUNCTION alsvid_v2.validate_storefront_return_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM alsvid_v2.storefront_orders WHERE id=NEW.order_id AND owner_user_uuid=NEW.owner_user_uuid) THEN
  RAISE EXCEPTION 'return request owner mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER validate_storefront_return_owner BEFORE INSERT ON alsvid_v2.storefront_return_requests FOR EACH ROW EXECUTE FUNCTION alsvid_v2.validate_storefront_return_owner();
CREATE FUNCTION alsvid_v2.guard_storefront_return_request() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status<>'pending' OR NEW.status NOT IN ('approved','rejected') OR (to_jsonb(NEW)-ARRAY['status','review_note','reviewed_by','reviewed_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','review_note','reviewed_by','reviewed_at']) THEN
  RAISE EXCEPTION 'return request history is immutable except for review' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER guard_storefront_return_request BEFORE UPDATE OR DELETE ON alsvid_v2.storefront_return_requests FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_storefront_return_request();
CREATE TRIGGER guard_storefront_return_items BEFORE UPDATE OR DELETE ON alsvid_v2.storefront_return_items FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_storefront_quote_history();
COMMIT;
