'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@/lib/alsvid-api';
import { openCartDrawerEvent } from './cart-drawer';
import { UI } from '@/lib/ui-text';
import { cartChangedEvent, guestCartKey, guestCartQuantity, readGuestCart } from './cart-storage';

export const cartDrawerOpenEvent = 'alsvid-cart-drawer-open';

export function CartNavLink({ locale }: { locale: Locale }) {
  const [quantity, setQuantity] = useState(0);
  const label = UI.cart[locale];

  useEffect(() => {
    let revision = 0;
    const refresh = async () => {
      const current = ++revision;
      setQuantity(guestCartQuantity());
      try {
        const auth = await fetch('/api/auth/status', { cache: 'no-store' }).then(response => response.ok ? response.json() : null);
        if (auth?.user?.role !== 'owner') return;
        const cart = await fetch('/api/portal/storefront/cart', { cache: 'no-store' }).then(response => response.ok ? response.json() : null);
        if (current === revision && Array.isArray(cart?.items)) setQuantity(cart.items.reduce((total: number, item: { quantity?: number }) => total + (Number(item.quantity) || 0), guestCartQuantity()));
      } catch { /* Keep the locally stored guest count when account services are unavailable. */ }
    };
    const onStorage = (event: StorageEvent) => { if (event.key === guestCartKey) void refresh(); };
    void refresh();
    window.addEventListener(cartChangedEvent, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(cartChangedEvent, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return <Link className="cart-nav-link" href={`/${locale}/cart`} aria-haspopup="dialog" onClick={event=>{if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();window.dispatchEvent(new Event(openCartDrawerEvent));}}} aria-label={quantity ? `${label}, ${quantity}` : label} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); window.dispatchEvent(new Event(cartDrawerOpenEvent)); }}>
    {label}{quantity > 0 && <span className="cart-nav-count" aria-hidden="true">{quantity > 99 ? '99+' : quantity}</span>}
  </Link>;
}

