-- Give color records UUID v7 identities and bind SKU color references to them.
BEGIN;

LOCK TABLE alsvid_v2.colors, alsvid_v2.skus
  IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE alsvid_v2.colors ADD COLUMN entity_uuid uuid;
ALTER TABLE alsvid_v2.colors
  ALTER COLUMN entity_uuid SET DEFAULT alsvid_v2.generate_uuid_v7();
UPDATE alsvid_v2.colors
SET entity_uuid=alsvid_v2.generate_uuid_v7()
WHERE entity_uuid IS NULL;
ALTER TABLE alsvid_v2.colors
  ALTER COLUMN entity_uuid SET NOT NULL,
  ADD CONSTRAINT colors_entity_uuid_uq UNIQUE(entity_uuid),
  ADD CONSTRAINT colors_entity_uuid_v7 CHECK(
    substring(entity_uuid::text,15,1)='7'
    AND substring(entity_uuid::text,20,1) IN ('8','9','a','b')
  ),
  ADD CONSTRAINT colors_code_entity_uuid_uq UNIQUE(code,entity_uuid);

ALTER TABLE alsvid_v2.skus ADD COLUMN color_uuid uuid;
UPDATE alsvid_v2.skus s
SET color_uuid=c.entity_uuid
FROM alsvid_v2.colors c
WHERE c.code=s.color_code;
ALTER TABLE alsvid_v2.skus
  ALTER COLUMN color_uuid SET NOT NULL,
  ADD CONSTRAINT skus_color_identity_fk
  FOREIGN KEY(color_code,color_uuid)
  REFERENCES alsvid_v2.colors(code,entity_uuid);

CREATE TRIGGER sync_skus_color_uuid
BEFORE INSERT OR UPDATE OF color_code,color_uuid ON alsvid_v2.skus
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('color_code','color_uuid','colors','code');

COMMIT;
