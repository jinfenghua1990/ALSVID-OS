BEGIN;
CREATE SEQUENCE alsvid_v2.finance_document_no START 1;
CREATE SEQUENCE alsvid_v2.finance_obligation_no START 1;
CREATE SEQUENCE alsvid_v2.finance_payment_no START 1;
CREATE SEQUENCE alsvid_v2.finance_landed_batch_no START 1;

CREATE TABLE alsvid_v2.finance_documents (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
 document_number text NOT NULL UNIQUE DEFAULT ('FIN-DOC-'||lpad(nextval('alsvid_v2.finance_document_no')::text,9,'0')),
 document_type text NOT NULL CHECK(document_type IN('SUPPLIER_INVOICE','CUSTOMER_INVOICE','SUPPLIER_CREDIT_NOTE','CUSTOMER_CREDIT_NOTE','DEBIT_NOTE','OTHER')),
 partner_id uuid NOT NULL REFERENCES alsvid_v2.partners(id) ON DELETE RESTRICT,
 external_reference text,currency char(3) NOT NULL CHECK(currency=upper(currency) AND length(trim(currency))=3),
 issue_date date NOT NULL,due_date date,subtotal_amount numeric(20,6) NOT NULL DEFAULT 0 CHECK(subtotal_amount>=0),
 tax_amount numeric(20,6) NOT NULL DEFAULT 0 CHECK(tax_amount>=0),total_amount numeric(20,6) NOT NULL DEFAULT 0 CHECK(total_amount=subtotal_amount+tax_amount),
 source_type text NOT NULL DEFAULT 'MANUAL' CHECK(source_type IN('PROCUREMENT_PO','COMMERCE_ORDER','LOGISTICS_SHIPMENT','MANUAL')),
 source_id uuid,status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','VERIFIED','POSTED','VOIDED')),
 note text NOT NULL DEFAULT '',version integer NOT NULL DEFAULT 1 CHECK(version>0),verified_at timestamptz,verified_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,
 posted_at timestamptz,posted_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,voided_at timestamptz,voided_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,void_reason text,
 created_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,updated_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(due_date IS NULL OR due_date>=issue_date),CHECK((source_type='MANUAL' AND source_id IS NULL) OR (source_type<>'MANUAL' AND source_id IS NOT NULL)),
 CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE UNIQUE INDEX finance_document_external_ref ON alsvid_v2.finance_documents(partner_id,document_type,external_reference) WHERE external_reference IS NOT NULL;
CREATE INDEX finance_document_status ON alsvid_v2.finance_documents(status,issue_date DESC);

CREATE TABLE alsvid_v2.finance_document_lines (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),document_id uuid NOT NULL REFERENCES alsvid_v2.finance_documents(id) ON DELETE RESTRICT,
 line_no integer NOT NULL CHECK(line_no>0),category text NOT NULL CHECK(category IN('GOODS','FREIGHT','INSURANCE','DUTY','IMPORT_VAT','ANTI_DUMPING','COUNTERVAILING','OPERATIONAL_FEE','SERVICE','OTHER')),
 description text NOT NULL DEFAULT '',quantity numeric(18,6) NOT NULL DEFAULT 1 CHECK(quantity>0),unit text NOT NULL DEFAULT 'EA',unit_price numeric(20,6) NOT NULL DEFAULT 0 CHECK(unit_price>=0),
 net_amount numeric(20,6) NOT NULL CHECK(net_amount>=0),tax_amount numeric(20,6) NOT NULL DEFAULT 0 CHECK(tax_amount>=0),sku_uuid uuid REFERENCES alsvid_v2.skus(entity_uuid) ON DELETE RESTRICT,
 shipment_uuid uuid REFERENCES alsvid_v2.production_deliveries(entity_uuid) ON DELETE RESTRICT,metadata jsonb NOT NULL DEFAULT '{}'::jsonb,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(document_id,line_no)
);

