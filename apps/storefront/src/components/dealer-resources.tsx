'use client';
import {useEffect,useRef,useState} from 'react';
import type {Locale} from '@/lib/alsvid-api';
const copy={
 zh:{search:'搜索素材',download:'下载',name:'名称',language:'语言',size:'大小',empty:'暂无内容',loading:'加载中…',error:'无法读取，请刷新后重试。',refresh:'刷新',reminders:'订单待办',policy:'政策公告',price:'调价公告',product:'新品通知',promotion:'促销活动',all:'全部语言'},
 en:{search:'Search assets',download:'Download',name:'Name',language:'Language',size:'Size',empty:'No content available',loading:'Loading…',error:'Unable to load. Please refresh and retry.',refresh:'Refresh',reminders:'Order actions',policy:'Policy',price:'Price changes',product:'New products',promotion:'Promotions',all:'All languages'},
 de:{search:'Material suchen',download:'Herunterladen',name:'Name',language:'Sprache',size:'Größe',empty:'Keine Inhalte',loading:'Wird geladen…',error:'Laden fehlgeschlagen. Bitte aktualisieren.',refresh:'Aktualisieren',reminders:'Offene Bestellungen',policy:'Richtlinien',price:'Preisänderungen',product:'Neue Produkte',promotion:'Aktionen',all:'Alle Sprachen'}
};
type Asset={id:string;label:string;fileName:string;folder:string;sizeBytes:string;langs:string[];tags:string[]};
type Notice={id:string;kind:'policy'|'price'|'product'|'promotion';translations:Record<Locale,{title:string;body:string}>;createdAt:string};
type Data={membershipId:string;assets?:Asset[];notices?:Notice[]};
const prefix='/api/portal/dealer/center/';
export function DealerResources({locale,membershipId,panel,reminders,onInvalidSession}:{locale:Locale;membershipId:string;panel:'resources'|'notices';reminders:{id:string;label:string}[];onInvalidSession:()=>void}){
 const t=copy[locale],[data,setData]=useState<Data|null>(null),[query,setQuery]=useState(''),[lang,setLang]=useState(''),[error,setError]=useState('');
 const generation=useRef(0);
 const load=async()=>{const g=++generation.current;setError('');try{const r=await fetch(prefix+panel,{cache:'no-store'});if(g!==generation.current)return;if(!r.ok){if(r.status===401||r.status===403)onInvalidSession();throw Error('load')}const d:Data=await r.json();if(g!==generation.current)return;if(d.membershipId!==membershipId){setData(null);onInvalidSession();return;}setData(d)}catch{if(g===generation.current){setData(null);setError(t.error)}}};
 useEffect(()=>{void load();return()=>{generation.current++}},[]);
 const rows=(data?.assets||[]).filter(a=>(!lang||!a.langs.length||a.langs.includes(lang))&&[a.label,a.fileName,a.folder,...a.tags].join(' ').toLowerCase().includes(query.toLowerCase()));
 return <div><button onClick={()=>void load()}>{t.refresh}</button>{error&&<p role="alert">{error}</p>}{!data?(error?null:<p>{t.loading}</p>):panel==='resources'?<>
 <p><input aria-label={t.search} placeholder={t.search} value={query} onChange={e=>setQuery(e.target.value)}/> <select aria-label={t.language} value={lang} onChange={e=>setLang(e.target.value)}><option value="">{t.all}</option><option value="de">Deutsch</option><option value="en">English</option><option value="zh">中文</option></select></p>
 <div className="dealer-scroll"><table><thead><tr><th>{t.name}</th><th>{t.language}</th><th>{t.size}</th><th></th></tr></thead><tbody>{rows.map(a=><tr key={a.id}><td>{a.label||a.fileName}<div>{a.folder}</div></td><td>{a.langs.join(' / ')||'—'}</td><td>{(Number(a.sizeBytes)/1048576).toFixed(2)} MB</td><td><a href={prefix+'resources/'+a.id+'/file'} download>{t.download}</a></td></tr>)}</tbody></table></div>{!rows.length&&<p>{t.empty}</p>}</>:<>
 <h3>{t.reminders}</h3>{reminders.map(r=><p key={r.id}>{r.label} · {r.id}</p>)}{!reminders.length&&<p>{t.empty}</p>}
 {(data.notices||[]).map(n=><article key={n.id} style={{borderTop:'1px solid #ccc',padding:'16px 0'}}><p>{t[n.kind]} · {new Intl.DateTimeFormat(locale,{dateStyle:'medium'}).format(new Date(n.createdAt))}</p><h3>{n.translations[locale].title}</h3><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{n.translations[locale].body}</p></article>)}{!data.notices?.length&&<p>{t.empty}</p>}</>}</div>
}
