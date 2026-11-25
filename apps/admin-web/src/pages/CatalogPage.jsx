import CatalogOrders from './CatalogOrders.jsx';
import CatalogCart from './CatalogCart.jsx';
import {addCartItem,guestCartKey,loadGuestCart,saveGuestCart} from '../storefront-cart.js';
import {setPageMetadata} from '../seo.js';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BlocksRenderer } from './cms-blocks.jsx';
import { L7ProductPage } from '../website/_components/product/l7-product';
import { L8ProductPage } from '../website/_components/product/l8-product';
import { Fc2ProductPage } from '../website/_components/product/fc2-product';
import { Fc1StoryPage } from '../website/_components/product/fc1-story-v4';
import { Fc1ColourConfigurator } from '../website/_components/product/fc1-colour-configurator';
import { Fc1ScrollStory } from '../website/_components/product/fc1-scroll-story';
import { FoldStatePreview } from '../website/_components/product/fc1-interactions';
import fc1Styles from '../website/_components/product/fc1-product.module.css';
import './catalog.css';

// 现有装修页面按产品主档绑定；商品地址或 SKU 改变时不影响关联。
const existingProductPages = {
  'p-bfaf74b1-dde8-40fb-9ec9-feff67a6c60d': L7ProductPage,
  '01a1cdb7-a32b-7ea7-aa18-fcbd53429c60': Fc1StoryPage,
  '01a1cfb5-89c8-733d-81a5-fb4f1948c84e': L8ProductPage,
  '01a1cec8-132b-7796-885c-342dfa79d464': Fc2ProductPage,
};
const productContentBlocks = new Set([
  'hero', 'twoColumn', 'image', 'carousel', 'divider', 'spacer', 'video',
  'features', 'faq', 'cta', 'comparison', 'reviews', 'accessories', 'manuals', 'specs', 'productGallery'
]);
const defaultProductLayout = { gallery: 'standard', specifications: 'list', reviews: 'list' };

