BEGIN;

CREATE TABLE alsvid_v2.inventory_non_sku_reservations (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  item_kind text NOT NULL CHECK (item_kind IN ('PART','VEHICLE')),
  product_uuid uuid REFERENCES alsvid_v2.products(entity_uuid) ON DELETE RESTRICT,
  vin_uuid uuid REFERENCES alsvid_v2.vins(entity_uuid) ON DELETE RESTRICT,
  location_uuid uuid NOT NULL REFERENCES alsvid_v2.warehouse_locations(id) ON DELETE RESTRICT,
  quantity numeric(18,6) NOT NULL CHECK (quantity>0),
  unit text NOT NULL CHECK (length(trim(unit)) BETWEEN 1 AND 20),
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','RELEASED','CONSUMED','CANCELLED')),
  reference_type text,
  reference_id uuid,
  note text NOT NULL DEFAULT '',
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  consumed_at timestamptz,
  CHECK ((item_kind='PART' AND product_uuid IS NOT NULL AND vin_uuid IS NULL)
      OR (item_kind='VEHICLE' AND product_uuid IS NULL AND vin_uuid IS NOT NULL)),
  CHECK (item_kind<>'VEHICLE' OR (quantity=1 AND upper(unit)='EA')),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE INDEX inventory_non_sku_reservations_active_idx ON alsvid_v2.inventory_non_sku_reservations(location_uuid,item_kind,product_uuid,vin_uuid) WHERE status='ACTIVE';
CREATE UNIQUE INDEX inventory_non_sku_vehicle_active_reservation_uq ON alsvid_v2.inventory_non_sku_reservations(vin_uuid) WHERE item_kind='VEHICLE' AND status='ACTIVE';

CREATE TABLE alsvid_v2.inventory_non_sku_movements (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  movement_type text NOT NULL CHECK (movement_type IN ('RECEIPT','TRANSFER','ISSUE','RETURN','ADJUSTMENT')),
  item_kind text NOT NULL CHECK (item_kind IN ('PART','VEHICLE')),
  product_uuid uuid REFERENCES alsvid_v2.products(entity_uuid) ON DELETE RESTRICT,
  vin_uuid uuid REFERENCES alsvid_v2.vins(entity_uuid) ON DELETE RESTRICT,
  quantity numeric(18,6) NOT NULL CHECK (quantity>0),
  unit text NOT NULL CHECK (length(trim(unit)) BETWEEN 1 AND 20),
  source_location_uuid uuid REFERENCES alsvid_v2.warehouse_locations(id) ON DELETE RESTRICT,
  destination_location_uuid uuid REFERENCES alsvid_v2.warehouse_locations(id) ON DELETE RESTRICT,
  reason text NOT NULL DEFAULT '',
  reservation_id uuid REFERENCES alsvid_v2.inventory_non_sku_reservations(id) ON DELETE RESTRICT,
  reference_type text,
  reference_id uuid,
  idempotency_key text NOT NULL UNIQUE CHECK (length(trim(idempotency_key)) BETWEEN 1 AND 200),
  actor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((item_kind='PART' AND product_uuid IS NOT NULL AND vin_uuid IS NULL)
      OR (item_kind='VEHICLE' AND product_uuid IS NULL AND vin_uuid IS NOT NULL)),
  CHECK ((movement_type='RECEIPT' AND source_location_uuid IS NULL AND destination_location_uuid IS NOT NULL)
      OR (movement_type='TRANSFER' AND source_location_uuid IS NOT NULL AND destination_location_uuid IS NOT NULL AND source_location_uuid<>destination_location_uuid)
      OR (movement_type='ISSUE' AND source_location_uuid IS NOT NULL AND destination_location_uuid IS NULL)
      OR (movement_type='RETURN' AND source_location_uuid IS NULL AND destination_location_uuid IS NOT NULL)
      OR (movement_type='ADJUSTMENT' AND ((source_location_uuid IS NOT NULL AND destination_location_uuid IS NULL) OR (source_location_uuid IS NULL AND destination_location_uuid IS NOT NULL)) AND length(trim(reason))>0)),
  CHECK (item_kind<>'VEHICLE' OR (quantity=1 AND upper(unit)='EA')),
  CHECK (reservation_id IS NULL OR movement_type='ISSUE'),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE INDEX inventory_non_sku_movements_item_idx ON alsvid_v2.inventory_non_sku_movements(item_kind,product_uuid,vin_uuid,created_at DESC);

CREATE TABLE alsvid_v2.inventory_non_sku_ledger (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  location_uuid uuid NOT NULL REFERENCES alsvid_v2.warehouse_locations(id) ON DELETE RESTRICT,
  item_kind text NOT NULL CHECK (item_kind IN ('PART','VEHICLE')),
  product_uuid uuid REFERENCES alsvid_v2.products(entity_uuid) ON DELETE RESTRICT,
  vin_uuid uuid REFERENCES alsvid_v2.vins(entity_uuid) ON DELETE RESTRICT,
  unit text NOT NULL CHECK (length(trim(unit)) BETWEEN 1 AND 20),
  quantity_delta numeric(18,6) NOT NULL CHECK (quantity_delta<>0),
  source_type text NOT NULL CHECK (source_type IN ('stocktake_correction','non_sku_movement')),
  source_id uuid NOT NULL,
  line_no smallint NOT NULL CHECK (line_no>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_type,source_id,line_no),
  CHECK ((item_kind='PART' AND product_uuid IS NOT NULL AND vin_uuid IS NULL)
      OR (item_kind='VEHICLE' AND product_uuid IS NULL AND vin_uuid IS NOT NULL)),
  CHECK (item_kind<>'VEHICLE' OR (quantity_delta IN (-1,1) AND upper(unit)='EA')),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE INDEX inventory_non_sku_balance_idx ON alsvid_v2.inventory_non_sku_ledger
  (location_uuid,item_kind,product_uuid,vin_uuid,created_at,id);

CREATE FUNCTION alsvid_v2.validate_inventory_non_sku_source() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE source record; expected_delta numeric(18,6); current_quantity numeric(18,6);
BEGIN
  IF NEW.source_type='stocktake_correction' THEN
    SELECT * INTO source FROM alsvid_v2.inventory_stocktake_counts WHERE id=NEW.source_id;
    IF NOT FOUND OR source.item_kind<>NEW.item_kind OR source.location_uuid<>NEW.location_uuid
       OR source.product_uuid IS DISTINCT FROM NEW.product_uuid OR source.vin_uuid IS DISTINCT FROM NEW.vin_uuid
       OR source.unit<>NEW.unit THEN
      RAISE EXCEPTION 'stocktake correction source does not match count' USING ERRCODE='23514';
    END IF;
    SELECT COALESCE(sum(quantity_delta),0) INTO current_quantity FROM alsvid_v2.inventory_non_sku_ledger
      WHERE location_uuid=NEW.location_uuid AND item_kind=NEW.item_kind
        AND product_uuid IS NOT DISTINCT FROM NEW.product_uuid AND vin_uuid IS NOT DISTINCT FROM NEW.vin_uuid;
    expected_delta:=source.counted_quantity-current_quantity;
  ELSE
    SELECT * INTO source FROM alsvid_v2.inventory_non_sku_movements WHERE id=NEW.source_id;
    IF NOT FOUND OR source.item_kind<>NEW.item_kind OR source.product_uuid IS DISTINCT FROM NEW.product_uuid
       OR source.vin_uuid IS DISTINCT FROM NEW.vin_uuid OR source.unit<>NEW.unit THEN
      RAISE EXCEPTION 'inventory movement source does not match ledger item' USING ERRCODE='23514';
    END IF;
    IF source.reservation_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM alsvid_v2.inventory_non_sku_reservations r WHERE r.id=source.reservation_id
        AND r.status='CONSUMED' AND r.item_kind=NEW.item_kind
        AND r.product_uuid IS NOT DISTINCT FROM NEW.product_uuid AND r.vin_uuid IS NOT DISTINCT FROM NEW.vin_uuid
        AND r.location_uuid=NEW.location_uuid AND r.quantity=source.quantity AND upper(r.unit)=upper(source.unit)
    ) THEN RAISE EXCEPTION 'inventory issue does not match consumed reservation' USING ERRCODE='23514'; END IF;
    IF NEW.line_no=1 AND source.source_location_uuid=NEW.location_uuid THEN expected_delta:=-source.quantity;
    ELSIF NEW.line_no IN (1,2) AND source.destination_location_uuid=NEW.location_uuid THEN expected_delta:=source.quantity;
    ELSE RAISE EXCEPTION 'inventory movement source does not match ledger location' USING ERRCODE='23514'; END IF;
  END IF;
  IF NEW.quantity_delta<>expected_delta THEN RAISE EXCEPTION 'inventory ledger delta does not match source' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_non_sku_source_guard BEFORE INSERT ON alsvid_v2.inventory_non_sku_ledger
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.validate_inventory_non_sku_source();

CREATE FUNCTION alsvid_v2.guard_inventory_non_sku_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE balance numeric(18,6); reserved numeric(18,6); item_key text;
BEGIN
  item_key:=COALESCE(NEW.product_uuid,NEW.vin_uuid)::text;
  IF NEW.item_kind='VEHICLE' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('VEHICLE:'||item_key,132));
    SELECT COALESCE(sum(quantity_delta),0) INTO balance FROM alsvid_v2.inventory_non_sku_ledger
      WHERE item_kind='VEHICLE' AND vin_uuid=NEW.vin_uuid;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.location_uuid::text||':'||item_key,132));
    SELECT COALESCE(sum(quantity_delta),0) INTO balance FROM alsvid_v2.inventory_non_sku_ledger
      WHERE location_uuid=NEW.location_uuid AND item_kind='PART' AND product_uuid=NEW.product_uuid;
  END IF;
  IF balance+NEW.quantity_delta<0 OR (NEW.item_kind='VEHICLE' AND balance+NEW.quantity_delta>1) THEN
    RAISE EXCEPTION 'inventory balance cannot be negative' USING ERRCODE='23514';
  END IF;
  IF NEW.quantity_delta<0 THEN
    SELECT COALESCE(sum(quantity),0) INTO reserved FROM alsvid_v2.inventory_non_sku_reservations
      WHERE status='ACTIVE' AND item_kind=NEW.item_kind
        AND product_uuid IS NOT DISTINCT FROM NEW.product_uuid AND vin_uuid IS NOT DISTINCT FROM NEW.vin_uuid
        AND location_uuid=NEW.location_uuid;
    IF balance+NEW.quantity_delta<reserved THEN RAISE EXCEPTION 'inventory movement would consume reserved stock' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_non_sku_balance_guard BEFORE INSERT ON alsvid_v2.inventory_non_sku_ledger
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_inventory_non_sku_balance();

