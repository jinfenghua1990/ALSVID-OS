'use client';
import {useState} from 'react';
export function ShellReviewConfirm({receipt,session,locale,device,draft,parentOrigin}:{receipt:string;session:string;locale:string;device:string;draft:boolean;parentOrigin:string}){
 const [sent,setSent]=useState(false);
 const [error,setError]=useState('');
 return <div role="status" style={{position:'fixed',bottom:0,left:0,right:0,zIndex:10000,background:'#202725',color:'white',padding:'12px',display:'flex',gap:12,flexWrap:'wrap',alignItems:'center',justifyContent:'space-between'}}>
   <span>发布前预览 · {locale.toUpperCase()} · {device==='desktop'?'PC':'移动端'} · {draft?'本次草稿':'其他语言当前正式内容'}</span>
   <button type="button" disabled={sent} onClick={()=>{
     if(window.parent===window){setError('请在后台预览窗口中确认');return}
     if(device==='mobile'?window.innerWidth>720:window.innerWidth<900){setError('当前预览宽度与设备类型不符，请调整后台窗口');return}
     window.parent.postMessage({type:'alsvid:shell-review-confirm',receipt,session,locale,device},parentOrigin);
     setSent(true);
   }}>{sent?'已确认':'确认此项视觉效果'}</button>
   {error&&<span role="alert">{error}</span>}
 </div>
}
