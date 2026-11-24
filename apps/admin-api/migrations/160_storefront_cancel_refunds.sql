-- P1 修复：B2C 已付款未发运订单的退款出口。
-- storefront_return_refunds.return_id 原为 NOT NULL，退款只能挂退货申请，
-- 而退货申请只允许 shipped/delivered 订单发起，导致 paid 订单取消后已收款项无法退回。
-- 放开 return_id 可空：NULL 表示「取消退款」（货未出库，无退货申请）。
-- 复合外键 (return_id,order_id) 为 MATCH SIMPLE，return_id 为 NULL 时不做校验，
-- 非 NULL 时仍强制退货申请与订单一致，原有约束不放松。
BEGIN;

ALTER TABLE alsvid_v2.storefront_return_refunds ALTER COLUMN return_id DROP NOT NULL;

COMMIT;