-- 统一素材空间：商品发布与页面装修共用的对象存储素材元数据
CREATE TABLE IF NOT EXISTS alsvid_v2.media_assets (
  id uuid PRIMARY KEY,
  object_key text NOT NULL UNIQUE,
  checksum text NOT NULL,
  file_name text NOT NULL DEFAULT '',
  content_type text NOT NULL,
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('image','video','other')),
  category text NOT NULL DEFAULT 'other' CHECK (category IN ('product','page','other')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  label text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS media_assets_checksum_key ON alsvid_v2.media_assets(checksum);
CREATE INDEX IF NOT EXISTS media_assets_created_at_idx ON alsvid_v2.media_assets(created_at DESC);
