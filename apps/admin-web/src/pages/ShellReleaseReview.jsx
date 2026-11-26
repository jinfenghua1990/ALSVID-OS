import React,{useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
const lang={zh:'中文',en:'英文',de:'德文'};
export default function ShellReleaseReview({page,onPublished,onClose}){
 const [session,setSession]=useState(null),[origin,setOrigin]=useState(''),[active,setActive]=useState(0),[receipts,setReceipts]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const frame=useRef(null),alive=useRef(true);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[]);
 const start=async()=>{
   setBusy(true);setError('');setSession(null);setReceipts({});setActive(0);
   try{
     const [response,connection]=await Promise.all([api.startShellReview(page.id,page.revision),api.layoutStorefrontRevalidateStatus()]);
     const url=new URL(connection?.data?.storefrontPublicOrigin||'');
     if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('前台预览地址无效');
     if(!Array.isArray(response.slots)||response.slots.length!==6||response.revision!==page.revision)throw Error('预览会话不完整');
     if(alive.current){setOrigin(url.origin);setSession(response)}
   }catch(e){if(alive.current)setError(e.message||'无法启动预览')}
   finally{if(alive.current)setBusy(false)}
 };
 const slot=session?.slots[active],key=slot?slot.locale+':'+slot.device:'';
 useEffect(()=>{
   if(!session||!slot||!origin)return;
   const listener=e=>{
     if(e.source!==frame.current?.contentWindow||e.origin!==origin||e.data?.type!=='alsvid:shell-review-confirm'||e.data.session!==session.session||e.data.locale!==slot.locale||e.data.device!==slot.device||typeof e.data.receipt!=='string')return;
     setReceipts(old=>({...old,[key]:e.data.receipt}));
   };
   window.addEventListener('message',listener);
   return()=>window.removeEventListener('message',listener);
 },[session,slot,origin,key]);
 const publish=async()=>{
   if(!session||busy||session.slots.some(s=>!receipts[s.locale+':'+s.device]))return;
   if(!window.confirm('确认将本语言草稿发布到正式网站？其他语言不变。'))return;
   setBusy(true);setError('');
   try{const updated=await api.publishReviewedShell(page.id,{revision:page.revision,session:session.session,receipts:session.slots.map(s=>receipts[s.locale+':'+s.device])});onPublished(updated)}
   catch(e){if(alive.current)setError(e.message||'发布失败')}
   finally{if(alive.current)setBusy(false)}
 };
 const src=slot&&origin?origin+'/design-preview?token='+encodeURIComponent(slot.token)+'&parent='+encodeURIComponent(window.location.origin):'';
 const completed=Object.keys(receipts).length;
 return <section className="udw-review">
   <div className="udw-top"><h3>发布前真实预览 · {completed}/6</h3><div className="udw-tabs"><button className="btn" disabled={busy} onClick={onClose}>关闭</button><button className="btn" disabled={busy} onClick={start}>{session?'重新开始':'加载六项预览'}</button><button className="btn primary" disabled={busy||completed!==6} onClick={publish}>确认发布</button></div></div>
   <p className="hint">本次仅发布 {lang[page.locale]} 草稿。其他语言显示当前正式内容。每项在真实前台预览底部点击确认，30 分钟内完成；草稿修改后重新审核。</p>
   {error&&<p role="alert" className="error-text">{error}</p>}
   {session&&<><div className="udw-tabs">{session.slots.map((s,i)=><button key={s.locale+':'+s.device} className={'btn small'+(i===active?' primary':'')} onClick={()=>setActive(i)}>{lang[s.locale]} {s.device==='desktop'?'PC':'移动端'} · {receipts[s.locale+':'+s.device]?'已确认':'待确认'}</button>)}</div>
   <div className="udw-top"><small>{slot.draft?'正在预览本次草稿':'正在核对其他语言正式内容'} · PC 采用 1200px，移动端采用 390px</small><button className="btn small" disabled={busy} onClick={()=>{setReceipts(old=>{const next={...old};delete next[key];return next});setReload(n=>n+1)}}>重新加载此项</button></div>
   <div style={{height:'70vh',overflow:'auto',background:'#eee'}}><iframe key={key+':'+reload} ref={frame} title={lang[slot.locale]+' '+slot.device+' 真实预览'} src={src} referrerPolicy="no-referrer" style={{width:slot.device==='mobile'?390:1200,minWidth:slot.device==='mobile'?390:1200,height:'100%',display:'block',margin:'auto',border:0,background:'white'}}/></div></>}
 </section>
}