CREATE TABLE alsvid_v2.finance_obligations (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),obligation_number text NOT NULL UNIQUE DEFAULT ('OBL-'||lpad(nextval('alsvid_v2.finance_obligation_no')::text,9,'0')),
 direction text NOT NULL CHECK(direction IN('AR','AP')),partner_id uuid NOT NULL REFERENCES alsvid_v2.partners(id) ON DELETE RESTRICT,document_id uuid UNIQUE REFERENCES alsvid_v2.finance_documents(id) ON DELETE RESTRICT,
 currency char(3) NOT NULL CHECK(currency=upper(currency)),original_amount numeric(20,6) NOT NULL CHECK(original_amount>0),due_date date,
 source_type text NOT NULL DEFAULT 'MANUAL' CHECK(source_type IN('PROCUREMENT_PO','COMMERCE_ORDER','LOGISTICS_SHIPMENT','MANUAL')),source_id uuid,
 note text NOT NULL DEFAULT '',created_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((source_type='MANUAL' AND source_id IS NULL) OR (source_type<>'MANUAL' AND source_id IS NOT NULL))
);
CREATE TABLE alsvid_v2.finance_obligation_voids(id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),obligation_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.finance_obligations(id) ON DELETE RESTRICT,reason text NOT NULL CHECK(length(trim(reason))>0),voided_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,voided_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE alsvid_v2.finance_payments (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),payment_number text NOT NULL UNIQUE DEFAULT ('PAY-'||lpad(nextval('alsvid_v2.finance_payment_no')::text,9,'0')),
 direction text NOT NULL CHECK(direction IN('INBOUND','OUTBOUND')),partner_id uuid REFERENCES alsvid_v2.partners(id) ON DELETE RESTRICT,currency char(3) NOT NULL CHECK(currency=upper(currency)),amount numeric(20,6) NOT NULL CHECK(amount>0),value_date date NOT NULL,
 provider text NOT NULL DEFAULT 'MANUAL',account_reference text,external_reference text,idempotency_key text NOT NULL UNIQUE CHECK(length(trim(idempotency_key))>0),note text NOT NULL DEFAULT '',posted_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE alsvid_v2.finance_payment_reversals(id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),payment_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.finance_payments(id) ON DELETE RESTRICT,reason text NOT NULL CHECK(length(trim(reason))>0),reversed_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,reversed_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE alsvid_v2.finance_fx_rates (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),base_currency char(3) NOT NULL CHECK(base_currency=upper(base_currency)),quote_currency char(3) NOT NULL CHECK(quote_currency=upper(quote_currency)),rate numeric(24,12) NOT NULL CHECK(rate>0),effective_at timestamptz NOT NULL,source text NOT NULL CHECK(length(trim(source))>0),external_reference text,created_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),CHECK(base_currency<>quote_currency),UNIQUE(base_currency,quote_currency,effective_at,source)
);
CREATE TABLE alsvid_v2.finance_allocations(id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),payment_id uuid NOT NULL REFERENCES alsvid_v2.finance_payments(id) ON DELETE RESTRICT,obligation_id uuid NOT NULL REFERENCES alsvid_v2.finance_obligations(id) ON DELETE RESTRICT,payment_amount numeric(20,6) NOT NULL CHECK(payment_amount>0),obligation_amount numeric(20,6) NOT NULL CHECK(obligation_amount>0),fx_rate_id uuid REFERENCES alsvid_v2.finance_fx_rates(id) ON DELETE RESTRICT,note text NOT NULL DEFAULT '',allocated_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,allocated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE alsvid_v2.finance_allocation_reversals(id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),allocation_id uuid NOT NULL UNIQUE REFERENCES alsvid_v2.finance_allocations(id) ON DELETE RESTRICT,reason text NOT NULL CHECK(length(trim(reason))>0),reversed_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,reversed_at timestamptz NOT NULL DEFAULT now());

CREATE OR REPLACE VIEW alsvid_v2.finance_v_obligations AS
SELECT o.*,COALESCE(sum(a.obligation_amount) FILTER(WHERE r.id IS NULL),0)::numeric(20,6) allocated_amount,(o.original_amount-COALESCE(sum(a.obligation_amount) FILTER(WHERE r.id IS NULL),0))::numeric(20,6) outstanding_amount,
 CASE WHEN v.id IS NOT NULL THEN 'VOID' WHEN COALESCE(sum(a.obligation_amount) FILTER(WHERE r.id IS NULL),0)=0 THEN 'OPEN' WHEN COALESCE(sum(a.obligation_amount) FILTER(WHERE r.id IS NULL),0)>=o.original_amount THEN 'SETTLED' ELSE 'PARTIALLY_SETTLED' END settlement_status,
 CASE WHEN v.id IS NULL AND o.due_date<current_date AND o.original_amount-COALESCE(sum(a.obligation_amount) FILTER(WHERE r.id IS NULL),0)>0 THEN current_date-o.due_date ELSE 0 END days_overdue
