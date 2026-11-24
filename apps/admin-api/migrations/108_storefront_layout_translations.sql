-- 商城装修多语言：中文是唯一编辑源，英/德是"文本层"翻译，不复制版式
-- translations 形如 {"en":{"首页主标题":"...","品牌故事":"..."},"de":{...}}，键为中文原文
BEGIN;

ALTER TABLE alsvid_v2.storefront_layout_drafts
  ADD COLUMN IF NOT EXISTS translations jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE alsvid_v2.storefront_layout_drafts
  DROP CONSTRAINT IF EXISTS storefront_layout_drafts_translations_check;

ALTER TABLE alsvid_v2.storefront_layout_drafts
  ADD CONSTRAINT storefront_layout_drafts_translations_check
  CHECK (jsonb_typeof(translations) = 'object');

COMMENT ON COLUMN alsvid_v2.storefront_layout_drafts.translations IS '英/德文本层：{locale:{中文原文:译文}}，版式与中文稿完全共用，发布时按语言渲染快照';

COMMIT;
