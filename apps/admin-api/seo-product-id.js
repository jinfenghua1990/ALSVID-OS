'use strict';

// SEO 商品 ID = 主市场 URL Slug，也是商城商品页唯一的业务识别入口。
// 规范见 docs/ALSVID-商品与SEO命名规范.md。
//
// 唯一真源是产品主档 products.specs._seoProductId（产品编辑页维护）。
// 商品装修页不再单独定义 URL，避免「产品页写一个、装修页写另一个」的分叉。
// 本模块负责三件事，保证「产品页改一次，商城 URL 全链路跟着变」：
//   1) 格式校验：只允许小写字母、数字和单个短横线；禁止把 SKU 编码当 SEO ID；
//   2) 全局唯一：一个 SEO 商品 ID 只能属于一个产品；
//   3) 同步：把新值写到该产品所有渠道的商品记录上（slug + document.seo.slug，含已发布版本）。

const FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// 早期遗留：有的产品把 SKU 编码（A1-STD-PUR-EUR）写进了这个字段。
// 这类值不能当 URL（规范明确 SKU 不进 SEO ID），必须让运营改掉，不能静默沿用到 slug。
const LEGACY_SKU_LIKE = /^[a-z][0-9]+-(?:std|ult|pro)-[a-z0-9]+-[a-z0-9]+$/;
const MAX_LENGTH = 80;

const bad = message => Object.assign(new Error(message), { statusCode: 400 });

function normalizeSeoProductId(value) {
  return String(value ?? '').trim().toLowerCase();
}

/** 校验并返回规范化后的值。空值合法（表示尚未确定），返回 ''。 */
function assertSeoProductId(value) {
  const seo = normalizeSeoProductId(value);
  if (!seo) return '';
  if (seo.length > MAX_LENGTH) throw bad(`SEO 商品 ID 不能超过 ${MAX_LENGTH} 个字符`);
  if (LEGACY_SKU_LIKE.test(seo)) throw bad('SEO 商品 ID 不能使用 SKU 编码（如 A1-STD-PUR-EUR），应使用品类词-属性-型号');
  if (!FORMAT.test(seo)) throw bad('SEO 商品 ID 只能包含小写字母、数字和单个短横线，且不能以短横线开头或结尾');
  return seo;
}

/** 同一 SEO 商品 ID 只能对应一个产品（规范：同一市场、同一语言下必须唯一）。 */
async function assertSeoProductIdUnique(client, seo, productId) {
  if (!seo) return;
  const row = (await client.query(
    "SELECT id,name FROM products WHERE BTRIM(LOWER(specs->>'_seoProductId'))=$1 AND id<>$2 LIMIT 1",
    [seo, String(productId || '')],
  )).rows[0];
  if (row) throw bad(`SEO 商品 ID「${seo}」已被产品「${row.name}」（${row.id}）占用`);
}

/** 产品已有商城记录时不允许清空 SEO 商品 ID：否则线上 URL 会指向一个不存在的标识。 */
async function assertSeoProductIdRemovable(client, productUuid, seo) {
  if (seo) return;
  const used = await client.query('SELECT 1 FROM storefront_listings WHERE product_uuid=$1 LIMIT 1', [productUuid]);
  if (used.rowCount) throw bad('该产品的 SEO 商品 ID 已用于商城链接，不能清空；如需更换请填写新值');
}

/** 把 SEO 商品 ID 同步到该产品所有渠道的商品记录。
 *
 * 同时改写三处，缺一处就会出现「URL 变了但 canonical/sitemap 还是旧的」：
 *   slug（决定 /xx/e-bikes/{slug} 路由）、draft.seo.slug、published.seo.slug（决定 canonical / hreflang）。
 * 已发布记录同步维护 revision 与 published_revision 的差值，避免后台把「地址变更」误判成未保存草稿。
 * 返回被改写的记录数；没有变化时不写库、不产生噪音版本。
 *
 * 注意：不能用 jsonb_set(doc,'{seo,slug}',…) —— 它只创建末级键，seo 对象不存在时整条更新会静默失效。
 * 这里显式构造 seo 对象：缺失就新建，已存在则合并（保留 title/description 等同级字段）。
 */
async function syncListingSeoId(client, productUuid, seo) {
  if (!productUuid || !seo) return 0;
  const result = await client.query(`
    UPDATE storefront_listings
       SET slug = $2,
           draft = jsonb_set(draft, '{seo}',
                             COALESCE(draft->'seo', '{}'::jsonb) || jsonb_build_object('slug', $2::text), true),
           published = CASE WHEN published IS NULL THEN NULL
                            ELSE jsonb_set(published, '{seo}',
                                           COALESCE(published->'seo', '{}'::jsonb) || jsonb_build_object('slug', $2::text), true) END,
           revision = revision + 1,
           published_revision = CASE WHEN published IS NULL THEN published_revision ELSE published_revision + 1 END,
           updated_at = now()
     WHERE product_uuid = $1
       AND (slug IS DISTINCT FROM $2
            OR draft->'seo'->>'slug' IS DISTINCT FROM $2
            OR (published IS NOT NULL AND published->'seo'->>'slug' IS DISTINCT FROM $2))
     RETURNING id`, [productUuid, seo]);
  if (result.rowCount) {
    const { currentActor } = require('./audit-context');
    await client.query('INSERT INTO audit_log(actor,action,target,after_json) VALUES($1,$2,$3,$4)', [
      currentActor(), 'listing.seo-sync', `storefront-listings/${productUuid}`,
      JSON.stringify({ seo, listings: result.rowCount }),
    ]);
  }
  return result.rowCount;
}

module.exports = {
  MAX_LENGTH, FORMAT, LEGACY_SKU_LIKE,
  normalizeSeoProductId, assertSeoProductId, assertSeoProductIdUnique,
  assertSeoProductIdRemovable, syncListingSeoId,
};
