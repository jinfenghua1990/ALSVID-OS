-- Promote production workflow references to UUID foreign keys.
-- Business identifiers remain in place for existing application compatibility.
BEGIN;

ALTER TABLE alsvid_v2.production_deliveries
  ADD CONSTRAINT production_deliveries_order_uuid_direct_fk FOREIGN KEY (order_uuid) REFERENCES alsvid_v2.production_orders(entity_uuid) NOT VALID,
  ADD CONSTRAINT production_deliveries_warehouse_uuid_direct_fk FOREIGN KEY (warehouse_uuid) REFERENCES alsvid_v2.warehouses(entity_uuid) NOT VALID;
ALTER TABLE alsvid_v2.production_delivery_receipts
  ADD CONSTRAINT production_delivery_receipts_delivery_uuid_direct_fk FOREIGN KEY (delivery_uuid) REFERENCES alsvid_v2.production_deliveries(entity_uuid) NOT VALID;
ALTER TABLE alsvid_v2.production_order_attachments
  ADD CONSTRAINT production_order_attachments_order_uuid_direct_fk FOREIGN KEY (order_uuid) REFERENCES alsvid_v2.production_orders(entity_uuid) NOT VALID;
ALTER TABLE alsvid_v2.production_order_events
  ADD CONSTRAINT production_order_events_order_uuid_direct_fk FOREIGN KEY (order_uuid) REFERENCES alsvid_v2.production_orders(entity_uuid) NOT VALID;
ALTER TABLE alsvid_v2.production_order_materials
  ADD CONSTRAINT production_order_materials_bom_item_uuid_direct_fk FOREIGN KEY (bom_item_uuid) REFERENCES alsvid_v2.bom_version_items(entity_uuid) NOT VALID,
  ADD CONSTRAINT production_order_materials_order_uuid_direct_fk FOREIGN KEY (order_uuid) REFERENCES alsvid_v2.production_orders(entity_uuid) NOT VALID;
ALTER TABLE alsvid_v2.production_orders
  ADD CONSTRAINT production_orders_bom_version_uuid_direct_fk FOREIGN KEY (bom_version_uuid) REFERENCES alsvid_v2.bom_versions(entity_uuid) NOT VALID,
  ADD CONSTRAINT production_orders_factory_uuid_direct_fk FOREIGN KEY (factory_uuid) REFERENCES alsvid_v2.factories(entity_uuid) NOT VALID;

ALTER TABLE alsvid_v2.production_deliveries VALIDATE CONSTRAINT production_deliveries_order_uuid_direct_fk;
ALTER TABLE alsvid_v2.production_deliveries VALIDATE CONSTRAINT production_deliveries_warehouse_uuid_direct_fk;
ALTER TABLE alsvid_v2.production_delivery_receipts VALIDATE CONSTRAINT production_delivery_receipts_delivery_uuid_direct_fk;
ALTER TABLE alsvid_v2.production_order_attachments VALIDATE CONSTRAINT production_order_attachments_order_uuid_direct_fk;
ALTER TABLE alsvid_v2.production_order_events VALIDATE CONSTRAINT production_order_events_order_uuid_direct_fk;
ALTER TABLE alsvid_v2.production_order_materials VALIDATE CONSTRAINT production_order_materials_bom_item_uuid_direct_fk;
ALTER TABLE alsvid_v2.production_order_materials VALIDATE CONSTRAINT production_order_materials_order_uuid_direct_fk;
ALTER TABLE alsvid_v2.production_orders VALIDATE CONSTRAINT production_orders_bom_version_uuid_direct_fk;
ALTER TABLE alsvid_v2.production_orders VALIDATE CONSTRAINT production_orders_factory_uuid_direct_fk;

ALTER TABLE alsvid_v2.production_deliveries
  DROP CONSTRAINT production_deliveries_order_id_fkey,
  DROP CONSTRAINT production_deliveries_order_identity_fk,
  DROP CONSTRAINT production_deliveries_warehouse_id_fkey,
  DROP CONSTRAINT production_deliveries_warehouse_identity_fk;
ALTER TABLE alsvid_v2.production_delivery_receipts
  DROP CONSTRAINT production_delivery_receipts_delivery_id_fkey,
  DROP CONSTRAINT production_delivery_receipts_delivery_identity_fk;
ALTER TABLE alsvid_v2.production_order_attachments
  DROP CONSTRAINT production_order_attachments_order_id_fkey,
  DROP CONSTRAINT production_order_attachments_order_identity_fk;
ALTER TABLE alsvid_v2.production_order_events
  DROP CONSTRAINT production_order_events_order_id_fkey,
  DROP CONSTRAINT production_order_events_order_identity_fk;
ALTER TABLE alsvid_v2.production_order_materials
  DROP CONSTRAINT production_order_materials_bom_item_id_fkey,
  DROP CONSTRAINT production_order_materials_bom_item_identity_fk,
  DROP CONSTRAINT production_order_materials_order_id_fkey,
  DROP CONSTRAINT production_order_materials_order_identity_fk;
ALTER TABLE alsvid_v2.production_orders
  DROP CONSTRAINT production_orders_bom_version_id_fkey,
  DROP CONSTRAINT production_orders_bom_version_identity_fk,
  DROP CONSTRAINT production_orders_factory_id_fkey,
  DROP CONSTRAINT production_orders_factory_identity_fk;

COMMIT;
