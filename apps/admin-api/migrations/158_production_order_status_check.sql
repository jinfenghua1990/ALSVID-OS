-- P0 修复：production_orders.status CHECK 与代码语义脱节。
-- V2 代码写入 待工厂确认（建单）/ 待发货（满产），但旧 CHECK 只允许 计划中/生产中/已完成/已取消，
-- 导致建单与满产进度登记被 23514 拒绝。此处扩展 CHECK 覆盖代码实际写入的全部状态，
-- 保留旧值兼容存量数据（现有 PO-20261115-001 为 计划中，无需数据映射）。
BEGIN;

ALTER TABLE alsvid_v2.production_orders DROP CONSTRAINT IF EXISTS production_orders_status_check;
ALTER TABLE alsvid_v2.production_orders ADD CONSTRAINT production_orders_status_check
  CHECK (status IN ('计划中','待工厂确认','生产中','待发货','已完成','已取消'));

COMMIT;