-- Replace remaining legacy primary keys while preserving business-key uniqueness.
BEGIN;

LOCK TABLE alsvid_v2.app_sessions, alsvid_v2.catalog_publications, alsvid_v2.fits,
  alsvid_v2.portal_account_reviews, alsvid_v2.portal_vehicle_access,
  alsvid_v2.schema_migrations, alsvid_v2.warehouse_stock IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE contype='f' AND confrelid IN (
      'alsvid_v2.app_sessions'::regclass, 'alsvid_v2.catalog_publications'::regclass,
      'alsvid_v2.fits'::regclass, 'alsvid_v2.portal_account_reviews'::regclass,
      'alsvid_v2.portal_vehicle_access'::regclass, 'alsvid_v2.schema_migrations'::regclass,
      'alsvid_v2.warehouse_stock'::regclass
    )
  ) THEN
    RAISE EXCEPTION 'referenced relation primary keys require separate review';
  END IF;
END;
$$;

ALTER TABLE alsvid_v2.app_sessions ADD COLUMN id uuid;
ALTER TABLE alsvid_v2.app_sessions ALTER COLUMN id SET DEFAULT alsvid_v2.generate_uuid_v7();
UPDATE alsvid_v2.app_sessions SET id=alsvid_v2.generate_uuid_v7() WHERE id IS NULL;
ALTER TABLE alsvid_v2.app_sessions
  ALTER COLUMN id SET NOT NULL,
  ADD CONSTRAINT app_sessions_id_uuid_v7 CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b')),
  ADD CONSTRAINT app_sessions_token_hash_unique UNIQUE (token_hash);
ALTER TABLE alsvid_v2.app_sessions DROP CONSTRAINT app_sessions_pkey;
ALTER TABLE alsvid_v2.app_sessions ADD CONSTRAINT app_sessions_pkey PRIMARY KEY (id);

ALTER TABLE alsvid_v2.schema_migrations ADD COLUMN id uuid;
ALTER TABLE alsvid_v2.schema_migrations ALTER COLUMN id SET DEFAULT alsvid_v2.generate_uuid_v7();
UPDATE alsvid_v2.schema_migrations SET id=alsvid_v2.generate_uuid_v7() WHERE id IS NULL;
ALTER TABLE alsvid_v2.schema_migrations
  ALTER COLUMN id SET NOT NULL,
  ADD CONSTRAINT schema_migrations_id_uuid_v7 CHECK (substring(id::text,15,1)='7' AND substring(id::text,20,1) IN ('8','9','a','b')),
  ADD CONSTRAINT schema_migrations_name_unique UNIQUE (name);
ALTER TABLE alsvid_v2.schema_migrations DROP CONSTRAINT schema_migrations_pkey;
ALTER TABLE alsvid_v2.schema_migrations ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (id);

ALTER TABLE alsvid_v2.catalog_publications ADD CONSTRAINT catalog_publications_legacy_product_unique UNIQUE (product_id);
ALTER TABLE alsvid_v2.catalog_publications DROP CONSTRAINT catalog_publications_pkey;
ALTER TABLE alsvid_v2.catalog_publications ADD CONSTRAINT catalog_publications_pkey PRIMARY KEY (product_uuid);

ALTER TABLE alsvid_v2.fits ADD CONSTRAINT fits_legacy_pair_unique UNIQUE (part_product_id,vehicle_product_id);
ALTER TABLE alsvid_v2.fits DROP CONSTRAINT fits_pkey;
ALTER TABLE alsvid_v2.fits ADD CONSTRAINT fits_pkey PRIMARY KEY (part_product_uuid,vehicle_product_uuid);

ALTER TABLE alsvid_v2.portal_account_reviews ADD CONSTRAINT portal_account_reviews_legacy_user_unique UNIQUE (user_id);
ALTER TABLE alsvid_v2.portal_account_reviews DROP CONSTRAINT portal_account_reviews_pkey;
ALTER TABLE alsvid_v2.portal_account_reviews ADD CONSTRAINT portal_account_reviews_pkey PRIMARY KEY (user_uuid);

ALTER TABLE alsvid_v2.portal_vehicle_access ADD CONSTRAINT portal_vehicle_access_legacy_request_unique UNIQUE (request_id);
ALTER TABLE alsvid_v2.portal_vehicle_access DROP CONSTRAINT portal_vehicle_access_pkey;
ALTER TABLE alsvid_v2.portal_vehicle_access ADD CONSTRAINT portal_vehicle_access_pkey PRIMARY KEY (request_uuid);

ALTER TABLE alsvid_v2.warehouse_stock ADD CONSTRAINT warehouse_stock_legacy_pair_unique UNIQUE (warehouse_id,sku_code);
ALTER TABLE alsvid_v2.warehouse_stock DROP CONSTRAINT warehouse_stock_pkey;
ALTER TABLE alsvid_v2.warehouse_stock ADD CONSTRAINT warehouse_stock_pkey PRIMARY KEY (warehouse_uuid,sku_uuid);

COMMIT;
