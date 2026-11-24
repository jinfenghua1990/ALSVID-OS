-- 第二阶段 CMS：页面管理、不可变版本与发布指针（复用 site_pages，不建平行页面主表）
ALTER TABLE alsvid_v2.site_pages
  ADD COLUMN IF NOT EXISTS page_type text NOT NULL DEFAULT 'custom',
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'de',
  ADD COLUMN IF NOT EXISTS path text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS draft_seo jsonb,
  ADD COLUMN IF NOT EXISTS published_seo jsonb,
  ADD COLUMN IF NOT EXISTS published_version integer,
  ADD COLUMN IF NOT EXISTS page_name text NOT NULL DEFAULT '';

UPDATE alsvid_v2.site_pages
SET page_type='home', locale='*', path='/', page_name=COALESCE(NULLIF(page_name,''),'官网首页')
WHERE slug='home';

CREATE UNIQUE INDEX IF NOT EXISTS site_pages_locale_path_key
  ON alsvid_v2.site_pages(locale, path)
  WHERE page_type<>'home';

CREATE TABLE IF NOT EXISTS alsvid_v2.site_page_versions (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  page_id uuid NOT NULL REFERENCES alsvid_v2.site_pages(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  seo jsonb,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(page_id, version)
);
CREATE INDEX IF NOT EXISTS site_page_versions_page_idx ON alsvid_v2.site_page_versions(page_id, version DESC);