CREATE FUNCTION alsvid_v2.reject_inventory_non_sku_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'inventory ledger is append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER inventory_non_sku_ledger_immutable BEFORE UPDATE OR DELETE ON alsvid_v2.inventory_non_sku_ledger
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_inventory_non_sku_mutation();

CREATE FUNCTION alsvid_v2.guard_inventory_non_sku_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE balance numeric(18,6); reserved numeric(18,6); item_key text;
BEGIN
  item_key:=COALESCE(NEW.product_uuid,NEW.vin_uuid)::text;
  IF NEW.item_kind='VEHICLE' THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('VEHICLE:'||item_key,132));
    SELECT COALESCE(sum(quantity_delta),0) INTO balance FROM alsvid_v2.inventory_non_sku_ledger WHERE item_kind='VEHICLE' AND vin_uuid=NEW.vin_uuid;
    SELECT COALESCE(sum(quantity),0) INTO reserved FROM alsvid_v2.inventory_non_sku_reservations WHERE item_kind='VEHICLE' AND vin_uuid=NEW.vin_uuid AND status='ACTIVE';
  ELSE
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.location_uuid::text||':'||item_key,132));
    SELECT COALESCE(sum(quantity_delta),0) INTO balance FROM alsvid_v2.inventory_non_sku_ledger WHERE location_uuid=NEW.location_uuid AND item_kind='PART' AND product_uuid=NEW.product_uuid;
    SELECT COALESCE(sum(quantity),0) INTO reserved FROM alsvid_v2.inventory_non_sku_reservations WHERE location_uuid=NEW.location_uuid AND item_kind='PART' AND product_uuid=NEW.product_uuid AND status='ACTIVE';
  END IF;
  IF balance-reserved<NEW.quantity THEN RAISE EXCEPTION 'insufficient available inventory to reserve' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_non_sku_reservation_guard BEFORE INSERT ON alsvid_v2.inventory_non_sku_reservations
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_inventory_non_sku_reservation();

