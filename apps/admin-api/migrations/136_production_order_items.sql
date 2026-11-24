BEGIN;

CREATE TABLE alsvid_v2.production_order_items (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  order_uuid uuid NOT NULL REFERENCES alsvid_v2.production_orders(entity_uuid) ON DELETE RESTRICT,
  sku_uuid uuid NOT NULL REFERENCES alsvid_v2.skus(entity_uuid) ON DELETE RESTRICT,
  sku_code text NOT NULL,
  planned_quantity integer NOT NULL CHECK (planned_quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_uuid, sku_uuid),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);

CREATE INDEX production_order_items_order_idx ON alsvid_v2.production_order_items(order_uuid);

-- Preserve any existing single-SKU orders as one line item before new orders
-- begin using multiple vehicle SKU lines.
INSERT INTO alsvid_v2.production_order_items(order_uuid,sku_uuid,sku_code,planned_quantity,unit_price)
SELECT o.entity_uuid,s.entity_uuid,o.sku_code,o.planned_quantity,o.supplier_cost
FROM alsvid_v2.production_orders o
JOIN alsvid_v2.skus s ON s.code=o.sku_code
WHERE NOT EXISTS (
  SELECT 1 FROM alsvid_v2.production_order_items i WHERE i.order_uuid=o.entity_uuid
);

COMMIT;
