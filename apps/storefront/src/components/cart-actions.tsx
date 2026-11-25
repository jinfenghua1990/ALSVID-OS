'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Locale, Offer, ProductAvailability } from '@/lib/alsvid-api';
import { UI } from '@/lib/ui-text';
import { guestCartKey, notifyCartChanged, readGuestCart } from './cart-storage';
import { openCartDrawerEvent } from './cart-drawer';
import { uuidv7 } from '@/lib/uuid';
import { cartDrawerOpenEvent } from './cart-nav-link';

const copy = {
  de: { add: 'In den Warenkorb', adding: 'Wird hinzugefügt…', view: 'Warenkorb ansehen', error: 'Der Warenkorb konnte nicht aktualisiert werden. Bitte erneut versuchen.', added: 'Zum Warenkorb hinzugefügt', configuration: 'Konfiguration auswählen', quantity: 'Menge', quantityLimit: 'Pro Konfiguration sind höchstens 100 Stück erlaubt.', limit: 'Der Warenkorb kann höchstens 50 verschiedene Artikel enthalten.' },
  en: { add: 'Add to cart', adding: 'Adding…', view: 'View cart', error: 'The cart could not be updated. Please try again.', added: 'Added to cart', configuration: 'Choose a configuration', quantity: 'Quantity', quantityLimit: 'You can add up to 100 units of each configuration.', limit: 'Your cart can contain up to 50 different items.' },
  zh: { add: '加入购物车', adding: '正在加入…', view: '查看购物车', error: '购物车更新失败，请重试。', added: '已加入购物车', configuration: '选择配置', quantity: '数量', quantityLimit: '每种配置最多 100 件。', limit: '购物车最多容纳 50 种不同商品。' },
} satisfies Record<Locale, Record<string, string>>;

const COLOR_SWATCHES:Record<string,string>={BLK:'#222725',BLACK:'#222725',GRY:'#929997',GREY:'#929997',GRAY:'#929997',BLU:'#315f8a',BLUE:'#315f8a',SIL:'#c8ccca',SILVER:'#c8ccca',RED:'#a33b35',WHT:'#ffffff',WHITE:'#ffffff',GRN:'#4b7255',GREEN:'#4b7255'};
function colorSwatch(value:string){return COLOR_SWATCHES[value.trim().toUpperCase()]||''}

async function data(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(body?.error || 'Request failed'), { status: response.status });
  return body;
}

// Server-authoritative preview only. Never insert gifts as ordinary paid cart items.
export type PurchaseGiftPreview = {
  productId: string;
  sku: string;
  currency: string;
  quantity: number;
  gifts: {
    ruleId: string;
    sku: string;
    name: string;
    imageUrl?: string;
    quantity: number;
    condition: string;
    status: 'qualified' | 'shortfall' | 'unavailable';
    remainingAmount?: string;
  }[];
};

const giftCopy = {
  zh: { title: '购车赠品', qualified: '满足赠送条件', shortfall: '尚未满足赠送条件', remaining: '还差', unavailable: '赠品暂不可用', quantity: '数量' },
  en: { title: 'Gifts with purchase', qualified: 'Gift conditions met', shortfall: 'Gift conditions not yet met', remaining: 'Still needed:', unavailable: 'Gift currently unavailable', quantity: 'Quantity' },
  de: { title: 'Geschenke zum Kauf', qualified: 'Geschenkbedingungen erfüllt', shortfall: 'Geschenkbedingungen noch nicht erfüllt', remaining: 'Es fehlen noch:', unavailable: 'Geschenk derzeit nicht verfügbar', quantity: 'Menge' },
} satisfies Record<Locale, Record<string, string>>;

