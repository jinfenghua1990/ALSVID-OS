-- BOM 物料行补全：供应商与关键管控件标识
ALTER TABLE alsvid_v2.bom_version_items ADD COLUMN IF NOT EXISTS supplier text NOT NULL DEFAULT '';
ALTER TABLE alsvid_v2.bom_version_items ADD COLUMN IF NOT EXISTS key_control boolean NOT NULL DEFAULT false;
