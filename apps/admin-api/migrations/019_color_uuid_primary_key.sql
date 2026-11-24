-- Use the existing UUID v7 identity as the color primary key.
-- Keep the code/UUID pair constraint while legacy SKU code references remain.
BEGIN;

LOCK TABLE alsvid_v2.colors, alsvid_v2.skus IN ACCESS EXCLUSIVE MODE;

ALTER TABLE alsvid_v2.colors ADD CONSTRAINT colors_code_unique UNIQUE (code);
ALTER TABLE alsvid_v2.skus DROP CONSTRAINT skus_color_code_fkey;
ALTER TABLE alsvid_v2.colors DROP CONSTRAINT colors_pkey;
ALTER TABLE alsvid_v2.colors DROP CONSTRAINT colors_entity_uuid_uq;
ALTER TABLE alsvid_v2.colors ADD CONSTRAINT colors_pkey PRIMARY KEY (entity_uuid);
ALTER TABLE alsvid_v2.skus ADD CONSTRAINT skus_color_uuid_fk
  FOREIGN KEY (color_uuid) REFERENCES alsvid_v2.colors(entity_uuid);

COMMIT;
