'use client';
import {useEffect,useRef,useState} from 'react';
import type {Locale,ReviewPage} from '@/lib/alsvid-api';
const copy={de:{title:'Kundenbewertungen',empty:'Noch keine Bewertungen',all:'Alle',recent:'Neueste zuerst',highest:'Höchste zuerst',lowest:'Niedrigste zuerst',reply:'ALSVID antwortet',more:'Weitere Bewertungen',filtered:'Keine Bewertungen entsprechen dem Filter.',unavailable:'Bewertungen derzeit nicht verfügbar'},en:{title:'Customer reviews',empty:'No reviews yet',all:'All',recent:'Most recent',highest:'Highest rated',lowest:'Lowest rated',reply:'ALSVID reply',more:'More reviews',filtered:'No reviews match this filter.',unavailable:'Reviews currently unavailable'},zh:{title:'用户评价',empty:'暂无评价',all:'全部',recent:'最新优先',highest:'高分优先',lowest:'低分优先',reply:'ALSVID 回复',more:'查看更多',filtered:'没有符合条件的评价。',unavailable:'评价暂不可用'}};
export function ProductReviews({locale,productId,data,style='list',limit=20}:{locale:Locale;productId:string;data:ReviewPage|null;style?:'list'|'cards';limit?:number}){
 const t=copy[locale],[rating,setRating]=useState(0),[sort,setSort]=useState('recent'),[result,setResult]=useState(data),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 const serial=useRef(0),size=Math.min(50,Math.max(1,limit));
 const load=async(nextRating:number,nextSort:string,page=1)=>{
  const request=++serial.current;setBusy(true);setError(false);
  try{
   const query=new URLSearchParams({productId,limit:String(size),rating:String(nextRating),sort:nextSort,page:String(page)});
   const res=await fetch('/api/site/reviews?'+query,{cache:'no-store'});
   if(!res.ok)throw Error('review request');
   const next:ReviewPage=await res.json();
   if(request===serial.current)setResult(old=>page===1?next:{...next,items:[...new Map([...(old?.items||[]),...next.items].map(item=>[item.id,item])).values()]});
  }catch{if(request===serial.current)setError(true)}finally{if(request===serial.current)setBusy(false)}
 };
 useEffect(()=>()=>{serial.current++},[]);
 const change=(nextRating:number,nextSort:string)=>{setRating(nextRating);setSort(nextSort);setResult(old=>old?{...old,items:[],hasMore:false,filteredTotal:nextRating?Number(old.counts.distribution?.[nextRating]||0):old.counts.total}:null);void load(nextRating,nextSort)};
 const counts=result?.counts,filtered=result?.items||[];
 return <section className={'reviews review-panel reviews--'+style} id="reviews" data-module="reviews"><h2>{t.title}</h2>
 {!result?<p>{t.unavailable}</p>:!counts?.total?<p>{t.empty}</p>:<>
 <div className="review-summary"><div><strong className="review-score">{counts.average}<small> / 5</small></strong><p>{counts.total} · {counts.goodRate}% ≥ 4★</p></div>{counts.distribution&&<div className="review-bars">{[5,4,3,2,1].map(star=><button key={star} type="button" aria-pressed={rating===star} onClick={()=>{change(rating===star?0:star,sort)}}><span>{star} ★</span><span className="rating-track"><span style={{width:100*(counts.distribution?.[star]||0)/counts.total+'%'}}/></span><span>{counts.distribution?.[star]||0}</span></button>)}</div>}</div>
 <div className="review-controls"><select aria-label={t.title} value={rating} onChange={e=>{change(Number(e.target.value),sort)}}><option value={0}>{t.all}</option>{[5,4,3,2,1].map(n=><option key={n} value={n}>{n} ★</option>)}</select><select aria-label={t.recent} value={sort} onChange={e=>{change(rating,e.target.value)}}><option value="recent">{t.recent}</option><option value="highest">{t.highest}</option><option value="lowest">{t.lowest}</option></select></div>
 <div className="review-items">{filtered.map(r=><article className="review" key={r.id}><div className="review-meta"><strong className="review-stars" aria-label={r.rating+' / 5'}>{'★'.repeat(r.rating)}{'☆'.repeat(5-r.rating)}</strong><time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleDateString(locale==='de'?'de-DE':locale==='zh'?'zh-CN':'en-GB',{timeZone:'UTC'})}</time></div><p>{r.content}</p>{r.reply&&<p className="review-reply"><strong>{t.reply}</strong><br/>{r.reply}</p>}</article>)}</div>{busy&&<p role="status">{locale==='de'?'Wird geladen…':locale==='en'?'Loading…':'正在加载…'}</p>}{error&&<button type="button" onClick={()=>load(rating,sort)}>{t.unavailable} · {locale==='de'?'Erneut versuchen':locale==='en'?'Retry':'重试'}</button>}{!busy&&!error&&!filtered.length&&<p>{t.filtered}</p>}{result?.hasMore&&<button className="review-more" type="button" disabled={busy} onClick={()=>load(rating,sort,result.page+1)}>{t.more}</button>}<p>{filtered.length} / {result?.filteredTotal??counts.total}</p></>}</section>
}
