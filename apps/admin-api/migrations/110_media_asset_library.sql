-- 110：统一素材库（P1 数据层）
-- 方案 A：所有素材收敛到 media_assets，产品/商城通过 asset_links 关联；替换保留 asset_versions 历史。
-- product_media 进入废弃状态（保留表，P3 代码切换完成后再删除）。

-- 1) 扩展素材主表
ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS tags       text[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS langs      text[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS markets    text[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS visibility text        NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS status     text        NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  BEGIN
    ALTER TABLE media_assets ADD CONSTRAINT media_assets_kind_chk
      CHECK (kind IN ('product','marketing','page'));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE media_assets ADD CONSTRAINT media_assets_visibility_chk
      CHECK (visibility IN ('public','internal'));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER TABLE media_assets ADD CONSTRAINT media_assets_status_chk
      CHECK (status IN ('draft','published','archived'));
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

-- 2) 关联表：素材 ↔ 车型 / SKU / 配件 / 页面 / 活动
CREATE TABLE IF NOT EXISTS asset_links (
  id          uuid        PRIMARY KEY DEFAULT generate_uuid_v7(),
  asset_id    uuid        NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  target_type text        NOT NULL CHECK (target_type IN ('product','sku','part','page','campaign')),
  target_id   text        NOT NULL,
  role        text        NOT NULL DEFAULT 'gallery'
                          CHECK (role IN ('hero','gallery','detail','package','certificate','drawing','banner','kv')),
  channel     text        NOT NULL DEFAULT 'product'
                          CHECK (channel IN ('product','storefront')),
  sort_order  integer     NOT NULL DEFAULT 0,
  created_by  text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, target_type, target_id, role, channel)
);
CREATE INDEX IF NOT EXISTS asset_links_target_idx ON asset_links(target_type, target_id, channel, sort_order);
CREATE INDEX IF NOT EXISTS asset_links_asset_idx  ON asset_links(asset_id);

-- 3) 版本表：替换素材时新增版本，旧版本保留，已发布页面不会挂图
CREATE TABLE IF NOT EXISTS asset_versions (
  id           uuid        PRIMARY KEY DEFAULT generate_uuid_v7(),
  asset_id     uuid        NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  version      integer     NOT NULL,
  object_key   text        NOT NULL,
  checksum     text        NOT NULL DEFAULT '',
  file_name    text        NOT NULL DEFAULT '',
  content_type text        NOT NULL DEFAULT '',
  size_bytes   bigint      NOT NULL DEFAULT 0,
  is_current   boolean     NOT NULL DEFAULT false,
  note         text        NOT NULL DEFAULT '',
  created_by   text        NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (asset_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS asset_versions_current_idx ON asset_versions(asset_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS asset_versions_checksum_idx ON asset_versions(checksum);

-- 4) 检索索引
CREATE INDEX IF NOT EXISTS media_assets_kind_idx   ON media_assets(kind, category, status);
CREATE INDEX IF NOT EXISTS media_assets_tags_idx   ON media_assets USING gin(tags);
CREATE INDEX IF NOT EXISTS media_assets_langs_idx  ON media_assets USING gin(langs);
CREATE INDEX IF NOT EXISTS media_assets_markets_idx ON media_assets USING gin(markets);

-- 5) 废弃标记：product_media 仍被旧代码写入，P3 切换后删除
COMMENT ON TABLE product_media IS '已废弃（P1，迁移 110）：改由 media_assets + asset_links 统一管理，P3 代码切换后删除';
