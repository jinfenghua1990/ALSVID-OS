-- 修复缺陷：财务「作废应收应付 / 冲销付款」必然报错。
--
-- 现象：调用作废应收应付（INSERT INTO finance_obligation_voids）报
--       record "new" has no field "payment_id"
-- 原因：finance_guard_voids 把两张表的校验写在同一个布尔表达式里：
--         IF TG_TABLE_NAME='finance_obligation_voids' AND EXISTS(... NEW.obligation_id ...) THEN ...
--         IF TG_TABLE_NAME='finance_payment_reversals' AND EXISTS(... NEW.payment_id ...) THEN ...
--       PL/pgSQL 在执行前会解析整个表达式里的 NEW.<field>，
--       而 finance_obligation_voids 没有 payment_id 字段，因此第一条 IF 就直接抛错。
-- 修复：拆成 IF / ELSIF 分支，让每张表的字段只在自己的分支里解析。
-- 只替换函数体，不动任何数据，可安全重放（CREATE OR REPLACE）。
BEGIN;

CREATE OR REPLACE FUNCTION alsvid_v2.finance_guard_voids()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_TABLE_NAME = 'finance_obligation_voids' THEN
    IF EXISTS (
      SELECT 1 FROM alsvid_v2.finance_allocations a
        LEFT JOIN alsvid_v2.finance_allocation_reversals r ON r.allocation_id = a.id
       WHERE a.obligation_id = NEW.obligation_id AND r.id IS NULL
    ) THEN
      RAISE EXCEPTION 'Reverse active allocations before voiding an obligation';
    END IF;
  ELSIF TG_TABLE_NAME = 'finance_payment_reversals' THEN
    IF EXISTS (
      SELECT 1 FROM alsvid_v2.finance_allocations a
        LEFT JOIN alsvid_v2.finance_allocation_reversals r ON r.allocation_id = a.id
       WHERE a.payment_id = NEW.payment_id AND r.id IS NULL
    ) THEN
      RAISE EXCEPTION 'Reverse active allocations before reversing a payment';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

COMMIT;
