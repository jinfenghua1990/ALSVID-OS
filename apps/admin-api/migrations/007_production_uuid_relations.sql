-- Add UUID v7 identities to production and BOM records without rewriting
-- existing IDs or breaking current API clients.
BEGIN;

LOCK TABLE alsvid_v2.products, alsvid_v2.warehouses, alsvid_v2.audit_log,
  alsvid_v2.bom_items, alsvid_v2.bom_versions,
  alsvid_v2.bom_version_items, alsvid_v2.production_orders,
  alsvid_v2.production_order_materials, alsvid_v2.production_order_events,
  alsvid_v2.production_order_attachments, alsvid_v2.production_deliveries,
  alsvid_v2.production_delivery_receipts, alsvid_v2.vins,
  alsvid_v2.vin_installed, alsvid_v2.warehouse_stock
  IN SHARE ROW EXCLUSIVE MODE;

-- The migration only fills identity columns on immutable BOM rows. The table
-- locks and transaction make it safe to pause these guards during backfill.
DROP TRIGGER guard_published_bom_version ON alsvid_v2.bom_versions;
DROP TRIGGER guard_published_bom_item ON alsvid_v2.bom_version_items;

CREATE OR REPLACE FUNCTION alsvid_v2.sync_uuidv7_reference()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb:=to_jsonb(NEW);
  legacy_value text;
  supplied_uuid uuid;
  expected_uuid uuid;
  legacy_column text:=TG_ARGV[0];
  uuid_column text:=TG_ARGV[1];
  target_table text:=TG_ARGV[2];
  target_key text:=TG_ARGV[3];
BEGIN
  legacy_value:=row_data->>legacy_column;
  IF legacy_value IS NULL THEN
    IF row_data->>uuid_column IS NOT NULL THEN
      RAISE EXCEPTION 'legacy and UUID references must both be null' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  BEGIN supplied_uuid:=(row_data->>uuid_column)::uuid; EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid UUID reference' USING ERRCODE='22P02';
  END;
  EXECUTE format('SELECT entity_uuid FROM alsvid_v2.%I WHERE %I::text=$1',target_table,target_key)
    INTO expected_uuid USING legacy_value;
  IF expected_uuid IS NULL THEN
    RAISE EXCEPTION 'referenced business record does not exist' USING ERRCODE='23503';
  END IF;
  IF supplied_uuid IS NOT NULL AND supplied_uuid<>expected_uuid THEN
    RAISE EXCEPTION 'legacy and UUID references do not match' USING ERRCODE='23514';
  END IF;
  row_data:=jsonb_set(row_data,ARRAY[uuid_column],to_jsonb(expected_uuid::text),true);
  NEW:=jsonb_populate_record(NEW,row_data);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION alsvid_v2.sync_text_uuidv7_identity()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb:=to_jsonb(NEW);
  identifier text;
  legacy_column text:=TG_ARGV[0];
  uuid_column text:=TG_ARGV[1];
BEGIN
  identifier:=row_data->>legacy_column;
  IF TG_OP='UPDATE' THEN
    IF (row_data->>legacy_column) IS DISTINCT FROM (to_jsonb(OLD)->>legacy_column)
       OR (row_data->>uuid_column) IS DISTINCT FROM (to_jsonb(OLD)->>uuid_column) THEN
      RAISE EXCEPTION 'UUID v7 entity identity is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF identifier ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
    row_data:=jsonb_set(row_data,ARRAY[uuid_column],to_jsonb(identifier::uuid),true);
    NEW:=jsonb_populate_record(NEW,row_data);
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY[
    'audit_log','bom_items','bom_versions','bom_version_items',
    'production_orders','production_order_materials','production_order_events',
    'production_order_attachments','production_deliveries',
    'production_delivery_receipts','vins','vin_installed'
  ] LOOP
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD COLUMN entity_uuid uuid',tab);
    EXECUTE format('ALTER TABLE alsvid_v2.%I ALTER COLUMN entity_uuid SET DEFAULT alsvid_v2.generate_uuid_v7()',tab);
    EXECUTE format('UPDATE alsvid_v2.%I SET entity_uuid=alsvid_v2.generate_uuid_v7() WHERE entity_uuid IS NULL',tab);
    EXECUTE format('ALTER TABLE alsvid_v2.%I ALTER COLUMN entity_uuid SET NOT NULL',tab);
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD CONSTRAINT %I UNIQUE(entity_uuid)',tab,tab||'_entity_uuid_uq');
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD CONSTRAINT %I CHECK(substring(entity_uuid::text,15,1)=''7'' AND substring(entity_uuid::text,20,1) IN (''8'',''9'',''a'',''b''))',tab,tab||'_entity_uuid_v7');
  END LOOP;
