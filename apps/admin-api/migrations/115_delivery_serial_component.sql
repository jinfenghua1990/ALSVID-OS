-- 修正 112：序列号关联区分组件类型
-- 车体包裹记 VIN、电池包裹记 battery_sn 并回填对应 VIN 用于配对，
-- 故 VIN 唯一性只能约束在「车体」侧，否则同一辆车的车体与电池记录会互相冲突。
BEGIN;

ALTER TABLE alsvid_v2.delivery_parcel_serials
  ADD COLUMN IF NOT EXISTS component_type text NOT NULL DEFAULT '车体';

ALTER TABLE alsvid_v2.delivery_parcel_serials
  DROP CONSTRAINT IF EXISTS delivery_parcel_serials_component_type_check;
ALTER TABLE alsvid_v2.delivery_parcel_serials
  ADD CONSTRAINT delivery_parcel_serials_component_type_check CHECK (
    component_type IN ('车体','电池','配件','其他')
  );

DROP INDEX IF EXISTS alsvid_v2.delivery_parcel_serials_active_vin;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_parcel_serials_active_vin
  ON alsvid_v2.delivery_parcel_serials(vin)
  WHERE effective_to IS NULL AND component_type = '车体' AND vin <> '';

DROP INDEX IF EXISTS alsvid_v2.delivery_parcel_serials_active_battery;
CREATE UNIQUE INDEX IF NOT EXISTS delivery_parcel_serials_active_battery
  ON alsvid_v2.delivery_parcel_serials(battery_sn)
  WHERE effective_to IS NULL AND component_type = '电池' AND battery_sn <> '';

CREATE INDEX IF NOT EXISTS delivery_parcel_serials_vin_idx
  ON alsvid_v2.delivery_parcel_serials(vin) WHERE vin <> '';

COMMIT;
