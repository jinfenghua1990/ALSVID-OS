-- site_pages 原先仅允许首页 slug='home'，扩展为多页面后放宽为合法 slug 格式
ALTER TABLE alsvid_v2.site_pages DROP CONSTRAINT IF EXISTS site_pages_slug_check;
ALTER TABLE alsvid_v2.site_pages ADD CONSTRAINT site_pages_slug_check CHECK (slug ~ '^[a-z0-9][a-z0-9:-]{0,119}$');