END;
$$;

UPDATE alsvid_v2.production_orders SET entity_uuid=id::uuid
  WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
UPDATE alsvid_v2.vins SET entity_uuid=id::uuid
  WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
UPDATE alsvid_v2.production_deliveries SET entity_uuid=id::uuid
  WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
UPDATE alsvid_v2.production_delivery_receipts SET entity_uuid=id::uuid
  WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

CREATE TRIGGER sync_production_orders_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.production_orders
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');
CREATE TRIGGER sync_vins_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.vins
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');
CREATE TRIGGER sync_production_deliveries_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.production_deliveries
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');
CREATE TRIGGER sync_production_delivery_receipts_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.production_delivery_receipts
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');
CREATE TRIGGER sync_production_order_events_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.production_order_events
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');
CREATE TRIGGER sync_production_order_attachments_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.production_order_attachments
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');
CREATE TRIGGER sync_products_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.products
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');
CREATE TRIGGER sync_warehouses_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.warehouses
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');

ALTER TABLE alsvid_v2.bom_versions
  ADD CONSTRAINT bom_versions_id_entity_uuid_uq UNIQUE(id,entity_uuid);
ALTER TABLE alsvid_v2.bom_version_items
  ADD CONSTRAINT bom_version_items_id_entity_uuid_uq UNIQUE(id,entity_uuid);
ALTER TABLE alsvid_v2.production_orders
  ADD CONSTRAINT production_orders_id_entity_uuid_uq UNIQUE(id,entity_uuid);
ALTER TABLE alsvid_v2.vins
  ADD CONSTRAINT vins_id_entity_uuid_uq UNIQUE(id,entity_uuid);
ALTER TABLE alsvid_v2.production_deliveries
  ADD CONSTRAINT production_deliveries_id_entity_uuid_uq UNIQUE(id,entity_uuid);

ALTER TABLE alsvid_v2.bom_version_items
  ADD COLUMN bom_version_uuid uuid,
  ADD COLUMN parent_item_uuid uuid;
UPDATE alsvid_v2.bom_version_items i SET bom_version_uuid=b.entity_uuid
  FROM alsvid_v2.bom_versions b WHERE b.id=i.bom_version_id;
UPDATE alsvid_v2.bom_version_items i SET parent_item_uuid=p.entity_uuid
  FROM alsvid_v2.bom_version_items p WHERE p.id=i.parent_item_id;
ALTER TABLE alsvid_v2.bom_version_items
  ALTER COLUMN bom_version_uuid SET NOT NULL,
  ADD CONSTRAINT bom_version_items_version_identity_fk
    FOREIGN KEY(bom_version_id,bom_version_uuid) REFERENCES alsvid_v2.bom_versions(id,entity_uuid),
  ADD CONSTRAINT bom_version_items_parent_identity_fk
    FOREIGN KEY(parent_item_id,parent_item_uuid) REFERENCES alsvid_v2.bom_version_items(id,entity_uuid);
CREATE TRIGGER sync_bom_version_items_version_uuid
BEFORE INSERT OR UPDATE OF bom_version_id,bom_version_uuid ON alsvid_v2.bom_version_items
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('bom_version_id','bom_version_uuid','bom_versions','id');
CREATE TRIGGER sync_bom_version_items_parent_uuid
BEFORE INSERT OR UPDATE OF parent_item_id,parent_item_uuid ON alsvid_v2.bom_version_items
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('parent_item_id','parent_item_uuid','bom_version_items','id');

ALTER TABLE alsvid_v2.production_orders ADD COLUMN bom_version_uuid uuid;
UPDATE alsvid_v2.production_orders o SET bom_version_uuid=b.entity_uuid
  FROM alsvid_v2.bom_versions b WHERE b.id=o.bom_version_id;
