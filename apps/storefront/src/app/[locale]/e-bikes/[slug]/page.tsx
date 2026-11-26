import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CmsBlocks } from '@/components/cms-blocks';
import { ProductPurchaseSection } from '@/components/product-purchase-section';
import { ProductPageNav } from '@/components/product-page-nav';
import { ImmersiveScene } from '@/components/immersive-scene';
import { ProductTemplateReviewConfirm } from '@/components/product-template-review-confirm';
import { absoluteApiUrl, getAvailability, getCmsProductTemplate, getOffers, getProduct, getProductTemplateReviewPreview, getReviews, publicApiUrl, publicAssetUrl, type Locale, type ProductModuleBanner, type ProductModuleCopy, type PerformanceConfig, type PerformanceSpec, siteUrl } from '@/lib/alsvid-api';
import { UI } from '@/lib/ui-text';

type Props = { params: Promise<{ locale: Locale; slug: string }>; searchParams?: Promise<{configure?:string;reviewToken?:string;parent?:string}> };

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

export default async function ProductPage({ params, searchParams }: Props) {
  const { locale, slug } = await params;
  const query = await searchParams;
  const product = await getProduct(slug, locale);
  if (!product || product.kind !== 'vehicle') notFound();
  const [allOffers, availability, reviews, reviewPreview] = await Promise.all([
    getOffers(product.slug, locale),
    getAvailability(product.slug, locale),
    getReviews(product.productId),
    query?.reviewToken && query.parent ? getProductTemplateReviewPreview(locale, product.productId, query.reviewToken) : Promise.resolve(null),
  ]);
  if (query?.reviewToken && !reviewPreview) return <main role="alert" style={{ padding: 32 }}>审核预览凭证无效或已失效，请回到装修工作台重新开始审核。</main>;
  const template = reviewPreview?.template ?? await getCmsProductTemplate(locale, product.productId);
  const offers = allOffers.filter(offer => offer.currency === 'EUR');
  const design=product.design;
  const visible=(id:string)=>design?.visibility?.[id]!==false;
  const configure=query?.configure==='1';
  const showPurchase=design?.purchaseVisible!==false||configure;
  const purchaseHref=showPurchase?'#product-purchase':`/${locale}/e-bikes/${encodeURIComponent(product.slug)}?configure=1#product-purchase`;
  const visual=design?.visual;
  const faqTitle={zh:'常见问题',de:'Häufige Fragen',en:'Frequently asked questions'}[locale];
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
  const rawSpecs = template?.masterSpecs ?? ((specsModule?.data?.specifications && specsModule.data.specifications.length > 0) ? specsModule.data.specifications : (product.specifications || []));
  const specifications: { code?:string;label: string; value: string }[] = rawSpecs.map((row: { code?:string;label: string; value: string; unit?: string }) => ({
    code:row.code,
    label: row.label,
    value: row.value + (row.unit && !String(row.value).trim().endsWith(row.unit.trim()) ? ' ' + row.unit : '')
  }));
  // P05 分组只决定展示，不修改主档字段或数值。
  const specGroups=groupSpecifications(specifications,locale);
  const coreContent=design?.coreVisible!==false && (!!template?.performanceSpecs?.length||!!template?.performance?.imageId||!!template?.performance?.videoId||!!template?.performance?.headline);
  // 详情主体定稿：P01、P02、P04—P10；旧评价和政策附加区保留。
  const modules = template?.modules;
  const banners = ([
    { key: 'marketing', banner: modules?.marketing },
    { key: 'reserved4', banner: modules?.reserved4 },
  ] as { key: string; banner: ProductModuleBanner | undefined }[]).filter((row): row is { key: string; banner: ProductModuleBanner } => !!row.banner?.enabled && !!(row.banner.imageId || row.banner.title || row.banner.description || row.banner.text || row.banner.href));
  const detailBlocks = (product.detailBlocks || []).filter(block => !block.hidden && ((['image','video'].includes(block.type)&&block.url)||(block.type==='text'&&block.text)));
  const reviewsConfig = modules?.reviews || { enabled: true, limit: 20, style: 'list' };
  const copyModules = [{key:'returns',id:'ALSVID-P12',row:modules?.returns},{key:'other',id:'ALSVID-P13',row:modules?.other}].filter((entry):entry is {key:string;id:string;row:ProductModuleCopy}=>!!entry.row?.enabled&&!!(entry.row.title||entry.row.body));
  const bannerHref = (href: string) => href.replace(/^\/www\/(de|en|zh)\/products(?:\/|$)/, (_, lang: string) => `/${lang}/e-bikes/`);
  return (
    <main className="container product-page product-page--with-nav" data-product-id={product.productId} data-product-slug={product.slug}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }}></script>
      <ProductPageNav locale={locale} model={product.model||product.title} hasSpecs={visible('P05')&&specifications.length>0} hasVideo={(visible('P04')&&detailBlocks.some(b=>b.type==='video'))||templateBlocks.some(block=>block.componentKey==='video' && !!block.data?.videoUrl)} purchaseHref={purchaseHref} overviewHref={visible('P02')?'#product-overview':showPurchase||coreContent?'#product-configurator':'#product-details'} hasDownloads={visible('P07')&&!!template?.downloads?.length} />
      {!showPurchase&&<h1 className="sr-only">{product.title}</h1>}
      {(showPurchase||coreContent)&&<ProductPurchaseSection product={product} locale={locale} offers={offers} availability={availability} galleryStyle={productLayout.gallery} showPurchase={showPurchase}>
      {coreContent&&<PerformanceBlock config={template?.performance} specs={template?.performanceSpecs||[]} alt={product.title} legacyHref=""/>}
      </ProductPurchaseSection>}
      {visible('P02')&&<section id="product-overview" className="product-overview-fallback product-visual" data-module-id="ALSVID-P02" data-module="marketing">
      {visual?<><ImmersiveScene scene={{...visual,type:visual.mediaType,title:visual.title||product.title}} index={0} alt={product.title}/>{visual.marketingEnabled&&<div className="product-visual-promo">{visual.marketingText&&<p>{visual.marketingText}</p>}{visual.buttonText&&<a className="product-visual-button" href={purchaseHref}>{visual.buttonText}</a>}</div>}</>:banners.some(x=>x.key==='marketing')?banners.filter(({key})=>key==='marketing').map(({key,banner})=><MarketingBlock key={key} name={key} banner={banner} alt={product.title} href={bannerHref(banner.href)} nested/>):<ImmersiveScene scene={{type:product.images[0]?'image':'text',url:product.images[0]?.url,title:product.title,fit:'contain',animation:'fade'}} index={0} alt={product.title}/>}
      </section>}
      {visible('P04')&&(detailBlocks.length>0||banners.some(x=>x.key==='reserved4')||(!modules?.performance&&modules?.reserved3?.enabled))&&<section className="product-immersive" id="product-details" data-module-id="ALSVID-P04" data-module="detail">
        {!modules?.performance&&modules?.reserved3?.enabled&&<MarketingBlock name="reserved3" banner={modules.reserved3} alt={product.title} href={bannerHref(modules.reserved3.href)} nested/>}
        {banners.filter(({key})=>key==='reserved4').map(({key,banner})=><MarketingBlock key={key} name={key} banner={banner} alt={product.title} href={bannerHref(banner.href)} nested/>)}
        {detailBlocks.map((block,index)=><ImmersiveScene key={index} scene={block} index={index+1} anchor={block.type==='video'&&index===detailBlocks.findIndex(b=>b.type==='video')?'product-video':undefined} alt={product.title}/>)}
      </section>}
      {visible('P05') && specifications.length > 0 && <section className="product-support-section" id="product-specifications" data-module-id="ALSVID-P05" data-module="specifications">
            <h2>{UI.specifications[locale]}</h2>
            {specGroups.map(group=><section key={group.title} className="product-spec-group"><h3>{group.title}</h3>{productLayout.specifications==='table'?<table className="product-spec-table"><tbody>{group.rows.map((row,i)=><tr key={row.code||i}><th>{row.label}</th><td>{row.value}</td></tr>)}</tbody></table>:productLayout.specifications==='accordion'?<details className="product-spec-accordion"><summary>{UI.showSpecifications[locale]}</summary><ul className="spec-list">{group.rows.map((row,i)=><li key={row.code||i}><span>{row.label}</span><strong>{row.value}</strong></li>)}</ul></details>:<ul className="spec-list">{group.rows.map((row,i)=><li key={row.code||i}><span>{row.label}</span><strong>{row.value}</strong></li>)}</ul>}</section>)} 
          </section>}
      {visible('P06')&&!!template?.packageSpecs?.length&&<section className="product-support-section" data-module-id="ALSVID-P06" data-module="packaging"><h2>{{zh:'包装清单',de:'Lieferumfang',en:'In the box'}[locale]}</h2><ul className="spec-list">{template.packageSpecs.map(row=><li key={row.code}><span>{row.label}</span><strong>{row.value}{row.unit&&!row.value.endsWith(row.unit)?' '+row.unit:''}</strong></li>)}</ul></section>}
      {visible('P07')&&!!template?.downloads?.length&&<section className="product-support-section" id="product-downloads" data-module-id="ALSVID-P07" data-module="downloads"><h2>{{zh:'产品下载',de:'Downloads',en:'Downloads'}[locale]}</h2><ul>{template.downloads.map(item=><li key={item.id}><a href={item.downloadUrl} target="_blank" rel="noopener noreferrer">{item.title} · PDF ↗</a></li>)}</ul></section>}
      {visible('P08')&&!!design?.faq?.length&&<section className="product-support-section" data-module-id="ALSVID-P08" data-module="faq"><h2>{faqTitle}</h2>{design.faq.map((item,i)=><details key={i}><summary>{item.question}</summary><p>{item.answer}</p></details>)}</section>}
      {visible('P09')&&product.warranty&&<section className="product-support-section" data-module-id="ALSVID-P09" data-module="warranty"><h2>{UI.warranty[locale]}</h2><p>{product.warranty}</p></section>}
      {visible('P10')&&product.delivery&&<section className="product-support-section" data-module-id="ALSVID-P10" data-module="delivery"><h2>{UI.delivery[locale]}</h2><p>{product.delivery}</p></section>}
      {templateBlocks.filter(block=>!['faq','manuals'].includes(block.componentKey)).map((block,index) => {
        const isVideo=block.componentKey==='video' && !!block.data?.videoUrl;
        const firstVideo=isVideo && !(visible('P04')&&detailBlocks.some(b=>b.type==='video')) && block.id===templateBlocks.find(item=>item.componentKey==='video' && !!item.data?.videoUrl)?.id;
        const anchor=firstVideo?'product-video':null;
        return anchor ? <div id={anchor} key={block.id}><CmsBlocks blocks={[block]} locale={locale}/></div> : <CmsBlocks key={block.id} blocks={[block]} locale={locale}/>;
      })}
      {!!product.relatedAccessories?.length && <section className="product-related"><p className="eyebrow">{UI.relatedAccessories[locale]}</p><h2>{UI.fitsThisModel[locale]}</h2><div className="product-related__grid">{product.relatedAccessories.map(item => <a key={item.productId} href={`/${locale}/e-bikes/${encodeURIComponent(item.slug)}`}><div>{item.images[0] ? <img src={publicApiUrl(item.images[0].url)} alt={item.title} loading="lazy"/> : item.title}</div><strong>{item.title}</strong>{item.prices.length>0&&<small>{item.prices.map(price=>`${price.currency} ${price.unitPrice}`).join(' · ')}</small>}</a>)}</div></section>}
      {reviewsConfig.enabled && <section className={`reviews reviews--${productLayout.reviews}`} id="product-reviews" data-module-id="ALSVID-P11" data-module="reviews">
        <p className="eyebrow">{UI.reviews[locale]}</p>
        <h2>{reviews?.counts.total ? `${reviews.counts.average} / 5 · ${reviews.counts.total}` : UI.noReviews[locale]}</h2>
        {(reviews?.items || []).slice(0, reviewsConfig.limit).map(review => <article className="review" key={review.id}><strong>{'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)}</strong><p>{review.content}</p>{review.reply && <p className="review-reply">{UI.brandReply[locale]} {review.reply}</p>}</article>)}
      </section>}
      {copyModules.map(({key,id,row}) => <section className="product-business-module product-standard-module" key={key} data-module-id={id} data-module={key}><h2>{row.title || (key==='returns'?UI.returns[locale]:UI.other[locale])}</h2><p>{row.body}</p></section>)}
      {reviewPreview && query?.parent && <ProductTemplateReviewConfirm {...reviewPreview} parentOrigin={query.parent}/>}
    </main>
  );
}

// 公共模块里的营销组件：三种标准样式（横幅广告 / 图片+文案 / 促销信息条），与后台预览同一套规则
function MarketingBlock({ name, banner, alt, href, nested=false }: { name: string; banner: ProductModuleBanner; alt: string; href: string; nested?:boolean }) {
  const theme = banner.theme || { background: 'none', spacing: 'normal', imageRatio: 'wide', buttonStyle: 'solid' };
  const cls = `product-mkt is-${banner.style} bg-${theme.background} sp-${theme.spacing} ratio-${theme.imageRatio}`;
  const title = banner.title || banner.text;
  const button = banner.buttonText && href ? <a className={`product-mkt__btn is-${theme.buttonStyle}`} href={href}>{banner.buttonText}</a> : null;
  const media = banner.imageId ? <img className="product-mkt__media" src={publicAssetUrl(banner.imageId)} alt={title || alt} loading="lazy" /> : null;
  if (banner.style === 'promoBar') return <section className={cls} data-module={nested?undefined:name} data-module-id={nested?undefined:name==='marketing'?'ALSVID-P02':name==='reserved3'?'ALSVID-P03':'ALSVID-P04'}>{title && <strong>{title}</strong>}{banner.description && <span>{banner.description}</span>}{button}</section>;
  return <section className={cls} data-module={nested?undefined:name} data-module-id={nested?undefined:name==='marketing'?'ALSVID-P02':name==='reserved3'?'ALSVID-P03':'ALSVID-P04'}>{media}{(title || banner.description || button) && <div className="product-mkt__copy">{title && <h2>{title}</h2>}{banner.description && <p>{banner.description}</p>}{button}</div>}</section>;
}

function PerformanceBlock({config,specs,legacy,alt,legacyHref}:{config?:PerformanceConfig;specs:PerformanceSpec[];legacy?:ProductModuleBanner;alt:string;legacyHref:string}) {
  const old = legacy?.enabled && !!(legacy.imageId||legacy.title||legacy.description||legacy.text||legacy.href);
  const rows = config?.showParameters === false ? [] : specs.slice(0,4);
  const media = config?.mediaType==='video'?config.videoId:config?.imageId;
  if (!old && !rows.length && !media && !config?.headline) return null;
  return <section data-module="reserved3" data-module-id="ALSVID-P01-02" style={{width:'100%',background:'transparent',color:'#171717',overflow:'hidden'}}>
    {old && legacy && <MarketingBlock name="reserved3" banner={legacy} alt={alt} href={legacyHref} nested/>}
    {media && (config?.mediaType==='video'?<video src={publicAssetUrl(media)} controls playsInline preload="metadata" style={{display:'block',width:'100%',maxHeight:'75vh',objectFit:'cover'}}/>:<img src={publicAssetUrl(media)} alt={alt} loading="lazy" style={{display:'block',width:'100%',maxHeight:'75vh',objectFit:'cover'}}/>)}
    {config?.headline&&<h2 style={{textAlign:config.alignment,padding:'clamp(20px,4vw,48px)',margin:0,color:'inherit'}}>{config.headline}</h2>}
    {!!rows.length&&<dl style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(min(100%, 150px),1fr))',gap:'clamp(16px,3vw,40px)',padding:'clamp(24px,5vw,64px)',margin:0,textAlign:'center'}}>
      {rows.map(row=><div key={row.code}><dt style={{color:'inherit',fontSize:'0.9rem',marginBottom:8}}>{row.label}</dt><dd style={{fontSize:'clamp(1.2rem,3vw,2.5rem)',fontWeight:600,margin:0,overflowWrap:'anywhere'}}>{row.value}{row.unit&&!String(row.value).trim().endsWith(row.unit.trim())?' '+row.unit:''}</dd></div>)}
    </dl>}
  </section>;
}

function groupSpecifications(rows:{code?:string;label:string;value:string}[],locale:Locale){
 const titles={zh:['车架系统','电气系统','骑行性能','机械配置','其他规格'],de:['Rahmen','Elektrik','Fahrleistung','Mechanik','Weitere Daten'],en:['Frame','Electrical system','Riding performance','Mechanical components','Other specifications']}[locale];
 const groups=titles.map(title=>({title,rows:[] as typeof rows}));
 for(const row of rows){const key=(row.code||row.label).toLowerCase();
 const i=/frame|weight|fold|dimension|车架|车重|重量|折叠|尺寸|rahmen|gewicht|falt/.test(key)?0:/motor|battery|controller|display|charger|电机|电池|控制器|仪表|充电|akku|lade/.test(key)?1:/range|speed|torque|续航|速度|扭矩|reichweite|geschwindigkeit|drehmoment/.test(key)?2:/brake|tyre|tire|gear|wheel|chain|刹车|轮胎|变速|链条|车轮|bremse|reifen|schaltung/.test(key)?3:4;groups[i].rows.push(row);}
 return groups.filter(g=>g.rows.length);
}