FROM alsvid_v2.finance_obligations o LEFT JOIN alsvid_v2.finance_obligation_voids v ON v.obligation_id=o.id LEFT JOIN alsvid_v2.finance_allocations a ON a.obligation_id=o.id LEFT JOIN alsvid_v2.finance_allocation_reversals r ON r.allocation_id=a.id GROUP BY o.id,v.id;
CREATE OR REPLACE VIEW alsvid_v2.finance_v_payments AS
SELECT p.*,COALESCE(sum(a.payment_amount) FILTER(WHERE r.id IS NULL),0)::numeric(20,6) allocated_amount,(p.amount-COALESCE(sum(a.payment_amount) FILTER(WHERE r.id IS NULL),0))::numeric(20,6) unallocated_amount,
 CASE WHEN x.id IS NOT NULL THEN 'REVERSED' WHEN COALESCE(sum(a.payment_amount) FILTER(WHERE r.id IS NULL),0)=0 THEN 'UNALLOCATED' WHEN COALESCE(sum(a.payment_amount) FILTER(WHERE r.id IS NULL),0)>=p.amount THEN 'ALLOCATED' ELSE 'PARTIAL' END allocation_status
FROM alsvid_v2.finance_payments p LEFT JOIN alsvid_v2.finance_payment_reversals x ON x.payment_id=p.id LEFT JOIN alsvid_v2.finance_allocations a ON a.payment_id=p.id LEFT JOIN alsvid_v2.finance_allocation_reversals r ON r.allocation_id=a.id GROUP BY p.id,x.id;
CREATE OR REPLACE VIEW alsvid_v2.finance_v_partner_balances AS SELECT partner_id,currency,direction,sum(original_amount)::numeric(20,6) original_amount,sum(allocated_amount)::numeric(20,6) allocated_amount,sum(outstanding_amount)::numeric(20,6) outstanding_amount FROM alsvid_v2.finance_v_obligations WHERE settlement_status<>'VOID' GROUP BY partner_id,currency,direction;

CREATE TABLE alsvid_v2.finance_landed_cost_batches (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),batch_number text NOT NULL UNIQUE DEFAULT ('LC-'||lpad(nextval('alsvid_v2.finance_landed_batch_no')::text,9,'0')),
 shipment_uuid uuid NOT NULL UNIQUE REFERENCES alsvid_v2.production_deliveries(entity_uuid) ON DELETE RESTRICT,currency char(3) NOT NULL CHECK(currency=upper(currency)),allocation_basis text NOT NULL CHECK(allocation_basis IN('QUANTITY','VALUE','WEIGHT','MANUAL')),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN('DRAFT','FINALIZED')),note text NOT NULL DEFAULT '',finalized_at timestamptz,finalized_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,created_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE alsvid_v2.finance_landed_cost_components (
 id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),batch_id uuid NOT NULL REFERENCES alsvid_v2.finance_landed_cost_batches(id) ON DELETE RESTRICT,category text NOT NULL CHECK(category IN('GOODS','FREIGHT','INSURANCE','DUTY','IMPORT_VAT','ANTI_DUMPING','COUNTERVAILING','OPERATIONAL_FEE','OTHER')),
 amount numeric(20,6) NOT NULL CHECK(amount>=0),currency char(3) NOT NULL CHECK(currency=upper(currency)),batch_currency_amount numeric(20,6) NOT NULL CHECK(batch_currency_amount>=0),fx_rate_id uuid REFERENCES alsvid_v2.finance_fx_rates(id) ON DELETE RESTRICT,
 source_document_id uuid REFERENCES alsvid_v2.finance_documents(id) ON DELETE RESTRICT,capitalizable boolean NOT NULL DEFAULT true,note text NOT NULL DEFAULT '',created_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE alsvid_v2.finance_landed_cost_allocations(id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),component_id uuid NOT NULL REFERENCES alsvid_v2.finance_landed_cost_components(id) ON DELETE RESTRICT,cargo_vin_uuid uuid NOT NULL REFERENCES alsvid_v2.vins(entity_uuid) ON DELETE RESTRICT,basis_value numeric(20,6) CHECK(basis_value IS NULL OR basis_value>=0),allocated_amount numeric(20,6) NOT NULL CHECK(allocated_amount>=0),created_by text REFERENCES alsvid_v2.app_users(id) ON DELETE SET NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(component_id,cargo_vin_uuid));

