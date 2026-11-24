BEGIN;

CREATE TABLE alsvid_v2.inventory_condition_transfers (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  location_uuid uuid NOT NULL REFERENCES alsvid_v2.warehouse_locations(id),
  sku_uuid uuid NOT NULL REFERENCES alsvid_v2.skus(entity_uuid),
  from_condition text NOT NULL CHECK(from_condition IN ('available','quality_hold','damaged')),
  to_condition text NOT NULL CHECK(to_condition IN ('available','quality_hold','damaged')),
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100000000),
  reason text NOT NULL CHECK(length(trim(reason)) BETWEEN 1 AND 500),
  recorded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(from_condition<>to_condition),
  CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);

CREATE TABLE alsvid_v2.inventory_condition_ledger (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  location_uuid uuid NOT NULL REFERENCES alsvid_v2.warehouse_locations(id),
  sku_uuid uuid NOT NULL REFERENCES alsvid_v2.skus(entity_uuid),
  condition text NOT NULL CHECK(condition IN ('available','quality_hold','damaged')),
  quantity_delta integer NOT NULL CHECK(quantity_delta<>0),
  source_type text NOT NULL CHECK(source_type IN ('opening_balance','inventory_location_ledger','condition_transfer')),
  source_id text NOT NULL,
  line_no smallint NOT NULL CHECK(line_no>0),
  inventory_location_ledger_uuid uuid UNIQUE REFERENCES alsvid_v2.inventory_location_ledger(id),
  transfer_uuid uuid REFERENCES alsvid_v2.inventory_condition_transfers(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_type,source_id,line_no),
  CHECK((source_type='opening_balance' AND inventory_location_ledger_uuid IS NULL AND transfer_uuid IS NULL)
     OR (source_type='inventory_location_ledger' AND inventory_location_ledger_uuid IS NOT NULL AND transfer_uuid IS NULL)
     OR (source_type='condition_transfer' AND inventory_location_ledger_uuid IS NULL AND transfer_uuid IS NOT NULL)),
  CHECK(substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b'))
);
CREATE INDEX inventory_condition_ledger_balance_idx
  ON alsvid_v2.inventory_condition_ledger(location_uuid,sku_uuid,condition,created_at,id);

-- Existing stock had no quality bucket; preserve its exact balance as available.
INSERT INTO alsvid_v2.inventory_condition_ledger(location_uuid,sku_uuid,condition,quantity_delta,source_type,source_id,line_no)
SELECT location_uuid,sku_uuid,'available',sum(quantity_delta)::integer,'opening_balance',location_uuid::text||':'||sku_uuid::text,1
FROM alsvid_v2.inventory_location_ledger
GROUP BY location_uuid,sku_uuid
HAVING sum(quantity_delta)<>0;

CREATE FUNCTION alsvid_v2.guard_inventory_condition_entry() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE current_quantity bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(NEW.location_uuid::text),hashtext(NEW.sku_uuid::text));
  SELECT COALESCE(sum(quantity_delta),0) INTO current_quantity
  FROM alsvid_v2.inventory_condition_ledger
  WHERE location_uuid=NEW.location_uuid AND sku_uuid=NEW.sku_uuid AND condition=NEW.condition;
  IF current_quantity+NEW.quantity_delta<0 THEN
    RAISE EXCEPTION 'inventory condition balance cannot be negative' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_condition_ledger_nonnegative
BEFORE INSERT ON alsvid_v2.inventory_condition_ledger
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_inventory_condition_entry();

CREATE FUNCTION alsvid_v2.record_inventory_condition_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO alsvid_v2.inventory_condition_ledger(location_uuid,sku_uuid,condition,quantity_delta,source_type,source_id,line_no,inventory_location_ledger_uuid,created_at)
  VALUES(NEW.location_uuid,NEW.sku_uuid,'available',NEW.quantity_delta,'inventory_location_ledger',NEW.id::text,1,NEW.id,NEW.created_at);
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_condition_from_location_ledger
AFTER INSERT ON alsvid_v2.inventory_location_ledger
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.record_inventory_condition_movement();

