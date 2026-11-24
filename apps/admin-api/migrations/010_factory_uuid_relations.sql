-- Add UUID v7 identities to factories and bind production orders to them.
BEGIN;

LOCK TABLE alsvid_v2.factories, alsvid_v2.production_orders
  IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE alsvid_v2.factories ADD COLUMN entity_uuid uuid;
ALTER TABLE alsvid_v2.factories
  ALTER COLUMN entity_uuid SET DEFAULT alsvid_v2.generate_uuid_v7();
UPDATE alsvid_v2.factories
SET entity_uuid=alsvid_v2.generate_uuid_v7()
WHERE entity_uuid IS NULL;
UPDATE alsvid_v2.factories
SET entity_uuid=id::uuid
WHERE id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
ALTER TABLE alsvid_v2.factories
  ALTER COLUMN entity_uuid SET NOT NULL,
  ADD CONSTRAINT factories_entity_uuid_uq UNIQUE(entity_uuid),
  ADD CONSTRAINT factories_entity_uuid_v7 CHECK(
    substring(entity_uuid::text,15,1)='7'
    AND substring(entity_uuid::text,20,1) IN ('8','9','a','b')
  ),
  ADD CONSTRAINT factories_id_entity_uuid_uq UNIQUE(id,entity_uuid);

CREATE TRIGGER sync_factories_uuidv7_identity
BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.factories
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity('id','entity_uuid');

ALTER TABLE alsvid_v2.production_orders ADD COLUMN factory_uuid uuid;
UPDATE alsvid_v2.production_orders o
SET factory_uuid=f.entity_uuid
FROM alsvid_v2.factories f
WHERE f.id=o.factory_id;
ALTER TABLE alsvid_v2.production_orders
  ADD CONSTRAINT production_orders_factory_identity_fk
  FOREIGN KEY(factory_id,factory_uuid)
  REFERENCES alsvid_v2.factories(id,entity_uuid);

CREATE TRIGGER sync_production_orders_factory_uuid
BEFORE INSERT OR UPDATE OF factory_id,factory_uuid ON alsvid_v2.production_orders
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('factory_id','factory_uuid','factories','id');

COMMIT;
