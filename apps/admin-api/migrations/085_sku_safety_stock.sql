-- 085 为 SKU 增加安全库存，供整车派生物料时录入。
ALTER TABLE alsvid_v2.skus ADD COLUMN IF NOT EXISTS safety_stock integer NOT NULL DEFAULT 0;
