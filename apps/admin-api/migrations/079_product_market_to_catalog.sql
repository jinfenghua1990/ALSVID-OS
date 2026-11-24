-- Preserve old product-level marketplace metadata in the marketplace record.
-- Existing public documents and product media are never overwritten.
ALTER TABLE alsvid_v2.catalog_publications
  ADD COLUMN IF NOT EXISTS legacy_product_market jsonb;

INSERT INTO alsvid_v2.catalog_publications(product_id, draft, revision, legacy_product_market)
SELECT p.id,
       jsonb_build_object(
         'model', '',
         'languages', jsonb_build_object('zh', jsonb_build_object(
           'title', p.name, 'description', '', 'specifications', '[]'::jsonb)),
         'mediaIds', '[]'::jsonb),
       1,
       p.specs->'_market'
FROM alsvid_v2.products p
WHERE p.kind = 'vehicle' AND p.specs ? '_market'
ON CONFLICT (product_id) DO UPDATE
SET legacy_product_market = EXCLUDED.legacy_product_market
WHERE alsvid_v2.catalog_publications.legacy_product_market IS NULL;

-- Refuse to remove the source if an existing archive differs.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM alsvid_v2.products p
    LEFT JOIN alsvid_v2.catalog_publications c ON c.product_id = p.id
    WHERE p.kind = 'vehicle' AND p.specs ? '_market'
      AND c.legacy_product_market IS DISTINCT FROM p.specs->'_market'
  ) THEN
    RAISE EXCEPTION 'Legacy marketplace data differs from its catalog archive';
  END IF;
END $$;

UPDATE alsvid_v2.products
SET specs = specs - '_market'
WHERE kind = 'vehicle' AND specs ? '_market';