type DrawerItem={productId:string;sku:string;currency:string;quantity:number};
type DrawerRow=DrawerItem & {title:string;image?:string;unitPrice?:string};
const drawerCopy={
 zh:{title:'购物袋',close:'关闭购物袋',empty:'购物袋为空',loading:'正在读取购物袋…',error:'无法读取完整购物袋，请前往购物车重试。',view:'查看购物车',subtotal:'商品小计（不含运费）',unavailable:'价格暂不可用',note:'暂不在线收款；运费尚未计算。'},
 de:{title:'Warenkorb',close:'Warenkorb schließen',empty:'Ihr Warenkorb ist leer.',loading:'Warenkorb wird geladen…',error:'Der Warenkorb konnte nicht vollständig geladen werden. Bitte öffnen Sie den Warenkorb.',view:'Warenkorb ansehen',subtotal:'Artikel-Zwischensumme (ohne Versand)',unavailable:'Preis nicht verfügbar',note:'Keine Online-Zahlung; Versandkosten noch nicht berechnet.'},
 en:{title:'Shopping bag',close:'Close shopping bag',empty:'Your shopping bag is empty.',loading:'Loading shopping bag…',error:'The full cart could not be loaded. Please open the cart to retry.',view:'View cart',subtotal:'Item subtotal (excluding shipping)',unavailable:'Price unavailable',note:'Online payment is not yet available; shipping has not been calculated.'}
} satisfies Record<Locale,Record<string,string>>;
function priceCents(value?:string){if(!value||!/^\d{1,9}(?:\.\d{1,2})?$/.test(value))return null;const [a,b='']=value.split('.');return Number(a)*100+Number((b+'00').slice(0,2));}
export function CartDrawer({locale}:{locale:Locale}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [open,setOpen]=useState(false),[rows,setRows]=useState<DrawerRow[]>([]),[loading,setLoading]=useState(false),[failed,setFailed]=useState(false),[revision,setRevision]=useState(0);
 const t=drawerCopy[locale];
 useEffect(()=>{
  const show=()=>{setOpen(true);setRevision(n=>n+1);};
  const change=()=>setRevision(n=>n+1);
  const storage=(event:StorageEvent)=>{if(event.key===guestCartKey)change();};
  window.addEventListener(cartDrawerOpenEvent,show);window.addEventListener(cartChangedEvent,change);window.addEventListener('storage',storage);
  return()=>{window.removeEventListener(cartDrawerOpenEvent,show);window.removeEventListener(cartChangedEvent,change);window.removeEventListener('storage',storage);};
 },[]);
 useEffect(()=>{const node=dialog.current;if(!node)return;if(open&&!node.open)node.showModal();else if(!open&&node.open)node.close();},[open]);
 useEffect(()=>{
  if(!open)return;
  const controller=new AbortController(),signal=controller.signal;
  const json=async(url:string)=>{const r=await fetch(url,{cache:'no-store',signal});if(!r.ok)throw new Error('request failed');return r.json();};
  const load=async()=>{
   setLoading(true);setFailed(false);setRows([]);
   try{
    const authResponse=await fetch('/api/auth/status',{cache:'no-store',signal});
    if(!authResponse.ok&&authResponse.status!==401)throw new Error('auth unavailable');
    const auth=authResponse.ok?await authResponse.json():null;
    const guest:DrawerItem[]=readGuestCart();
    const account=auth?.user?.role==='owner'?await json('/api/portal/storefront/cart'):null;
    if(account&&!Array.isArray(account.items))throw new Error('cart unavailable');
    const merged=new Map<string,DrawerItem>();
    for(const item of [...(account?.items||[]),...guest] as DrawerItem[]){
     const key=JSON.stringify([item.productId,item.sku,item.currency]);
     const old=merged.get(key);
     merged.set(key,{...item,quantity:item.quantity+(old?.quantity||0)});
    }
    const items=[...merged.values()];
    const products=await Promise.all([...new Set(items.map(i=>i.productId))].map(async id=>{
     const base='/api/catalog/products/'+encodeURIComponent(id),q='?lang='+locale;
     const [product,offers]=await Promise.all([json(base+q),json(base+'/offers'+q)]);
     return [id,{product,offers}] as const;
    }));
    const details=new Map(products);
    if(!signal.aborted)setRows(items.map(item=>{
     const detail=details.get(item.productId),offer=Array.isArray(detail?.offers)?detail.offers.find((x:{sku:string;currency:string})=>x.sku===item.sku&&x.currency===item.currency):null;
     return {...item,title:detail?.product?.title||item.sku,image:detail?.product?.images?.[0]?.url,unitPrice:typeof offer?.unitPrice==='string'?offer.unitPrice:undefined};
    }));
   }catch{if(!signal.aborted)setFailed(true);}
   finally{if(!signal.aborted)setLoading(false);}
  };
  void load();return()=>controller.abort();
 },[open,locale,revision]);
 const totals=new Map<string,number>();let complete=true;
 for(const row of rows){const price=priceCents(row.unitPrice);if(price===null){complete=false;continue;}totals.set(row.currency,(totals.get(row.currency)||0)+price*row.quantity);}
 const format=(cents:number,currency:string)=>new Intl.NumberFormat(locale==='de'?'de-DE':locale==='zh'?'zh-CN':'en-IE',{style:'currency',currency}).format(cents/100);
 return <dialog ref={dialog} className="quick-cart-drawer" aria-label={t.title} onClose={()=>setOpen(false)} onClick={event=>{if(event.target===dialog.current){const r=dialog.current.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)setOpen(false);}}}>
  <header><h2>{t.title}</h2><button type="button" onClick={()=>setOpen(false)} aria-label={t.close}>×</button></header>
  <div className="quick-cart-items" aria-live="polite">
   {loading?<p>{t.loading}</p>:failed?<p role="alert">{t.error}</p>:!rows.length?<p>{t.empty}</p>:rows.map(row=><article key={JSON.stringify([row.productId,row.sku,row.currency])}>{row.image?<img src={row.image} alt=""/>:<span/>}<div><strong>{row.title}</strong><small>{row.sku} · ×{row.quantity}</small><span>{priceCents(row.unitPrice)===null?t.unavailable:format(priceCents(row.unitPrice)!,row.currency)}</span></div></article>)}
  </div>
  <footer>{!loading&&!failed&&complete&&[...totals].map(([currency,cents])=><p key={currency}>{t.subtotal} <strong>{format(cents,currency)}</strong></p>)}<p>{t.note}</p><Link className="button" href={'/'+locale+'/cart'} onClick={()=>setOpen(false)}>{t.view} →</Link></footer>
 </dialog>;
}
