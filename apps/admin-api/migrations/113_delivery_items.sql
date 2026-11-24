-- 交付行：让一个交付批次内可以有 SKU 级明细（配件按 SKU 数量出货，整车按车体/电池组件）
-- 依据规范 §3.3 / §5「交付行 delivery_items」：数量>0，不可超过来源剩余可发量（由应用层校验）
BEGIN;

CREATE TABLE IF NOT EXISTS alsvid_v2.delivery_items (
  id text PRIMARY KEY,
  delivery_id text NOT NULL REFERENCES alsvid_v2.production_deliveries(id),
  source_type text NOT NULL DEFAULT 'production_order'
    CHECK (source_type IN ('production_order','purchase_order','stock_transfer')),
  source_line_id text NOT NULL DEFAULT '' CHECK (length(source_line_id) <= 80),
  sku_code text NOT NULL CHECK (length(trim(sku_code)) BETWEEN 1 AND 80),
  quantity integer NOT NULL CHECK (quantity > 0),
  component_type text NOT NULL CHECK (component_type IN ('车体','电池','配件','其他')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_id, sku_code, component_type)
);

CREATE INDEX IF NOT EXISTS delivery_items_delivery_idx
  ON alsvid_v2.delivery_items(delivery_id, component_type);
CREATE INDEX IF NOT EXISTS delivery_items_sku_idx
  ON alsvid_v2.delivery_items(sku_code);

COMMIT;
