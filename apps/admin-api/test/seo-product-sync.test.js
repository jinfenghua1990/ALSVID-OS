'use strict';
// 依赖隔离数据库：验证「产品页改 SEO 商品 ID → 各渠道 listing 的 URL 跟着改」这条链路。
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { syncListingSeoId } = require('../seo-product-id');
const { assertIsolatedTestDatabase } = require('./test-database');

// storefront_listings 由 migrations/082 引入，不在 schema.sql 里：这里按同样的约束补建。
const LISTINGS_DDL = `
CREATE TABLE IF NOT EXISTS alsvid_v2.storefront_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_uuid uuid NOT NULL REFERENCES alsvid_v2.products(entity_uuid),
  channel text NOT NULL DEFAULT 'website' CHECK (length(btrim(channel)) BETWEEN 1 AND 80),
  slug text NOT NULL DEFAULT '' CHECK (slug = '' OR slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  is_default boolean NOT NULL DEFAULT false,
  draft jsonb NOT NULL CHECK (jsonb_typeof(draft)='object'),
  published jsonb CHECK (published IS NULL OR jsonb_typeof(published)='object'),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  published_revision integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS storefront_listings_channel_slug_unique
  ON alsvid_v2.storefront_listings(channel,slug) WHERE slug <> '';
`;

test('改 SEO 商品 ID 会同步所有渠道的 URL，且不影响草稿/发布版本关系', async t => {
  const client = new Client({ connectionString: assertIsolatedTestDatabase().toString() });
  await client.connect();
  t.after(async () => client.end());
  await client.query(readFileSync(path.join(__dirname, '../schema.sql'), 'utf8'));
  await client.query(LISTINGS_DDL);
  await client.query('SET search_path TO alsvid_v2');

  const product = (await client.query(
    "INSERT INTO products(id,kind,name,product_type,ownership,specs) VALUES('seo-product','vehicle','Bike','EBI','SE','{\"_seoProductId\":\"carbon-e-bike-klapprad-a1\"}'::jsonb) RETURNING entity_uuid",
  )).rows[0];
  const uuid = product.entity_uuid;
  await client.query(`INSERT INTO storefront_listings(product_uuid,channel,slug,is_default,draft,published,revision,published_revision) VALUES
    ($1,'website','carbon-e-bike-klapprad-a1',true,
      '{"seo":{"slug":"carbon-e-bike-klapprad-a1","title":"20 Zoll Carbon E-Bike"}}'::jsonb,
      '{"seo":{"slug":"carbon-e-bike-klapprad-a1","title":"20 Zoll Carbon E-Bike"}}'::jsonb, 3, 2),
    ($1,'official','carbon-e-bike-klapprad-a1',false,
      '{"seo":{"slug":"carbon-e-bike-klapprad-a1"}}'::jsonb, NULL, 1, NULL)`, [uuid]);

  assert.equal(await syncListingSeoId(client, uuid, 'carbon-e-bike-klapprad-a1-neu'), 2, '两个渠道都应被改写');

  const rows = (await client.query(
    `SELECT channel,slug,revision,published_revision,
            draft->'seo'->>'slug' AS draft_slug, draft->'seo'->>'title' AS draft_title,
            published->'seo'->>'slug' AS published_slug
       FROM storefront_listings ORDER BY channel`,
  )).rows;
  const website = rows.find(row => row.channel === 'website');
  assert.equal(website.slug, 'carbon-e-bike-klapprad-a1-neu');
  assert.equal(website.draft_slug, 'carbon-e-bike-klapprad-a1-neu');
  assert.equal(website.published_slug, 'carbon-e-bike-klapprad-a1-neu', 'canonical 读发布版本，必须一起改');
  assert.equal(website.draft_title, '20 Zoll Carbon E-Bike', '合并 seo 对象时不能冲掉标题');
  assert.equal(website.revision, 4);
  assert.equal(website.published_revision, 3, '草稿与发布版本的差值要保持，否则后台会误报有未保存草稿');
  assert.equal(rows.find(row => row.channel === 'official').slug, 'carbon-e-bike-klapprad-a1-neu');

  // 幂等：值没变就不该再产生新版本
  assert.equal(await syncListingSeoId(client, uuid, 'carbon-e-bike-klapprad-a1-neu'), 0);

  const audit = (await client.query("SELECT after_json FROM audit_log WHERE action='listing.seo-sync'")).rows[0];
  assert.deepEqual(audit.after_json, { seo: 'carbon-e-bike-klapprad-a1-neu', listings: 2 });
});
