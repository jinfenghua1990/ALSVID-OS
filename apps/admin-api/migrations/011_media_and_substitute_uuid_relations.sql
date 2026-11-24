-- Add UUID v7 identities to media and substitute records, and bind BOM drawings.
BEGIN;

LOCK TABLE alsvid_v2.product_media, alsvid_v2.substitutes,
  alsvid_v2.bom_version_items
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
DECLARE tab text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['product_media','substitutes'] LOOP
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD COLUMN entity_uuid uuid',tab);
    EXECUTE format('ALTER TABLE alsvid_v2.%I ALTER COLUMN entity_uuid SET DEFAULT alsvid_v2.generate_uuid_v7()',tab);
    EXECUTE format('UPDATE alsvid_v2.%I SET entity_uuid=alsvid_v2.generate_uuid_v7() WHERE entity_uuid IS NULL',tab);
    EXECUTE format('UPDATE alsvid_v2.%I SET entity_uuid=id::uuid WHERE id ~* %L',tab,
      '^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');
    EXECUTE format('ALTER TABLE alsvid_v2.%I ALTER COLUMN entity_uuid SET NOT NULL',tab);
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD CONSTRAINT %I UNIQUE(entity_uuid)',tab,tab||'_entity_uuid_uq');
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD CONSTRAINT %I CHECK(substring(entity_uuid::text,15,1)=''7'' AND substring(entity_uuid::text,20,1) IN (''8'',''9'',''a'',''b''))',tab,tab||'_entity_uuid_v7');
    EXECUTE format('ALTER TABLE alsvid_v2.%I ADD CONSTRAINT %I UNIQUE(id,entity_uuid)',tab,tab||'_id_entity_uuid_uq');
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OF id,entity_uuid ON alsvid_v2.%I FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_text_uuidv7_identity(''id'',''entity_uuid'')',
      'sync_'||tab||'_uuidv7_identity',tab);
  END LOOP;
END;
$$;

ALTER TABLE alsvid_v2.bom_version_items ADD COLUMN drawing_media_uuid uuid;
UPDATE alsvid_v2.bom_version_items i
SET drawing_media_uuid=m.entity_uuid
FROM alsvid_v2.product_media m
WHERE m.id=i.drawing_media_id;
ALTER TABLE alsvid_v2.bom_version_items
  ADD CONSTRAINT bom_version_items_drawing_media_identity_fk
  FOREIGN KEY(drawing_media_id,drawing_media_uuid)
  REFERENCES alsvid_v2.product_media(id,entity_uuid);

CREATE TRIGGER sync_bom_version_items_drawing_media_uuid
BEFORE INSERT OR UPDATE OF drawing_media_id,drawing_media_uuid ON alsvid_v2.bom_version_items
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.sync_uuidv7_reference('drawing_media_id','drawing_media_uuid','product_media','id');

COMMIT;
