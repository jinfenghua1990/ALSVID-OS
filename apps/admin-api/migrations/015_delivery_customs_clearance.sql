-- Track manual customs clearance for overseas production deliveries.
BEGIN;

LOCK TABLE alsvid_v2.production_deliveries, alsvid_v2.warehouses
  IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE alsvid_v2.production_deliveries
  ADD COLUMN customs_status text NOT NULL DEFAULT '无需清关'
    CHECK (customs_status IN ('无需清关','待清关','清关中','查验中','已放行')),
  ADD COLUMN customs_reference text NOT NULL DEFAULT '',
  ADD COLUMN customs_note text NOT NULL DEFAULT '',
  ADD COLUMN customs_updated_by text NOT NULL DEFAULT '',
  ADD COLUMN customs_updated_at timestamptz;

UPDATE alsvid_v2.production_deliveries d
SET customs_status='待清关'
FROM alsvid_v2.warehouses w
WHERE d.warehouse_id=w.id AND d.status='在途' AND w.kind='海外仓';

COMMIT;
