import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CmsBlocks } from '@/components/cms-blocks';
import { CartActions } from '@/components/cart-actions';
import { ProductGallery } from '@/components/product-gallery';
import { absoluteApiUrl, getAvailability, getCmsProductTemplate, getOffers, getProduct, getReviews, publicApiUrl, publicAssetUrl, type Locale, type ProductModuleBanner, type ProductModuleCopy, siteUrl } from '@/lib/alsvid-api';
import { UI } from '@/lib/ui-text';

type Props = { params: Promise<{ locale: Locale; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const product = await getProduct(slug, locale);
  if (!product || product.kind !== 'vehicle') return { title: 'Product unavailable', robots: { index: false, follow: false } };
  return {
    title: product.title,
    description: product.description,
    alternates: {
      canonical: `${siteUrl}/${locale}/e-bikes/${encodeURIComponent(product.slug)}`,
      languages: { ...Object.fromEntries(product.languages.filter(code => ['de','en','zh'].includes(code)).map(code => [code, `${siteUrl}/${code}/e-bikes/${encodeURIComponent(product.slug)}`])), 'x-default': `${siteUrl}/de/e-bikes/${encodeURIComponent(product.slug)}` },
    },
    openGraph: { title: product.title, description: product.description, images: product.images.slice(0, 1).map(image => image.url) },
  };
}

export default async function ProductPage({ params }: Props) {
  const { locale, slug } = await params;
  const product = await getProduct(slug, locale);
  if (!product || product.kind !== 'vehicle') notFound();
  const [allOffers, availability, reviews, template] = await Promise.all([getOffers(product.slug, locale), getAvailability(product.slug, locale), getReviews(product.productId), getCmsProductTemplate(locale, product.productId)]);
  const offers = allOffers.filter(offer => offer.currency === 'EUR');
  const productLayout = template?.productLayout || { gallery: 'standard', specifications: 'list', reviews: 'list' };
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ProductGroup', '@id': `${siteUrl}/${locale}/e-bikes/${encodeURIComponent(product.slug)}#group`, productGroupID: product.slug,
        name: product.title, description: product.description, productGroupName: product.title, variesBy: ['https://schema.org/color', 'https://schema.org/additionalProperty'],
        brand: { '@type': 'Brand', name: 'ALSVID' }, model: product.model,
        image: product.images.map(item => absoluteApiUrl(item.url)),
        url: `${siteUrl}/${locale}/e-bikes/${encodeURIComponent(product.slug)}`,
        hasVariant: offers.map(offer => ({
          '@type': 'Product', name: `${product.title} ${offer.spec} ${offer.color}`.trim(), sku: offer.sku, color: offer.color, model: product.model,
          isVariantOf: { '@id': `${siteUrl}/${locale}/e-bikes/${encodeURIComponent(product.slug)}#group` },
          offers: { '@type': 'Offer', sku: offer.sku, priceCurrency: offer.currency, price: offer.unitPrice, url: `${siteUrl}/${locale}/e-bikes/${encodeURIComponent(product.slug)}`, ...(availability?.items?.find(item => item.sku === offer.sku) ? { availability: availability.items.find(item => item.sku === offer.sku)?.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' } : availability?.available === null || availability === null ? {} : { availability: availability.available ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' }) },
        })),
        ...(reviews?.counts.total ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: reviews.counts.average, reviewCount: reviews.counts.total } } : {}),
      },
      { '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: UI.home[locale], item: `${siteUrl}/${locale}` },
        { '@type': 'ListItem', position: 2, name: 'E-Bikes', item: `${siteUrl}/${locale}/e-bikes` },
        { '@type': 'ListItem', position: 3, name: product.title, item: `${siteUrl}/${locale}/e-bikes/${encodeURIComponent(product.slug)}` },
      ] },
    ],
  };
  const productContentKeys = new Set(['twoColumn', 'video', 'specs', 'features', 'faq', 'cta']);
  const templateBlocks = template?.blocks.filter(block => block.visible !== false && productContentKeys.has(block.componentKey)) || [];
  const hasSpecsModule = templateBlocks.some(block => block.componentKey === 'specs');
  // 详情页 8 模块（顺序固定）：①主图+SKU（上方数据驱动区）②营销 ③④预留（空则隐藏）⑤图文详情 ⑥评价 ⑦退换货 ⑧其他。
  const modules = template?.modules;
  const banners = ([
    { key: 'marketing', banner: modules?.marketing },
    { key: 'reserved3', banner: modules?.reserved3 },
    { key: 'reserved4', banner: modules?.reserved4 },
  ] as { key: string; banner: ProductModuleBanner | undefined }[]).filter((row): row is { key: string; banner: ProductModuleBanner } => !!row.banner?.enabled && !!(row.banner.imageId || row.banner.title || row.banner.description || row.banner.text || row.banner.href));
  const detailBlocks = (product.detailBlocks || []).filter(block => (block.type === 'image' && block.url) || (block.type === 'text' && block.text));
  const reviewsConfig = modules?.reviews || { enabled: true, limit: 20, style: 'list' };
  const copyModules = [modules?.returns, modules?.other].filter((row): row is ProductModuleCopy => !!row?.enabled && !!(row.title || row.body));
  const bannerHref = (href: string) => href.replace(/^\/www\/(de|en|zh)\/products(?:\/|$)/, (_, lang: string) => `/${lang}/e-bikes/`);
  return (
    <main className="container product-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}></script>
      <div className="product-layout">
        <ProductGallery key={product.productId} images={product.images} title={product.title} locale={locale} style={productLayout.gallery} />
        <section>
          <p className="eyebrow">ALSVID / {product.model}</p>
          <h1>{product.title}</h1>
          <p className="lede">{product.description}</p>
          <p>{UI.availableConfigurations[locale]}</p>
          {offers.length ? <ul className="spec-list">{offers.map(offer => <li key={`${offer.sku}-${offer.currency}`}><span>{offer.sku}</span><strong>{offer.currency} {offer.unitPrice}</strong></li>)}</ul> : <p>{UI.priceOnRequest[locale]}</p>}
          <CartActions locale={locale} productId={product.productId} offers={offers} />
          <p className="availability">{availability?.available === null || !availability ? (UI.availabilityUnknown[locale]) : availability.available ? (UI.inStockGermany[locale]) : (UI.outOfStock[locale])}</p>
          {!hasSpecsModule && <>
            <h2>{UI.specifications[locale]}</h2>
            {productLayout.specifications === 'table' ? <table className="product-spec-table"><tbody>{product.specifications.map(row => <tr key={row.label}><th>{row.label}</th><td>{row.value}</td></tr>)}</tbody></table> : productLayout.specifications === 'accordion' ? <details className="product-spec-accordion"><summary>{UI.showSpecifications[locale]}</summary><ul className="spec-list">{product.specifications.map(row => <li key={row.label}><span>{row.label}</span><strong>{row.value}</strong></li>)}</ul></details> : <ul className="spec-list">{product.specifications.map(row => <li key={row.label}><span>{row.label}</span><strong>{row.value}</strong></li>)}</ul>}
          </>}
          {product.delivery && <section className="product-business-module"><h2>{UI.delivery[locale]}</h2><p>{product.delivery}</p></section>}
          {product.warranty && <section className="product-business-module"><h2>{UI.warranty[locale]}</h2><p>{product.warranty}</p></section>}
        </section>
      </div>
      {banners.map(({ key, banner }) => <MarketingBlock key={key} name={key} banner={banner} alt={product.title} href={bannerHref(banner.href)}/>)}
      {detailBlocks.length > 0 && <section className="product-detail-blocks">
        <h2>{UI.detailDescription[locale]}</h2>
        {detailBlocks.map((block, index) => block.type === 'image'
          ? <img key={index} src={publicApiUrl(block.url!)} alt={block.alt || product.title} loading="lazy" />
          : <p key={index}>{block.text}</p>)}
      </section>}
      {templateBlocks.length > 0 && <CmsBlocks blocks={templateBlocks} locale={locale} />}
      {!!product.relatedAccessories?.length && <section className="product-related"><p className="eyebrow">{UI.relatedAccessories[locale]}</p><h2>{UI.fitsThisModel[locale]}</h2><div className="product-related__grid">{product.relatedAccessories.map(item => <a key={item.productId} href={`/${locale}/e-bikes/${encodeURIComponent(item.slug)}`}><div>{item.images[0] ? <img src={publicApiUrl(item.images[0].url)} alt={item.title} loading="lazy"/> : item.title}</div><strong>{item.title}</strong>{item.prices.length>0&&<small>{item.prices.map(price=>`${price.currency} ${price.unitPrice}`).join(' · ')}</small>}</a>)}</div></section>}
      {reviewsConfig.enabled && <section className={`reviews reviews--${productLayout.reviews}`}>
        <p className="eyebrow">{UI.reviews[locale]}</p>
        <h2>{reviews?.counts.total ? `${reviews.counts.average} / 5 · ${reviews.counts.total}` : UI.noReviews[locale]}</h2>
        {(reviews?.items || []).slice(0, reviewsConfig.limit).map(review => <article className="review" key={review.id}><strong>{'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)}</strong><p>{review.content}</p>{review.reply && <p className="review-reply">{UI.brandReply[locale]} {review.reply}</p>}</article>)}
      </section>}
      {copyModules.map((row, index) => <section className="product-business-module product-standard-module" key={`standard-${index}`}><h2>{row.title || (index === 0 ? UI.returns[locale] : UI.other[locale])}</h2><p>{row.body}</p></section>)}
    </main>
  );
}

// 公共模块里的营销组件：三种标准样式（横幅广告 / 图片+文案 / 促销信息条），与后台预览同一套规则
function MarketingBlock({ name, banner, alt, href }: { name: string; banner: ProductModuleBanner; alt: string; href: string }) {
  const theme = banner.theme || { background: 'none', spacing: 'normal', imageRatio: 'wide', buttonStyle: 'solid' };
  const cls = `product-mkt is-${banner.style} bg-${theme.background} sp-${theme.spacing} ratio-${theme.imageRatio}`;
  const title = banner.title || banner.text;
  const button = banner.buttonText && href ? <a className={`product-mkt__btn is-${theme.buttonStyle}`} href={href}>{banner.buttonText}</a> : null;
  const media = banner.imageId ? <img className="product-mkt__media" src={publicAssetUrl(banner.imageId)} alt={title || alt} loading="lazy" /> : null;
  if (banner.style === 'promoBar') return <section className={cls} data-module={name}>{title && <strong>{title}</strong>}{banner.description && <span>{banner.description}</span>}{button}</section>;
  return <section className={cls} data-module={name}>{media}{(title || banner.description || button) && <div className="product-mkt__copy">{title && <h2>{title}</h2>}{banner.description && <p>{banner.description}</p>}{button}</div>}</section>;
}
