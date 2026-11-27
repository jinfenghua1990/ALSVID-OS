'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { Locale, Offer, ProductAvailability } from '@/lib/alsvid-api';
import { UI } from '@/lib/ui-text';
import { guestCartKey, notifyCartChanged, readGuestCart } from './cart-storage';
import { openCartDrawerEvent } from './cart-drawer';
import { uuidv7 } from '@/lib/uuid';

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
    setBusy(true); setMessage('');
    try {
      const base='/api/catalog/products/'+encodeURIComponent(productId), query='?lang='+locale;
      const [freshOffers,freshStock,auth]=await Promise.all([
        fetch(base+'/offers'+query,{cache:'no-store'}).then(data),
        fetch(base+'/availability'+query,{cache:'no-store'}).then(data),
        fetch('/api/auth/status',{cache:'no-store'}),
      ]);
      const fresh=Array.isArray(freshOffers)&&freshOffers.find((offer:Offer)=>offer.sku===selectedOffer.sku&&offer.currency===selectedOffer.currency);
      if(!fresh||!(Number(amountCents(fresh.unitPrice))>0)||fresh.unitPrice!==selectedOffer.unitPrice)throw new Error('offer changed');
      const freshAvailable=freshStock?.items?.find((item:{sku:string;available:boolean})=>item.sku===selectedOffer.sku)?.available;
      if(freshAvailable===false||(!freshStock?.items?.length&&freshStock?.available===false))throw new Error('unavailable');
      if(!auth.ok&&auth.status!==401&&auth.status!==403)throw new Error('auth unavailable');
      const user=auth.ok?(await auth.json())?.user:null;
      const serverCart=user?.role==='owner'?await data(await fetch('/api/portal/storefront/cart',{cache:'no-store'})):null;
      if(user?.role==='owner'&&(!Array.isArray(serverCart?.items)||!Number.isSafeInteger(serverCart?.revision)))throw new Error('invalid cart');
      const requested:CartItem={productId,sku:selectedOffer.sku,currency:selectedOffer.currency,quantity};
      const merge=(rows:CartItem[])=>{
        const merged=new Map<string,CartItem>();
        for(const row of rows){
          const key=JSON.stringify([row.productId,row.sku,row.currency]);
          const count=row.quantity+(merged.get(key)?.quantity||0);
          if(count>100)throw new Error('maximum quantity');
          merged.set(key,{...row,quantity:count});
        }
        if(merged.size>50)throw new Error('maximum items');
        return [...merged.values()];
      };
      const guest:CartItem[]=readGuestCart();
      const combined=merge([...(serverCart?.items||[]),...guest,requested]);
      if(serverCart){
        // Do not clear guest items here; the existing cart-page merge flow handles them.
        const items=merge([...serverCart.items,requested]);
        await data(await fetch('/api/portal/storefront/cart',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:serverCart.revision,items})}));
      }else{
        // Guest selections are local; a catalog response is not a server cart acknowledgement.
        localStorage.setItem(guestCartKey,JSON.stringify(combined));
      }
      notifyCartChanged(); setMessage(t.added);
      if(direct)window.location.assign(cartHref+'?step=checkout');
      else if(serverCart)window.dispatchEvent(new Event(openCartDrawerEvent));
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

const guestCopy = {
 zh:{title:'免注册下单',email:'邮箱',code:'邮箱验证码',send:'发送验证码',verify:'验证邮箱',verified:'邮箱已验证',lookup:'查询访客订单',order:'订单编号',claim:'登录后认领订单',accept:'接受报价',decline:'拒绝报价',receive:'确认收货',error:'验证或订单操作失败，请重试。'},
 en:{title:'Guest checkout',email:'Email',code:'Verification code',send:'Send code',verify:'Verify email',verified:'Email verified',lookup:'Find guest order',order:'Order number',claim:'Sign in to claim order',accept:'Accept quote',decline:'Decline quote',receive:'Confirm receipt',error:'Verification or order action failed. Please retry.'},
 de:{title:'Als Gast bestellen',email:'E-Mail',code:'Bestätigungscode',send:'Code senden',verify:'E-Mail bestätigen',verified:'E-Mail bestätigt',lookup:'Gastbestellung suchen',order:'Bestellnummer',claim:'Anmelden und Bestellung übernehmen',accept:'Angebot annehmen',decline:'Angebot ablehnen',receive:'Erhalt bestätigen',error:'Bestätigung oder Bestellaktion fehlgeschlagen. Bitte erneut versuchen.'},
} as const;
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