const copy = {
  zh: { title: '探索 ALSVID', subtitle: '产品目录', all: '全部产品', vehicle: '整车', part: '零配件', empty: '该语言暂无已发布产品。', emptyVehicle: '该语言暂无已发布的整车。', emptyPart: '该语言暂无已发布的零配件。', noMatches: '没有找到匹配的产品。', searchPlaceholder: '搜索名称、型号、SKU 或产品说明', searchButton: '搜索', clearSearch: '清除搜索', loading: '正在加载产品…', error: '暂时无法加载产品，请稍后重试。', missing: '该产品尚未发布此语言的内容，或已下架。', retry: '重试', details: '查看详情', back: '返回产品目录', specs: '产品参数', prev: '上一页', next: '下一页', noImage: '暂无产品图片', priceLoading: '正在加载价格…', priceError: '价格暂时无法加载。', noPrices: '该商品当前没有已发布价格。', from: '起', quantity: '数量' },
  en: { title: 'Explore ALSVID', subtitle: 'Product catalogue', all: 'All products', vehicle: 'Bikes', part: 'Parts', empty: 'No products have been published in this language yet.', emptyVehicle: 'No bikes have been published in this language yet.', emptyPart: 'No parts have been published in this language yet.', noMatches: 'No matching products found.', searchPlaceholder: 'Search names, models, SKUs or descriptions', searchButton: 'Search', clearSearch: 'Clear search', loading: 'Loading products…', error: 'Products could not be loaded. Please try again.', missing: 'This product is unavailable in this language or has been unpublished.', retry: 'Retry', details: 'View details', back: 'Back to catalogue', specs: 'Specifications', prev: 'Previous', next: 'Next', noImage: 'No product image', priceLoading: 'Loading prices…', priceError: 'Prices could not be loaded right now.', noPrices: 'No prices are currently published for this product.', from: 'from', quantity: 'Quantity' },
  de: { title: 'ALSVID entdecken', subtitle: 'Produktkatalog', all: 'Alle Produkte', vehicle: 'Fahrräder', part: 'Ersatzteile', empty: 'In dieser Sprache sind noch keine Produkte veröffentlicht.', emptyVehicle: 'In dieser Sprache sind noch keine Fahrräder veröffentlicht.', emptyPart: 'In dieser Sprache sind noch keine Ersatzteile veröffentlicht.', noMatches: 'Keine passenden Produkte gefunden.', searchPlaceholder: 'Namen, Modelle, SKUs oder Beschreibungen suchen', searchButton: 'Suchen', clearSearch: 'Suche löschen', loading: 'Produkte werden geladen…', error: 'Produkte konnten nicht geladen werden. Bitte versuchen Sie es erneut.', missing: 'Dieses Produkt ist in dieser Sprache nicht verfügbar oder wurde entfernt.', retry: 'Erneut versuchen', details: 'Details ansehen', back: 'Zurück zum Katalog', specs: 'Technische Daten', prev: 'Zurück', next: 'Weiter', noImage: 'Kein Produktbild', priceLoading: 'Preise werden geladen…', priceError: 'Preise konnten gerade nicht geladen werden.', noPrices: 'Für dieses Produkt sind derzeit keine Preise veröffentlicht.', from: 'ab', quantity: 'Menge' },
};
// 营销组件（预览端）：三种标准样式 + 背景/间距/按钮样式，与 storefront 保持同一套视觉规则
function MarketingBlock({ name, banner, fallbackAlt }) {
  const theme = banner.theme || {};
  const cls = `catalog-mkt is-${banner.style || 'banner'} bg-${theme.background || 'none'} sp-${theme.spacing || 'normal'} ratio-${theme.imageRatio || 'wide'}`;
  const src = banner.imageId ? `/api/public/cms-media/${encodeURIComponent(banner.imageId)}` : '';
  const title = banner.title || banner.text;
  const button = banner.buttonText && banner.href ? <a className={`catalog-mkt__btn is-${theme.buttonStyle || 'solid'}`} href={banner.href}>{banner.buttonText}</a> : null;
  const alt = title || fallbackAlt;
  const media = src ? <img className="catalog-mkt__media" src={src} alt={alt} loading="lazy"/> : null;
  if (banner.style === 'promoBar') return <section className={cls} data-module={name}>{title && <strong>{title}</strong>}{banner.description && <span>{banner.description}</span>}{button}</section>;
  return <section className={cls} data-module={name}>{media}{(title || banner.description || button) && <div className="catalog-mkt__copy">{title && <h2>{title}</h2>}{banner.description && <p>{banner.description}</p>}{button}</div>}</section>;
}

