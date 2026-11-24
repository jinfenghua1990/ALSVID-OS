-- Give field definitions UUID v7 primary keys while preserving their stable codes.
BEGIN;

LOCK TABLE alsvid_v2.fields IN ACCESS EXCLUSIVE MODE;

ALTER TABLE alsvid_v2.fields ADD COLUMN id uuid;
ALTER TABLE alsvid_v2.fields ALTER COLUMN id SET DEFAULT alsvid_v2.generate_uuid_v7();
UPDATE alsvid_v2.fields SET id=alsvid_v2.generate_uuid_v7() WHERE id IS NULL;
ALTER TABLE alsvid_v2.fields
  ALTER COLUMN id SET NOT NULL,
  ADD CONSTRAINT fields_code_unique UNIQUE (code),
  ADD CONSTRAINT fields_id_uuid_v7 CHECK (
    substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b')
  );
ALTER TABLE alsvid_v2.fields DROP CONSTRAINT fields_pkey;
ALTER TABLE alsvid_v2.fields ADD CONSTRAINT fields_pkey PRIMARY KEY (id);

COMMIT;