CREATE FUNCTION alsvid_v2.finance_reject_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION '% is append-only',TG_TABLE_NAME; END $$;
CREATE TRIGGER finance_obligations_no_mutation BEFORE UPDATE OR DELETE ON alsvid_v2.finance_obligations FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_reject_append_only();
CREATE TRIGGER finance_obligation_voids_no_mutation BEFORE UPDATE OR DELETE ON alsvid_v2.finance_obligation_voids FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_reject_append_only();
CREATE TRIGGER finance_payments_no_mutation BEFORE UPDATE OR DELETE ON alsvid_v2.finance_payments FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_reject_append_only();
CREATE TRIGGER finance_payment_reversals_no_mutation BEFORE UPDATE OR DELETE ON alsvid_v2.finance_payment_reversals FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_reject_append_only();
CREATE TRIGGER finance_fx_no_mutation BEFORE UPDATE OR DELETE ON alsvid_v2.finance_fx_rates FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_reject_append_only();
CREATE TRIGGER finance_allocations_no_mutation BEFORE UPDATE OR DELETE ON alsvid_v2.finance_allocations FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_reject_append_only();
CREATE TRIGGER finance_allocation_reversals_no_mutation BEFORE UPDATE OR DELETE ON alsvid_v2.finance_allocation_reversals FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_reject_append_only();
CREATE TRIGGER finance_documents_no_delete BEFORE DELETE ON alsvid_v2.finance_documents FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_reject_append_only();

CREATE FUNCTION alsvid_v2.finance_guard_voids() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_TABLE_NAME='finance_obligation_voids' AND EXISTS(SELECT 1 FROM alsvid_v2.finance_allocations a LEFT JOIN alsvid_v2.finance_allocation_reversals r ON r.allocation_id=a.id WHERE a.obligation_id=NEW.obligation_id AND r.id IS NULL) THEN RAISE EXCEPTION 'Reverse active allocations before voiding an obligation'; END IF;
 IF TG_TABLE_NAME='finance_payment_reversals' AND EXISTS(SELECT 1 FROM alsvid_v2.finance_allocations a LEFT JOIN alsvid_v2.finance_allocation_reversals r ON r.allocation_id=a.id WHERE a.payment_id=NEW.payment_id AND r.id IS NULL) THEN RAISE EXCEPTION 'Reverse active allocations before reversing a payment'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_obligation_void_guard BEFORE INSERT ON alsvid_v2.finance_obligation_voids FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_guard_voids();
CREATE TRIGGER finance_payment_reversal_guard BEFORE INSERT ON alsvid_v2.finance_payment_reversals FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_guard_voids();

CREATE FUNCTION alsvid_v2.finance_guard_document() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE document_id_value uuid; document_status text;
BEGIN
 IF TG_OP='DELETE' THEN document_id_value=OLD.document_id; ELSE document_id_value=NEW.document_id; END IF;
 SELECT status INTO document_status FROM alsvid_v2.finance_documents WHERE id=document_id_value;
 IF document_status IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Only draft Finance documents can be edited'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER finance_document_lines_draft BEFORE INSERT OR UPDATE OR DELETE ON alsvid_v2.finance_document_lines FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_guard_document();

CREATE FUNCTION alsvid_v2.finance_document_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status=OLD.status THEN RETURN NEW; END IF;
 IF NOT((OLD.status='DRAFT' AND NEW.status IN('VERIFIED','VOIDED')) OR (OLD.status='VERIFIED' AND NEW.status IN('DRAFT','POSTED','VOIDED'))) THEN RAISE EXCEPTION 'Invalid Finance document transition'; END IF;
 IF NEW.status='POSTED' AND OLD.status<>'VERIFIED' THEN RAISE EXCEPTION 'Only verified Finance documents can be posted'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_document_transition_guard BEFORE UPDATE OF status ON alsvid_v2.finance_documents FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_document_transition();

