-- Guest order ownership is separate from customer registration; no synthetic accounts.
ALTER TABLE alsvid_v2.storefront_orders ALTER COLUMN owner_user_uuid DROP NOT NULL;
ALTER TABLE alsvid_v2.storefront_orders ADD COLUMN guest_email text;
ALTER TABLE alsvid_v2.storefront_orders ADD CONSTRAINT storefront_order_identity_check CHECK (owner_user_uuid IS NOT NULL OR guest_email IS NOT NULL);
CREATE INDEX storefront_orders_guest_lookup_idx ON alsvid_v2.storefront_orders(guest_email,id) WHERE owner_user_uuid IS NULL;
CREATE TABLE alsvid_v2.storefront_guest_challenges(
 id uuid PRIMARY KEY,
 email text NOT NULL CHECK (char_length(email)<=254),
 code_hash text NOT NULL,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 delivered boolean NOT NULL DEFAULT false,
 used_at timestamptz,
 token_hash text UNIQUE,
 token_expires_at timestamptz,
 CHECK ((token_hash IS NULL)=(token_expires_at IS NULL))
);
CREATE INDEX storefront_guest_challenges_rate_idx ON alsvid_v2.storefront_guest_challenges(created_at,email);

-- Permit only the one-way claim of a verified guest order. All commercial snapshots remain immutable.
CREATE OR REPLACE FUNCTION alsvid_v2.guard_storefront_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'storefront order request details are immutable' USING ERRCODE='23514'; END IF;
 IF OLD.owner_user_uuid IS NULL AND NEW.owner_user_uuid IS NOT NULL AND OLD.guest_email IS NOT NULL THEN
   IF NEW.status IS DISTINCT FROM OLD.status OR
      (to_jsonb(NEW)-'owner_user_uuid') IS DISTINCT FROM (to_jsonb(OLD)-'owner_user_uuid') OR
      NOT EXISTS (SELECT 1 FROM alsvid_v2.app_users WHERE entity_uuid=NEW.owner_user_uuid AND role='owner' AND enabled AND lower(username)=OLD.guest_email) THEN
     RAISE EXCEPTION 'invalid guest claim' USING ERRCODE='23514'; END IF;
 ELSIF (to_jsonb(NEW)-'status') IS DISTINCT FROM (to_jsonb(OLD)-'status') THEN
   RAISE EXCEPTION 'storefront order request details are immutable' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;
ALTER TABLE alsvid_v2.storefront_order_responses ALTER COLUMN responded_by DROP NOT NULL;
ALTER TABLE alsvid_v2.storefront_order_responses ADD COLUMN guest_email text;
ALTER TABLE alsvid_v2.storefront_order_responses ADD CONSTRAINT storefront_response_identity_check CHECK ((responded_by IS NOT NULL) <> (guest_email IS NOT NULL));
ALTER TABLE alsvid_v2.storefront_order_receipts ALTER COLUMN confirmed_by DROP NOT NULL;
ALTER TABLE alsvid_v2.storefront_order_receipts ADD COLUMN guest_email text;
ALTER TABLE alsvid_v2.storefront_order_receipts ADD CONSTRAINT storefront_receipt_identity_check CHECK ((confirmed_by IS NOT NULL) <> (guest_email IS NOT NULL));
CREATE OR REPLACE FUNCTION alsvid_v2.validate_storefront_receipt_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM alsvid_v2.storefront_orders WHERE id=NEW.order_id AND
 ((NEW.confirmed_by IS NOT NULL AND owner_user_uuid=NEW.confirmed_by) OR
 (NEW.confirmed_by IS NULL AND owner_user_uuid IS NULL AND guest_email=NEW.guest_email))) THEN
 RAISE EXCEPTION 'receipt owner mismatch' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END;
$$;
