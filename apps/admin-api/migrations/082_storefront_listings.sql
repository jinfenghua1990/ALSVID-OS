-- A listing is a sales-channel document linked to one physical product.
-- Existing publication and offer rows remain available for compatibility and
-- audit while the default listing receives an exact copy of their contents.
CREATE TABLE IF NOT EXISTS alsvid_v2.storefront_listings (
  id uuid PRIMARY KEY DEFAULT alsvid_v2.generate_uuid_v7(),
  product_uuid uuid NOT NULL REFERENCES alsvid_v2.products(entity_uuid),
  channel text NOT NULL DEFAULT 'website' CHECK (length(btrim(channel)) BETWEEN 1 AND 80),
  slug text NOT NULL DEFAULT '' CHECK (slug = '' OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_default boolean NOT NULL DEFAULT false,
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft)='object'),
  published jsonb CHECK (published IS NULL OR jsonb_typeof(published)='object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  published_revision integer,
  legacy_product_market jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS storefront_listings_default_product_unique
  ON alsvid_v2.storefront_listings(product_uuid) WHERE is_default;
CREATE UNIQUE INDEX IF NOT EXISTS storefront_listings_channel_slug_unique
  ON alsvid_v2.storefront_listings(channel,slug) WHERE slug <> '';
CREATE INDEX IF NOT EXISTS storefront_listings_product_idx
  ON alsvid_v2.storefront_listings(product_uuid,channel);

CREATE TABLE IF NOT EXISTS alsvid_v2.storefront_listing_skus (
  listing_id uuid NOT NULL REFERENCES alsvid_v2.storefront_listings(id),
  sku_uuid uuid NOT NULL REFERENCES alsvid_v2.skus(entity_uuid),
  PRIMARY KEY(listing_id,sku_uuid)
);
CREATE OR REPLACE FUNCTION alsvid_v2.validate_storefront_listing_sku()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM alsvid_v2.storefront_listings l
    JOIN alsvid_v2.skus s ON s.product_uuid=l.product_uuid
    WHERE l.id=NEW.listing_id AND s.entity_uuid=NEW.sku_uuid
  ) THEN
    RAISE EXCEPTION 'Listing SKU must belong to the linked product' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER storefront_listing_sku_product_guard
BEFORE INSERT OR UPDATE ON alsvid_v2.storefront_listing_skus
FOR EACH ROW EXECUTE FUNCTION alsvid_v2.validate_storefront_listing_sku();
CREATE TABLE IF NOT EXISTS alsvid_v2.storefront_listing_prices (
  listing_id uuid NOT NULL,
  sku_uuid uuid NOT NULL,
  currency text NOT NULL CHECK(currency IN ('EUR','CNY')),
  unit_price numeric(14,2) NOT NULL CHECK(unit_price BETWEEN 0 AND 100000000),
  published boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK(revision > 0),
  PRIMARY KEY(listing_id,sku_uuid,currency),
  FOREIGN KEY(listing_id,sku_uuid) REFERENCES alsvid_v2.storefront_listing_skus(listing_id,sku_uuid)
);

INSERT INTO alsvid_v2.storefront_listings
  (id,product_uuid,channel,is_default,draft,published,revision,published_revision,legacy_product_market)
SELECT c.product_uuid,c.product_uuid,'website',true,c.draft,c.published,c.revision,c.published_revision,c.legacy_product_market
FROM alsvid_v2.catalog_publications c
ON CONFLICT (id) DO NOTHING;

INSERT INTO alsvid_v2.storefront_listing_skus(listing_id,sku_uuid)
SELECT l.id,s.entity_uuid FROM alsvid_v2.storefront_listings l
JOIN alsvid_v2.skus s ON s.product_uuid=l.product_uuid
WHERE l.is_default
ON CONFLICT DO NOTHING;

INSERT INTO alsvid_v2.storefront_listing_prices(listing_id,sku_uuid,currency,unit_price,published,revision)
SELECT ls.listing_id,o.sku_uuid,o.currency,o.unit_price,o.published,o.revision
FROM alsvid_v2.storefront_listing_skus ls
JOIN alsvid_v2.storefront_offers o ON o.sku_uuid=ls.sku_uuid
JOIN alsvid_v2.storefront_listings l ON l.id=ls.listing_id AND l.is_default
ON CONFLICT DO NOTHING;