CREATE FUNCTION alsvid_v2.finance_validate_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p alsvid_v2.finance_payments%ROWTYPE;o alsvid_v2.finance_obligations%ROWTYPE;fx alsvid_v2.finance_fx_rates%ROWTYPE;used_p numeric(20,6);used_o numeric(20,6);
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('finance-payment:'||NEW.payment_id::text,0)); PERFORM pg_advisory_xact_lock(hashtextextended('finance-obligation:'||NEW.obligation_id::text,0));
 SELECT * INTO p FROM alsvid_v2.finance_payments WHERE id=NEW.payment_id; SELECT * INTO o FROM alsvid_v2.finance_obligations WHERE id=NEW.obligation_id;
 IF p.id IS NULL OR o.id IS NULL THEN RAISE EXCEPTION 'Payment or obligation not found'; END IF;
 IF EXISTS(SELECT 1 FROM alsvid_v2.finance_payment_reversals WHERE payment_id=p.id) OR EXISTS(SELECT 1 FROM alsvid_v2.finance_obligation_voids WHERE obligation_id=o.id) THEN RAISE EXCEPTION 'Reversed payment or voided obligation cannot be allocated'; END IF;
 IF (p.direction='INBOUND' AND o.direction<>'AR') OR (p.direction='OUTBOUND' AND o.direction<>'AP') THEN RAISE EXCEPTION 'Payment direction does not match obligation'; END IF;
 IF p.partner_id IS NOT NULL AND p.partner_id<>o.partner_id THEN RAISE EXCEPTION 'Payment partner does not match obligation'; END IF;
 IF p.currency=o.currency THEN IF NEW.fx_rate_id IS NOT NULL OR NEW.payment_amount<>NEW.obligation_amount THEN RAISE EXCEPTION 'Same-currency allocations must match and cannot use FX'; END IF;
 ELSE IF NEW.fx_rate_id IS NULL THEN RAISE EXCEPTION 'Cross-currency allocation requires FX'; END IF; SELECT * INTO fx FROM alsvid_v2.finance_fx_rates WHERE id=NEW.fx_rate_id; IF fx.id IS NULL OR NOT((fx.base_currency=p.currency AND fx.quote_currency=o.currency) OR (fx.base_currency=o.currency AND fx.quote_currency=p.currency)) THEN RAISE EXCEPTION 'FX currencies do not match'; END IF; END IF;
 SELECT COALESCE(sum(payment_amount),0) INTO used_p FROM alsvid_v2.finance_allocations a LEFT JOIN alsvid_v2.finance_allocation_reversals r ON r.allocation_id=a.id WHERE a.payment_id=p.id AND r.id IS NULL;
 SELECT COALESCE(sum(obligation_amount),0) INTO used_o FROM alsvid_v2.finance_allocations a LEFT JOIN alsvid_v2.finance_allocation_reversals r ON r.allocation_id=a.id WHERE a.obligation_id=o.id AND r.id IS NULL;
 IF used_p+NEW.payment_amount>p.amount OR used_o+NEW.obligation_amount>o.original_amount THEN RAISE EXCEPTION 'Allocation exceeds remaining balance'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_allocation_guard BEFORE INSERT ON alsvid_v2.finance_allocations FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_validate_allocation();

CREATE FUNCTION alsvid_v2.finance_landed_draft_only() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b uuid; st text; BEGIN
 IF TG_OP='UPDATE' THEN RAISE EXCEPTION 'Delete and recreate draft landed-cost rows to change them'; END IF;
 IF TG_TABLE_NAME='finance_landed_cost_components' THEN b=CASE WHEN TG_OP='DELETE' THEN OLD.batch_id ELSE NEW.batch_id END; ELSE SELECT batch_id INTO b FROM alsvid_v2.finance_landed_cost_components WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.component_id ELSE NEW.component_id END; END IF;
 SELECT status INTO st FROM alsvid_v2.finance_landed_cost_batches WHERE id=b; IF st IS DISTINCT FROM 'DRAFT' THEN RAISE EXCEPTION 'Finalized landed-cost batch is immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER finance_landed_components_draft BEFORE INSERT OR UPDATE OR DELETE ON alsvid_v2.finance_landed_cost_components FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_landed_draft_only();
CREATE TRIGGER finance_landed_allocations_draft BEFORE INSERT OR UPDATE OR DELETE ON alsvid_v2.finance_landed_cost_allocations FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_landed_draft_only();

CREATE FUNCTION alsvid_v2.finance_validate_landed_component_fx() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE batch_currency text; fx alsvid_v2.finance_fx_rates%ROWTYPE; expected numeric(20,6);
BEGIN
 SELECT currency INTO batch_currency FROM alsvid_v2.finance_landed_cost_batches WHERE id=NEW.batch_id;
 IF NEW.currency=batch_currency THEN
  IF NEW.fx_rate_id IS NOT NULL OR NEW.amount<>NEW.batch_currency_amount THEN RAISE EXCEPTION 'Same-currency landed-cost amounts must match and cannot use FX'; END IF;
 ELSE
  SELECT * INTO fx FROM alsvid_v2.finance_fx_rates WHERE id=NEW.fx_rate_id;
  IF fx.id IS NULL OR NOT((fx.base_currency=NEW.currency AND fx.quote_currency=batch_currency) OR (fx.base_currency=batch_currency AND fx.quote_currency=NEW.currency)) THEN RAISE EXCEPTION 'Landed-cost FX currencies do not match'; END IF;
  IF fx.base_currency=NEW.currency THEN expected=round(NEW.amount*fx.rate,6); ELSE expected=round(NEW.amount/fx.rate,6); END IF;
  IF expected<>NEW.batch_currency_amount THEN RAISE EXCEPTION 'Landed-cost batch amount does not match the selected FX rate'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_landed_component_fx_guard BEFORE INSERT ON alsvid_v2.finance_landed_cost_components FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_validate_landed_component_fx();

