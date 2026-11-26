import type { Metadata } from 'next';
import Link from 'next/link';
import { CollectionCards } from '@/components/collection-cards';
import { CmsBlocks } from '@/components/cms-blocks';
import { getCmsPage, getCmsProductTemplate, getProductTemplateReviewPreview, getProducts, siteUrl, type Locale } from '@/lib/alsvid-api';
import { UI } from '@/lib/ui-text';
import { ProductTemplateReviewConfirm } from '@/components/product-template-review-confirm';

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
const accessoriesCopy={zh:'配件与增值服务',en:'Accessories and services',de:'Zubehör und Services'} as Record<Locale,string>;

export default async function EbikeListing({ params, searchParams }: { params: Promise<{ locale: Locale }>; searchParams: Promise<{ cat?: string;q?:string;reviewToken?:string;parent?:string }> }) {
  const { locale } = await params;
  const { cat,q,reviewToken,parent } = await searchParams;
  const page=await getCmsPage(locale,'/e-bikes');
  // 版式来自「店铺装修-产品」的 catalogLayout：分类导航 + 按销量自动展示；未装修时维持系统默认渲染。
  const reviewPreview = reviewToken && parent ? await getProductTemplateReviewPreview(locale, '', reviewToken) : null;
  const template = reviewPreview?.template ?? await getCmsProductTemplate(locale);
  const catalogLayout = template?.catalogLayout || null;
  const allProducts = await getProducts(locale, catalogLayout?.sort === 'sales' ? 'sales' : undefined);
  const products = allProducts.filter(product => product.kind === 'vehicle');
  const accessories = allProducts.filter(product => product.kind === 'part' && catalogLayout?.partProductIds?.includes(product.productId));
  const services = (catalogLayout?.services || []).filter(item => item.enabled);
  const categories = (catalogLayout?.categories || []).filter(category => category.productIds.length);
  const activeIndex = Number(cat);
  const active = Number.isInteger(activeIndex) && activeIndex >= 0 && activeIndex < categories.length ? activeIndex : -1;
  const shown = active >= 0 ? products.filter(product => categories[active].productIds.includes(product.productId)) : products;
  const href = (index: number) => `/${locale}/e-bikes${index >= 0 ? `?cat=${index}` : ''}`;
  return <main className="container catalog">
    <p className="eyebrow">ALSVID / E-BIKES</p>
    <h1>{UI.catalogTitle[locale]}</h1>
    <nav className="catalog-category-nav" aria-label="产品分类" data-module-id="ALSVID-L01">
      <Link href={href(-1)} className={active < 0 ? 'is-active' : ''}>{navCopy[locale].all}</Link>
      {categories.map((category, index) => <Link key={`${category.name}-${index}`} href={href(index)} className={active === index ? 'is-active' : ''}>{category.name}</Link>)}
      {accessories.length>0&&<Link href="#ALSVID-L03">{accessoriesCopy[locale]}</Link>}
      {services.length>0&&<Link href="#ALSVID-L04">{locale==='zh'?'服务':locale==='en'?'Services':'Service'}</Link>}
    </nav>
    <CmsBlocks blocks={(page?.blocks||[]).filter(block=>block.componentKey!=='faq'&&block.componentKey!=='productGallery')} locale={locale}/>
    <div data-module-id="ALSVID-L02"><CollectionCards products={shown} locale={locale} initialSearch={q||''}/></div>
    {accessories.length>0&&<section id="ALSVID-L03" className="container" data-module-id="ALSVID-L03"><h2>{accessoriesCopy[locale]}</h2><CollectionCards products={accessories} locale={locale} allowCompare={false} productType="part"/></section>}
    {services.length>0&&<section id="ALSVID-L04" className="container listing-services" data-module-id="ALSVID-L04"><h2>{locale==='zh'?'服务与支持':locale==='en'?'Service and support':'Service und Support'}</h2><div className="listing-services__grid">{services.map(item=><article key={item.key}><h3>{item.title}</h3><p>{item.description}</p><Link href={`/${locale}/${item.key==='test-ride'?'test-ride':'account/service'}`}>{item.buttonText} →</Link></article>)}</div></section>}
    <CmsBlocks blocks={(page?.blocks||[]).filter(block=>block.componentKey==='faq')} locale={locale}/>
    {categories.length > 0 && active >= 0 && !shown.length && <p className="catalog-category-empty">{navCopy[locale].all === '全部产品' ? '该分类下暂无已发布产品。' : locale==='de'?'Noch keine veröffentlichten Produkte in dieser Kategorie.':'No published products in this category yet.'}</p>}
    {reviewPreview && parent && <ProductTemplateReviewConfirm {...reviewPreview} parentOrigin={parent}/>}
  </main>;
}
