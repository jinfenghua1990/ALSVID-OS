BEGIN;

-- 生产订单付款记录：一张订单允许多笔，独立于发票统计。
CREATE TABLE alsvid_v2.production_order_payments (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  order_id text NOT NULL REFERENCES alsvid_v2.production_orders(id),
  paid_on date NOT NULL,
  payer_type text NOT NULL CHECK (payer_type IN ('对公','个人')),
  payer_account text NOT NULL DEFAULT '' CHECK (length(payer_account) <= 120),
  payee text NOT NULL CHECK (length(trim(payee)) BETWEEN 1 AND 120),
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'CNY' CHECK (currency IN ('CNY','EUR','USD')),
  voucher_type text NOT NULL DEFAULT '' CHECK (voucher_type IN ('','银行回单','银行流水','转账截图')),
  attachment_id text REFERENCES alsvid_v2.production_order_attachments(id),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  status text NOT NULL DEFAULT '已确认' CHECK (status IN ('已确认','待核对')),
  recorded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX production_order_payments_order
  ON alsvid_v2.production_order_payments(order_id, paid_on, id);

-- 生产订单发票记录：一张订单允许多张，金额不并入已付款。
CREATE TABLE alsvid_v2.production_order_invoices (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  order_id text NOT NULL REFERENCES alsvid_v2.production_orders(id),
  status text NOT NULL DEFAULT '已开票' CHECK (status IN ('未开票','部分开票','已开票')),
  amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  issued_on date,
  invoice_number text NOT NULL DEFAULT '' CHECK (length(invoice_number) <= 120),
  currency text NOT NULL DEFAULT 'CNY' CHECK (currency IN ('CNY','EUR','USD')),
  attachment_id text REFERENCES alsvid_v2.production_order_attachments(id),
  note text NOT NULL DEFAULT '' CHECK (length(note) <= 2000),
  recorded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX production_order_invoices_order
  ON alsvid_v2.production_order_invoices(order_id, created_at);

-- 附件分类，用于区分付款凭证、发票等来源。
ALTER TABLE alsvid_v2.production_order_attachments
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '其他',
  ADD COLUMN IF NOT EXISTS ref_id uuid;

-- 财务记录不可篡改：仅允许回填 attachment_id。
CREATE FUNCTION alsvid_v2.guard_production_order_payment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'production order payment records are immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.id <> OLD.id OR NEW.order_id <> OLD.order_id OR NEW.paid_on <> OLD.paid_on
     OR NEW.payer_type <> OLD.payer_type OR NEW.payer_account <> OLD.payer_account
     OR NEW.payee <> OLD.payee OR NEW.amount <> OLD.amount OR NEW.currency <> OLD.currency
     OR NEW.voucher_type <> OLD.voucher_type OR NEW.note <> OLD.note OR NEW.status <> OLD.status
     OR NEW.recorded_by <> OLD.recorded_by THEN
    RAISE EXCEPTION 'production order payment records are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_production_order_payment
BEFORE UPDATE OR DELETE ON alsvid_v2.production_order_payments
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_production_order_payment();

CREATE FUNCTION alsvid_v2.guard_production_order_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'production order invoice records are immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.id <> OLD.id OR NEW.order_id <> OLD.order_id OR NEW.status <> OLD.status
     OR NEW.amount <> OLD.amount OR NEW.issued_on IS DISTINCT FROM OLD.issued_on
     OR NEW.invoice_number <> OLD.invoice_number OR NEW.currency <> OLD.currency
     OR NEW.note <> OLD.note OR NEW.recorded_by <> OLD.recorded_by THEN
    RAISE EXCEPTION 'production order invoice records are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_production_order_invoice
BEFORE UPDATE OR DELETE ON alsvid_v2.production_order_invoices
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_production_order_invoice();

COMMIT;