const orderStatuses:Record<Locale,Record<string,string>>={
 zh:{submitted:'申请已提交，尚未付款',quoted:'已报价',accepted:'报价已接受',allocated:'库存已分配，等待付款',partially_paid:'部分付款',paid:'已付款',shipped:'已发货',delivered:'已收货',cancelled:'订单已取消',declined:'报价已拒绝'},
 en:{submitted:'Request submitted, not paid',quoted:'Quote issued',accepted:'Quote accepted',allocated:'Stock allocated, awaiting payment',partially_paid:'Partially paid',paid:'Paid',shipped:'Shipped',delivered:'Delivered',cancelled:'Order cancelled',declined:'Quote declined'},
 de:{submitted:'Anfrage eingereicht, nicht bezahlt',quoted:'Angebot erstellt',accepted:'Angebot angenommen',allocated:'Bestand reserviert, Zahlung offen',partially_paid:'Teilweise bezahlt',paid:'Bezahlt',shipped:'Versandt',delivered:'Zugestellt',cancelled:'Bestellung storniert',declined:'Angebot abgelehnt'},
};
export function CartPage({ locale, initialStep = 1, initialOrderId }: { locale: Locale; initialStep?: 1 | 2; initialOrderId?: string }) {
  const t = cartCopy[locale];
  const g = guestCopy[locale];
  const [guestEmail,setGuestEmail]=useState('');
  const [guestCode,setGuestCode]=useState('');
  const [guestChallenge,setGuestChallenge]=useState('');
  const [guestToken,setGuestToken]=useState('');
  const [guestBusy,setGuestBusy]=useState(false);
  const [guestError,setGuestError]=useState('');
  const [lookupId,setLookupId]=useState(initialOrderId||'');
  const [guestOrder,setGuestOrder]=useState<any>(null);
  const guestRequest=async (action:string,body:object,token='')=>data(await fetch('/api/public/guest-checkout/'+action,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body),cache:'no-store'}));
  const guestAction=async(action:string)=>{
    if(guestBusy)return;
    setGuestBusy(true);setGuestError('');
    try{
      if(action==='start'){setGuestToken('');setGuestChallenge('');const r=await guestRequest('start',{email:guestEmail,locale});setGuestChallenge(r.challengeId);}
      else if(action==='verify'){const r=await guestRequest('verify',{email:guestEmail,challengeId:guestChallenge,code:guestCode});setGuestToken(r.accessToken);}
      else if(action==='lookup'){const r=await guestRequest('lookup',{orderId:lookupId.trim().toLowerCase()},guestToken);setGuestOrder(r);}
      else if(action==='claim'){await data(await fetch('/api/portal/storefront/guest-claim',{method:'POST',headers:{'Content-Type':'application/json','X-Guest-Authorization':'Bearer '+guestToken},body:JSON.stringify({orderId:lookupId.trim().toLowerCase()})}));window.location.assign('/'+locale+'/account/orders');}
      else if(guestOrder){await guestRequest(action==='receive'?'receive':'respond',{orderId:guestOrder.id,quoteId:guestOrder.quote?.id,decision:action,note:''},guestToken);setGuestOrder(await guestRequest('lookup',{orderId:guestOrder.id},guestToken));}
    }catch{setGuestError(g.error)}finally{setGuestBusy(false)}
  };
  const [items, setItems] = useState<CartItem[]>([]);
  const [details, setDetails] = useState<Record<string, { product: CartProduct; offers: CartOffer[] }>>({});
  const [revision, setRevision] = useState(0);
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState<'guest' | 'ownerOnly' | 'owner'>('guest');
  const [success, setSuccess] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(initialOrderId?3:initialStep);
  const [orderId, setOrderId] = useState('');
  const [submittedStatus, setSubmittedStatus] = useState('');
  const flow = transactionCopy[locale];
  const navigateStep = (next: 1 | 2 | 3) => {
    setStep(next);
    if(next!==3)window.history.replaceState(null,'','/'+locale+'/cart'+(next===2?'?step=checkout':''));
    window.scrollTo({top:0,behavior:'auto'});
  };
  const [delivery, setDelivery] = useState({ name: '', phone: '', country: '', city: '', postalCode: '', address: '' });
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true); setError('');
    try {
      if(initialOrderId){
        const auth=await fetch('/api/auth/status',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
        if(auth?.user?.role!=='owner'){setStatus(auth?.user?'ownerOnly':'guest');setLookupId(initialOrderId);return;}
        const response=await fetch('/api/portal/storefront/orders/'+encodeURIComponent(initialOrderId),{cache:'no-store'});
        if(response.status===404){setStatus('owner');setLookupId(initialOrderId);return;}
        const order=await data(response);
        if(order?.id!==initialOrderId || typeof order.status!=='string')throw Error('invalid order');
        setOrderId(order.id);setSubmittedStatus(order.status);setStatus('owner');setSuccess(true);setStep(3);
        if(order.delivery)setDelivery(current=>({...current,...order.delivery}));
        return;
      }
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

  useEffect(() => { void load(); }, [locale,initialOrderId]);
  useEffect(() => { setStep(initialOrderId?3:initialStep); }, [initialStep,initialOrderId]);

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
    event.preventDefault(); if (busy || !available || currencies.length !== 1 || (status!=='owner'&&(status!=='guest'||!guestToken))) return;
    setBusy(true); setError('');
    try {
      const key = status==='guest'?'alsvid-guest-request-v1:'+JSON.stringify([guestEmail.trim().toLowerCase(),items,delivery]):`alsvid-order-request-v1:${accountId}:${revision}`;
      let requestId = localStorage.getItem(key);
      if (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) { requestId = uuidv7(); localStorage.setItem(key, requestId); }
      const requestItems = items.map(item => {
        const offer = details[item.productId]?.offers.find(row => row.sku === item.sku && row.currency === item.currency);
        if (!offer) throw new Error('unavailable');
        return { ...item, unitPrice: offer.unitPrice };
      });
      const result = status==='guest'
        ? await guestRequest('submit',{id:requestId,delivery,items:requestItems},guestToken)
        : await data(await fetch('/api/portal/storefront/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: requestId, cartRevision: revision, delivery, items: requestItems }) }));
      if (!result || result.id !== requestId || typeof result.status !== 'string') throw new Error('invalid response');
      localStorage.removeItem(key); if(status==='guest'){localStorage.removeItem(guestCartKey);setLookupId(result.id);} setOrderId(result.id); setSubmittedStatus(result.status); setItems([]); setSuccess(true); navigateStep(3); window.history.replaceState(null,'','/'+locale+'/cart?order='+encodeURIComponent(result.id)); notifyCartChanged();
    } catch (cause: any) { setError(cause.message === 'unavailable' ? t.unavailable : t.submitError); }
    finally { setBusy(false); }
  };

  const loginHref = `/${locale}/account?returnTo=${encodeURIComponent(`/${locale}/cart`)}`;
  return <main className="container cart-page">
    <p className="eyebrow">ALSVID / {UI.cart[locale]}</p>
    <nav className="transaction-steps" aria-label={flow.review} style={{display:'flex',alignItems:'center',gap:'clamp(12px,4vw,48px)',margin:'0 0 28px',flexWrap:'wrap'}}>
      {([flow.cart,flow.checkout,flow.complete] as const).map((label,i)=><span key={label} aria-current={step===i+1?'step':undefined} style={{fontWeight:step===i+1?700:400,opacity:step===i+1?1:0.65}}>{i+1}. {label}{i<2?'  →':''}</span>)}
    </nav>
    <h1>{step===1?flow.cart:step===2?flow.checkout:flow.complete}</h1>{step!==3&&<p className="lede">{t.note}</p>}
    {loading && <p role="status">{t.loading}</p>}
    {!loading && status !== 'owner' && items.length > 0 && <section className="cart-notice"><a className="cart-view-link" href={loginHref}>{t.loginButton}</a></section>}
    {!loading && (status==='guest'||(initialOrderId&&!success&&status==='owner')) && (step===2||step===3||!items.length) && <section className="cart-checkout" aria-label={g.title}>
      <h2>{step===2&&items.length?g.title:g.lookup}</h2>
      <label>{g.email}<input type="email" autoComplete="email" value={guestEmail} maxLength={254} onChange={e=>{setGuestEmail(e.target.value);setGuestChallenge('');setGuestToken('');setGuestOrder(null)}} /></label>
      <button type="button" disabled={guestBusy||!guestEmail} onClick={()=>void guestAction('start')}>{g.send}</button>
      {guestChallenge&&!guestToken&&<><label>{g.code}<input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={guestCode} onChange={e=>setGuestCode(e.target.value)}/></label><button type="button" disabled={guestBusy||!/^\d{8}$/.test(guestCode)} onClick={()=>void guestAction('verify')}>{g.verify}</button></>}
      {guestToken&&<p role="status">{g.verified}</p>}
      {step!==2&&guestToken&&<><label>{g.order}<input value={lookupId} maxLength={36} onChange={e=>setLookupId(e.target.value)}/></label><button type="button" disabled={guestBusy||!lookupId} onClick={()=>void guestAction('lookup')}>{g.lookup}</button>
      {guestOrder&&<section><p>{g.order}: {guestOrder.id}</p><p>{orderStatuses[locale][guestOrder.status]||guestOrder.status}</p>
      {guestOrder.quote&&<p>{guestOrder.currency} {(Number(guestOrder.quote.totalMinor)/100).toFixed(2)}</p>}
      {guestOrder.status==='quoted'&&<><button type="button" disabled={guestBusy} onClick={()=>void guestAction('accept')}>{g.accept}</button><button type="button" disabled={guestBusy} onClick={()=>void guestAction('decline')}>{g.decline}</button></>}
      {guestOrder.status==='shipped'&&<button type="button" disabled={guestBusy} onClick={()=>void guestAction('receive')}>{g.receive}</button>}
      {guestOrder.shipment&&<p>{guestOrder.shipment.carrier} · {guestOrder.shipment.trackingNo}</p>}
      {status==='owner'?<button type="button" disabled={guestBusy} onClick={()=>void guestAction('claim')}>{g.claim}</button>:<Link href={loginHref}>{g.claim}</Link>}
      </section>}</>}
      {guestError&&<p role="alert">{guestError}</p>}
    </section>}
    {!loading && error && <p className="cart-error" role="alert">{error} <button type="button" onClick={() => void load()}>{t.retry}</button></p>}
    {!loading && !error && success && step === 3 && <section className="cart-success" role="status"><h2>{orderStatuses[locale][submittedStatus]||submittedStatus}</h2>{submittedStatus==='submitted'&&<p>{t.success}</p>}<p>{flow.order}: <strong>{orderId}</strong></p>{delivery.address&&<p>{delivery.name} · {delivery.address} · {delivery.postalCode} {delivery.city} · {delivery.country}</p>}{status==='owner'&&<Link className="button" href={`/${locale}/account`}>{flow.orders}</Link>}</section>}
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
      {step===2 && (status === 'owner'||(status==='guest'&&!!guestToken)) && available && currencies.length === 1 && <form className="cart-checkout" onSubmit={submit}><h2>{t.request}</h2>{(Object.keys(delivery) as (keyof typeof delivery)[]).map(field => <label key={field}>{t[field]}<input required maxLength={field === 'address' ? 500 : field === 'phone' ? 80 : field==='postalCode'?40:field==='country'?100:120} value={delivery[field]} onChange={event => setDelivery(current => ({ ...current, [field]: event.target.value }))} /></label>)}<button className="button" disabled={busy}>{busy ? '…' : t.request}</button></form>}
    </>}
  </main>;
}
