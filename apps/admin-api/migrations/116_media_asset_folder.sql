-- 116：素材目录归档（folder）
-- 用途：按「型号/主图·详情页·其他」归档素材；folder 只做展示与筛选，物理对象仍是 media/<id>。

ALTER TABLE alsvid_v2.media_assets ADD COLUMN IF NOT EXISTS folder text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS media_assets_folder_idx
  ON alsvid_v2.media_assets(category, folder, created_at DESC);
