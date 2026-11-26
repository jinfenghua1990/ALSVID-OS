'use client';
import {useState} from 'react';
import type {Locale} from '@/lib/alsvid-api';

export function StorefrontLayoutReviewConfirm({confirmationToken,session,locale,device,draft,parentOrigin}:{confirmationToken:string;session:string;locale:Locale;device:'desktop'|'mobile';draft:boolean;parentOrigin:string}){
  const [confirmed,setConfirmed]=useState(false),[error,setError]=useState('');
  const confirm=async()=>{
    let origin='';
    try{const url=new URL(parentOrigin);if(['http:','https:'].includes(url.protocol)&&url.origin===parentOrigin)origin=url.origin}catch{}
    if(!origin||window.parent===window)return;
    setError('');
    try{
      const response=await fetch('/api/site/layout-draft/release-review-confirm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:confirmationToken}),cache:'no-store'});
      const result=await response.json();
      if(!response.ok||typeof result?.receipt!=='string')throw new Error(result?.error||'确认失败，请重新加载预览');
      window.parent.postMessage({type:'alsvid:storefront-layout-review-confirm',receipt:result.receipt,session,locale,device},origin);
      setConfirmed(true);
    }catch(reason){setError(reason instanceof Error?reason.message:'确认失败，请重试')}
  };
  return <aside style={{position:'fixed',zIndex:10000,inset:'auto 0 0',display:'flex',alignItems:'center',justifyContent:'center',gap:12,padding:12,background:'#122018',color:'#fff',boxShadow:'0 -2px 12px #0003'}}>
    <span>{draft?'正在核对本次首页草稿':'正在核对当前正式首页'} · {locale.toUpperCase()} · {device==='mobile'?'移动端':'PC'}{error&&<span role="alert"> · {error}</span>}</span>
    <button type="button" onClick={confirm} disabled={confirmed} style={{border:0,borderRadius:6,padding:'9px 16px',background:confirmed?'#87b85c':'#b7e547',color:'#16240d',fontWeight:700,cursor:confirmed?'default':'pointer'}}>{confirmed?'此项已确认':'确认此项预览'}</button>
  </aside>;
}
