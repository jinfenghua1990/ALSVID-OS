-- 178: 首页装修发布版本历史
--
-- 背景：audit_log 的 storefront.layout.publish 只记了 {publishedVersion, bytes, locales}，
-- 不含页面快照本身，因此无法据此回滚。要支持「版本列表 + 回滚」必须单独存快照。
--
-- 设计取舍：
-- 1. 不改 storefront_layout_drafts 的既有结构（published / published_version 语义不变），
--    版本表只追加记录，读取路径完全不受影响 —— 属于增量能力，不是重构。
-- 2. snapshot 与现有 published 同构（{html, css, locales}），且沿用 gz1: 压缩存储，
--    避免每一版都占几十上百 KB 明文。
-- 3. (slug, version) 唯一：同一版本号只允许一条记录，重复发布同一版本不会产生脏数据。
-- 4. 回滚本身不删除历史，而是「把旧快照重新发布一次」，产生新的版本号，链路可追溯。
BEGIN;

CREATE TABLE IF NOT EXISTS alsvid_v2.storefront_layout_versions (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  slug text NOT NULL CHECK (slug = 'home'),
  -- 发布时的 published_version，与 drafts 的版本号一一对应
  version integer NOT NULL CHECK (version > 0),
  -- 与 drafts.published 同构：{html, css, locales:{de?,en?}}，文本字段为 gz1: 压缩形式
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  published_by text NOT NULL,
  published_at timestamptz NOT NULL,
  -- 该版本由谁产生：publish=正常发布，rollback=回滚产生
  origin text NOT NULL DEFAULT 'publish' CHECK (origin IN ('publish', 'rollback')),
  -- 回滚时指向被回滚到的来源版本，便于排查
  rolled_back_from integer,
  note text CHECK (note IS NULL OR length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (slug, version),
  CHECK (substring(id::text, 15, 1) = '7' AND substring(id::text, 20, 1) IN ('8', '9', 'a', 'b'))
);

-- 列表页按「版本倒序」翻页，这是唯一的访问形态
CREATE INDEX IF NOT EXISTS storefront_layout_versions_slug_version_idx
  ON alsvid_v2.storefront_layout_versions (slug, version DESC);

COMMIT;