function PurchaseGiftSummary({ locale, preview }: { locale: Locale; preview: PurchaseGiftPreview }) {
  const t = giftCopy[locale];
  const format = (value: string) => new Intl.NumberFormat(locale === 'de' ? 'de-DE' : locale === 'zh' ? 'zh-CN' : 'en-IE', { style: 'currency', currency: preview.currency }).format(Number(value));
  return <section data-purchase-feature="gift-preview" aria-label={t.title} aria-live="polite" style={{display:'grid',gap:8,background:'transparent'}}>
    <strong>{t.title}</strong>
    {preview.gifts.map(gift => <div key={gift.ruleId+'|'+gift.sku} style={{display:'flex',alignItems:'center',gap:12}}>
      {gift.imageUrl && <img src={gift.imageUrl} alt="" width={64} height={64} style={{objectFit:'contain'}} />}
      <div style={{display:'grid',gap:3}}>
        <strong>{gift.name}</strong>
        <small>{t.quantity}: {gift.quantity}</small>
        <small>{gift.condition}</small>
        <small>{gift.status === 'qualified' ? t.qualified : gift.status === 'unavailable' ? t.unavailable : t.shortfall}{gift.status === 'shortfall' && gift.remainingAmount && /^\d{1,9}(?:\.\d{1,2})?$/.test(gift.remainingAmount) ? ' · '+t.remaining+' '+format(gift.remainingAmount) : ''}</small>
      </div>
    </div>)}
  </section>;
}

