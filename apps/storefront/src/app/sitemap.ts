import type { MetadataRoute } from 'next';
import { getCmsSitemap, getProducts, type Locale, siteUrl } from '@/lib/alsvid-api';

const LOCALES: Locale[] = ['de', 'en', 'zh'];

// 三语 sitemap：默认语言德语，x-default 指向德语。
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [catalogs, pages] = await Promise.all([
    Promise.all(LOCALES.map(async (locale) => [locale, await getProducts(locale)] as const)),
    getCmsSitemap(),
  ]);

  const homeLanguages = Object.fromEntries(LOCALES.map((code) => [code, `${siteUrl}/${code}`]));
  const urls: MetadataRoute.Sitemap = LOCALES.map((code) => ({
    url: `${siteUrl}/${code}`,
    alternates: { languages: { ...homeLanguages, 'x-default': `${siteUrl}/de` } },
  }));

  // 商品：同一 slug 在各语言下的可用性以 catalog 返回为准
  const bySlug = new Map<string, Set<Locale>>();
  for (const [locale, products] of catalogs) {
    for (const product of products.filter((item) => item.kind === 'vehicle')) {
      const entry = bySlug.get(product.slug) || new Set<Locale>();
      entry.add(locale);
      bySlug.set(product.slug, entry);
    }
  }
  for (const [slug, languages] of bySlug) {
    const alternates = Object.fromEntries([...languages].map((code) => [code, `${siteUrl}/${code}/e-bikes/${encodeURIComponent(slug)}`]));
    for (const locale of languages) {
      urls.push({ url: `${siteUrl}/${locale}/e-bikes/${encodeURIComponent(slug)}`, alternates: { languages: alternates } });
    }
  }

  // CMS 页面：只为已发布的语言生成条目，alternates 仅包含同样存在的语言
  const available = new Set(pages.map((page) => `${page.locale}|${page.path}`));
  for (const page of pages) {
    if (!LOCALES.includes(page.locale as Locale)) continue;
    const path = page.path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
    const alternates = Object.fromEntries(
      LOCALES.filter((code) => available.has(`${code}|${page.path}`))
        .map((code) => [code, `${siteUrl}/${code}/${path}`]),
    );
    urls.push({ url: `${siteUrl}/${page.locale}/${path}`, alternates: { languages: alternates } });
  }

  return urls;
}
