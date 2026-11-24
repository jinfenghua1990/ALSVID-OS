-- P1 工厂交货明细：每个交货批次携带的 VIN / 电池 SN / 去向类型 / 证据附件。
-- 规格 §8 TAB3「工厂交货」要求记录 VIN、电池 SN、证据、去向类型；一车一电池关联见 vehicle_battery_links。
-- evidence_ids 存 production_order_attachments.id 数组（附件表在主域，避免新建附件表）。
BEGIN;

CREATE TABLE alsvid_v2.factory_handover_items (
  id            uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  batch_uuid    uuid NOT NULL
                  REFERENCES alsvid_v2.factory_handover_batches(entity_uuid) ON DELETE CASCADE,
  vin_uuid      uuid REFERENCES alsvid_v2.vins(entity_uuid),
  vin           text NOT NULL DEFAULT '' CHECK (length(vin) <= 64),
  battery_sn    text NOT NULL DEFAULT '' CHECK (length(battery_sn) <= 120),
  sku_code      text NOT NULL DEFAULT '',
  destination_type text NOT NULL DEFAULT ''
                  CHECK (destination_type IN ('', '实体仓', '虚拟仓', '客户直发')),
  destination_ref text NOT NULL DEFAULT '',
  evidence_ids  jsonb NOT NULL DEFAULT '[]'::jsonb,
  note          text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT factory_handover_items_vin_one_per_batch UNIQUE (batch_uuid, vin)
);

COMMENT ON TABLE alsvid_v2.factory_handover_items IS
  '工厂交货明细：一批交货可含多台车；vin 允许留空表示尚未分配（先按数量交货后补 VIN）';
COMMENT ON COLUMN alsvid_v2.factory_handover_items.evidence_ids IS
  '交货证据附件 id 数组，引用 production_order_attachments.id';

CREATE INDEX factory_handover_items_batch
  ON alsvid_v2.factory_handover_items(batch_uuid, id);

CREATE INDEX factory_handover_items_vin_uuid
  ON alsvid_v2.factory_handover_items(vin_uuid)
  WHERE vin_uuid IS NOT NULL;

COMMIT;