export function CartActions({ locale, productId, offers, availability, giftPreview }: { locale: Locale; productId: string; offers: Offer[]; availability?: ProductAvailability | null; giftPreview?: PurchaseGiftPreview | null }) {
  const t = copy[locale];
  const [selected, setSelected] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const cartHref = `/${locale}/cart`;
  const selectedOffer = useMemo(() => offers.find(offer => `${offer.sku}|${offer.currency}` === selected), [offers, selected]);
  const stock=selectedOffer?availability?.items?.find(item=>item.sku===selectedOffer.sku)?.available:undefined;
  const blocked=stock===false||(!availability?.items?.length&&availability?.available===false);
  const money=(value:string,currency:string)=>new Intl.NumberFormat(locale==='de'?'de-DE':locale==='zh'?'zh-CN':'en-IE',{style:'currency',currency}).format(Number(value));

  useEffect(() => {
    if (offers.length && !selected) setSelected(`${offers[0]!.sku}|${offers[0]!.currency}`);
  }, [offers, selected]);
  useEffect(() => { setQuantity(1); }, [productId]);

  const add = async (direct=false) => {
    if (!selectedOffer || busy || blocked || !Number.isSafeInteger(quantity)||quantity<1||quantity>100) return;
    setBusy(true);
    setMessage('');
    try {
      // Authenticated additions use the existing revision-checked cart service.
      // Guest cart entries remain local until the existing login/merge flow.
      const authResponse = await fetch('/api/auth/status', {cache:'no-store'});
      if (!authResponse.ok && authResponse.status !== 401) throw new Error('auth unavailable');
      const auth = authResponse.ok ? await authResponse.json() : null;
      if (auth?.user?.role === 'owner') {
        const cart = await data(await fetch('/api/portal/storefront/cart', {cache:'no-store'}));
        if (!Array.isArray(cart?.items) || !Number.isSafeInteger(cart.revision)) throw new Error('cart unavailable');
        const key = (item:{productId:string;sku:string;currency:string}) => JSON.stringify([item.productId,item.sku,item.currency]);
        const requested = {productId,sku:selectedOffer.sku,currency:selectedOffer.currency,quantity};
        const combined = new Map<string,number>();
        for (const row of [...cart.items, ...readGuestCart(), requested]) {
          const k=key(row); const count=(combined.get(k)||0)+row.quantity;
          if (count>100) throw new Error('maximum quantity');
          combined.set(k,count);
        }
        if (combined.size>50) throw new Error('maximum items');
        const items = [...cart.items];
        const index=items.findIndex((row:{productId:string;sku:string;currency:string})=>key(row)===key(requested));
        if(index<0)items.push(requested);else items[index]={...items[index],quantity:items[index].quantity+quantity};
        await data(await fetch('/api/portal/storefront/cart',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:cart.revision,items})}));
        notifyCartChanged();
        setMessage(t.added);
        if(direct)window.location.assign(cartHref);
        else window.dispatchEvent(new Event(cartDrawerOpenEvent));
        return;
      }
      const base='/api/catalog/products/'+encodeURIComponent(productId), query='?lang='+locale;
      const [freshOffers,freshStock,auth]=await Promise.all([
        data(await fetch(base+'/offers'+query,{cache:'no-store'})),
        data(await fetch(base+'/availability'+query,{cache:'no-store'})),
        fetch('/api/auth/status',{cache:'no-store'}),
      ]);
      const fresh=Array.isArray(freshOffers)&&freshOffers.find((offer:Offer)=>offer.sku===selectedOffer.sku&&offer.currency===selectedOffer.currency);
      if(!fresh || !(Number(amountCents(fresh.unitPrice))>0) || fresh.unitPrice!==selectedOffer.unitPrice)throw new Error('offer changed');
      const freshAvailable=freshStock?.items?.find((item:{sku:string;available:boolean})=>item.sku===selectedOffer.sku)?.available;
      if(freshAvailable===false||(!freshStock?.items?.length&&freshStock?.available===false))throw new Error('unavailable');
      if(!auth.ok&&auth.status!==401&&auth.status!==403)throw new Error('auth unavailable');
      const user=auth.ok?(await auth.json())?.user:null;
      const serverCart=user?.role==='owner'?await data(await fetch('/api/portal/storefront/cart',{cache:'no-store'})):null;
      if(user?.role==='owner'&&(!Array.isArray(serverCart?.items)||!Number.isSafeInteger(serverCart?.revision)))throw new Error('invalid cart');
      const merged=new Map<string,CartItem>();
      for(const row of [...(serverCart?.items||[]),...readGuestCart(),{productId,sku:selectedOffer.sku,currency:selectedOffer.currency,quantity}] as CartItem[]){
        const key=JSON.stringify([row.productId,row.sku,row.currency]);
        const count=row.quantity+(merged.get(key)?.quantity||0);
        if(count>100)throw new Error('maximum quantity');
        merged.set(key,{...row,quantity:count});
      }
      const items=[...merged.values()];
      if(items.length>50)throw new Error('maximum items');
      if(serverCart){
        await data(await fetch('/api/portal/storefront/cart',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:serverCart.revision,items})}));
        localStorage.removeItem(guestCartKey);
      }else{
        // Guest selections are local only; product availability and price were checked against the public API.
        localStorage.setItem(guestCartKey,JSON.stringify(items));
      }
      notifyCartChanged();
      setMessage(t.added);
      if(direct) window.location.assign(cartHref+'?step=checkout');
      else window.dispatchEvent(new Event(openCartDrawerEvent));
    } catch (error) { setMessage(error instanceof Error && error.message === 'maximum items' ? t.limit : error instanceof Error && error.message === 'maximum quantity' ? t.quantityLimit : t.error); }
    finally { setBusy(false); }
  };
  useEffect(()=>{window.dispatchEvent(new CustomEvent('alsvid:purchase-config',{detail:{productId,price:selectedOffer?money(selectedOffer.unitPrice,selectedOffer.currency):'',disabled:!selectedOffer||blocked||busy,images:selectedOffer?.images||[]}}))},[productId,selectedOffer?.sku,selectedOffer?.unitPrice,selectedOffer?.currency,blocked,busy,locale]);
  useEffect(()=>{const handler=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.productId===productId)void add(true)};window.addEventListener('alsvid:purchase-now',handler);return()=>window.removeEventListener('alsvid:purchase-now',handler)},[productId,selectedOffer,blocked,busy,quantity]);

  return <div className="cart-actions purchase-controls" id="purchase-controls">
    <div className="purchase-price" aria-live="polite">{selectedOffer?money(selectedOffer.unitPrice,selectedOffer.currency):UI.priceOnRequest[locale]}{selectedOffer?.referencePrice&&Number(selectedOffer.referencePrice)>Number(selectedOffer.unitPrice)&&<div className="price-reference"><del>{money(selectedOffer.referencePrice,selectedOffer.currency)}</del><small>{locale==='de'?'Niedrigster Preis der 30 Tage vor der Preisermäßigung':locale==='en'?'Lowest price in the 30 days before the reduction':'降价前30天最低售价'}</small></div>}</div>
    {offers.length>0&&<fieldset className="purchase-variants"><legend>{t.configuration}</legend><div className="variant-options">{offers.map(offer=>{const key=offer.sku+'|'+offer.currency;return <label className={'variant-option'+(selected===key?' selected':'')} key={key}><input type="radio" name={'configuration-'+productId} checked={selected===key} onChange={()=>setSelected(key)}/><span className="variant-option__label"><strong><i className="variant-swatch" aria-hidden="true" style={colorSwatch(offer.color)?{backgroundColor:colorSwatch(offer.color)}:undefined}/>{offer.color||offer.sku}</strong><small>{offer.spec||offer.sku}</small></span></label>})}</div></fieldset>}
    <p className="availability" aria-live="polite">{blocked?UI.outOfStock[locale]:stock===true?UI.inStockGermany[locale]:UI.availabilityUnknown[locale]}</p>
    <div className="purchase-qty"><span>{t.quantity}</span><div><button type="button" aria-label="−" disabled={quantity<=1} onClick={()=>setQuantity(n=>Math.max(1,n-1))}>−</button><input aria-label={t.quantity} type="number" min="1" max="100" step="1" value={quantity} onChange={e=>setQuantity(Number(e.target.value))}/><button type="button" aria-label="+" disabled={quantity>=100} onClick={()=>setQuantity(n=>Math.min(100,n+1))}>+</button></div></div>
    {/* Only display a current, server-provided quote for this exact selection. */}
    {giftPreview && giftPreview.productId === productId && giftPreview.sku === selectedOffer?.sku && giftPreview.currency === selectedOffer?.currency && giftPreview.quantity === quantity && giftPreview.gifts.length > 0 && <PurchaseGiftSummary locale={locale} preview={giftPreview}/>}
    <button className="button" type="button" onClick={()=>add()} disabled={busy||!selectedOffer||blocked||!Number.isSafeInteger(quantity)||quantity<1||quantity>100}>{busy?t.adding:t.add}</button>
    <button className="purchase-direct" type="button" onClick={()=>add(true)} disabled={busy||!selectedOffer||blocked||!Number.isSafeInteger(quantity)||quantity<1||quantity>100}>{locale==='de'?'Zur Bestellung':locale==='en'?'Continue to order':'立即订购'}</button>
    <Link className="cart-view-link" href={cartHref}>{t.view} →</Link>
    <p className="purchase-disclaimer">{locale==='de'?'Unverbindliche Bestellanfrage; keine Online-Zahlung.':locale==='en'?'Non-binding order request; no online payment.':'非约束性订购申请，暂不在线收款。'}</p>
    {message&&<p role="status">{message}</p>}
  </div>;
}

