import React,{useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
const lang={zh:'中文',en:'英文',de:'德文'};

export default function StorefrontLayoutReleaseReview({request,onPublished,onClose}){
 const [session,setSession]=useState(null),[origin,setOrigin]=useState(''),[active,setActive]=useState(0),[receipts,setReceipts]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const frame=useRef(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const start=async()=>{
  setBusy(true);setError('');setSession(null);setReceipts({});setActive(0);
  try{
   const [response,connection]=await Promise.all([api.startStorefrontLayoutReview({...request.body,scope:request.scope}),api.layoutStorefrontRevalidateStatus()]);
   const url=new URL(connection?.data?.storefrontPublicOrigin||'');
   if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('前台预览地址无效');
   if(!Array.isArray(response.data?.slots)||response.data.slots.length!==6||response.data.revision!==request.body.expectedVersion)throw Error('预览会话不完整');
   if(alive.current){setOrigin(url.origin);setSession(response.data)}
  }catch(e){if(alive.current)setError(e.message||'无法启动预览')}
  finally{if(alive.current)setBusy(false)}
 };
 useEffect(()=>{start()},[request]);
 const slot=session?.slots[active],key=slot?slot.locale+':'+slot.device:'';
 useEffect(()=>{
  if(!session||!slot||!origin)return;
  const listener=e=>{
   if(e.source!==frame.current?.contentWindow||e.origin!==origin||e.data?.type!=='alsvid:storefront-layout-review-confirm'||e.data.session!==session.session||e.data.locale!==slot.locale||e.data.device!==slot.device||typeof e.data.receipt!=='string')return;
   setReceipts(old=>({...old,[key]:e.data.receipt}));
  };
  window.addEventListener('message',listener);return()=>window.removeEventListener('message',listener);
 },[session,slot,origin,key]);
 const publish=async()=>{
  if(!session||busy||session.slots.some(s=>!receipts[s.locale+':'+s.device]))return;
  setBusy(true);setError('');
  try{
   const payload={...request.body,reviewSession:session.session,reviewReceipts:session.slots.map(s=>receipts[s.locale+':'+s.device])};
   const result=request.scope==='all'?await api.publishStorefrontLayout(payload):await api.publishStorefrontLocale({...payload,locale:request.scope,reviewScope:request.scope});
   onPublished(result.data||result);
  }catch(e){if(alive.current)setError(e.message||'发布失败')}
  finally{if(alive.current)setBusy(false)}
 };
 const src=slot&&origin?`${origin}/${slot.locale}?reviewToken=${encodeURIComponent(slot.token)}&parent=${encodeURIComponent(window.location.origin)}&device=${slot.device}`:'';
 const completed=Object.keys(receipts).length;
 return <div style={{position:'fixed',inset:0,zIndex:3000,background:'#1119',display:'grid',placeItems:'center',padding:20}}>
  <section style={{background:'#fff',width:'min(1400px,98vw)',maxHeight:'96vh',overflow:'auto',padding:18,borderRadius:12,boxShadow:'0 16px 56px #0004'}}>
   <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><h3 style={{margin:'4px 0'}}>首页发布前真实预览 · {completed}/6</h3><div style={{display:'flex',gap:8}}><button className="btn" disabled={busy} onClick={onClose}>关闭</button><button className="btn" disabled={busy} onClick={start}>重新开始</button><button className="btn primary" disabled={busy||completed!==6} onClick={publish}>确认发布</button></div></div>
   <p className="hint">审核绑定当前草稿版本与发布范围。六项都要在真实前台逐一确认；草稿更新后需重新审核。</p>
   {error&&<p role="alert" className="error-text">{error}</p>}
   {session&&<><div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'12px 0'}}>{session.slots.map((s,i)=><button key={s.locale+':'+s.device} className={'btn small'+(i===active?' primary':'')} onClick={()=>setActive(i)}>{lang[s.locale]} {s.device==='desktop'?'PC':'移动端'} · {receipts[s.locale+':'+s.device]?'已确认':'待确认'}</button>)}</div>
    <div style={{height:'70vh',overflow:'auto',background:'#eee'}}><iframe key={key+':'+reload} ref={frame} title={lang[slot.locale]+' '+slot.device+' 首页审核预览'} src={src} referrerPolicy="no-referrer" style={{width:slot.device==='mobile'?390:1200,minWidth:slot.device==='mobile'?390:1200,height:'100%',display:'block',margin:'auto',border:0,background:'#fff'}}/></div>
    <button className="btn small" style={{marginTop:8}} disabled={busy} onClick={()=>{setReceipts(old=>{const next={...old};delete next[key];return next});setReload(n=>n+1)}}>重新加载此项</button>
   </>}
  </section>
 </div>;
}
