-- 181: 首页装修「按语言发布」支持
--
-- 背景：一次「全部发布」把中文/英文/德文绑在一起——德文没翻完就没法先发中文，
-- 中文改一个标点又要英德重发一遍。改为单语言发布后，每次发布会独立产生一个版本，
-- 版本历史里必须能区分「这是发德文，不是发中文」，否则回滚时无从判断影响了哪些语言。
BEGIN;

ALTER TABLE alsvid_v2.storefront_layout_versions
  DROP CONSTRAINT IF EXISTS storefront_layout_versions_origin_check;

ALTER TABLE alsvid_v2.storefront_layout_versions
  ADD CONSTRAINT storefront_layout_versions_origin_check
  CHECK (origin IN ('publish', 'rollback', 'manual', 'locale'));

COMMIT;
