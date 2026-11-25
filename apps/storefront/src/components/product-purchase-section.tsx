import type { ReactNode } from 'react';
import type { CatalogProduct, Locale, Offer, ProductAvailability } from '@/lib/alsvid-api';
import { UI } from '@/lib/ui-text';
import { ProductGallery } from './product-gallery';
import { CartActions } from './cart-actions';

export function ProductPurchaseSection({product,locale,offers,availability,galleryStyle='standard',showPurchase=true,children}:{product:CatalogProduct;locale:Locale;offers:Offer[];availability:ProductAvailability|null;galleryStyle?:'standard'|'immersive'|'mosaic'|'columns';showPurchase?:boolean;children?:ReactNode}){
 return <section className="product-p01" id="product-configurator" data-module-id="ALSVID-P01" data-module="info" style={{background:product.design?.background||'#eaeae6'}}>
  {showPurchase&&<div className="product-layout" data-module-id="ALSVID-P01-01">
   <ProductGallery key={product.productId} productId={product.productId} images={product.images} title={product.title} locale={locale} style={galleryStyle}/>
   <section>
    <p className="eyebrow">ALSVID / {product.model}</p>
    <h1>{product.title}</h1>
    <p className="lede">{product.description}</p>
    <p>{UI.availableConfigurations[locale]}</p>
    {offers.length?<ul className="spec-list">{offers.map(offer=><li key={offer.sku+'-'+offer.currency}><span>{offer.sku}</span><strong>{offer.currency} {offer.unitPrice}</strong></li>)}</ul>:<p>{UI.priceOnRequest[locale]}</p>}
    <div id="product-purchase"><CartActions locale={locale} productId={product.productId} offers={offers} availability={availability}/></div>
    <p className="availability">{availability?.available===null||!availability?UI.availabilityUnknown[locale]:availability.available?UI.inStockGermany[locale]:UI.outOfStock[locale]}</p>
   </section>
  </div>}
  {children}
 </section>;
}
