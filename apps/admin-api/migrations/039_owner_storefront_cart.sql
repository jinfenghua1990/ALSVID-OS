BEGIN;
CREATE TABLE alsvid_v2.storefront_carts (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
 owner_user_uuid uuid NOT NULL UNIQUE REFERENCES alsvid_v2.app_users(entity_uuid),
 revision integer NOT NULL DEFAULT 0 CHECK(revision>=0), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE TABLE alsvid_v2.storefront_cart_items (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
 cart_id uuid NOT NULL REFERENCES alsvid_v2.storefront_carts(id) ON DELETE CASCADE,
 sku_uuid uuid NOT NULL, currency text NOT NULL, quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100),
 UNIQUE(cart_id,sku_uuid,currency), FOREIGN KEY(sku_uuid,currency) REFERENCES alsvid_v2.storefront_offers(sku_uuid,currency),
 CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
COMMIT;
