-- 交付包裹：整车车体（无动力电池）与独立锂电池强制分包裹、分开发运、独立签收
-- 依据《生产交付与仓储履约规范》§4 / §5：一批多包裹、不同承运商、不同发货日，独立签收
-- 仅新增表，不改动既有 production_deliveries 语义
BEGIN;

CREATE TABLE IF NOT EXISTS alsvid_v2.delivery_parcels (
  id text PRIMARY KEY,
  parcel_no text NOT NULL CHECK (length(trim(parcel_no)) BETWEEN 1 AND 60),
  delivery_id text NOT NULL REFERENCES alsvid_v2.production_deliveries(id),
  component_type text NOT NULL CHECK (component_type IN ('车体','电池','配件','其他')),
  carton_no text NOT NULL DEFAULT '' CHECK (length(carton_no) <= 60),
  quantity integer NOT NULL CHECK (quantity > 0),
  gross_weight_kg numeric(12,3) CHECK (gross_weight_kg IS NULL OR gross_weight_kg > 0),
  volume_m3 numeric(12,4) CHECK (volume_m3 IS NULL OR volume_m3 > 0),
  carrier text NOT NULL DEFAULT '' CHECK (length(carrier) <= 120),
  tracking_no text NOT NULL DEFAULT '' CHECK (length(tracking_no) <= 120),
  eta date,
  status text NOT NULL DEFAULT '待发运'
    CHECK (status IN ('待发运','已交运','运输中','已签收','异常','取消')),
  dispatched_at timestamptz,
  delivered_at timestamptz,
  hazmat_un text NOT NULL DEFAULT '' CHECK (length(hazmat_un) <= 40),
  hazmat_approved boolean NOT NULL DEFAULT false,
  hazmat_note text NOT NULL DEFAULT '' CHECK (length(hazmat_note) <= 500),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_id, parcel_no)
);

CREATE INDEX IF NOT EXISTS delivery_parcels_delivery_idx
  ON alsvid_v2.delivery_parcels(delivery_id, component_type, created_at);
CREATE INDEX IF NOT EXISTS delivery_parcels_status_idx
  ON alsvid_v2.delivery_parcels(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS delivery_parcels_tracking_uniq
  ON alsvid_v2.delivery_parcels(tracking_no) WHERE tracking_no <> '';

-- 车体 VIN 与电池 SN 的交付对应关系，保留历史链以支持售后更换电池
CREATE TABLE IF NOT EXISTS alsvid_v2.delivery_parcel_serials (
  id text PRIMARY KEY,
  parcel_id text NOT NULL REFERENCES alsvid_v2.delivery_parcels(id),
  vin text NOT NULL DEFAULT '' CHECK (length(vin) <= 40),
  battery_sn text NOT NULL DEFAULT '' CHECK (length(battery_sn) <= 60),
  motor_sn text NOT NULL DEFAULT '' CHECK (length(motor_sn) <= 60),
  association_version integer NOT NULL DEFAULT 1 CHECK (association_version > 0),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 300),
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (vin <> '' OR battery_sn <> '' OR motor_sn <> ''),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX IF NOT EXISTS delivery_parcel_serials_parcel_idx
  ON alsvid_v2.delivery_parcel_serials(parcel_id, association_version DESC);
-- 同一 VIN / 电池 SN 在有效期内不得重复占用（出库即占位，换电池时先关闭旧链）
CREATE UNIQUE INDEX IF NOT EXISTS delivery_parcel_serials_active_vin
  ON alsvid_v2.delivery_parcel_serials(vin) WHERE effective_to IS NULL AND vin <> '';
CREATE UNIQUE INDEX IF NOT EXISTS delivery_parcel_serials_active_battery
  ON alsvid_v2.delivery_parcel_serials(battery_sn) WHERE effective_to IS NULL AND battery_sn <> '';

COMMIT;
