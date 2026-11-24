-- P1-1 配件出库挂接售后工单 + 自动生成出库单的记账来源标记
-- 问题：B2C 销售出库单、售后领料出库单的库存扣减由各自来源业务记账
--       （sales_order / repair_stock_event），出库单本身不写 outbound_order 流水。
--       若对这类单据执行「出库退回」，会写入 outbound_return 流水但原扣减不在 outbound_order，
--       导致库存与账本不一致。
-- 方案：出库单记录实际记账来源；只有 ledger_source='outbound_order' 的单据允许出库退回。
BEGIN;

ALTER TABLE alsvid_v2.inventory_outbound_orders
  ADD COLUMN IF NOT EXISTS ledger_source text NOT NULL DEFAULT 'outbound_order';

ALTER TABLE alsvid_v2.inventory_outbound_orders
  DROP CONSTRAINT IF EXISTS inventory_outbound_orders_ledger_source_check;
ALTER TABLE alsvid_v2.inventory_outbound_orders
  ADD CONSTRAINT inventory_outbound_orders_ledger_source_check
  CHECK (ledger_source IN ('outbound_order','sales_order','repair_stock_event'));

COMMENT ON COLUMN alsvid_v2.inventory_outbound_orders.ledger_source IS
  '实际记账来源：outbound_order=本单确认时扣减；sales_order/repair_stock_event=由来源业务记账，本单仅为单据形态，不可出库退回';

-- 存量回填：B2C 自动生成的销售出库单
UPDATE alsvid_v2.inventory_outbound_orders
SET ledger_source='sales_order'
WHERE ledger_source='outbound_order' AND source_type='销售出库' AND note LIKE 'B2C 销售发货自动生成出库单%';

COMMIT;