ALTER TABLE alsvid_v2.production_orders
  ALTER COLUMN bom_version_uuid SET NOT NULL,
  ADD CONSTRAINT production_orders_bom_version_identity_fk
    FOREIGN KEY(bom_version_id,bom_version_uuid) REFERENCES alsvid_v2.bom_versions(id,entity_uuid);
CREATE TRIGGER sync_production_orders_bom_version_uuid
BEFORE INSERT OR UPDATE OF bom_version_id,bom_version_uuid ON alsvid_v2.production_orders
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('bom_version_id','bom_version_uuid','bom_versions','id');

ALTER TABLE alsvid_v2.production_order_materials
  ADD COLUMN order_uuid uuid,
  ADD COLUMN bom_item_uuid uuid;
UPDATE alsvid_v2.production_order_materials m SET order_uuid=o.entity_uuid
  FROM alsvid_v2.production_orders o WHERE o.id=m.order_id;
UPDATE alsvid_v2.production_order_materials m SET bom_item_uuid=i.entity_uuid
  FROM alsvid_v2.bom_version_items i WHERE i.id=m.bom_item_id;
ALTER TABLE alsvid_v2.production_order_materials
  ALTER COLUMN order_uuid SET NOT NULL,
  ALTER COLUMN bom_item_uuid SET NOT NULL,
  ADD CONSTRAINT production_order_materials_order_identity_fk
    FOREIGN KEY(order_id,order_uuid) REFERENCES alsvid_v2.production_orders(id,entity_uuid),
  ADD CONSTRAINT production_order_materials_bom_item_identity_fk
    FOREIGN KEY(bom_item_id,bom_item_uuid) REFERENCES alsvid_v2.bom_version_items(id,entity_uuid);
CREATE TRIGGER sync_production_order_materials_order_uuid
BEFORE INSERT OR UPDATE OF order_id,order_uuid ON alsvid_v2.production_order_materials
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('order_id','order_uuid','production_orders','id');
CREATE TRIGGER sync_production_order_materials_bom_item_uuid
BEFORE INSERT OR UPDATE OF bom_item_id,bom_item_uuid ON alsvid_v2.production_order_materials
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('bom_item_id','bom_item_uuid','bom_version_items','id');

ALTER TABLE alsvid_v2.vin_installed ADD COLUMN vin_uuid uuid;
UPDATE alsvid_v2.vin_installed i SET vin_uuid=v.entity_uuid
  FROM alsvid_v2.vins v WHERE v.id=i.vin_id;
ALTER TABLE alsvid_v2.vin_installed
  ALTER COLUMN vin_uuid SET NOT NULL,
  ADD CONSTRAINT vin_installed_vin_identity_fk
    FOREIGN KEY(vin_id,vin_uuid) REFERENCES alsvid_v2.vins(id,entity_uuid);
CREATE TRIGGER sync_vin_installed_vin_uuid
BEFORE INSERT OR UPDATE OF vin_id,vin_uuid ON alsvid_v2.vin_installed
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('vin_id','vin_uuid','vins','id');

ALTER TABLE alsvid_v2.warehouse_stock ADD COLUMN warehouse_uuid uuid;
UPDATE alsvid_v2.warehouse_stock s SET warehouse_uuid=w.entity_uuid
  FROM alsvid_v2.warehouses w WHERE w.id=s.warehouse_id;
ALTER TABLE alsvid_v2.warehouse_stock
  ALTER COLUMN warehouse_uuid SET NOT NULL,
  ADD CONSTRAINT warehouse_stock_warehouse_identity_fk
    FOREIGN KEY(warehouse_id,warehouse_uuid) REFERENCES alsvid_v2.warehouses(id,entity_uuid);
CREATE TRIGGER sync_warehouse_stock_warehouse_uuid
BEFORE INSERT OR UPDATE OF warehouse_id,warehouse_uuid ON alsvid_v2.warehouse_stock
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('warehouse_id','warehouse_uuid','warehouses','id');

ALTER TABLE alsvid_v2.production_deliveries
  ADD COLUMN order_uuid uuid,
  ADD COLUMN warehouse_uuid uuid;
UPDATE alsvid_v2.production_deliveries d SET order_uuid=o.entity_uuid
  FROM alsvid_v2.production_orders o WHERE o.id=d.order_id;