CREATE FUNCTION alsvid_v2.validate_inventory_condition_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE warehouse_id uuid; reserved_quantity bigint; available_quantity bigint;
BEGIN
  SELECT warehouse_uuid INTO warehouse_id FROM alsvid_v2.warehouse_locations WHERE id=NEW.location_uuid;
  IF NEW.from_condition='available' THEN
    PERFORM 1 FROM alsvid_v2.warehouse_stock WHERE warehouse_uuid=warehouse_id AND sku_uuid=NEW.sku_uuid FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'inventory stock balance is missing' USING ERRCODE='23503';
    END IF;
    SELECT COALESCE(sum(quantity_delta),0) INTO available_quantity
      FROM alsvid_v2.inventory_condition_ledger l JOIN alsvid_v2.warehouse_locations loc ON loc.id=l.location_uuid
      WHERE loc.warehouse_uuid=warehouse_id AND l.sku_uuid=NEW.sku_uuid AND l.condition='available';
    SELECT COALESCE(sum(quantity),0) INTO reserved_quantity FROM alsvid_v2.inventory_reservations
      WHERE warehouse_uuid=warehouse_id AND sku_uuid=NEW.sku_uuid AND status='reserved';
    IF available_quantity-NEW.quantity<reserved_quantity THEN
      RAISE EXCEPTION 'inventory condition change would consume reserved stock' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_condition_transfer_reservation_check
BEFORE INSERT ON alsvid_v2.inventory_condition_transfers
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.validate_inventory_condition_transfer();

CREATE FUNCTION alsvid_v2.record_inventory_condition_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO alsvid_v2.inventory_condition_ledger(location_uuid,sku_uuid,condition,quantity_delta,source_type,source_id,line_no,transfer_uuid,created_at)
  VALUES(NEW.location_uuid,NEW.sku_uuid,NEW.from_condition,-NEW.quantity,'condition_transfer',NEW.id::text,1,NEW.id,NEW.created_at),
        (NEW.location_uuid,NEW.sku_uuid,NEW.to_condition,NEW.quantity,'condition_transfer',NEW.id::text,2,NEW.id,NEW.created_at);
  RETURN NEW;
END;
$$;
CREATE TRIGGER inventory_condition_transfer_ledger
AFTER INSERT ON alsvid_v2.inventory_condition_transfers
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.record_inventory_condition_transfer();

CREATE FUNCTION alsvid_v2.reject_inventory_condition_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'inventory condition history is append only' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER inventory_condition_ledger_immutable BEFORE UPDATE OR DELETE ON alsvid_v2.inventory_condition_ledger
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_inventory_condition_mutation();
CREATE TRIGGER inventory_condition_transfers_immutable BEFORE UPDATE OR DELETE ON alsvid_v2.inventory_condition_transfers
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.reject_inventory_condition_mutation();

CREATE OR REPLACE VIEW alsvid_v2.inventory_available_balances AS
WITH on_hand AS (
  SELECT sku_uuid,warehouse_uuid,sum(quantity_delta)::bigint AS quantity
  FROM alsvid_v2.inventory_ledger GROUP BY sku_uuid,warehouse_uuid
), reserved AS (
  SELECT sku_uuid,warehouse_uuid,sum(quantity)::bigint AS quantity
  FROM alsvid_v2.inventory_reservations WHERE status='reserved' GROUP BY sku_uuid,warehouse_uuid
), condition_balances AS (
  SELECT l.sku_uuid,loc.warehouse_uuid,
    sum(l.quantity_delta) FILTER(WHERE l.condition='available')::bigint AS available_condition_quantity,
    sum(l.quantity_delta) FILTER(WHERE l.condition='quality_hold')::bigint AS quality_hold_quantity,
    sum(l.quantity_delta) FILTER(WHERE l.condition='damaged')::bigint AS damaged_quantity
  FROM alsvid_v2.inventory_condition_ledger l JOIN alsvid_v2.warehouse_locations loc ON loc.id=l.location_uuid
  GROUP BY l.sku_uuid,loc.warehouse_uuid
)
SELECT on_hand.sku_uuid,on_hand.warehouse_uuid,on_hand.quantity AS on_hand_quantity,
       COALESCE(reserved.quantity,0) AS reserved_quantity,
       COALESCE(condition_balances.available_condition_quantity,0)-COALESCE(reserved.quantity,0) AS available_quantity,
       COALESCE(condition_balances.available_condition_quantity,0) AS available_condition_quantity,
       COALESCE(condition_balances.quality_hold_quantity,0) AS quality_hold_quantity,
       COALESCE(condition_balances.damaged_quantity,0) AS damaged_quantity
FROM on_hand LEFT JOIN reserved USING(sku_uuid,warehouse_uuid)
LEFT JOIN condition_balances USING(sku_uuid,warehouse_uuid);

COMMIT;