const cartCopy = {
  de: { title: 'Warenkorb', note: 'Dies ist eine unverbindliche Bestellanfrage. Bestand, Steuern und Versand werden noch bestätigt; eine Zahlung erfolgt nicht.', loading: 'Warenkorb wird geladen…', empty: 'Ihr Warenkorb ist leer.', browse: 'E-Bikes ansehen', login: 'Melden Sie sich mit einem freigeschalteten Kundenkonto an, um Ihre Bestellanfrage sicher zu senden.', loginButton: 'Anmelden und Anfrage senden', error: 'Warenkorb oder Produktdaten konnten nicht geladen werden.', mergeLimit: 'Der Warenkorb enthält zu viele Positionen oder Mengen zum Zusammenführen. Der Gastwarenkorb bleibt gespeichert.', retry: 'Erneut versuchen', remove: 'Entfernen', quantity: 'Anzahl', save: 'Menge speichern', subtotal: 'Zwischensumme', request: 'Bestellanfrage senden', name: 'Name', phone: 'Telefon', country: 'Land', city: 'Stadt', postalCode: 'Postleitzahl', address: 'Adresse', success: 'Ihre Anfrage wurde übermittelt. ALSVID bestätigt Preis, Bestand und Lieferung.', submitError: 'Die Anfrage konnte nicht gesendet werden. Bitte prüfen Sie die Verbindung und versuchen Sie es erneut.', unavailable: 'Ein Produkt oder Preis ist nicht mehr verfügbar. Bitte entfernen Sie es und fügen Sie es erneut hinzu.' },
  en: { title: 'Your cart', note: 'This is a non-binding order request. Stock, taxes and shipping will be confirmed by ALSVID; no payment is taken.', loading: 'Loading your cart…', empty: 'Your cart is empty.', browse: 'Explore E-Bikes', login: 'Sign in with an approved owner account to securely send your order request.', loginButton: 'Sign in to send request', error: 'The cart or product details could not be loaded.', mergeLimit: 'This cart has too many items or units to merge. Your guest cart remains saved.', retry: 'Try again', remove: 'Remove', quantity: 'Quantity', save: 'Save quantity', subtotal: 'Items subtotal', request: 'Send order request', name: 'Name', phone: 'Phone', country: 'Country', city: 'City', postalCode: 'Postal code', address: 'Address', success: 'Your request was sent. ALSVID will confirm price, stock and delivery.', submitError: 'The request could not be sent. Check your connection and try again.', unavailable: 'A product or price is no longer available. Remove it and add it again.' },
  zh: { title: '购物车', note: '此为不具约束力的订购申请，库存、税费与运费将由 ALSVID 确认，不会产生付款。', loading: '正在加载购物车…', empty: '购物车是空的。', browse: '浏览整车', login: '请使用已开通的车主账号登录，以安全提交订购申请。', loginButton: '登录并提交申请', error: '购物车或商品数据加载失败。', mergeLimit: '购物车条目或数量过多，无法合并。访客购物车仍已保留。', retry: '重试', remove: '移除', quantity: '数量', save: '保存数量', subtotal: '商品小计', request: '提交订购申请', name: '姓名', phone: '电话', country: '国家', city: '城市', postalCode: '邮编', address: '地址', success: '申请已提交，ALSVID 将确认价格、库存与配送。', submitError: '申请发送失败，请检查网络后重试。', unavailable: '某商品或价格已不可用，请移除后重新添加。' },
} satisfies Record<Locale, Record<string, string>>;

