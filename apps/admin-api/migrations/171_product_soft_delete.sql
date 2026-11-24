-- 商品删除仅从日常目录隐藏；保留商品、SKU 与业务单据之间的历史关系。
BEGIN;

ALTER TABLE alsvid_v2.products
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS products_deleted_at_idx
  ON alsvid_v2.products (deleted_at) WHERE deleted_at IS NOT NULL;

COMMIT;
