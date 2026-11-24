-- 111：素材库约束对齐（P2）
-- 背景：迁移 100 的 kind 表示文件类型（image/video/other），迁移 110 误把 kind 约束成业务分类；
--       两条 CHECK 同时存在时任何素材都写不进去。
-- 处理：kind 继续表示文件类型，业务分类统一由 category 表达，并扩展 marketing（营销素材）。

ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_kind_chk;

DO $$
BEGIN
  ALTER TABLE media_assets DROP CONSTRAINT IF EXISTS media_assets_category_check;
  ALTER TABLE media_assets ADD CONSTRAINT media_assets_category_check
    CHECK (category IN ('product','marketing','page','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 已有素材补初始版本记录，版本机制从此刻开始追踪
INSERT INTO asset_versions(asset_id, version, object_key, checksum, file_name, content_type, size_bytes, is_current, note, created_by, created_at)
SELECT a.id, 1, a.object_key, a.checksum, a.file_name, a.content_type, a.size_bytes, true, '初始版本', a.created_by, a.created_at
FROM media_assets a
WHERE NOT EXISTS (SELECT 1 FROM asset_versions v WHERE v.asset_id = a.id)
ON CONFLICT (asset_id, version) DO NOTHING;

CREATE INDEX IF NOT EXISTS media_assets_category_status_idx ON media_assets(category, status, created_at DESC);
