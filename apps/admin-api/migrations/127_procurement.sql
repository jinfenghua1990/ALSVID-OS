BEGIN;
CREATE SEQUENCE alsvid_v2.procurement_quotation_no_seq START 1;
CREATE SEQUENCE alsvid_v2.procurement_po_no_seq START 1;

CREATE TABLE alsvid_v2.procurement_quotations (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  quotation_no text NOT NULL UNIQUE DEFAULT ('SQ-'||lpad(nextval('alsvid_v2.procurement_quotation_no_seq')::text,8,'0')),
  supplier_partner_id uuid NOT NULL REFERENCES alsvid_v2.partners(id) ON DELETE RESTRICT,
  supplier_reference text,
  currency char(3) NOT NULL CHECK (currency=upper(currency) AND length(trim(currency))=3),
  valid_until date,
  incoterm text,
  payment_terms text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','RECEIVED','ACCEPTED','REJECTED','EXPIRED')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE TABLE alsvid_v2.procurement_quotation_lines (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  quotation_id uuid NOT NULL REFERENCES alsvid_v2.procurement_quotations(id) ON DELETE CASCADE,
  line_no integer NOT NULL CHECK (line_no>0),
  sku_uuid uuid NOT NULL REFERENCES alsvid_v2.skus(entity_uuid) ON DELETE RESTRICT,
  sku_code text NOT NULL,
  description text NOT NULL DEFAULT '',
  supplier_item_reference text,
  quantity numeric(18,6) NOT NULL CHECK (quantity>0),
  unit text NOT NULL DEFAULT '件',
  unit_price numeric(20,6) NOT NULL CHECK (unit_price>=0),
  line_kind text NOT NULL DEFAULT 'PURCHASE' CHECK (line_kind IN ('PURCHASE','GIFT')),
  requested_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(quotation_id,line_no),
  CHECK (line_kind<>'GIFT' OR unit_price=0),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);

