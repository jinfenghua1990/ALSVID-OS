import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {CartActions} from '@/components/cart-actions';
import {ProductGallery} from '@/components/product-gallery';
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
  <div className="product-layout purchase-layout"><ProductGallery images={product.images} title={product.title} locale={locale} productId={product.productId}/><section className="purchase-info"><p className="eyebrow">ALSVID / {product.model}</p><h1>{product.title}</h1><p className="lede">{product.description}</p><CartActions locale={locale} productId={product.productId} offers={eur} availability={availability}/><h2>{locale==='de'?'Technische Daten':locale==='en'?'Specifications':'产品参数'}</h2><ul className="spec-list">{product.specifications.map(row=><li key={row.label}><span>{row.label}</span><strong>{row.value}</strong></li>)}</ul></section></div>
  {!!product.detailBlocks?.length&&<section className="product-detail-blocks"><h2>{locale==='de'?'Produktdetails':locale==='en'?'Product details':'产品详情'}</h2>{product.detailBlocks.map((block,i)=>block.type==='image'&&block.url?<img key={i} src={block.url} alt={block.alt||product.title} loading="lazy"/>:block.text?<p key={i}>{block.text}</p>:null)}</section>}
  <p className="accessory-note">{locale==='de'?'Kompatibilität bitte vor der Bestellung anhand der Produktangaben prüfen.':locale==='en'?'Please check compatibility against the product specifications before ordering.':'下单前请根据商品参数确认兼容性。'}</p>
 </main>;
}
