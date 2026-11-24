const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
const { assertIsolatedTestDatabase } = require('./test-database');

test('product master migration archives legacy sales data without overwriting published content', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const url = assertIsolatedTestDatabase();
  const c = new Client({ connectionString: url.toString() });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query(`CREATE SCHEMA alsvid_v2;
      CREATE FUNCTION alsvid_v2.generate_uuid_v7() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
      CREATE TABLE alsvid_v2.products(id text PRIMARY KEY, entity_uuid uuid UNIQUE NOT NULL, kind text NOT NULL, name text NOT NULL, model text NOT NULL, specs jsonb NOT NULL DEFAULT '{}');
      CREATE TABLE alsvid_v2.skus(entity_uuid uuid PRIMARY KEY, product_uuid uuid NOT NULL REFERENCES alsvid_v2.products(entity_uuid), price numeric);
      CREATE TABLE alsvid_v2.catalog_publications(product_id text PRIMARY KEY REFERENCES alsvid_v2.products(id), product_uuid uuid, draft jsonb NOT NULL, published jsonb, revision integer NOT NULL,published_revision integer);
      CREATE FUNCTION alsvid_v2.fixture_catalog_identity() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN SELECT entity_uuid INTO NEW.product_uuid FROM alsvid_v2.products WHERE id=NEW.product_id; RETURN NEW; END $$;
      CREATE TRIGGER fixture_catalog_identity BEFORE INSERT OR UPDATE OF product_id ON alsvid_v2.catalog_publications FOR EACH ROW EXECUTE FUNCTION alsvid_v2.fixture_catalog_identity();
      CREATE TABLE alsvid_v2.storefront_offers(sku_uuid uuid NOT NULL REFERENCES alsvid_v2.skus(entity_uuid),currency text NOT NULL,unit_price numeric NOT NULL,published boolean NOT NULL,revision integer NOT NULL DEFAULT 1,UNIQUE(sku_uuid,currency));`);
    await c.query(`INSERT INTO alsvid_v2.products VALUES
      ('a','00000000-0000-4000-8000-000000000001','vehicle','A1','A1','{"_officialModelName":"ALSVID A1","_market":{"deTitle":"Werbetitel","seoSlug":"a1"},"motor":"250W"}'),
      ('b','00000000-0000-4000-8000-000000000002','vehicle','B1','B1','{}');
      INSERT INTO alsvid_v2.skus VALUES
      ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',1299),
      ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002',1499);
      INSERT INTO alsvid_v2.catalog_publications(product_id,draft,published,revision,published_revision) VALUES('a','{"existing":"draft"}','{"existing":"published"}',3,3);
      INSERT INTO alsvid_v2.storefront_offers(sku_uuid,currency,unit_price,published) VALUES('10000000-0000-4000-8000-000000000002','EUR',999,true);`);
    for (const name of ['077_vehicle_model_unique.sql','078_product_official_model_name.sql','079_product_market_to_catalog.sql','080_vehicle_sku_price_to_storefront.sql','081_product_versions.sql','082_storefront_listings.sql']) {
      await c.query(readFileSync(path.join(__dirname, '../migrations', name), 'utf8'));
    }
    const p = (await c.query("SELECT official_model_name,specs FROM alsvid_v2.products WHERE id='a'")).rows[0];
    assert.equal(p.official_model_name, 'ALSVID A1');
    assert.deepEqual(p.specs, { motor: '250W' });
    const catalog = (await c.query("SELECT draft,published,legacy_product_market FROM alsvid_v2.catalog_publications WHERE product_id='a'")).rows[0];
    assert.deepEqual(catalog.draft, { existing: 'draft' });
    assert.deepEqual(catalog.published, { existing: 'published' });
    assert.deepEqual(catalog.legacy_product_market, { deTitle: 'Werbetitel', seoSlug: 'a1' });
    assert.equal((await c.query('SELECT count(*)::int n FROM alsvid_v2.legacy_vehicle_sku_prices')).rows[0].n, 2);
    assert.equal((await c.query("SELECT unit_price::text price FROM alsvid_v2.storefront_offers WHERE sku_uuid='10000000-0000-4000-8000-000000000002'")).rows[0].price, '999');
    assert.equal((await c.query('SELECT count(*)::int n FROM alsvid_v2.skus WHERE price IS NOT NULL')).rows[0].n, 0);
    const listing=(await c.query("SELECT id,product_uuid,draft,published,legacy_product_market FROM alsvid_v2.storefront_listings WHERE is_default")).rows[0];
    assert.deepEqual(listing.draft,{ existing:'draft' });
    assert.deepEqual(listing.published,{ existing:'published' });
    assert.deepEqual(listing.legacy_product_market,{ deTitle:'Werbetitel',seoSlug:'a1' });
    assert.equal((await c.query('SELECT unit_price::text price FROM alsvid_v2.storefront_listing_prices WHERE listing_id=$1',[listing.id])).rows[0].price,'1299.00');
    await c.query('SAVEPOINT wrong_listing_sku');
    await assert.rejects(c.query("INSERT INTO alsvid_v2.storefront_listing_skus(listing_id,sku_uuid) VALUES($1,'10000000-0000-4000-8000-000000000002')",[listing.id]), {code:'23514'});
    await c.query('ROLLBACK TO SAVEPOINT wrong_listing_sku');
    await c.query("INSERT INTO alsvid_v2.product_versions(product_uuid,label,snapshot,created_by) VALUES('00000000-0000-4000-8000-000000000001','V1.0','{\"name\":\"A1\"}','tester')");
    await c.query('SAVEPOINT immutable_check');
    await assert.rejects(c.query("UPDATE alsvid_v2.product_versions SET label='changed'"), { code: '23514' });
    await c.query('ROLLBACK TO SAVEPOINT immutable_check');
    await c.query('SAVEPOINT duplicate_check');
    await assert.rejects(c.query("INSERT INTO alsvid_v2.products(id,entity_uuid,kind,name,model) VALUES('c','00000000-0000-4000-8000-000000000003','vehicle','Duplicate','a1')"), { code: '23505' });
    await c.query('ROLLBACK TO SAVEPOINT duplicate_check');
  } finally { await c.query('ROLLBACK').catch(() => {}); await c.end(); }
});

test('duplicate model preflight aborts without rewriting historic codes', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const url = assertIsolatedTestDatabase();
  const c = new Client({ connectionString: url.toString() });
  await c.connect();
  try {
    await c.query('BEGIN');
    await c.query("CREATE SCHEMA alsvid_v2; CREATE TABLE alsvid_v2.products(id text,kind text,model text); INSERT INTO alsvid_v2.products VALUES('a','vehicle','A1'),('b','vehicle','a1')");
    await c.query('SAVEPOINT preflight');
    await assert.rejects(c.query(readFileSync(path.join(__dirname, '../migrations/077_vehicle_model_unique.sql'), 'utf8')), /Duplicate vehicle model codes/);
    await c.query('ROLLBACK TO SAVEPOINT preflight');
    assert.deepEqual((await c.query('SELECT model FROM alsvid_v2.products ORDER BY id')).rows.map(row=>row.model), ['A1','a1']);
  } finally { await c.query('ROLLBACK').catch(() => {}); await c.end(); }
});