export default function CatalogPage({ lang, productId }) {
  const t = copy[lang], params = new URLSearchParams(window.location.search);
  // 装修工作区草稿/历史版本预览：仅管理员 cookie 有效时后端才返回草稿内容。
  const previewDraft = params.get('draft') === '1', previewVersion = Number(params.get('version') || 0) || 0;
  const previewQuery = previewDraft ? '&draft=1' : previewVersion ? `&version=${previewVersion}` : '';
  const parsedPage = Number(params.get('page') || 1), page = Number.isSafeInteger(parsedPage) && parsedPage > 0 && parsedPage <= 10000 ? parsedPage : 1;
  const requestedKind=params.get('kind'),selectedKind=['vehicle','part'].includes(requestedKind)?requestedKind:'';
  const requestedSearch=params.get('q')||'',search=requestedSearch.trim().slice(0,120);
  const [searchDraft,setSearchDraft]=useState(requestedSearch);
  const home=`/www/${lang}/products`;
  const listingPath=(targetPage=1,targetKind=selectedKind,targetSearch=search)=>{const query=new URLSearchParams();if(targetPage>1)query.set('page',String(targetPage));if(targetKind)query.set('kind',targetKind);if(targetSearch)query.set('q',targetSearch);const value=query.toString();return `${home}${value?`?${value}`:''}`};
  const contextQuery=new URLSearchParams();if(page>1)contextQuery.set('page',String(page));if(selectedKind)contextQuery.set('kind',selectedKind);if(search)contextQuery.set('q',search);
  const [offers, setOffers] = useState([]), [offersLoading,setOffersLoading]=useState(false), [offersError,setOffersError]=useState(''), [offerAttempt,setOfferAttempt]=useState(0), [selectedOfferKey,setSelectedOfferKey]=useState(''), [activeImage,setActiveImage]=useState(0), [cartMessage,setCartMessage]=useState(''), [cartSaving,setCartSaving]=useState(false), [cartCount,setCartCount]=useState(0), [quantity,setQuantity]=useState(1);
  const showCart=params.get('cart')==='1',showOrders=params.get('orders')==='1';
  const cartBusy=useRef(false);
  useEffect(()=>{const count=()=>loadGuestCart().reduce((total,item)=>total+item.quantity,0),update=event=>setCartCount(typeof event.detail?.quantity==='number'?event.detail.quantity:count()),storage=event=>{if(event.key===guestCartKey)update({detail:{}})};setCartCount(count());window.addEventListener('alsvid-cart-changed',update);window.addEventListener('storage',storage);return()=>{window.removeEventListener('alsvid-cart-changed',update);window.removeEventListener('storage',storage)}},[]);
  const addToCart=async offer=>{if(cartBusy.current)return;cartBusy.current=true;setCartSaving(true);try{saveGuestCart(addCartItem(loadGuestCart(),{productId:data?.productId || productId,sku:offer.sku,currency:offer.currency},quantity));setCartMessage(lang==='zh'?'已加入购物车':lang==='de'?'Zum Warenkorb hinzugefügt':'Added to cart')}catch(e){setCartMessage(lang==='zh'?(e.message==='maximum quantity'?'该配置已达到数量上限':e.message==='maximum cart items'?'购物车商品种类已达上限':'无法保存购物车，请检查浏览器存储设置'):lang==='de'?'Warenkorb konnte nicht aktualisiert werden. Bitte Mengenlimit und Browserspeicher prüfen.':'The cart could not be updated. Check the quantity limit and browser storage.')}finally{cartBusy.current=false;setCartSaving(false)}};
  useEffect(()=>{const onMessage=event=>{if(event.data?.type!=='alsvid:focus-module'||!event.data.key)return;const target=document.querySelector(`[data-module="${event.data.key}"]`);if(!target)return;target.scrollIntoView({behavior:'smooth',block:'center'});target.classList.add('is-module-focus');window.setTimeout(()=>target.classList.remove('is-module-focus'),1800)};window.addEventListener('message',onMessage);return()=>window.removeEventListener('message',onMessage)},[]);
  const [data, setData] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0), [template, setTemplate] = useState(null), [reviews, setReviews] = useState(null);
  const productLayout = { ...defaultProductLayout, ...(template?.productLayout || {}) };
  const ExistingProductPage = productId && data?.productId ? existingProductPages[data.productId] : null;
  const modules = template?.modules;
  const isSpecialPage = Boolean(ExistingProductPage) && !template?.isProductSpecific;
  const isImmersiveVehicle = Boolean(productId && (ExistingProductPage || (template?.isProductSpecific && data?.kind === 'vehicle')));
  const bannerModules = isSpecialPage ? [] : [['marketing', modules?.marketing], ['reserved3', modules?.reserved3], ['reserved4', modules?.reserved4]].filter(([, banner]) => banner?.enabled && (banner.imageId || banner.title || banner.description || banner.text || banner.href));
  const detailBlocks = isSpecialPage ? [] : (data?.detailBlocks || []).filter(block => (block.type === 'image' && block.url) || (block.type === 'text' && block.text));
  const reviewsConfig = modules?.reviews || { enabled: true, limit: 20 };
  const copyModules = isSpecialPage ? [] : [modules?.returns, modules?.other].filter(row => row?.enabled && (row.title || row.body));
  // 列表页分类导航：catalogLayout.categories 按 productIds 过滤当前页商品。
  const categories = !productId ? (template?.catalogLayout?.categories || []).filter(category => category.productIds.length) : [];
  const catParam = Number(params.get('cat'));
  const activeCat = Number.isInteger(catParam) && catParam >= 0 && catParam < categories.length ? catParam : -1;
  const shownItems = data?.items ? (activeCat >= 0 ? data.items.filter(item => categories[activeCat].productIds.includes(item.productId)) : data.items) : [];
  useEffect(() => {
    let active = true;
    setTemplate(null);
    if (productId && !data?.productId) return () => { active = false; };
    const templateProductId = productId && data?.productId ? data.productId : '';
    fetch(`/api/cms/product-template?locale=${encodeURIComponent(lang)}&productId=${encodeURIComponent(templateProductId)}${previewQuery}`).then(r => r.ok ? r.json() : null).then(row => { if (active) setTemplate(row); }).catch(() => {});
    return () => { active = false; };
  }, [productId, lang, data?.productId, previewQuery]);
  useEffect(() => {
    let active = true;
    setReviews(null);
    if (!productId || !data?.productId) return () => { active = false; };
    fetch(`/api/site/reviews?limit=20&productId=${encodeURIComponent(data.productId)}`).then(response => response.ok ? response.json() : null).then(result => { if (active) setReviews(result); }).catch(() => { if (active) setReviews(null); });
    return () => { active = false; };
  }, [productId, data?.productId]);
  const templateBlocks = useMemo(() => (template?.blocks || []).filter(block => productContentBlocks.has(block.componentKey)).map(block => {
    if (block.componentKey === 'specs' && !block.bindings?.productId) return { ...block, bindings: { ...block.bindings, productId }, data: { specifications: data?.specifications || [] } };
    if (block.componentKey === 'productGallery' && !(block.bindings?.productIds || []).length) return { ...block, data: { products: data ? [{ id: productId, kind: data.kind, title: data.title, image: data.images?.[0] }] : [] } };
    return block;
  }), [template, data, productId]);
  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError('');
    const query=new URLSearchParams({lang,page:String(page)});if(selectedKind)query.set('kind',selectedKind);if(search)query.set('q',search);
    // 列表页版式装修：按销量自动展示（分类过滤在渲染层完成）
    if (!productId && template?.catalogLayout?.sort === 'sales') query.set('sort', 'sales');
    if (productId && previewDraft) query.set('draft', '1');
    const url = productId ? `/api/catalog/products/${encodeURIComponent(productId)}?${query}` : `/api/catalog/products?${query}`;
    fetch(url, { signal: controller.signal }).then(async r => { if (!r.ok) throw Error(r.status === 404 ? t.missing : t.error); return r.json(); }).then(setData).catch(e => { if (e.name !== 'AbortError') setError(e.message); });
    return () => controller.abort();
  }, [productId, lang, page, selectedKind, search, attempt, template?.catalogLayout?.sort, previewDraft]);
  useEffect(()=>{let active=true;setOffers([]);setSelectedOfferKey('');setActiveImage(0);setOffersError('');if(!productId){setOffersLoading(false);return()=>{active=false}}setOffersLoading(true);fetch(`/api/catalog/products/${encodeURIComponent(productId)}/offers?lang=${lang}`).then(r=>{if(!r.ok)throw Error('price request failed');return r.json()}).then(rows=>{if(active){setOffers(rows);setSelectedOfferKey(rows[0]?`${rows[0].sku}|${rows[0].currency}`:'')}}).catch(()=>{if(active)setOffersError(t.priceError)}).finally(()=>{if(active)setOffersLoading(false)});return()=>{active=false}},[productId,lang,offerAttempt,t]);
  useEffect(() => {
    const route = productId ? `/www/${lang}/products/${encodeURIComponent(data?.slug || productId)}` : `/www/${lang}/products${page>1?`?page=${page}`:''}`;
    const hasIndexableContent = productId ? Boolean(data) : Boolean(data?.items?.length);
    const alternates = [];
    setPageMetadata({
      lang,
      title: data?.title || (productId ? t.missing : t.title),
      description: data?.description || `${t.title} — ${t.subtitle}`,
      path: route,
      image: data?.images?.[0]?.url,
      alternates,
      robots: showCart || showOrders || error || !productId && (selectedKind || requestedKind && !selectedKind || search || !hasIndexableContent) ? 'noindex,nofollow' : 'index,follow',
    });
  }, [lang, data, productId, page, selectedKind, requestedKind, search, showCart, showOrders, error, t]);
  return <div className={`catalog-site${isImmersiveVehicle ? ' is-immersive-vehicle' : ''}`}>
    <header className="catalog-header"><a href={home} className="catalog-brand"><img className="alsvid-brand-logo" src="/alsvid-logo.png" alt="ALSVID" /><span>{t.subtitle}</span></a><nav><a href={`${home}?orders=1`}>{lang==='zh'?'我的订单申请':lang==='de'?'Meine Anfragen':'My requests'}</a><a href={`${home}?cart=1`} aria-label={`${lang==='zh'?'购物车':lang==='de'?'Warenkorb':'Cart'}${cartCount?`, ${cartCount}`:''}`}>{lang==='zh'?'购物车':lang==='de'?'Warenkorb':'Cart'}{cartCount>0&&<span className="catalog-cart-count">{cartCount>99?'99+':cartCount}</span>}</a></nav></header>
    <main>
      {showOrders ? <CatalogOrders lang={lang}/> : showCart ? <CatalogCart lang={lang}/> : error ? <section className="catalog-state" role="alert"><p>{error}</p><button onClick={() => setAttempt(n => n + 1)}>{t.retry}</button> <a href={home}>{t.back}</a></section> : !data ? <p className="catalog-state" role="status">{t.loading}</p> : productId ? (
        isImmersiveVehicle ? <>
          {/* 旗舰整车专属沉浸式交互选配展厅（图 1 核心体验） */}
          <section id="overview" className={`${fc1Styles.hero} ${fc1Styles.interestHero}`} data-fc1-chapter>
            <Fc1ColourConfigurator locale={lang} productTitle={data?.title} productDescription={data?.description} productImage={data?.images?.[0]?.url} />
          </section>

          {/* 粘性章节导航条 */}
          <nav className="catalog-chapter-nav" aria-label="章节导航">
            <a href="#fc1-features">核心亮点</a>
            <a href="#fc1-two-entry">低跨车架</a>
            <a href="#fc1-two-fold">紧凑折叠</a>
            <a href="#fc1-two-front">隐藏前避震</a>
            <a href="#fc1-two-rear">后空气减震</a>
            <a href="#fc1-two-drive">动力响应</a>
            <a href="#fc1-two-controls">中控交互</a>
            <a href="#fc1-specs">技术参数</a>
            <a href="#fc1-faq">常见问题</a>
            <a href="#fc1-accessories">专属配件</a>
          </nav>

          {/* 全套 CMS 积木组件（图文、参数、配件、评价、FAQ、CTA） */}
          {template?.isProductSpecific && templateBlocks.some(block=>block.visible!==false)
            ? <BlocksRenderer blocks={templateBlocks} lang={lang}/>
            : ExistingProductPage
              ? <ExistingProductPage locale={lang} myUrl="/my" dealerUrl="/dealer" catalogProduct={data}/>
              : templateBlocks.length > 0 && <BlocksRenderer blocks={templateBlocks} lang={lang}/>}

          {data.relatedAccessories?.length>0&&<section id="fc1-accessories" className="catalog-related"><p className="catalog-eyebrow">{lang==='zh'?'适配配件':lang==='de'?'Passendes Zubehör':'Compatible accessories'}</p><h2>{lang==='zh'?'为这款车型适配':lang==='de'?'Kompatibel mit diesem Modell':'Fits this model'}</h2><div className="catalog-related__grid">{data.relatedAccessories.map(item=><a className="catalog-related__card" key={item.productId} href={`${home}/${encodeURIComponent(item.slug)}`}><div>{item.images?.[0]?<img src={item.images[0].url} alt={item.title} loading="lazy"/>:<span>{t.noImage}</span>}</div><strong>{item.title}</strong>{item.prices?.length>0&&<small>{item.prices.map(price=>`${price.currency} ${price.unitPrice}`).join(' · ')}</small>}</a>)}</div></section>}
          {(isSpecialPage || reviewsConfig.enabled) && <section className={`catalog-reviews catalog-reviews--${productLayout.reviews}`} data-module="reviews"><p className="catalog-eyebrow">{lang==='zh'?'用户评价':lang==='de'?'Kundenbewertungen':'Customer reviews'}</p><h2>{reviews?.counts?.total?`${reviews.counts.average} / 5 · ${reviews.counts.total}`:lang==='zh'?'暂无公开评价':lang==='de'?'Noch keine Bewertungen':'No reviews yet'}</h2>{(reviews?.items||[]).slice(0, isSpecialPage ? 20 : reviewsConfig.limit).map(review=><article key={review.id}><strong className="catalog-review__stars" aria-label={`${review.rating} / 5`}>{'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)}</strong><p>{review.content}</p>{review.reply&&<p className="catalog-reviews__reply">{lang==='zh'?'ALSVID 回复：':lang==='de'?'Antwort von ALSVID:':'ALSVID reply:'} {review.reply}</p>}</article>)}</section>}
          {copyModules.map((row, index) => <section className="catalog-business-module" data-module={index === 0 ? 'returns' : 'other'} key={`standard-${index}`}><h2>{row.title || (index === 0 ? (lang==='zh'?'退换货政策':lang==='de'?'Rückgabe & Umtausch':'Returns & exchanges') : (lang==='zh'?'其他说明':lang==='de'?'Weitere Informationen':'Other information'))}</h2><p>{row.body}</p></section>)}
        </> : <>
          <a className="catalog-back" href={listingPath(page,selectedKind,search)}>← {t.back}</a><article className="catalog-product" data-module="info">
            <div className={`catalog-gallery catalog-gallery--${productLayout.gallery}`}>
              {productLayout.gallery === 'mosaic' && data.images.length > 1 ? <div className="catalog-gallery__mosaic">{data.images.map((image,i)=><button type="button" key={image.id} aria-label={`${data.title} ${i+1}`} onClick={()=>setActiveImage(i)}><img src={image.url} alt={`${data.title} ${i+1}`} loading={i?'lazy':undefined}/></button>)}</div> : <>
              <div className="catalog-gallery__main">{data.images.length ? <img src={data.images[Math.min(activeImage,data.images.length-1)]?.url} alt={`${data.title} ${activeImage + 1}`} /> : <div className="catalog-no-image">{t.noImage}</div>}{data.images.length>1&&<><button type="button" className="catalog-gallery__arrow is-prev" aria-label={t.prev} onClick={()=>setActiveImage(i=>(i-1+data.images.length)%data.images.length)}>‹</button><button type="button" className="catalog-gallery__arrow is-next" aria-label={t.next} onClick={()=>setActiveImage(i=>(i+1)%data.images.length)}>›</button></>}</div>
              {data.images.length > 1 && <div className="catalog-gallery__thumbs" aria-label={lang==='zh'?'商品图片':lang==='de'?'Produktbilder':'Product images'}>{data.images.map((image,i)=><button type="button" key={image.id} className={i===activeImage?'is-active':''} aria-label={`${data.title} ${i+1}`} aria-pressed={i===activeImage} onClick={()=>setActiveImage(i)}><img src={image.url} alt="" loading="lazy" /></button>)}</div>}
              </>}
            </div>
            <div className="catalog-product__details">
              <p className="catalog-eyebrow">{t[data.kind]} {data.model && ` / ${data.model}`}</p><h1>{data.title}</h1><p className="catalog-description">{data.description}</p>
              <section className="catalog-buybox" aria-label={lang==='zh'?'商品选购':lang==='de'?'Produktoptionen':'Product options'}>
                <h2>{lang==='zh'?'选择配置与价格':lang==='de'?'Konfiguration und Preis':'Choose configuration and price'}</h2>
                {offersLoading?<p role="status">{t.priceLoading}</p>:offersError?<p role="alert">{offersError} <button type="button" onClick={()=>setOfferAttempt(value=>value+1)}>{t.retry}</button></p>:offers.length?<>
                  <div className="catalog-offers">{offers.map(o=>{const key=`${o.sku}|${o.currency}`;return <button type="button" key={key} className={selectedOfferKey===key?'is-selected':''} aria-pressed={selectedOfferKey===key} onClick={()=>setSelectedOfferKey(key)}><span>{o.spec || o.sku}</span><small>{o.color}</small><strong>{o.currency} {o.unitPrice}</strong></button>})}</div>
                  <label className="catalog-quantity">{t.quantity}<input type="number" min="1" max="100" step="1" value={quantity} onChange={event=>setQuantity(Number(event.target.value))}/></label><button className="catalog-add" type="button" disabled={cartSaving||!selectedOfferKey||!Number.isSafeInteger(quantity)||quantity<1||quantity>100} onClick={()=>{const offer=offers.find(o=>`${o.sku}|${o.currency}`===selectedOfferKey);if(offer)addToCart(offer)}}>{cartSaving?(lang==='zh'?'正在加入…':lang==='de'?'Wird hinzugefügt…':'Adding…'):(lang==='zh'?'加入购物车':lang==='de'?'In den Warenkorb':'Add to cart')}</button>
                  <p className="catalog-buybox__note">{lang==='zh'?'当前为订单申请流程，提交后由 ALSVID 确认报价、库存与交付安排。':lang==='de'?'Derzeit Anfrageprozess. Angebot, Bestand und Lieferung werden von ALSVID bestätigt.':'This is an order request. ALSVID will confirm the quote, stock and delivery.'}</p>
                </>:<p>{t.noPrices}</p>}
                {cartMessage&&<p role="status" className="catalog-cart-message">{cartMessage}</p>}
                <a className="catalog-buybox__cart" href={`${home}?cart=1`}>{lang==='zh'?'查看购物车':lang==='de'?'Warenkorb ansehen':'View cart'} →</a>
              </section>
              {data.specifications.length > 0 && <section className={`catalog-specs catalog-specs--${productLayout.specifications}`}><h2>{t.specs}</h2>{productLayout.specifications==='accordion'?<details><summary>{lang==='zh'?'查看技术参数':lang==='de'?'Technische Daten anzeigen':'View specifications'}</summary><dl>{data.specifications.map((row,i)=><div key={i}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl></details>:productLayout.specifications==='table'?<table><tbody>{data.specifications.map((row,i)=><tr key={i}><th>{row.label}</th><td>{row.value}</td></tr>)}</tbody></table>:<dl>{data.specifications.map((row,i)=><div key={i}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>}</section>}
              {data.delivery&&<section className="catalog-business-module"><h2>{lang==='zh'?'配送与交付':lang==='de'?'Lieferung':'Delivery'}</h2><p>{data.delivery}</p></section>}
              {data.warranty&&<section className="catalog-business-module"><h2>{lang==='zh'?'质保服务':lang==='de'?'Garantie':'Warranty'}</h2><p>{data.warranty}</p></section>}
            </div>
          </article>
          {bannerModules.map(([name, banner]) => <MarketingBlock key={name} name={name} banner={banner} fallbackAlt={data.title}/>)}
          {detailBlocks.length > 0 && <section className="catalog-detail-blocks" data-module="detail"><h2>{lang==='zh'?'图文详情':lang==='de'?'Produktdetails':'Product details'}</h2>{detailBlocks.map((block, index) => block.type === 'image' ? <img key={index} src={block.url} alt={block.alt || data.title} loading="lazy"/> : <p key={index}>{block.text}</p>)}</section>}
          {template?.isProductSpecific && templateBlocks.some(block=>block.visible!==false) ? <BlocksRenderer blocks={templateBlocks} lang={lang}/> : ExistingProductPage ? <ExistingProductPage locale={lang} myUrl="/my" dealerUrl="/dealer" catalogProduct={data}/> : templateBlocks.length > 0 && <BlocksRenderer blocks={templateBlocks} lang={lang}/>}
          {data.relatedAccessories?.length>0&&<section className="catalog-related"><p className="catalog-eyebrow">{lang==='zh'?'适配配件':lang==='de'?'Passendes Zubehör':'Compatible accessories'}</p><h2>{lang==='zh'?'为这款车型适配':lang==='de'?'Kompatibel mit diesem Modell':'Fits this model'}</h2><div className="catalog-related__grid">{data.relatedAccessories.map(item=><a className="catalog-related__card" key={item.productId} href={`${home}/${encodeURIComponent(item.slug)}`}><div>{item.images?.[0]?<img src={item.images[0].url} alt={item.title} loading="lazy"/>:<span>{t.noImage}</span>}</div><strong>{item.title}</strong>{item.prices?.length>0&&<small>{item.prices.map(price=>`${price.currency} ${price.unitPrice}`).join(' · ')}</small>}</a>)}</div></section>}
          {(isSpecialPage || reviewsConfig.enabled) && <section className={`catalog-reviews catalog-reviews--${productLayout.reviews}`} data-module="reviews"><p className="catalog-eyebrow">{lang==='zh'?'用户评价':lang==='de'?'Kundenbewertungen':'Customer reviews'}</p><h2>{reviews?.counts?.total?`${reviews.counts.average} / 5 · ${reviews.counts.total}`:lang==='zh'?'暂无公开评价':lang==='de'?'Noch keine Bewertungen':'No reviews yet'}</h2>{(reviews?.items||[]).slice(0, isSpecialPage ? 20 : reviewsConfig.limit).map(review=><article key={review.id}><strong className="catalog-review__stars" aria-label={`${review.rating} / 5`}>{'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)}</strong><p>{review.content}</p>{review.reply&&<p className="catalog-reviews__reply">{lang==='zh'?'ALSVID 回复：':lang==='de'?'Antwort von ALSVID:':'ALSVID reply:'} {review.reply}</p>}</article>)}</section>}
          {copyModules.map((row, index) => <section className="catalog-business-module" data-module={index === 0 ? 'returns' : 'other'} key={`standard-${index}`}><h2>{row.title || (index === 0 ? (lang==='zh'?'退换货政策':lang==='de'?'Rückgabe & Umtausch':'Returns & exchanges') : (lang==='zh'?'其他说明':lang==='de'?'Weitere Informationen':'Other information'))}</h2><p>{row.body}</p></section>)}
        </>
      ) : <><section className="catalog-intro"><p className="catalog-eyebrow">ALSVID / {t.subtitle}</p><h1>{t.title}</h1><form className="catalog-search" role="search" onSubmit={e=>{e.preventDefault();window.location.assign(listingPath(1,selectedKind,searchDraft.trim().slice(0,120)))}}><input type="search" maxLength={120} aria-label={t.searchPlaceholder} placeholder={t.searchPlaceholder} value={searchDraft} onChange={e=>setSearchDraft(e.target.value)}/><button type="submit">{t.searchButton}</button>{search&&<a href={listingPath(1,selectedKind,'')}>{t.clearSearch}</a>}</form><nav className="catalog-filters" aria-label={t.subtitle}>{[['',t.all],['vehicle',t.vehicle],['part',t.part]].map(([kind,label])=><a key={kind||'all'} href={listingPath(1,kind)} aria-current={selectedKind===kind?'page':undefined}>{label}</a>)}</nav>{categories.length>0&&<nav className="catalog-category-nav" aria-label={lang==='zh'?'产品分类':'Kategorien'}>{[[-1,t.all],...categories.map((category,index)=>[index,category.name])].map(([index,label])=><a key={index} href={`${home}${index>=0?`?cat=${index}`:''}`} aria-current={activeCat===index?'page':undefined}>{label}</a>)}</nav>}</section>{shownItems.length ? <div className="catalog-grid">{shownItems.map(product => <a className="catalog-card" key={product.id} href={`${home}/${encodeURIComponent(product.id)}${contextQuery.toString()?`?${contextQuery}`:''}`}><div className="catalog-card-image">{product.images[0] ? <img src={product.images[0].url} alt={product.title} loading="lazy" /> : <div className="catalog-no-image">{t.noImage}</div>}</div><div className="catalog-card-copy"><p className="catalog-eyebrow">{t[product.kind]} {product.model && ` / ${product.model}`}</p><h2>{product.title}</h2>{product.prices?.length?product.prices.map(price=><p className="catalog-card-price" key={price.currency}>{price.currency} {price.unitPrice} {t.from}</p>):<p className="catalog-card-price catalog-card-price--empty">{t.noPrices}</p>}<span>{t.details} ↗</span></div></a>)}</div> : <p className="catalog-state">{activeCat>=0?(lang==='zh'?'该分类下暂无已发布产品。':'Keine Produkte in dieser Kategorie.'):(search?t.noMatches:selectedKind==='vehicle'?t.emptyVehicle:selectedKind==='part'?t.emptyPart:t.empty)}</p>}<nav className="catalog-pagination" aria-label={t.subtitle}>{page > 1 && <a href={listingPath(page-1)}>← {t.prev}</a>}{data.hasMore && <a href={listingPath(page+1)}> {t.next} →</a>}</nav></>}
    </main><footer className="catalog-footer"><img className="alsvid-brand-logo" src="/alsvid-logo.png" alt="ALSVID" /><span>{t.subtitle}</span></footer>
  </div>;
}
