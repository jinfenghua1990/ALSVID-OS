-- G6 统一出库单：单据层（销售出库/配件出库/其他出库），库存仍走 inventory_ledger 统一流水
-- 依据《生产交付仓储履约-现状核对与实施规划》阶段 3：
-- B2C 出库已记账但无单据形态；售后/配件出库依赖手工库存变动。本迁移补齐出库单据层。
-- 不新建第二套库存系统：确认出库时直接写 inventory_ledger（source_type='outbound_order'），
-- 由既有触发器自动同步库位账本。
BEGIN;

-- 1) 流水来源类型扩展：outbound_order（沿用迁移 140 的兼容写法）
ALTER TABLE alsvid_v2.inventory_ledger
  DROP CONSTRAINT IF EXISTS inventory_ledger_source_type_check;
ALTER TABLE alsvid_v2.inventory_ledger
  ADD CONSTRAINT inventory_ledger_source_type_check
  CHECK (source_type IN (
    'stock_movement','repair_stock_event','opening_balance','production_order_material',
    'stocktake_correction','dealer_order_item','storefront_order_item',
    'storefront_return_receipt_item','storefront_return_restock','sales_order',
    'manual_adjustment','outbound_order'
  ));

-- 2) 出库单主表
CREATE TABLE IF NOT EXISTS alsvid_v2.inventory_outbound_orders (
  id text PRIMARY KEY,
  outbound_no text NOT NULL UNIQUE,
  source_type text NOT NULL CHECK (source_type IN ('销售出库','配件出库','其他出库')),
  source_ref text NOT NULL DEFAULT '' CHECK (length(source_ref) <= 120),
  warehouse_id text NOT NULL REFERENCES alsvid_v2.warehouses(id),
  status text NOT NULL DEFAULT '待出库' CHECK (status IN ('待出库','已完成','已取消')),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  cancel_reason text NOT NULL DEFAULT '' CHECK (length(cancel_reason) <= 500),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_by text,
  confirmed_at timestamptz
);

CREATE INDEX IF NOT EXISTS inventory_outbound_orders_created_idx
  ON alsvid_v2.inventory_outbound_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_outbound_orders_status_idx
  ON alsvid_v2.inventory_outbound_orders(status, created_at DESC);

COMMENT ON TABLE alsvid_v2.inventory_outbound_orders IS '统一出库单：待出库→已完成（确认时扣库存并写 inventory_ledger）/已取消';
COMMENT ON COLUMN alsvid_v2.inventory_outbound_orders.outbound_no IS '出库单号 OUT-YYYYMMDD-XXX，按日序号';

-- 3) 出库单明细
CREATE TABLE IF NOT EXISTS alsvid_v2.inventory_outbound_items (
  id text PRIMARY KEY,
  outbound_id text NOT NULL REFERENCES alsvid_v2.inventory_outbound_orders(id) ON DELETE CASCADE,
  sku_code text NOT NULL REFERENCES alsvid_v2.skus(code),
  quantity integer NOT NULL CHECK (quantity > 0),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  UNIQUE (outbound_id, sku_code)
);

COMMIT;