CREATE FUNCTION alsvid_v2.finance_landed_batch_no_delete() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Landed-cost batches cannot be deleted'; END $$;
CREATE TRIGGER finance_landed_batch_no_delete BEFORE DELETE ON alsvid_v2.finance_landed_cost_batches FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_landed_batch_no_delete();

CREATE FUNCTION alsvid_v2.finance_validate_landed_allocation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE delivery uuid; cargo_delivery uuid; component_amount numeric(20,6); source_amount numeric(20,6); used numeric(20,6); fx alsvid_v2.finance_fx_rates%ROWTYPE; batch_currency text; component_currency text; component_fx uuid;
BEGIN
 SELECT b.shipment_uuid,b.currency,c.batch_currency_amount,c.currency,c.fx_rate_id,c.amount INTO delivery,batch_currency,component_amount,component_currency,component_fx,source_amount FROM alsvid_v2.finance_landed_cost_components c JOIN alsvid_v2.finance_landed_cost_batches b ON b.id=c.batch_id WHERE c.id=NEW.component_id;
 SELECT delivery_uuid INTO cargo_delivery FROM alsvid_v2.production_delivery_vins WHERE vin_uuid=NEW.cargo_vin_uuid AND released_at IS NULL;
 IF delivery IS NULL OR delivery<>cargo_delivery THEN RAISE EXCEPTION 'Landed-cost VIN must belong to the selected delivery'; END IF;
 IF component_currency=batch_currency THEN IF component_fx IS NOT NULL OR component_amount<>source_amount THEN RAISE EXCEPTION 'Same-currency component cannot use FX'; END IF;
 ELSE SELECT * INTO fx FROM alsvid_v2.finance_fx_rates WHERE id=component_fx; IF fx.id IS NULL OR NOT((fx.base_currency=component_currency AND fx.quote_currency=batch_currency) OR (fx.base_currency=batch_currency AND fx.quote_currency=component_currency)) THEN RAISE EXCEPTION 'Landed-cost FX currencies do not match'; END IF; END IF;
 SELECT COALESCE(sum(allocated_amount),0) INTO used FROM alsvid_v2.finance_landed_cost_allocations WHERE component_id=NEW.component_id;
 IF used+NEW.allocated_amount>component_amount THEN RAISE EXCEPTION 'Landed-cost allocation exceeds batch-currency component amount'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_landed_allocation_guard BEFORE INSERT ON alsvid_v2.finance_landed_cost_allocations FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_validate_landed_allocation();

CREATE FUNCTION alsvid_v2.finance_finalize_landed_batch() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c record; total numeric(20,6); BEGIN
 IF OLD.status='FINALIZED' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'Finalized landed-cost batch is immutable'; END IF;
 IF NEW.status=OLD.status THEN RETURN NEW; END IF;
 IF NOT(OLD.status='DRAFT' AND NEW.status='FINALIZED') THEN RAISE EXCEPTION 'Invalid landed-cost batch transition'; END IF;
 IF NOT EXISTS(SELECT 1 FROM alsvid_v2.finance_landed_cost_components WHERE batch_id=NEW.id) THEN RAISE EXCEPTION 'Landed-cost batch requires components'; END IF;
 FOR c IN SELECT * FROM alsvid_v2.finance_landed_cost_components WHERE batch_id=NEW.id AND capitalizable LOOP SELECT COALESCE(sum(allocated_amount),0) INTO total FROM alsvid_v2.finance_landed_cost_allocations WHERE component_id=c.id; IF total<>c.batch_currency_amount THEN RAISE EXCEPTION 'Capitalizable component must be fully allocated'; END IF; END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_landed_batch_guard BEFORE UPDATE ON alsvid_v2.finance_landed_cost_batches FOR EACH ROW EXECUTE FUNCTION alsvid_v2.finance_finalize_landed_batch();
COMMIT;
