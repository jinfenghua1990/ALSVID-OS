-- P0 补强：仓库编码必须唯一（规格 §6：warehouses.code 唯一）。
-- 149 迁移用 WHERE NOT EXISTS 防重，但数据库层没有唯一约束，此处补上。
-- 现有三条编码 CN-B2C-CZ / DE-B2C-BL / WH_VIRTUAL 互不重复，可安全加约束。
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS warehouses_warehouse_code_key
  ON alsvid_v2.warehouses(warehouse_code);

COMMIT;
