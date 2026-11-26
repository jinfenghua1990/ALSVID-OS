'use client';
import { useEffect } from 'react';
export function DesignPreviewFocus(){
 useEffect(()=>{
  if(window.parent===window)return;
  let highlighted:HTMLElement|null=null;
  let outline='',offset='';
  const clear=()=>{if(highlighted){highlighted.style.outline=outline;highlighted.style.outlineOffset=offset;highlighted=null}};
  const listener=(event:MessageEvent)=>{
   if(event.source!==window.parent||event.data?.type!=='alsvid:design-focus'||typeof event.data.id!=='string'||!/^ALSVID-[GHLP][0-9]{2}(?:-[0-9]{2})?$/.test(event.data.id))return;
   clear();
   const id=event.data.id;
   const target=document.querySelector<HTMLElement>('[data-module-id="'+id+'"]');
   if(target){highlighted=target;outline=target.style.outline;offset=target.style.outlineOffset;target.style.outline='2px solid #84b78a';target.style.outlineOffset='-2px';target.scrollIntoView({block:'start',behavior:'instant'});}
   if(event.origin!=='null')window.parent.postMessage({type:'alsvid:design-focus-result',id,found:Boolean(target)},event.origin);
  };
  window.addEventListener('message',listener);
  return()=>{window.removeEventListener('message',listener);clear()};
 },[]);
 return null;
}
