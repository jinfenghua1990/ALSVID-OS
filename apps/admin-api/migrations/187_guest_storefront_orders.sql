BEGIN;
ALTER TABLE alsvid_v2.storefront_orders ALTER COLUMN owner_user_uuid DROP NOT NULL;
ALTER TABLE alsvid_v2.storefront_orders ADD COLUMN guest_token_hash text;
ALTER TABLE alsvid_v2.storefront_orders ADD CONSTRAINT storefront_order_identity_check CHECK (
 (owner_user_uuid IS NOT NULL AND guest_token_hash IS NULL)
 OR (owner_user_uuid IS NULL AND guest_token_hash IS NOT NULL AND guest_token_hash ~ '^[0-9a-f]{64}$'
 AND COALESCE(length(delivery->>'email'),0) BETWEEN 3 AND 254)
);
CREATE INDEX storefront_guest_order_created ON alsvid_v2.storefront_orders(created_at DESC) WHERE owner_user_uuid IS NULL;
ALTER TABLE alsvid_v2.storefront_order_responses ALTER COLUMN responded_by DROP NOT NULL;
ALTER TABLE alsvid_v2.storefront_order_receipts ALTER COLUMN confirmed_by DROP NOT NULL;
CREATE FUNCTION alsvid_v2.validate_storefront_response_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM alsvid_v2.storefront_orders WHERE id=NEW.order_id AND owner_user_uuid IS NOT DISTINCT FROM NEW.responded_by) THEN
  RAISE EXCEPTION 'response owner mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER validate_storefront_response_owner BEFORE INSERT ON alsvid_v2.storefront_order_responses FOR EACH ROW EXECUTE FUNCTION alsvid_v2.validate_storefront_response_owner();
CREATE OR REPLACE FUNCTION alsvid_v2.validate_storefront_receipt_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM alsvid_v2.storefront_orders WHERE id=NEW.order_id AND owner_user_uuid IS NOT DISTINCT FROM NEW.confirmed_by) THEN
  RAISE EXCEPTION 'receipt owner mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
COMMIT;