UPDATE alsvid_v2.production_deliveries d SET warehouse_uuid=w.entity_uuid
  FROM alsvid_v2.warehouses w WHERE w.id=d.warehouse_id;
ALTER TABLE alsvid_v2.production_deliveries
  ALTER COLUMN order_uuid SET NOT NULL,
  ALTER COLUMN warehouse_uuid SET NOT NULL,
  ADD CONSTRAINT production_deliveries_order_identity_fk
    FOREIGN KEY(order_id,order_uuid) REFERENCES alsvid_v2.production_orders(id,entity_uuid),
  ADD CONSTRAINT production_deliveries_warehouse_identity_fk
    FOREIGN KEY(warehouse_id,warehouse_uuid) REFERENCES alsvid_v2.warehouses(id,entity_uuid);
CREATE TRIGGER sync_production_deliveries_order_uuid
BEFORE INSERT OR UPDATE OF order_id,order_uuid ON alsvid_v2.production_deliveries
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('order_id','order_uuid','production_orders','id');
CREATE TRIGGER sync_production_deliveries_warehouse_uuid
BEFORE INSERT OR UPDATE OF warehouse_id,warehouse_uuid ON alsvid_v2.production_deliveries
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('warehouse_id','warehouse_uuid','warehouses','id');

ALTER TABLE alsvid_v2.production_order_events ADD COLUMN order_uuid uuid;
UPDATE alsvid_v2.production_order_events e SET order_uuid=o.entity_uuid
  FROM alsvid_v2.production_orders o WHERE o.id=e.order_id;
ALTER TABLE alsvid_v2.production_order_events
  ALTER COLUMN order_uuid SET NOT NULL,
  ADD CONSTRAINT production_order_events_order_identity_fk
    FOREIGN KEY(order_id,order_uuid) REFERENCES alsvid_v2.production_orders(id,entity_uuid);
CREATE TRIGGER sync_production_order_events_order_uuid
BEFORE INSERT OR UPDATE OF order_id,order_uuid ON alsvid_v2.production_order_events
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('order_id','order_uuid','production_orders','id');

ALTER TABLE alsvid_v2.production_order_attachments ADD COLUMN order_uuid uuid;
UPDATE alsvid_v2.production_order_attachments a SET order_uuid=o.entity_uuid
  FROM alsvid_v2.production_orders o WHERE o.id=a.order_id;
ALTER TABLE alsvid_v2.production_order_attachments
  ALTER COLUMN order_uuid SET NOT NULL,
  ADD CONSTRAINT production_order_attachments_order_identity_fk
    FOREIGN KEY(order_id,order_uuid) REFERENCES alsvid_v2.production_orders(id,entity_uuid);
CREATE TRIGGER sync_production_order_attachments_order_uuid
BEFORE INSERT OR UPDATE OF order_id,order_uuid ON alsvid_v2.production_order_attachments
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('order_id','order_uuid','production_orders','id');

ALTER TABLE alsvid_v2.production_delivery_receipts ADD COLUMN delivery_uuid uuid;
UPDATE alsvid_v2.production_delivery_receipts r SET delivery_uuid=d.entity_uuid
  FROM alsvid_v2.production_deliveries d WHERE d.id=r.delivery_id;
ALTER TABLE alsvid_v2.production_delivery_receipts
  ALTER COLUMN delivery_uuid SET NOT NULL,
  ADD CONSTRAINT production_delivery_receipts_delivery_identity_fk
    FOREIGN KEY(delivery_id,delivery_uuid) REFERENCES alsvid_v2.production_deliveries(id,entity_uuid);
CREATE TRIGGER sync_production_delivery_receipts_delivery_uuid
BEFORE INSERT OR UPDATE OF delivery_id,delivery_uuid ON alsvid_v2.production_delivery_receipts
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('delivery_id','delivery_uuid','production_deliveries','id');

CREATE TRIGGER guard_published_bom_version
BEFORE UPDATE OR DELETE ON alsvid_v2.bom_versions
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_published_bom_version();
CREATE TRIGGER guard_published_bom_item
BEFORE INSERT OR UPDATE OR DELETE ON alsvid_v2.bom_version_items
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.guard_published_bom_item();

COMMIT;
