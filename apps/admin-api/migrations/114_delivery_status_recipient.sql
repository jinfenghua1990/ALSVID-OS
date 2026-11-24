-- 交付批次：状态机扩展 + 收货对象/配送方式/地址快照
-- 依据规范 §3.3 / §5.1 / §6：草稿→待确认→已交运→运输中→已签收，可进异常/取消
-- 保留既有三态（待发运/在途/已入库）以兼容当前发运与签收代码
BEGIN;

ALTER TABLE alsvid_v2.production_deliveries
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'production_order',
  ADD COLUMN IF NOT EXISTS recipient_type text NOT NULL DEFAULT '仓库',
  ADD COLUMN IF NOT EXISTS recipient_id text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS delivery_method text NOT NULL DEFAULT '物流',
  ADD COLUMN IF NOT EXISTS ship_to_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS dispatched_by text NOT NULL DEFAULT '';

ALTER TABLE alsvid_v2.production_deliveries
  DROP CONSTRAINT IF EXISTS production_deliveries_status_check;

ALTER TABLE alsvid_v2.production_deliveries
  ADD CONSTRAINT production_deliveries_status_check CHECK (
    status IN ('草稿','待确认','待发运','已交运','在途','运输中','已签收','已入库','异常','取消')
  );

ALTER TABLE alsvid_v2.production_deliveries
  DROP CONSTRAINT IF EXISTS production_deliveries_source_type_check;
ALTER TABLE alsvid_v2.production_deliveries
  ADD CONSTRAINT production_deliveries_source_type_check CHECK (
    source_type IN ('production_order','purchase_order','stock_transfer')
  );

ALTER TABLE alsvid_v2.production_deliveries
  DROP CONSTRAINT IF EXISTS production_deliveries_recipient_type_check;
ALTER TABLE alsvid_v2.production_deliveries
  ADD CONSTRAINT production_deliveries_recipient_type_check CHECK (
    recipient_type IN ('仓库','客户','维修店')
  );

ALTER TABLE alsvid_v2.production_deliveries
  DROP CONSTRAINT IF EXISTS production_deliveries_delivery_method_check;
ALTER TABLE alsvid_v2.production_deliveries
  ADD CONSTRAINT production_deliveries_delivery_method_check CHECK (
    delivery_method IN ('物流','同城自配','客户自提','工厂直发')
  );

ALTER TABLE alsvid_v2.production_deliveries
  DROP CONSTRAINT IF EXISTS production_deliveries_ship_to_snapshot_check;
ALTER TABLE alsvid_v2.production_deliveries
  ADD CONSTRAINT production_deliveries_ship_to_snapshot_check CHECK (
    ship_to_snapshot IS NULL OR jsonb_typeof(ship_to_snapshot) = 'object'
  );

CREATE INDEX IF NOT EXISTS production_deliveries_order_status_idx
  ON alsvid_v2.production_deliveries(order_id, status, created_at DESC);

COMMIT;
