'use client';
import {useEffect,useState} from 'react';
import type {Locale} from '@/lib/alsvid-api';
const labels={de:{buy:'Jetzt bestellen',loading:'Wird aktualisiert…'},en:{buy:'Order now',loading:'Updating…'},zh:{buy:'立即订购',loading:'正在更新…'}} satisfies Record<Locale,Record<string,string>>;
export function StickyPurchaseBar({locale,productId,initialPrice,disabled=false}:{locale:Locale;productId:string;initialPrice:string;disabled?:boolean}){
 const [price,setPrice]=useState(initialPrice),[blocked,setBlocked]=useState(disabled),[busy,setBusy]=useState(false),t=labels[locale];
 useEffect(()=>{const handler=(event:Event)=>{const detail=(event as CustomEvent).detail;if(detail?.productId!==productId)return;setPrice(String(detail.price||''));setBlocked(Boolean(detail.disabled))};window.addEventListener('alsvid:purchase-config',handler);return()=>window.removeEventListener('alsvid:purchase-config',handler)},[productId]);
 const buy=()=>{if(blocked||busy)return;setBusy(true);window.dispatchEvent(new CustomEvent('alsvid:purchase-now',{detail:{productId}}));window.setTimeout(()=>setBusy(false),1200)};
 return <aside className="sticky-purchase-bar" aria-label={t.buy}><strong>{price||'—'}</strong><button type="button" disabled={blocked||busy} onClick={buy}>{busy?t.loading:t.buy}</button></aside>;
}
