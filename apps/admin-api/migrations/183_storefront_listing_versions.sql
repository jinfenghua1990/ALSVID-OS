-- 183: append-only publication history; preserve existing live content as baseline.
BEGIN;
CREATE TABLE IF NOT EXISTS alsvid_v2.storefront_listing_versions (
 listing_id uuid NOT NULL REFERENCES alsvid_v2.storefront_listings(id),
 revision integer NOT NULL CHECK (revision>0),
 action text NOT NULL CHECK (action IN ('baseline','publish','unpublish','rollback')),
 document jsonb NOT NULL CHECK (jsonb_typeof(document)='object'),
 channel text NOT NULL,
 slug text NOT NULL,
 sku_prices jsonb NOT NULL CHECK (jsonb_typeof(sku_prices)='array'),
 actor text NOT NULL,
 source_revision integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(listing_id,revision),
 FOREIGN KEY(listing_id,source_revision) REFERENCES alsvid_v2.storefront_listing_versions(listing_id,revision)
);
INSERT INTO alsvid_v2.storefront_listing_versions(listing_id,revision,action,document,channel,slug,sku_prices,actor,created_at)
SELECT l.id,l.published_revision,'baseline',l.published,l.channel,l.slug,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('sku',s.code,'prices',COALESCE((SELECT jsonb_agg(jsonb_build_object('currency',p.currency,'unitPrice',p.unit_price::text,'published',p.published) ORDER BY p.currency) FROM alsvid_v2.storefront_listing_prices p WHERE p.listing_id=l.id AND p.sku_uuid=s.entity_uuid),'[]'::jsonb)) ORDER BY s.code) FROM alsvid_v2.storefront_listing_skus ls JOIN alsvid_v2.skus s ON s.entity_uuid=ls.sku_uuid WHERE ls.listing_id=l.id),'[]'::jsonb),
 'migration-183',l.updated_at
FROM alsvid_v2.storefront_listings l WHERE l.published IS NOT NULL AND l.published_revision>0
ON CONFLICT DO NOTHING;
COMMIT;
