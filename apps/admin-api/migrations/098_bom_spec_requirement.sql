-- BOM 物料行补全：规格要求
ALTER TABLE alsvid_v2.bom_version_items ADD COLUMN IF NOT EXISTS spec_requirement text NOT NULL DEFAULT '';
