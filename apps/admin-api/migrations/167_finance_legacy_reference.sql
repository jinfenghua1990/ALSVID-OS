-- 8090 迁移补完：保留原 OMS 的关联单号，财务页「关联单号」列直接读取此字段。
ALTER TABLE alsvid_v2.finance_obligations ADD COLUMN IF NOT EXISTS legacy_ref_no text;
CREATE INDEX IF NOT EXISTS finance_obligations_legacy_ref_no_idx ON alsvid_v2.finance_obligations(legacy_ref_no);
