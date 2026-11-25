import type { Metadata } from 'next';
import Link from 'next/link';
import { CollectionCards } from '@/components/collection-cards';
import { CmsBlocks } from '@/components/cms-blocks';
import { getCmsPage, getCmsProductTemplate, getProducts, siteUrl, type Locale } from '@/lib/alsvid-api';
import { UI } from '@/lib/ui-text';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const page=await getCmsPage(locale,'/e-bikes');
  return { title: page?.seo.title||page?.name||'E-Bikes',description:page?.seo.description, alternates: { canonical: `${siteUrl}/${locale}/e-bikes`, languages: { de: `${siteUrl}/de/e-bikes`, en: `${siteUrl}/en/e-bikes`, zh: `${siteUrl}/zh/e-bikes`, 'x-default': `${siteUrl}/de/e-bikes` } } };
}

const navCopy = {
  zh: { all: '全部产品' },
  en: { all: 'All products' },
  de: { all: 'Alle Produkte' },
} as Record<Locale, { all: string }>;

export default async function EbikeListing({ params, searchParams }: { params: Promise<{ locale: Locale }>; searchParams: Promise<{ cat?: string;q?:string }> }) {
  const { locale } = await params;
  const { cat,q } = await searchParams;
  const page=await getCmsPage(locale,'/e-bikes');
  // 版式来自「店铺装修-产品」的 catalogLayout：分类导航 + 按销量自动展示；未装修时维持系统默认渲染。
  const template = await getCmsProductTemplate(locale);
  const catalogLayout = template?.catalogLayout || null;
  const products = (await getProducts(locale, catalogLayout?.sort === 'sales' ? 'sales' : undefined)).filter(product => product.kind === 'vehicle');
  const categories = (catalogLayout?.categories || []).filter(category => category.productIds.length);
  const activeIndex = Number(cat);
  const active = Number.isInteger(activeIndex) && activeIndex >= 0 && activeIndex < categories.length ? activeIndex : -1;
  const shown = active >= 0 ? products.filter(product => categories[active].productIds.includes(product.productId)) : products;
  const href = (index: number) => `/${locale}/e-bikes${index >= 0 ? `?cat=${index}` : ''}`;
  return <main className="container catalog">
    <p className="eyebrow">ALSVID / E-BIKES</p>
    <h1>{UI.catalogTitle[locale]}</h1>
    {categories.length > 0 && <nav className="catalog-category-nav" aria-label="产品分类">
      <Link href={href(-1)} className={active < 0 ? 'is-active' : ''}>{navCopy[locale].all}</Link>
      {categories.map((category, index) => <Link key={`${category.name}-${index}`} href={href(index)} className={active === index ? 'is-active' : ''}>{category.name}</Link>)}
    </nav>}
    <CmsBlocks blocks={(page?.blocks||[]).filter(block=>block.componentKey!=='faq'&&block.componentKey!=='productGallery')} locale={locale}/>
    <CollectionCards products={shown} locale={locale} initialSearch={q||''}/>
    <CmsBlocks blocks={(page?.blocks||[]).filter(block=>block.componentKey==='faq')} locale={locale}/>
    {categories.length > 0 && active >= 0 && !shown.length && <p className="catalog-category-empty">{navCopy[locale].all === '全部产品' ? '该分类下暂无已发布产品。' : locale==='de'?'Noch keine veröffentlichten Produkte in dieser Kategorie.':'No published products in this category yet.'}</p>}
  </main>;
}
