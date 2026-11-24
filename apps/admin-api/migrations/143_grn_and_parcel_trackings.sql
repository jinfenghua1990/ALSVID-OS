-- G2 入库单单据化 + G5 包裹多物流编号
-- 依据《生产交付仓储履约-现状核对与实施规划》：签收入库生成 GRN 入库单号，记录状态；
-- 包裹支持多个物流编号（货代运单/承运商运单/其他），不改动既有记账原子性。
BEGIN;

-- 1) 入库单：GRN 编号 + 状态
ALTER TABLE alsvid_v2.production_delivery_receipts
  ADD COLUMN IF NOT EXISTS grn_no text;
ALTER TABLE alsvid_v2.production_delivery_receipts
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT '已完成';

-- 历史签收记录按签收日期回填 GRN-YYYYMMDD-XXX
WITH numbered AS (
  SELECT id,
         'GRN-' || to_char(received_at, 'YYYYMMDD') || '-' ||
           lpad((row_number() OVER (PARTITION BY to_char(received_at, 'YYYYMMDD') ORDER BY received_at, id))::text, 3, '0') AS grn
  FROM alsvid_v2.production_delivery_receipts
  WHERE grn_no IS NULL
)
UPDATE alsvid_v2.production_delivery_receipts r
SET grn_no = n.grn
FROM numbered n
WHERE r.id = n.id;

ALTER TABLE alsvid_v2.production_delivery_receipts
  ADD CONSTRAINT production_delivery_receipts_grn_no_key UNIQUE (grn_no);

COMMENT ON COLUMN alsvid_v2.production_delivery_receipts.grn_no IS '入库单号 GRN-YYYYMMDD-XXX，签收入库时生成';
COMMENT ON COLUMN alsvid_v2.production_delivery_receipts.status IS '入库单状态：待验收/部分入库/已完成';

-- 2) 包裹多物流编号子表（只增不删，留痕）
CREATE TABLE IF NOT EXISTS alsvid_v2.delivery_parcel_trackings (
  id text PRIMARY KEY,
  parcel_id text NOT NULL REFERENCES alsvid_v2.delivery_parcels(id) ON DELETE CASCADE,
  tracking_type text NOT NULL CHECK (tracking_type IN ('货代运单','承运商运单','其他')),
  tracking_no text NOT NULL CHECK (length(trim(tracking_no)) BETWEEN 1 AND 120),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parcel_id, tracking_no)
);

CREATE INDEX IF NOT EXISTS delivery_parcel_trackings_parcel_idx
  ON alsvid_v2.delivery_parcel_trackings(parcel_id, created_at);

-- 存量包裹运单号回填为承运商运单
INSERT INTO alsvid_v2.delivery_parcel_trackings (id, parcel_id, tracking_type, tracking_no, created_by)
SELECT gen_random_uuid()::text, p.id, '承运商运单', p.tracking_no, 'migration-143'
FROM alsvid_v2.delivery_parcels p
WHERE p.tracking_no <> ''
  AND NOT EXISTS (
    SELECT 1 FROM alsvid_v2.delivery_parcel_trackings t
    WHERE t.parcel_id = p.id AND t.tracking_no = p.tracking_no
  );

COMMIT;
