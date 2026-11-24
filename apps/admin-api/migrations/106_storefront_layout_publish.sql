-- 商城装修：从"只有草稿"补上"发布快照"，让装修结果能真正成为官网首页
-- 新增列全部可空、附加式，不影响既有草稿读取
BEGIN;

ALTER TABLE alsvid_v2.storefront_layout_drafts
  ADD COLUMN IF NOT EXISTS html text,
  ADD COLUMN IF NOT EXISTS css text,
  ADD COLUMN IF NOT EXISTS published jsonb,
  ADD COLUMN IF NOT EXISTS published_version integer,
  ADD COLUMN IF NOT EXISTS published_by text,
  ADD COLUMN IF NOT EXISTS published_at timestamp with time zone;

ALTER TABLE alsvid_v2.storefront_layout_drafts
  DROP CONSTRAINT IF EXISTS storefront_layout_drafts_published_check;

ALTER TABLE alsvid_v2.storefront_layout_drafts
  ADD CONSTRAINT storefront_layout_drafts_published_check
  CHECK (published IS NULL OR jsonb_typeof(published) = 'object');

COMMIT;
