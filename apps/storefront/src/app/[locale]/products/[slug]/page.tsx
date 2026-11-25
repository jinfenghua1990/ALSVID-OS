import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {ProductPurchaseSection} from '@/components/product-purchase-section';
import {ImmersiveScene} from '@/components/immersive-scene';
import {StickyPurchaseBar} from '@/components/sticky-purchase-bar';
import {getAvailability,getProduct,getOffers,siteUrl,type Locale} from '@/lib/alsvid-api';
type Props={params:Promise<{locale:Locale;slug:string}>};
export async function generateMetadata({params}:Props):Promise<Metadata>{
 const {locale,slug}=await params;
 const product=await getProduct(slug,locale);
 if(!product||product.kind!=='part')return {title:'Product unavailable',robots:{index:false,follow:false}};
 return {title:product.title,description:product.description,alternates:{canonical:siteUrl+'/'+locale+'/products/'+encodeURIComponent(product.slug)},openGraph:{title:product.title,description:product.description,images:product.images.slice(0,1).map(x=>x.url)}};
}
export default async function AccessoryPage({params}:Props){
 const {locale,slug}=await params;
 const product=await getProduct(slug,locale);
 if(!product||product.kind!=='part')notFound();
 const [offers,availability]=await Promise.all([getOffers(product.slug,locale),getAvailability(product.slug,locale)]);
 const eur=offers.filter(x=>x.currency==='EUR');
 return <main className="container product-page accessory-page">
  <nav className="product-crumb"><a href={'/'+locale+'/e-bikes'}>{locale==='de'?'E-Bikes':locale==='en'?'E-Bikes':'整车'}</a> / {product.title}</nav>
  <ProductPurchaseSection product={product} locale={locale} offers={eur} availability={availability}/>
  {product.detailBlocks?.some(block=>!block.hidden)&&<section className="product-immersive" id="product-details" data-module-id="ALSVID-P04" data-module="detail">{product.detailBlocks.filter(block=>!block.hidden&&((block.type==='text'&&block.text)||(['image','video'].includes(block.type)&&block.url))).map((block,i)=><ImmersiveScene key={i} scene={block} index={i+1} alt={product.title}/>)}</section>}
  {product.specifications.length>0&&<section className="product-support-section" id="product-specifications" data-module-id="ALSVID-P05" data-module="specifications"><h2>{locale==='de'?'Technische Daten':locale==='en'?'Specifications':'产品参数'}</h2><ul className="spec-list">{product.specifications.map((row,i)=><li key={i}><span>{row.label}</span><strong>{row.value}</strong></li>)}</ul></section>}
  <p className="accessory-note">{locale==='de'?'Kompatibilität bitte vor der Bestellung anhand der Produktangaben prüfen.':locale==='en'?'Please check compatibility against the product specifications before ordering.':'下单前请根据商品参数确认兼容性。'}</p>
  <StickyPurchaseBar locale={locale} productId={product.productId} initialPrice={eur[0]?new Intl.NumberFormat(locale==='de'?'de-DE':locale==='zh'?'zh-CN':'en-IE',{style:'currency',currency:eur[0].currency}).format(Number(eur[0].unitPrice)):''} disabled={!eur.length||availability?.available===false}/>
 </main>;
}
