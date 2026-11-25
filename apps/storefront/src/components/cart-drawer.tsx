'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Locale, Offer } from '@/lib/alsvid-api';
import { cartChangedEvent, guestCartKey, readGuestCart } from './cart-storage';

export const openCartDrawerEvent = 'alsvid:open-cart-drawer';
type Item = { productId:string; sku:string; currency:string; quantity:number };
type Row = Item & { title:string; image?:string; unitPrice?:string };
const copy = {
  zh:{title:'购物袋',close:'关闭',loading:'正在读取购物袋…',empty:'购物袋是空的',cart:'查看购物车',checkout:'前往结算',subtotal:'商品小计',error:'购物袋读取失败，请重试。',unavailable:'商品或价格不可用',note:'运费和税费以实际确认结果为准。',qty:'数量'},
  en:{title:'Shopping bag',close:'Close',loading:'Loading your bag…',empty:'Your bag is empty',cart:'View cart',checkout:'Continue to checkout',subtotal:'Items subtotal',error:'Could not load your bag. Try again.',unavailable:'Product or price unavailable',note:'Shipping and tax are subject to confirmation.',qty:'Quantity'},
  de:{title:'Warenkorb',close:'Schließen',loading:'Warenkorb wird geladen…',empty:'Ihr Warenkorb ist leer',cart:'Warenkorb ansehen',checkout:'Zur Kasse',subtotal:'Zwischensumme',error:'Der Warenkorb konnte nicht geladen werden. Bitte erneut versuchen.',unavailable:'Artikel oder Preis nicht verfügbar',note:'Versand und Steuern werden noch bestätigt.',qty:'Menge'},
} as const;
async function json(url:string) {
  const response=await fetch(url,{cache:'no-store'});
  if(!response.ok) throw new Error('request failed');
  return response.json();
}
function minor(value:string|undefined) {
  if (!value || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value)) return null;
  const [a,b='']=value.split('.');
  return Number(a)*100+Number((b+'00').slice(0,2));
}
export function CartDrawer({locale}:{locale:Locale}) {
  const t=copy[locale], pathname=usePathname();
  const dialog=useRef<HTMLDialogElement>(null), generation=useRef(0);
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(false),[rows,setRows]=useState<Row[]>([]);
  useEffect(()=>{setOpen(false)},[pathname]);
  useEffect(()=>{
    const show=()=>setOpen(true);
    window.addEventListener(openCartDrawerEvent,show);
    return()=>window.removeEventListener(openCartDrawerEvent,show);
  },[]);
  useEffect(()=>{
    const el=dialog.current;
    if(open && el && !el.open)el.showModal();
    else if(!open && el?.open)el.close();
    if(!open)return;
    const overflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    return()=>{document.body.style.overflow=overflow};
  },[open]);
  const load=async()=>{
    const seq=++generation.current;
    setBusy(true);setError(false);setRows([]);
    try{
      let items:Item[]=readGuestCart();
      const auth=await fetch('/api/auth/status',{cache:'no-store'});
      if(auth.ok){
        const user=(await auth.json())?.user;
        if(user?.role==='owner'){
          const cart=await json('/api/portal/storefront/cart');
          if(!Array.isArray(cart?.items))throw new Error('invalid cart');
          items=[...cart.items,...items];
        }
      }else if(auth.status!==401&&auth.status!==403)throw new Error('auth unavailable');
      const merged=new Map<string,Item>();
      for(const item of items){
        const key=JSON.stringify([item.productId,item.sku,item.currency]);
        merged.set(key,{...item,quantity:(merged.get(key)?.quantity||0)+item.quantity});
      }
      const products=await Promise.all([...new Set(items.map(item=>item.productId))].map(async id=>{
        try{
          const url='/api/catalog/products/'+encodeURIComponent(id), query='?lang='+locale;
          const [product,offers]=await Promise.all([json(url+query),json(url+'/offers'+query)]);
          return [id,{product,offers:Array.isArray(offers)?offers as Offer[]:[]}] as const;
        }catch{return [id,null] as const}
      }));
      const byProduct=new Map(products);
      const next=[...merged.values()].map(item=>{
        const record=byProduct.get(item.productId);
        const offer=record?.offers.find(x=>x.sku===item.sku&&x.currency===item.currency);
        return {...item,title:record?.product?.title||item.sku,image:offer?.images?.[0]?.url||record?.product?.images?.[0]?.url,unitPrice:offer?.unitPrice};
      });
      if(seq===generation.current)setRows(next);
    }catch{if(seq===generation.current)setError(true)}
    finally{if(seq===generation.current)setBusy(false)}
  };
  useEffect(()=>{
    if(!open)return;
    const refresh=()=>void load();
    const storage=(e:StorageEvent)=>{if(e.key===guestCartKey)refresh()};
    refresh();
    window.addEventListener(cartChangedEvent,refresh);
    window.addEventListener('storage',storage);
    return()=>{generation.current++;window.removeEventListener(cartChangedEvent,refresh);window.removeEventListener('storage',storage)};
  },[open,locale]);
  const totals=new Map<string,number>();
  const ready=rows.length>0&&rows.every(row=>Number(minor(row.unitPrice))>0&&row.quantity<=100)&&rows.length<=50;
  if(ready)for(const row of rows)totals.set(row.currency,(totals.get(row.currency)||0)+minor(row.unitPrice)!*row.quantity);
  const money=(value:number,currency:string)=>new Intl.NumberFormat(locale==='de'?'de-DE':locale==='zh'?'zh-CN':'en-IE',{style:'currency',currency}).format(value/100);
  return <dialog ref={dialog} className="alsvid-cart-drawer" aria-label={t.title} onClose={()=>setOpen(false)} onClick={event=>{if(event.target===event.currentTarget){const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)setOpen(false)}}}>
    <div className="alsvid-cart-drawer-inner">
      <header><h2>{t.title}</h2><button type="button" onClick={()=>setOpen(false)} aria-label={t.close} autoFocus>×</button></header>
      <div className="alsvid-cart-drawer-lines" aria-live="polite">
        {busy?<p>{t.loading}</p>:error?<p role="alert">{t.error} <button type="button" onClick={()=>void load()}>{locale==='zh'?'重试':locale==='de'?'Erneut versuchen':'Retry'}</button></p>:!rows.length?<p>{t.empty}</p>:rows.map(row=><article key={JSON.stringify([row.productId,row.sku,row.currency])}>
          {row.image?<img src={row.image} alt=""/>:<span aria-hidden="true"/>}<div><strong>{row.title}</strong><small>{row.sku}</small><small>{t.qty}: {row.quantity}</small></div><span>{!(Number(minor(row.unitPrice))>0)?t.unavailable:money(minor(row.unitPrice)!*row.quantity,row.currency)}</span>
        </article>)}
      </div>
      <div className="alsvid-cart-drawer-bottom">
        {ready&&[...totals].map(([currency,value])=><p key={currency}>{t.subtotal} <strong>{money(value,currency)}</strong></p>)}
        <small>{t.note}</small>
        <Link className="button" href={'/'+locale+'/cart'} onClick={()=>setOpen(false)}>{t.cart}</Link>
        {ready&&!busy&&!error&&totals.size===1&&<Link className="button" href={'/'+locale+'/cart?step=checkout'} onClick={()=>setOpen(false)}>{t.checkout}</Link>}
      </div>
    </div>
  </dialog>;
}
