-- P0 修复：跨币种核销缺少金额一致性校验。
-- 129 的 finance_validate_allocation 跨币种分支只校验汇率币种对匹配，
-- payment_amount 与 obligation_amount 均由客户端传入且互不约束，
-- 可用 1 美元付款核销 1000 欧元应付，造成往来余额与汇兑损益失真。
-- 此处对齐到岸成本触发器（finance_validate_landed_component_fx）的标准：
-- 跨币种核销必须满足 obligation_amount = round(payment_amount ×/÷ rate, 6)。
-- 其余校验逻辑与 129 完全一致，仅新增金额一致性分支。
BEGIN;

CREATE OR REPLACE FUNCTION alsvid_v2.finance_validate_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p alsvid_v2.finance_payments%ROWTYPE;o alsvid_v2.finance_obligations%ROWTYPE;fx alsvid_v2.finance_fx_rates%ROWTYPE;used_p numeric(20,6);used_o numeric(20,6);expected numeric(20,6);
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('finance-payment:'||NEW.payment_id::text,0)); PERFORM pg_advisory_xact_lock(hashtextextended('finance-obligation:'||NEW.obligation_id::text,0));
 SELECT * INTO p FROM alsvid_v2.finance_payments WHERE id=NEW.payment_id; SELECT * INTO o FROM alsvid_v2.finance_obligations WHERE id=NEW.obligation_id;
 IF p.id IS NULL OR o.id IS NULL THEN RAISE EXCEPTION 'Payment or obligation not found'; END IF;
 IF EXISTS(SELECT 1 FROM alsvid_v2.finance_payment_reversals WHERE payment_id=p.id) OR EXISTS(SELECT 1 FROM alsvid_v2.finance_obligation_voids WHERE obligation_id=o.id) THEN RAISE EXCEPTION 'Reversed payment or voided obligation cannot be allocated'; END IF;
 IF (p.direction='INBOUND' AND o.direction<>'AR') OR (p.direction='OUTBOUND' AND o.direction<>'AP') THEN RAISE EXCEPTION 'Payment direction does not match obligation'; END IF;
 IF p.partner_id IS NOT NULL AND p.partner_id<>o.partner_id THEN RAISE EXCEPTION 'Payment partner does not match obligation'; END IF;
 IF p.currency=o.currency THEN IF NEW.fx_rate_id IS NOT NULL OR NEW.payment_amount<>NEW.obligation_amount THEN RAISE EXCEPTION 'Same-currency allocations must match and cannot use FX'; END IF;
 ELSE
  IF NEW.fx_rate_id IS NULL THEN RAISE EXCEPTION 'Cross-currency allocation requires FX'; END IF;
  SELECT * INTO fx FROM alsvid_v2.finance_fx_rates WHERE id=NEW.fx_rate_id;
  IF fx.id IS NULL OR NOT((fx.base_currency=p.currency AND fx.quote_currency=o.currency) OR (fx.base_currency=o.currency AND fx.quote_currency=p.currency)) THEN RAISE EXCEPTION 'FX currencies do not match'; END IF;
  IF fx.base_currency=p.currency THEN expected:=round(NEW.payment_amount*fx.rate,6); ELSE expected:=round(NEW.payment_amount/fx.rate,6); END IF;
  IF expected<>NEW.obligation_amount THEN RAISE EXCEPTION 'Allocation obligation amount does not match the selected FX rate'; END IF;
 END IF;
 SELECT COALESCE(sum(payment_amount),0) INTO used_p FROM alsvid_v2.finance_allocations a LEFT JOIN alsvid_v2.finance_allocation_reversals r ON r.allocation_id=a.id WHERE a.payment_id=p.id AND r.id IS NULL;
 SELECT COALESCE(sum(obligation_amount),0) INTO used_o FROM alsvid_v2.finance_allocations a LEFT JOIN alsvid_v2.finance_allocation_reversals r ON r.allocation_id=a.id WHERE a.obligation_id=o.id AND r.id IS NULL;
 IF used_p+NEW.payment_amount>p.amount OR used_o+NEW.obligation_amount>o.original_amount THEN RAISE EXCEPTION 'Allocation exceeds remaining balance'; END IF;
 RETURN NEW;
END $$;

COMMIT;