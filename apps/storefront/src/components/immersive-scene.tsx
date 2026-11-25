'use client';
import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { ProductScene } from '@/lib/alsvid-api';
export function ImmersiveScene({scene,index,alt,anchor}:{scene:ProductScene;index:number;alt:string;anchor?:string}) {
  const root=useRef<HTMLElement>(null);
  const motion=scene.animation||'fade';
  useEffect(()=>{
    const el=root.current;
    if(!el||motion==='none'||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    let frame=0,entered=false;
    const sync=()=>{
      const rect=el.getBoundingClientRect();
      const threshold=(scene.trigger??20)/100;
      const progress=Math.max(0,Math.min(1,(window.innerHeight*(1-threshold)-rect.top)/Math.max(1,Math.min(rect.height,window.innerHeight)*.65)));
      if(progress>0)entered=true;
      el.style.setProperty('--scene-progress',String(scene.scrollLinked?progress:entered?1:0));
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=0;sync()})};
    sync();window.addEventListener('scroll',schedule,{passive:true});window.addEventListener('resize',schedule);
    return()=>{window.removeEventListener('scroll',schedule);window.removeEventListener('resize',schedule);cancelAnimationFrame(frame)};
  },[motion,scene.trigger,scene.scrollLinked]);
  const bg=scene.background==='solid'?scene.backgroundColor:scene.background==='gradient'?`linear-gradient(145deg,${scene.backgroundColor},${scene.backgroundEnd})`:scene.background==='image'&&scene.backgroundUrl?`url("${scene.backgroundUrl}") center/cover no-repeat`:undefined;
  const copy=scene.title||scene.subtitle||scene.caption||scene.text;
  return <section ref={root} id={anchor} data-module-id={index>0?'ALSVID-P04-'+String(index).padStart(2,'0'):undefined} className={`immersive-scene motion-${motion} text-${scene.textPosition||'bottom-center'}`} style={{background:bg,color:scene.textColor||'#fff',minHeight:scene.hold?`${100+scene.hold}svh`:undefined,'--scene-duration':`${scene.duration??600}ms`} as CSSProperties}>
    <div className={'immersive-scene__stage'+(motion==='sticky'?' is-sticky':'')}>
      {scene.type==='video'&&scene.url?<video className="immersive-scene__media" src={scene.url} controls playsInline preload="metadata" style={{objectFit:scene.fit||'cover',objectPosition:scene.mediaPosition||'center',scale:(scene.scale??100)/100}}/>:scene.type==='image'&&scene.url?<img className="immersive-scene__media" src={scene.url} loading="lazy" alt={scene.alt||alt} style={{objectFit:scene.fit||'cover',objectPosition:scene.mediaPosition||'center',scale:(scene.scale??100)/100}}/>:null}
      {copy&&<div className="immersive-scene__copy">{scene.title&&<h2 style={{fontSize:`clamp(24px,5vw,${scene.fontSize??48}px)`}}>{scene.title}</h2>}{scene.subtitle&&<h3>{scene.subtitle}</h3>}{(scene.caption||scene.text)&&<p>{scene.caption||scene.text}</p>}</div>}
    </div>
  </section>
}