const transactionCopy = {
  zh: { cart:'购物车', checkout:'结算', complete:'申请结果', next:'前往结算', back:'返回购物车', order:'申请编号', pending:'订购申请已受理 · 尚未付款', orders:'查看我的订单', shipping:'运费与税费待确认，暂不支持在线付款。', review:'确认商品及收货信息' },
  en: { cart:'Cart', checkout:'Checkout', complete:'Request result', next:'Continue to checkout', back:'Back to cart', order:'Request number', pending:'Order request received · not paid', orders:'View my orders', shipping:'Shipping and taxes await confirmation. Online payment is not available.', review:'Review items and delivery details' },
  de: { cart:'Warenkorb', checkout:'Kasse', complete:'Anfragestatus', next:'Zur Kasse', back:'Zurück zum Warenkorb', order:'Anfragenummer', pending:'Bestellanfrage erhalten · nicht bezahlt', orders:'Meine Bestellungen', shipping:'Versand und Steuern werden noch bestätigt. Online-Zahlung ist nicht verfügbar.', review:'Artikel und Lieferdaten prüfen' },
} as const;

type CartItem = { productId: string; sku: string; currency: string; quantity: number };
type CartProduct = { title: string; images: { url: string }[] };
type CartOffer = Offer;
function amountCents(value: string) {
  if (!/^\d{1,9}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  return Number(whole!) * 100 + Number((fraction + '00').slice(0, 2));
}

export function CartPage({ locale, initialStep = 1 }: { locale: Locale; initialStep?: 1 | 2 }) {
  const t = cartCopy[locale];
  const [items, setItems] = useState<CartItem[]>([]);
  const [details, setDetails] = useState<Record<string, { product: CartProduct; offers: CartOffer[] }>>({});
  const [revision, setRevision] = useState(0);
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'guest' | 'ownerOnly' | 'owner'>('guest');
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);
  const [orderId, setOrderId] = useState('');
  const [submittedStatus, setSubmittedStatus] = useState('');
  const flow = transactionCopy[locale];
  const navigateStep = (next: 1 | 2 | 3) => {
    setStep(next);
    window.scrollTo({top:0,behavior:'auto'});
  };
  const [delivery, setDelivery] = useState({ name: '', phone: '', country: '', city: '', postalCode: '', address: '' });
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true); setError('');
    try {
      const auth = await fetch('/api/auth/status', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).catch(() => null);
      let current: CartItem[] = readGuestCart();
      if (auth?.user?.role === 'owner') {
        setStatus('owner'); setAccountId(String(auth.user.id));
        const cart = await data(await fetch('/api/portal/storefront/cart', { cache: 'no-store' }));
        setRevision(cart.revision);
        const merged = new Map<string, CartItem>();
        for (const item of [...cart.items, ...current]) {
          const key = `${item.productId}|${item.sku}|${item.currency}`;
          const previous = merged.get(key);
          const quantity = item.quantity + (previous?.quantity || 0);
          if (quantity > 100) throw new Error('merge_limit');
          merged.set(key, { ...item, quantity });
        }
        if (merged.size > 50) throw new Error('merge_limit');
        current = [...merged.values()];
        if (readGuestCart().length) {
          const result = await data(await fetch('/api/portal/storefront/cart', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision: cart.revision, items: current }) }));
          current = result.items; setRevision(result.revision); localStorage.removeItem(guestCartKey);
        } else current = cart.items;
      } else setStatus(auth?.user ? 'ownerOnly' : 'guest');
      setItems(current);
      if (!current.length) setStep(previous => previous === 3 ? 3 : 1);
      notifyCartChanged();
      const ids = [...new Set(current.map((item: CartItem) => item.productId))];
      const rows = await Promise.all(ids.map(async productId => {
        const query = `?lang=${locale}`;
        const [productResponse, offersResponse] = await Promise.all([
          fetch(`/api/catalog/products/${encodeURIComponent(productId)}${query}`, { cache: 'no-store' }),
          fetch(`/api/catalog/products/${encodeURIComponent(productId)}/offers${query}`, { cache: 'no-store' }),
        ]);
        if (!productResponse.ok || !offersResponse.ok) throw new Error('unavailable');
        return [productId, { product: await productResponse.json(), offers: await offersResponse.json() }] as const;
      }));
      setDetails(Object.fromEntries(rows));
    } catch (cause: any) { setError(cause.message === 'merge_limit' ? t.mergeLimit : t.error); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [locale]);
  useEffect(() => { setStep(previous => previous===3?3:initialStep); }, [initialStep]);

  const save = async (next: CartItem[]) => {
    setBusy(true); setError('');
    try {
      if (status === 'owner') {
        const result = await data(await fetch('/api/portal/storefront/cart', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, items: next }) }));
        setRevision(result.revision); setItems(result.items);
        notifyCartChanged();
      } else {
        localStorage.setItem(guestCartKey, JSON.stringify(next)); setItems(next); notifyCartChanged();
      }
      setSuccess(false);
    } catch { setError(t.error); }
    finally { setBusy(false); }
  };

  const available = items.length > 0 && items.every(item => details[item.productId]?.offers.some(offer => offer.sku === item.sku && offer.currency === item.currency && Number(amountCents(offer.unitPrice)) > 0));
  const currencies = [...new Set(items.map(item => item.currency))];
  const totals = new Map<string, number>();
  for (const item of items) {
    const offer = details[item.productId]?.offers.find(row => row.sku === item.sku && row.currency === item.currency);
    const cents = offer && amountCents(offer.unitPrice);
    if (cents !== null && cents !== undefined) totals.set(item.currency, (totals.get(item.currency) || 0) + cents * item.quantity);
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy || !available || currencies.length !== 1) return;
    setBusy(true); setError('');
    try {
      const key = `alsvid-order-request-v1:${accountId}:${revision}`;
      let requestId = localStorage.getItem(key);
      if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) { requestId = uuidv7(); localStorage.setItem(key, requestId); }
      const requestItems = items.map(item => {
        const offer = details[item.productId]?.offers.find(row => row.sku === item.sku && row.currency === item.currency);
        if (!offer) throw new Error('unavailable');
        return { ...item, unitPrice: offer.unitPrice };
      });
      const result = await data(await fetch('/api/portal/storefront/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: requestId, cartRevision: revision, delivery, items: requestItems }) }));
      if (!result || result.id !== requestId || typeof result.status !== 'string') throw new Error('invalid response');
      localStorage.removeItem(key); setOrderId(result.id); setSubmittedStatus(result.status); setItems([]); setSuccess(true); navigateStep(3); notifyCartChanged();
    } catch (cause: any) { setError(cause.message === 'unavailable' ? t.unavailable : t.submitError); }
    finally { setBusy(false); }
  };

  const loginHref = `/${locale}/account?returnTo=${encodeURIComponent(`/${locale}/cart`)}`;
  return <main className="container cart-page">
    <p className="eyebrow">ALSVID / {UI.cart[locale]}</p>
    <nav className="transaction-steps" aria-label={flow.review} style={{display:'flex',alignItems:'center',gap:'clamp(12px,4vw,48px)',margin:'0 0 28px',flexWrap:'wrap'}}>
      {([flow.cart,flow.checkout,flow.complete] as const).map((label,i)=><span key={label} aria-current={step===i+1?'step':undefined} style={{fontWeight:step===i+1?700:400,opacity:step===i+1?1:0.65}}>{i+1}. {label}{i<2?'  →':''}</span>)}
    </nav>
    <h1>{step===1?flow.cart:step===2?flow.checkout:flow.complete}</h1><p className="lede">{t.note}</p>
    {loading && <p role="status">{t.loading}</p>}
    {!loading && status !== 'owner' && items.length > 0 && <section className="cart-notice"><p>{t.login}</p><a className="button" href={loginHref}>{t.loginButton}</a></section>}
    {!loading && error && <p className="cart-error" role="alert">{error} <button type="button" onClick={() => void load()}>{t.retry}</button></p>}
    {!loading && !error && status === 'owner' && success && step === 3 && <section className="cart-success" role="status"><h2>{flow.pending}</h2><p>{t.success}</p><p>{flow.order}: <strong>{orderId}</strong></p><p>{locale==='zh'?'服务器状态':locale==='de'?'Serverstatus':'Server status'}: {submittedStatus}</p><Link className="button" href={`/${locale}/account`}>{flow.orders}</Link></section>}
    {!loading && !error && !success && !items.length && <section className="cart-notice"><p>{t.empty}</p><a className="button" href={`/${locale}/e-bikes`}>{t.browse}</a></section>}
    {!loading && !error && !success && items.length > 0 && <>
      {step===1&&<div className="cart-lines">{items.map((item, index) => {
        const product = details[item.productId]?.product;
        const offer = details[item.productId]?.offers.find(row => row.sku === item.sku && row.currency === item.currency);
        const key = `${item.productId}:${item.sku}:${item.currency}`;
        return <article className="cart-line" key={key}>
          {product?.images[0]?.url && <img src={product.images[0].url} alt="" />}
          <div className="cart-line-main"><h2>{product?.title || item.sku}</h2><p>{item.sku}{offer ? ` · ${offer.spec} · ${offer.color}` : ''}</p><strong>{offer ? `${offer.currency} ${offer.unitPrice}` : t.unavailable}</strong></div>
          <label>{t.quantity}<input type="number" min="1" max="100" value={quantities[key] ?? String(item.quantity)} onChange={event => setQuantities(current => ({ ...current, [key]: event.target.value }))} /></label>
          <div className="cart-line-actions"><button type="button" disabled={busy} onClick={() => { const quantity = Number(quantities[key] ?? item.quantity); if (Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 100) { void save(items.map((row, i) => i === index ? { ...row, quantity } : row)); setQuantities(current => { const next = { ...current }; delete next[key]; return next; }); } }}>{t.save}</button><button type="button" disabled={busy} onClick={() => void save(items.filter((_, i) => i !== index))}>{t.remove}</button></div>
        </article>;
      })}</div>}
      {step===2&&<section aria-label={flow.review}><h2>{flow.review}</h2>{items.map(item=><p key={`${item.productId}|${item.sku}|${item.currency}`}>{details[item.productId]?.product.title||item.sku} · {item.quantity} × {item.sku}</p>)}</section>}
      {available && [...totals.entries()].map(([currency, cents]) => <p className="cart-subtotal" key={currency}>{t.subtotal} · {currency} <strong>{(cents / 100).toFixed(2)}</strong></p>)}
      {step===1 && available && currencies.length===1 && <button className="button" type="button" disabled={busy||Object.keys(quantities).length>0} onClick={()=>navigateStep(2)}>{flow.next}</button>}
      {step===2 && <button type="button" className="cart-view-link" onClick={()=>navigateStep(1)} disabled={busy}>{flow.back}</button>}
      {step===2 && <p>{flow.shipping}</p>}
      {step===2 && status === 'owner' && available && currencies.length === 1 && <form className="cart-checkout" onSubmit={submit}><h2>{t.request}</h2>{(Object.keys(delivery) as (keyof typeof delivery)[]).map(field => <label key={field}>{t[field]}<input required maxLength={field === 'address' ? 500 : field === 'phone' ? 80 : field==='postalCode'?40:field==='country'?100:120} value={delivery[field]} onChange={event => setDelivery(current => ({ ...current, [field]: event.target.value }))} /></label>)}<button className="button" disabled={busy}>{busy ? '…' : t.request}</button></form>}
    </>}
  </main>;
}
