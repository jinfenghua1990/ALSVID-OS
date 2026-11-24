-- B2B warehouse-fulfilled shipments need the shared delivery and parcel timeline,
-- while remaining linked to the sales order instead of a fabricated production order.
BEGIN;

ALTER TABLE alsvid_v2.production_deliveries
  DROP CONSTRAINT IF EXISTS production_deliveries_order_uuid_direct_fk;
DROP TRIGGER IF EXISTS sync_production_deliveries_order_uuid
  ON alsvid_v2.production_deliveries;

ALTER TABLE alsvid_v2.production_deliveries
  ALTER COLUMN order_id DROP NOT NULL,
  ALTER COLUMN order_uuid DROP NOT NULL,
  ADD COLUMN sales_order_uuid uuid REFERENCES alsvid_v2.sales_orders(id) ON DELETE RESTRICT;

ALTER TABLE alsvid_v2.production_deliveries
  DROP CONSTRAINT IF EXISTS production_deliveries_source_type_check,
  ADD CONSTRAINT production_deliveries_source_type_check
    CHECK (source_type IN ('production_order','purchase_order','stock_transfer','sales_order')),
  ADD CONSTRAINT production_deliveries_source_reference_check CHECK (
    (source_type='sales_order' AND sales_order_uuid IS NOT NULL AND order_id IS NULL AND order_uuid IS NULL)
    OR (source_type<>'sales_order' AND sales_order_uuid IS NULL AND order_id IS NOT NULL AND order_uuid IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION alsvid_v2.sync_production_delivery_source_reference()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected_uuid uuid;
BEGIN
  IF NEW.source_type='sales_order' THEN
    IF NEW.sales_order_uuid IS NULL THEN
      RAISE EXCEPTION 'sales delivery source reference is required' USING ERRCODE='23503';
    END IF;
    NEW.order_id:=NULL;
    NEW.order_uuid:=NULL;
  ELSE
    SELECT entity_uuid INTO expected_uuid
      FROM alsvid_v2.production_orders WHERE id=NEW.order_id;
    IF expected_uuid IS NULL OR (NEW.order_uuid IS NOT NULL AND NEW.order_uuid<>expected_uuid) THEN
      RAISE EXCEPTION 'production delivery source reference is invalid' USING ERRCODE='23503';
    END IF;
    NEW.order_uuid:=expected_uuid;
    NEW.sales_order_uuid:=NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_production_delivery_source_reference
BEFORE INSERT OR UPDATE OF source_type,order_id,order_uuid,sales_order_uuid
ON alsvid_v2.production_deliveries
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_production_delivery_source_reference();

CREATE INDEX production_deliveries_sales_order_idx
  ON alsvid_v2.production_deliveries(sales_order_uuid,created_at DESC)
  WHERE sales_order_uuid IS NOT NULL;

COMMIT;
