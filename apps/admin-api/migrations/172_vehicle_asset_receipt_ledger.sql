-- 工厂/仓间发运签收时，逐 VIN 转为实体仓在库并记录资产流水。
BEGIN;

CREATE OR REPLACE FUNCTION alsvid_v2.record_vehicle_asset_receipt()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  receipt_row record;
  vin_row record;
BEGIN
  SELECT r.id, r.received_at, r.received_by, d.id AS delivery_id,
         d.shipment_no, d.source_type, d.warehouse_uuid
    INTO receipt_row
    FROM alsvid_v2.production_delivery_receipts r
    JOIN alsvid_v2.production_deliveries d ON d.entity_uuid=r.delivery_uuid
   WHERE r.entity_uuid=NEW.receipt_uuid;

  IF receipt_row.source_type='sales_order' THEN
    RAISE EXCEPTION 'B2B customer shipments cannot be received into warehouse stock'
      USING ERRCODE='23514';
  END IF;

  SELECT entity_uuid, vin, sku_uuid, current_warehouse_uuid, owner_state,
         asset_status, sales_order_uuid
    INTO vin_row
    FROM alsvid_v2.vins
   WHERE entity_uuid=NEW.vin_uuid
   FOR UPDATE;

  IF vin_row.sales_order_uuid IS NOT NULL OR vin_row.owner_state='CUSTOMER'
     OR vin_row.asset_status='预占' THEN
    RAISE EXCEPTION 'reserved or customer-owned VIN cannot be received into warehouse stock'
      USING ERRCODE='23514';
  END IF;
  IF vin_row.current_warehouse_uuid=receipt_row.warehouse_uuid THEN
    RAISE EXCEPTION 'VIN is already assigned to the receiving warehouse'
      USING ERRCODE='23514';
  END IF;

  UPDATE alsvid_v2.vins
     SET asset_status='可用', owner_state='STOCK',
         current_warehouse_uuid=receipt_row.warehouse_uuid,
         asset_note='仓库签收入库 '||receipt_row.shipment_no
   WHERE entity_uuid=NEW.vin_uuid;

  INSERT INTO alsvid_v2.vehicle_asset_ledger
    (event_key,vin_uuid,sku_uuid,from_warehouse_uuid,to_warehouse_uuid,
     movement_type,source_type,source_id,occurred_at,actor,note,raw)
  VALUES
    ('delivery-receipt:'||NEW.receipt_uuid::text||':'||NEW.vin_uuid::text,
     NEW.vin_uuid,vin_row.sku_uuid,vin_row.current_warehouse_uuid,
     receipt_row.warehouse_uuid,'PHYSICAL_IN','production_delivery_receipt',
     receipt_row.id::text,receipt_row.received_at,receipt_row.received_by,
     '发运批次签收入库 '||receipt_row.shipment_no,
     jsonb_build_object('receiptId',receipt_row.id,'deliveryId',receipt_row.delivery_id,
                        'shipmentNo',receipt_row.shipment_no,'vin',vin_row.vin));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS record_vehicle_asset_receipt
  ON alsvid_v2.production_delivery_receipt_vins;
CREATE TRIGGER record_vehicle_asset_receipt
AFTER INSERT ON alsvid_v2.production_delivery_receipt_vins
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.record_vehicle_asset_receipt();

COMMIT;
