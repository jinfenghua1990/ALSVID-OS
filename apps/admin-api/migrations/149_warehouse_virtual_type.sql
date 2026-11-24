-- P0 数据底座：仓库类型区分实体仓与虚拟中转仓。
-- 规格 §3.1：不设置"在途仓"；虚拟仓 WH_VIRTUAL 只做逻辑过账，不是实物库存。
-- 现有 warehouses.kind CHECK 只有 国内仓/维修店仓/海外仓，purpose CHECK 只有 普通仓/B2C 仓。
BEGIN;

ALTER TABLE alsvid_v2.warehouses DROP CONSTRAINT IF EXISTS warehouses_kind_check;
ALTER TABLE alsvid_v2.warehouses ADD CONSTRAINT warehouses_kind_check
  CHECK (kind IN ('国内仓', '维修店仓', '海外仓', '虚拟仓'));

ALTER TABLE alsvid_v2.warehouses DROP CONSTRAINT IF EXISTS warehouses_warehouse_purpose_check;
ALTER TABLE alsvid_v2.warehouses ADD CONSTRAINT warehouses_warehouse_purpose_check
  CHECK (warehouse_purpose IN ('普通仓', 'B2C 仓', '虚拟中转仓'));

-- 建立唯一虚拟仓。所有 NOT NULL 字段给空占位，明确它不是实物仓。
-- warehouses.id 无默认值且要求 text，entity_uuid 是主键且默认 uuidv7；两端必须同一值。
WITH v AS (SELECT alsvid_v2.generate_uuid_v7() AS u)
INSERT INTO alsvid_v2.warehouses(
  id, entity_uuid, name, kind, warehouse_code, warehouse_purpose,
  status, country_region, address, contact_name, contact_phone, note, created_at
)
SELECT u::text, u, '虚拟中转仓', '虚拟仓', 'WH_VIRTUAL', '虚拟中转仓',
       '启用', '', '', '', '', '工厂交货待分配与直发逻辑过账点，无实物库存', now()
FROM v
WHERE NOT EXISTS (
  SELECT 1 FROM alsvid_v2.warehouses WHERE warehouse_code = 'WH_VIRTUAL'
);

COMMIT;
