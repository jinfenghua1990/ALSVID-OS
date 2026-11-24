-- P0 数据底座：VIN 与电池 SN 的历史关联。
-- 规格 §4.3：换电保存原 SN 与生效日期，不覆盖历史。
-- 用 unlinked_at 关闭旧绑定，而不是 UPDATE/DELETE 原行。
BEGIN;

CREATE TABLE IF NOT EXISTS alsvid_v2.vehicle_battery_links (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  vin_uuid uuid NOT NULL REFERENCES alsvid_v2.vins(entity_uuid) ON DELETE RESTRICT,
  battery_sn text NOT NULL CHECK (length(trim(battery_sn)) BETWEEN 1 AND 120),
  linked_at timestamptz NOT NULL DEFAULT now(),
  unlinked_at timestamptz,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 1000),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (unlinked_at IS NULL OR unlinked_at >= linked_at),
  CHECK (substring(id::text, 15, 1) = '7' AND substring(id::text, 20, 1) IN ('8','9','a','b'))
);

CREATE INDEX IF NOT EXISTS vehicle_battery_links_vin_idx
  ON alsvid_v2.vehicle_battery_links(vin_uuid, linked_at DESC);
CREATE INDEX IF NOT EXISTS vehicle_battery_links_sn_idx
  ON alsvid_v2.vehicle_battery_links(battery_sn);

-- 同一 VIN 同时只有一个有效电池；同一电池同时只装一台车。
-- 用部分唯一索引，历史行（unlinked_at 非空）不受约束。
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_battery_links_one_active
  ON alsvid_v2.vehicle_battery_links(vin_uuid) WHERE unlinked_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_battery_links_sn_one_active
  ON alsvid_v2.vehicle_battery_links(battery_sn) WHERE unlinked_at IS NULL;

-- 回填 vin_installed 的存量 serial_no（当前 0 行；有历史数据时也不丢弃）。
-- vin_installed 无 created_at，仅 installed_at 可用，缺失时取 now()。
INSERT INTO alsvid_v2.vehicle_battery_links(vin_uuid, battery_sn, linked_at, note)
SELECT vi.vin_uuid, vi.serial_no, COALESCE(vi.installed_at, now()), 'migration-149 from vin_installed'
FROM alsvid_v2.vin_installed vi
WHERE NULLIF(trim(vi.serial_no), '') IS NOT NULL
  AND vi.vin_uuid IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM alsvid_v2.vehicle_battery_links b
    WHERE b.vin_uuid = vi.vin_uuid AND b.battery_sn = vi.serial_no
  );

COMMIT;
