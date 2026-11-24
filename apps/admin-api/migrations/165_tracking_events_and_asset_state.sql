-- 补齐 8090 OMS → 8089 V2 迁移后的两处残缺（只做加法，可安全重跑）：
--
-- 1) VIN 资产归属四态（8090 的整车序列号台账）
--    迁移 150 已有 asset_status（可用/预占/已出库/冻结）表达"能不能动"，
--    但表达不了"这台车现在算谁的"——现货在库 / 虚拟仓待出库 / 国际在途 / 买方持有。
--    故新增 owner_state 与销售链路挂载列。
--
-- 2) tracking_events 已在迁移 153 建好（package_id → delivery_parcels），本迁移不重复建表，
--    仅补一个按运单号回溯的辅助索引，供「物流跟踪」页按运单反查事件。
BEGIN;

ALTER TABLE alsvid_v2.vins ADD COLUMN IF NOT EXISTS owner_state text NOT NULL DEFAULT 'STOCK';
ALTER TABLE alsvid_v2.vins ADD COLUMN IF NOT EXISTS sales_order_uuid uuid REFERENCES alsvid_v2.sales_orders(id);
ALTER TABLE alsvid_v2.vins ADD COLUMN IF NOT EXISTS shipped_at timestamptz;
ALTER TABLE alsvid_v2.vins ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'alsvid_v2.vins'::regclass AND conname = 'vins_owner_state_check'
  ) THEN
    ALTER TABLE alsvid_v2.vins ADD CONSTRAINT vins_owner_state_check
      CHECK (owner_state IN ('STOCK', 'VIRTUAL', 'IN_TRANSIT', 'CUSTOMER'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS vins_owner_state_idx ON alsvid_v2.vins(owner_state, created_at DESC);
CREATE INDEX IF NOT EXISTS vins_sales_order_idx ON alsvid_v2.vins(sales_order_uuid) WHERE sales_order_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS tracking_events_status_idx ON alsvid_v2.tracking_events(status, event_time DESC);

COMMIT;
