BEGIN;

ALTER TABLE alsvid_v2.inventory_ledger
  DROP CONSTRAINT inventory_ledger_source_type_check,
  ADD CONSTRAINT inventory_ledger_source_type_check
    CHECK (source_type IN ('stock_movement','repair_stock_event','opening_balance','production_order_material','stocktake_correction'));

CREATE SEQUENCE alsvid_v2.inventory_stocktake_number START 1;
CREATE TABLE alsvid_v2.inventory_stocktakes (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  stocktake_number text NOT NULL UNIQUE DEFAULT ('ST-'||lpad(nextval('alsvid_v2.inventory_stocktake_number')::text,9,'0')),
  warehouse_uuid uuid NOT NULL REFERENCES alsvid_v2.warehouses(entity_uuid) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED','CANCELLED')),
  note text NOT NULL DEFAULT '',
  opened_by text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_by text,
  closed_at timestamptz,
  CHECK ((status='OPEN' AND closed_by IS NULL AND closed_at IS NULL) OR (status<>'OPEN' AND closed_by IS NOT NULL AND closed_at IS NOT NULL)),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE UNIQUE INDEX inventory_stocktakes_one_open_per_warehouse ON alsvid_v2.inventory_stocktakes(warehouse_uuid) WHERE status='OPEN';
CREATE INDEX inventory_stocktakes_recent ON alsvid_v2.inventory_stocktakes(opened_at DESC);

CREATE TABLE alsvid_v2.inventory_stocktake_counts (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  stocktake_id uuid NOT NULL REFERENCES alsvid_v2.inventory_stocktakes(id) ON DELETE RESTRICT,
  location_uuid uuid NOT NULL REFERENCES alsvid_v2.warehouse_locations(id) ON DELETE RESTRICT,
  item_kind text NOT NULL DEFAULT 'SKU' CHECK (item_kind IN ('PART','SKU','VEHICLE')),
  product_uuid uuid REFERENCES alsvid_v2.products(entity_uuid) ON DELETE RESTRICT,
  sku_uuid uuid REFERENCES alsvid_v2.skus(entity_uuid) ON DELETE RESTRICT,
  vin_uuid uuid REFERENCES alsvid_v2.vins(entity_uuid) ON DELETE RESTRICT,
  condition text NOT NULL CHECK (condition IN ('available','quality_hold','damaged')),
  counted_quantity numeric(18,6) NOT NULL CHECK (counted_quantity>=0),
  unit text NOT NULL DEFAULT 'EA' CHECK (length(trim(unit)) BETWEEN 1 AND 20),
  counted_by text NOT NULL,
  counted_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((item_kind='PART' AND product_uuid IS NOT NULL AND sku_uuid IS NULL AND vin_uuid IS NULL)
      OR (item_kind='SKU' AND product_uuid IS NULL AND sku_uuid IS NOT NULL AND vin_uuid IS NULL)
      OR (item_kind='VEHICLE' AND product_uuid IS NULL AND sku_uuid IS NULL AND vin_uuid IS NOT NULL)),
  CHECK (item_kind<>'VEHICLE' OR (counted_quantity IN (0,1) AND upper(unit)='EA')),
  CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE INDEX inventory_stocktake_counts_latest ON alsvid_v2.inventory_stocktake_counts(stocktake_id,location_uuid,item_kind,product_uuid,sku_uuid,vin_uuid,condition,counted_at DESC,id DESC);

CREATE FUNCTION alsvid_v2.inventory_stocktake_count_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE session_warehouse uuid; location_warehouse uuid; BEGIN
  SELECT warehouse_uuid INTO session_warehouse FROM alsvid_v2.inventory_stocktakes WHERE id=NEW.stocktake_id AND status='OPEN' FOR SHARE;
  SELECT warehouse_uuid INTO location_warehouse FROM alsvid_v2.warehouse_locations WHERE id=NEW.location_uuid AND status='启用' FOR SHARE;
  IF session_warehouse IS NULL OR location_warehouse IS DISTINCT FROM session_warehouse THEN
    RAISE EXCEPTION 'Stocktake must use an active location in its open warehouse' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_stocktake_count_guard BEFORE INSERT ON alsvid_v2.inventory_stocktake_counts
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.inventory_stocktake_count_guard();

CREATE FUNCTION alsvid_v2.inventory_stocktake_count_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Stocktake counts are append-only' USING ERRCODE='23514'; END $$;
CREATE TRIGGER inventory_stocktake_counts_immutable BEFORE UPDATE OR DELETE ON alsvid_v2.inventory_stocktake_counts
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.inventory_stocktake_count_immutable();

CREATE FUNCTION alsvid_v2.inventory_stocktake_transition() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status=OLD.status THEN RETURN NEW; END IF;
  IF OLD.status<>'OPEN' OR NEW.status NOT IN ('CLOSED','CANCELLED') THEN RAISE EXCEPTION 'Invalid stocktake transition' USING ERRCODE='23514'; END IF;
  IF NEW.closed_at IS NULL OR NEW.closed_by IS NULL THEN RAISE EXCEPTION 'Stocktake close audit fields are required' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_stocktake_transition_guard BEFORE UPDATE OF status ON alsvid_v2.inventory_stocktakes
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.inventory_stocktake_transition();

CREATE OR REPLACE FUNCTION alsvid_v2.record_inventory_location_ledger() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE location_id uuid; movement record;
BEGIN
  IF NEW.source_type='stock_movement' THEN
    SELECT kind,from_location_uuid,to_location_uuid INTO movement FROM alsvid_v2.stock_movements WHERE id=NEW.source_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'inventory movement source is missing' USING ERRCODE='23503'; END IF;
    IF movement.kind='调拨' AND NEW.line_no=1 THEN location_id:=movement.from_location_uuid; ELSE location_id:=movement.to_location_uuid; END IF;
  ELSIF NEW.source_type='stocktake_correction' THEN
    SELECT location_uuid INTO location_id FROM alsvid_v2.inventory_stocktake_counts WHERE id=NEW.source_id::uuid;
  ELSE
    SELECT id INTO location_id FROM alsvid_v2.warehouse_locations WHERE warehouse_uuid=NEW.warehouse_uuid AND is_default AND status='启用';
  END IF;
  IF location_id IS NULL THEN RAISE EXCEPTION 'inventory warehouse location is missing' USING ERRCODE='23503'; END IF;
  INSERT INTO alsvid_v2.inventory_location_ledger(inventory_ledger_uuid,location_uuid,sku_uuid,quantity_delta,source_type,source_id,line_no,created_at)
  VALUES(NEW.id,location_id,NEW.sku_uuid,NEW.quantity_delta,NEW.source_type,NEW.source_id,NEW.line_no,NEW.created_at);
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION alsvid_v2.record_inventory_condition_movement() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stock_condition text;
BEGIN
  IF NEW.source_type='stocktake_correction' THEN
    SELECT condition INTO stock_condition FROM alsvid_v2.inventory_stocktake_counts WHERE id=NEW.source_id::uuid;
    IF stock_condition IS NULL THEN RAISE EXCEPTION 'stocktake count source is missing' USING ERRCODE='23503'; END IF;
  ELSE stock_condition:='available'; END IF;
  INSERT INTO alsvid_v2.inventory_condition_ledger(location_uuid,sku_uuid,condition,quantity_delta,source_type,source_id,line_no,inventory_location_ledger_uuid,created_at)
  VALUES(NEW.location_uuid,NEW.sku_uuid,stock_condition,NEW.quantity_delta,'inventory_location_ledger',NEW.id::text,1,NEW.id,NEW.created_at);
  RETURN NEW;
END $$;

COMMIT;
