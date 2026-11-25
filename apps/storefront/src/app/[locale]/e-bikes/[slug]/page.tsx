import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CmsBlocks } from '@/components/cms-blocks';
import { CartActions } from '@/components/cart-actions';
import { ProductGallery } from '@/components/product-gallery';
import { ProductPageNav } from '@/components/product-page-nav';
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
  const productContentKeys = new Set(['hero', 'twoColumn', 'image', 'carousel', 'divider', 'spacer', 'video', 'features', 'faq', 'cta', 'comparison', 'reviews', 'accessories', 'manuals']);
  const templateBlocks = template?.blocks.filter(block => block.visible !== false && productContentKeys.has(block.componentKey)) || [];
  const specsModule = template?.blocks.find(block => block.componentKey === 'specs' && block.visible !== false);
  // 规格仍在原来的固定业务区，优先读取模板主档参数绑定；若未配置或过渡期，平滑回退至商品原规格
  const rawSpecs = (specsModule?.data?.specifications && specsModule.data.specifications.length > 0)
    ? specsModule.data.specifications
    : (product.specifications || []);
  const specifications: { label: string; value: string }[] = rawSpecs.map((row: { label: string; value: string; unit?: string }) => ({
    label: row.label,
    value: row.value + (row.unit && !String(row.value).trim().endsWith(row.unit.trim()) ? ' ' + row.unit : '')
  }));
  // 详情页 8 模块（顺序固定）：①主图+SKU（上方数据驱动区）②营销 ③④预留（空则隐藏）⑤图文详情 ⑥评价 ⑦退换货 ⑧其他。
  const modules = template?.modules;
  const banners = ([
    { key: 'marketing', banner: modules?.marketing },
    { key: 'reserved4', banner: modules?.reserved4 },
  ] as { key: string; banner: ProductModuleBanner | undefined }[]).filter((row): row is { key: string; banner: ProductModuleBanner } => !!row.banner?.enabled && !!(row.banner.imageId || row.banner.title || row.banner.description || row.banner.text || row.banner.href));
  const detailBlocks = (product.detailBlocks || []).filter(block => (block.type === 'image' && block.url) || (block.type === 'text' && block.text));
  const reviewsConfig = modules?.reviews || { enabled: true, limit: 20, style: 'list' };
  const copyModules = [{key:'returns',id:'ALSVID-P07',row:modules?.returns},{key:'other',id:'ALSVID-P08',row:modules?.other}].filter((entry):entry is {key:string;id:string;row:ProductModuleCopy}=>!!entry.row?.enabled&&!!(entry.row.title||entry.row.body));
  const bannerHref = (href: string) => href.replace(/^\/www\/(de|en|zh)\/products(?:\/|$)/, (_, lang: string) => `/${lang}/e-bikes/`);
  return (
    <main className="container product-page product-page--with-nav" data-product-id={product.productId} data-product-slug={product.slug}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}></script>
      <ProductPageNav locale={locale} model={product.model||product.title} hasSpecs={specifications.length>0} hasVideo={templateBlocks.some(block=>block.componentKey==='video' && !!block.data?.videoUrl)} hasDownloads={templateBlocks.some(block=>block.componentKey==='manuals' && !!block.data?.manuals?.length)} />
      <div className="product-layout" id="product-overview" data-module-id="ALSVID-P01" data-module="info">
        <ProductGallery key={product.productId} productId={product.productId} images={product.images} title={product.title} locale={locale} style={productLayout.gallery} />
        <section>
          <p className="eyebrow">ALSVID / {product.model}</p>
          <h1>{product.title}</h1>
          <p className="lede">{product.description}</p>
          <p>{UI.availableConfigurations[locale]}</p>
          {offers.length ? <ul className="spec-list">{offers.map(offer => <li key={`${offer.sku}-${offer.currency}`}><span>{offer.sku}</span><strong>{offer.currency} {offer.unitPrice}</strong></li>)}</ul> : <p>{UI.priceOnRequest[locale]}</p>}
          <div id="product-purchase"><CartActions locale={locale} productId={product.productId} offers={offers} /></div>
          <p className="availability">{availability?.available === null || !availability ? (UI.availabilityUnknown[locale]) : availability.available ? (UI.inStockGermany[locale]) : (UI.outOfStock[locale])}</p>
          {specifications.length > 0 && <div id="product-specifications">
            <h2>{UI.specifications[locale]}</h2>
            {productLayout.specifications === 'table' ? <table className="product-spec-table"><tbody>{specifications.map(row => <tr key={row.label}><th>{row.label}</th><td>{row.value}</td></tr>)}</tbody></table> : productLayout.specifications === 'accordion' ? <details className="product-spec-accordion"><summary>{UI.showSpecifications[locale]}</summary><ul className="spec-list">{specifications.map(row => <li key={row.label}><span>{row.label}</span><strong>{row.value}</strong></li>)}</ul></details> : <ul className="spec-list">{specifications.map(row => <li key={row.label}><span>{row.label}</span><strong>{row.value}</strong></li>)}</ul>}
          </div>}
          {product.delivery && <section className="product-business-module"><h2>{UI.delivery[locale]}</h2><p>{product.delivery}</p></section>}
          {product.warranty && <section className="product-business-module"><h2>{UI.warranty[locale]}</h2><p>{product.warranty}</p></section>}
        </section>
      </div>
      {banners.filter(row=>row.key==='marketing').map(({ key, banner }) => <MarketingBlock key={key} name={key} banner={banner} alt={product.title} href={bannerHref(banner.href)}/>)} 
      <CorePerformance config={modules?.reserved3} parameters={template?.coreParameters || []}/>
      {banners.filter(row=>row.key!=='marketing').map(({ key, banner }) => <MarketingBlock key={key} name={key} banner={banner} alt={product.title} href={bannerHref(banner.href)}/>)} 
      {detailBlocks.length > 0 && <section className="product-detail-blocks" id="product-details" data-module-id="ALSVID-P05" data-module="detail">
        <h2>{UI.detailDescription[locale]}</h2>
        {detailBlocks.map((block, index) => block.type === 'image'
          ? <img key={index} src={publicApiUrl(block.url!)} alt={block.alt || product.title} loading="lazy" />
          : <p key={index}>{block.text}</p>)}
      </section>}
      {templateBlocks.map((block,index) => {
        const isVideo=block.componentKey==='video' && !!block.data?.videoUrl;
        const isDownload=block.componentKey==='manuals' && !!block.data?.manuals?.length;
        const firstVideo=isVideo && index===templateBlocks.findIndex(item=>item.componentKey==='video' && !!item.data?.videoUrl);
        const firstDownload=isDownload && index===templateBlocks.findIndex(item=>item.componentKey==='manuals' && !!item.data?.manuals?.length);
        const anchor=firstVideo?'product-video':firstDownload?'product-downloads':null;
        return anchor ? <div id={anchor} key={block.id}><CmsBlocks blocks={[block]} locale={locale}/></div> : <CmsBlocks key={block.id} blocks={[block]} locale={locale}/>;
      })}
      {!!product.relatedAccessories?.length && <section className="product-related"><p className="eyebrow">{UI.relatedAccessories[locale]}</p><h2>{UI.fitsThisModel[locale]}</h2><div className="product-related__grid">{product.relatedAccessories.map(item => <a key={item.productId} href={`/${locale}/e-bikes/${encodeURIComponent(item.slug)}`}><div>{item.images[0] ? <img src={publicApiUrl(item.images[0].url)} alt={item.title} loading="lazy"/> : item.title}</div><strong>{item.title}</strong>{item.prices.length>0&&<small>{item.prices.map(price=>`${price.currency} ${price.unitPrice}`).join(' · ')}</small>}</a>)}</div></section>}
      {reviewsConfig.enabled && <section className={`reviews reviews--${productLayout.reviews}`} id="product-reviews" data-module-id="ALSVID-P06" data-module="reviews">
        <p className="eyebrow">{UI.reviews[locale]}</p>
        <h2>{reviews?.counts.total ? `${reviews.counts.average} / 5 · ${reviews.counts.total}` : UI.noReviews[locale]}</h2>
        {(reviews?.items || []).slice(0, reviewsConfig.limit).map(review => <article className="review" key={review.id}><strong>{'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)}</strong><p>{review.content}</p>{review.reply && <p className="review-reply">{UI.brandReply[locale]} {review.reply}</p>}</article>)}
      </section>}
      {copyModules.map(({key,id,row}) => <section className="product-business-module product-standard-module" key={key} data-module-id={id} data-module={key}><h2>{row.title || (key==='returns'?UI.returns[locale]:UI.other[locale])}</h2><p>{row.body}</p></section>)}
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
  if (banner.style === 'promoBar') return <section className={cls} data-module={name} data-module-id={name==='marketing'?'ALSVID-P02':name==='reserved3'?'ALSVID-P03':'ALSVID-P04'}>{title && <strong>{title}</strong>}{banner.description && <span>{banner.description}</span>}{button}</section>;
  return <section className={cls} data-module={name} data-module-id={name==='marketing'?'ALSVID-P02':name==='reserved3'?'ALSVID-P03':'ALSVID-P04'}>{media}{(title || banner.description || button) && <div className="product-mkt__copy">{title && <h2>{title}</h2>}{banner.description && <p>{banner.description}</p>}{button}</div>}</section>;
}

function CorePerformance({config,parameters}:{config?:import('@/lib/alsvid-api').ProductTemplateModules['reserved3'];parameters:{code:string;label:string;value:string;unit?:string}[]}) {
  const image=config?.imageId?publicAssetUrl(config.imageId):undefined;
  const video=config?.videoId?publicAssetUrl(config.videoId):undefined;
  const headline=config?.title||config?.text;
  const show=config?.showParameters!==false&&parameters.length>0;
  if(!image&&!video&&!headline&&!show)return null;
  return <section className="p03-performance" data-module-id="ALSVID-P03" data-module="reserved3">
    {image&&<img className="p03-performance__media" src={image} alt="" loading="lazy"/>}
    {video&&<video className="p03-performance__media" src={video} poster={image} autoPlay muted loop playsInline preload="metadata" aria-hidden="true"/>}
    <div className={'p03-performance__content p03-align-'+(config?.alignment||'center')}>
      {headline&&<h2>{headline}</h2>}
      {show&&<dl className="p03-performance__parameters">{parameters.map((row,i)=><div key={row.code+'-'+i}><dt>{row.label}</dt><dd>{row.value?row.value+(row.unit&&!String(row.value).trim().endsWith(row.unit.trim())?' '+row.unit:''):'—'}</dd></div>)}</dl>}
    </div>
  </section>;
}
