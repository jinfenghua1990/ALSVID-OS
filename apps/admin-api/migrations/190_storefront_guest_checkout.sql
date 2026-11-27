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
