BEGIN;
CREATE TABLE alsvid_v2.storefront_cart_merges (
 id uuid PRIMARY KEY,
 cart_id uuid NOT NULL REFERENCES alsvid_v2.storefront_carts(id) ON DELETE CASCADE,
 request_hash text NOT NULL CHECK(request_hash ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX storefront_cart_merges_cart_idx ON alsvid_v2.storefront_cart_merges(cart_id);
COMMIT;
