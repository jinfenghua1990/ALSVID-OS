-- Dealer order requests with administrator-issued quotes.
BEGIN;

CREATE TABLE alsvid_v2.dealer_orders (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  dealer_user_uuid uuid NOT NULL REFERENCES alsvid_v2.app_users(entity_uuid),
  status text NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('submitted','quoted','accepted','declined','rejected')),
  note text NOT NULL DEFAULT '',
  admin_note text NOT NULL DEFAULT '',
  dealer_response_note text NOT NULL DEFAULT '',
  currency text CHECK (currency IN ('CNY','EUR')),
  quoted_by text NOT NULL DEFAULT '',
  quoted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dealer_orders_user_created_idx ON alsvid_v2.dealer_orders(dealer_user_uuid,created_at DESC);
CREATE INDEX dealer_orders_status_created_idx ON alsvid_v2.dealer_orders(status,created_at);

CREATE TABLE alsvid_v2.dealer_order_items (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  order_id uuid NOT NULL REFERENCES alsvid_v2.dealer_orders(id),
  sku_uuid uuid NOT NULL REFERENCES alsvid_v2.skus(entity_uuid),
  sku_code text NOT NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  quoted_unit_price numeric(14,2) CHECK (quoted_unit_price IS NULL OR quoted_unit_price >= 0),
  quote_note text NOT NULL DEFAULT '',
  UNIQUE(order_id,sku_uuid)
);
CREATE INDEX dealer_order_items_order_idx ON alsvid_v2.dealer_order_items(order_id);

COMMIT;
