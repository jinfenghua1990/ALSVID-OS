-- 8090 库存中心对齐：把原 OMS 的均价成本、流水金额/结存沉淀到 8089，
-- 让「库存台账」「整车序列号」两张表能显示 8090 同口径的列。
-- 新列只用于历史迁移数据的展示，不参与 8089 现有库存/成本核算。
ALTER TABLE alsvid_v2.warehouse_stock ADD COLUMN IF NOT EXISTS avg_cost_8090 numeric(20,2);
ALTER TABLE alsvid_v2.inventory_ledger ADD COLUMN IF NOT EXISTS unit_cost_8090 numeric(20,2);
ALTER TABLE alsvid_v2.inventory_ledger ADD COLUMN IF NOT EXISTS amount_8090 numeric(20,2);
ALTER TABLE alsvid_v2.inventory_ledger ADD COLUMN IF NOT EXISTS balance_after_8090 integer;
CREATE INDEX IF NOT EXISTS warehouse_stock_avg_cost_8090_idx ON alsvid_v2.warehouse_stock(avg_cost_8090);
