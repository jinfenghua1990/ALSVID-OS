-- 179: 首页装修「保存版本」支持
--
-- 背景：版本历史原本只记录 publish / rollback 两种来源，运营在改稿中途
-- 想留一个可回滚的快照时只能先发布，容易误改线上。新增 manual 来源：
-- 「保存版本」= 草稿落盘 + 同一版本留一份快照，线上版本完全不变。
BEGIN;

ALTER TABLE alsvid_v2.storefront_layout_versions
  DROP CONSTRAINT IF EXISTS storefront_layout_versions_origin_check;

ALTER TABLE alsvid_v2.storefront_layout_versions
  ADD CONSTRAINT storefront_layout_versions_origin_check
  CHECK (origin IN ('publish', 'rollback', 'manual'));

COMMIT;
