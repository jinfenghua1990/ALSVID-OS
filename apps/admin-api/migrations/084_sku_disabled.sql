-- 083 之前的整车品类收敛；084 为 SKU 增加「停用」标记，替代物理删除。
ALTER TABLE alsvid_v2.skus ADD COLUMN IF NOT EXISTS disabled boolean NOT NULL DEFAULT false;
