-- 生产发货批次的车型明细。
-- 旧版批次只有总数量；单车型旧批次可安全回填，多车型旧批次保留原汇总记录，禁止伪造拆分。
BEGIN;

CREATE TABLE IF NOT EXISTS alsvid_v2.production_delivery_items (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  delivery_uuid uuid NOT NULL REFERENCES alsvid_v2.production_deliveries(entity_uuid) ON DELETE RESTRICT,
  order_item_uuid uuid NOT NULL REFERENCES alsvid_v2.production_order_items(id) ON DELETE RESTRICT,
  sku_uuid uuid NOT NULL REFERENCES alsvid_v2.skus(entity_uuid) ON DELETE RESTRICT,
  sku_code text NOT NULL,
  planned_quantity integer NOT NULL CHECK (planned_quantity > 0),
  received_quantity integer NOT NULL DEFAULT 0 CHECK (received_quantity >= 0 AND received_quantity <= planned_quantity),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_uuid, sku_uuid),
  UNIQUE (delivery_uuid, order_item_uuid),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);

CREATE INDEX IF NOT EXISTS production_delivery_items_delivery_idx
  ON alsvid_v2.production_delivery_items(delivery_uuid);
CREATE INDEX IF NOT EXISTS production_delivery_items_sku_idx
  ON alsvid_v2.production_delivery_items(sku_uuid);

-- 只有订单本身只有一个车型时，旧批次的总数才有确定的车型归属。
INSERT INTO alsvid_v2.production_delivery_items(
  delivery_uuid, order_item_uuid, sku_uuid, sku_code, planned_quantity
)
SELECT d.entity_uuid, i.id, i.sku_uuid, i.sku_code, d.planned_quantity
FROM alsvid_v2.production_deliveries d
JOIN alsvid_v2.production_orders o ON o.id=d.order_id
JOIN alsvid_v2.production_order_items i ON i.order_uuid=o.entity_uuid
WHERE NOT EXISTS (
  SELECT 1 FROM alsvid_v2.production_order_items other
  WHERE other.order_uuid=i.order_uuid AND other.id<>i.id
)
AND NOT EXISTS (
  SELECT 1 FROM alsvid_v2.production_delivery_items existing
  WHERE existing.delivery_uuid=d.entity_uuid
);

COMMIT;