CREATE FUNCTION alsvid_v2.guard_inventory_non_sku_reservation_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status<>'ACTIVE' OR NEW.status NOT IN ('RELEASED','CONSUMED','CANCELLED') THEN RAISE EXCEPTION 'invalid inventory reservation transition' USING ERRCODE='23514'; END IF;
  IF NEW.status='RELEASED' AND NEW.released_at IS NULL THEN RAISE EXCEPTION 'reservation release timestamp is required' USING ERRCODE='23514'; END IF;
  IF NEW.status='CONSUMED' AND NEW.consumed_at IS NULL THEN RAISE EXCEPTION 'reservation consume timestamp is required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_non_sku_reservation_transition_guard BEFORE UPDATE OF status ON alsvid_v2.inventory_non_sku_reservations
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_inventory_non_sku_reservation_transition();
CREATE TRIGGER inventory_non_sku_reservations_immutable_fields BEFORE UPDATE OF item_kind,product_uuid,vin_uuid,location_uuid,quantity,unit,reference_type,reference_id,note,actor,created_at ON alsvid_v2.inventory_non_sku_reservations
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_inventory_non_sku_mutation();

CREATE FUNCTION alsvid_v2.record_inventory_non_sku_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.movement_type IN ('TRANSFER','ISSUE','ADJUSTMENT') AND NEW.source_location_uuid IS NOT NULL THEN
    INSERT INTO alsvid_v2.inventory_non_sku_ledger(location_uuid,item_kind,product_uuid,vin_uuid,unit,quantity_delta,source_type,source_id,line_no)
    VALUES(NEW.source_location_uuid,NEW.item_kind,NEW.product_uuid,NEW.vin_uuid,NEW.unit,-NEW.quantity,'non_sku_movement',NEW.id,1);
  END IF;
  IF NEW.movement_type IN ('RECEIPT','TRANSFER','RETURN','ADJUSTMENT') AND NEW.destination_location_uuid IS NOT NULL THEN
    INSERT INTO alsvid_v2.inventory_non_sku_ledger(location_uuid,item_kind,product_uuid,vin_uuid,unit,quantity_delta,source_type,source_id,line_no)
    VALUES(NEW.destination_location_uuid,NEW.item_kind,NEW.product_uuid,NEW.vin_uuid,NEW.unit,NEW.quantity,'non_sku_movement',NEW.id,
      CASE WHEN NEW.source_location_uuid IS NULL THEN 1 ELSE 2 END);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_non_sku_movement_ledger AFTER INSERT ON alsvid_v2.inventory_non_sku_movements
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.record_inventory_non_sku_movement();
CREATE TRIGGER inventory_non_sku_movements_immutable BEFORE UPDATE OR DELETE ON alsvid_v2.inventory_non_sku_movements
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_inventory_non_sku_mutation();

COMMIT;