CREATE TABLE alsvid_v2.procurement_purchase_orders (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  po_number text NOT NULL UNIQUE DEFAULT ('PO-'||lpad(nextval('alsvid_v2.procurement_po_no_seq')::text,8,'0')),
  supplier_partner_id uuid NOT NULL REFERENCES alsvid_v2.partners(id) ON DELETE RESTRICT,
  source_quotation_id uuid REFERENCES alsvid_v2.procurement_quotations(id) ON DELETE RESTRICT,
  supplier_reference text,
  currency char(3) NOT NULL CHECK (currency=upper(currency) AND length(trim(currency))=3),
  incoterm text,
  payment_terms text NOT NULL DEFAULT '',
  deposit_terms text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ISSUED','CONFIRMED','PARTIALLY_FULFILLED','FULFILLED','CANCELLED')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  issued_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_by text NOT NULL,
  updated_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE TABLE alsvid_v2.procurement_purchase_order_lines (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  purchase_order_id uuid NOT NULL REFERENCES alsvid_v2.procurement_purchase_orders(id) ON DELETE CASCADE,
  line_no integer NOT NULL CHECK (line_no>0),
  sku_uuid uuid NOT NULL REFERENCES alsvid_v2.skus(entity_uuid) ON DELETE RESTRICT,
  sku_code text NOT NULL,
  description text NOT NULL DEFAULT '',
  supplier_item_reference text,
  ordered_quantity numeric(18,6) NOT NULL CHECK (ordered_quantity>0),
  unit text NOT NULL DEFAULT '件',
  unit_price numeric(20,6) NOT NULL CHECK (unit_price>=0),
  line_kind text NOT NULL DEFAULT 'PURCHASE' CHECK (line_kind IN ('PURCHASE','GIFT')),
  requested_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(purchase_order_id,line_no),
  CHECK (line_kind<>'GIFT' OR unit_price=0),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE TABLE alsvid_v2.procurement_supplier_confirmations (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  purchase_order_id uuid NOT NULL REFERENCES alsvid_v2.procurement_purchase_orders(id) ON DELETE RESTRICT,
  supplier_reference text,
  note text NOT NULL DEFAULT '',
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text NOT NULL
);
CREATE TABLE alsvid_v2.procurement_supplier_confirmation_lines (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  confirmation_id uuid NOT NULL REFERENCES alsvid_v2.procurement_supplier_confirmations(id) ON DELETE CASCADE,
  purchase_order_line_id uuid NOT NULL REFERENCES alsvid_v2.procurement_purchase_order_lines(id) ON DELETE RESTRICT,
  confirmed_quantity numeric(18,6) NOT NULL CHECK (confirmed_quantity>0),
  confirmed_date date,
  note text NOT NULL DEFAULT '',
  UNIQUE(confirmation_id,purchase_order_line_id)
);
CREATE TABLE alsvid_v2.procurement_receipts (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  purchase_order_id uuid NOT NULL REFERENCES alsvid_v2.procurement_purchase_orders(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('PHYSICAL_RECEIPT','FACTORY_COMMITMENT')),
  reference text,
  occurred_on date NOT NULL,
  note text NOT NULL DEFAULT '',
  recorded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE alsvid_v2.procurement_receipt_lines (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  receipt_id uuid NOT NULL REFERENCES alsvid_v2.procurement_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id uuid NOT NULL REFERENCES alsvid_v2.procurement_purchase_order_lines(id) ON DELETE RESTRICT,
  quantity numeric(18,6) NOT NULL CHECK (quantity>0),
  unit text NOT NULL DEFAULT '件',
  note text NOT NULL DEFAULT '',
  UNIQUE(receipt_id,purchase_order_line_id)
);
CREATE TABLE alsvid_v2.procurement_purchase_order_snapshots (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  purchase_order_id uuid NOT NULL REFERENCES alsvid_v2.procurement_purchase_orders(id) ON DELETE RESTRICT,
  state text NOT NULL,
  po_version integer NOT NULL,
  snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION alsvid_v2.require_procurement_partner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM alsvid_v2.partners p JOIN alsvid_v2.partner_roles r ON r.partner_id=p.id
    WHERE p.id=NEW.supplier_partner_id AND p.status='ACTIVE' AND r.status='ACTIVE' AND r.role IN ('SUPPLIER','FACTORY')) THEN
    RAISE EXCEPTION 'Procurement supplier must have an active SUPPLIER or FACTORY role';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER procurement_quotation_partner BEFORE INSERT OR UPDATE OF supplier_partner_id ON alsvid_v2.procurement_quotations
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.require_procurement_partner();
CREATE TRIGGER procurement_order_partner BEFORE INSERT OR UPDATE OF supplier_partner_id ON alsvid_v2.procurement_purchase_orders
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.require_procurement_partner();

CREATE FUNCTION alsvid_v2.require_draft_procurement_lines() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_status text;
BEGIN
  IF TG_TABLE_NAME='procurement_quotation_lines' THEN
    SELECT status INTO parent_status FROM alsvid_v2.procurement_quotations WHERE id=COALESCE(NEW.quotation_id,OLD.quotation_id);
  ELSE
    SELECT status INTO parent_status FROM alsvid_v2.procurement_purchase_orders WHERE id=COALESCE(NEW.purchase_order_id,OLD.purchase_order_id);
  END IF;
  IF parent_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Only draft procurement documents can be edited'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;
CREATE TRIGGER procurement_quotation_lines_draft BEFORE INSERT OR UPDATE OR DELETE ON alsvid_v2.procurement_quotation_lines
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.require_draft_procurement_lines();
CREATE TRIGGER procurement_order_lines_draft BEFORE INSERT OR UPDATE OR DELETE ON alsvid_v2.procurement_purchase_order_lines
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.require_draft_procurement_lines();

CREATE FUNCTION alsvid_v2.guard_procurement_order_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status=OLD.status THEN RETURN NEW; END IF;
  IF NOT ((OLD.status='DRAFT' AND NEW.status IN ('ISSUED','CANCELLED')) OR
    (OLD.status='ISSUED' AND NEW.status IN ('CONFIRMED','CANCELLED')) OR
    (OLD.status='CONFIRMED' AND NEW.status IN ('PARTIALLY_FULFILLED','FULFILLED','CANCELLED')) OR
    (OLD.status='PARTIALLY_FULFILLED' AND NEW.status IN ('FULFILLED','CANCELLED'))) THEN
    RAISE EXCEPTION 'Invalid procurement order transition';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER procurement_order_transition BEFORE UPDATE OF status ON alsvid_v2.procurement_purchase_orders
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_procurement_order_transition();

CREATE FUNCTION alsvid_v2.reject_procurement_snapshot_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Procurement order snapshots are append-only'; END;
$$;
CREATE TRIGGER procurement_snapshots_immutable BEFORE UPDATE OR DELETE ON alsvid_v2.procurement_purchase_order_snapshots
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_procurement_snapshot_mutation();
COMMIT;
