import React,{useEffect,useRef,useState} from 'react';
import {api} from '../api.js';
import {modulesFor,DESIGN_LOCALES,DESIGN_DEVICES,shellState} from './design-module-registry.js';
import './unified-design.css';
const pages=[['home','首页'],['list','商品列表'],['detail','商品详情'],['transaction','统一交易页']];
export default function UnifiedDesignWorkspace({active,user,onOpenEditor}){
 const [page,setPage]=useState('home'),[locale,setLocale]=useState('zh'),[device,setDevice]=useState('desktop'),[selected,setSelected]=useState('ALSVID-G01');
 const [records,setRecords]=useState({}),[error,setError]=useState(''),[loading,setLoading]=useState(false),[origin,setOrigin]=useState(''),[products,setProducts]=useState([]),[slug,setSlug]=useState(''),[history,setHistory]=useState(null),[focusResult,setFocusResult]=useState('');
 const frame=useRef(null),request=useRef(0),historyRequest=useRef(0);
 const modules=modulesFor(page);
 const load=async()=>{
   const seq=++request.current;setLoading(true);setError('');setRecords({});setHistory(null);historyRequest.current++;
   try{
     const [rows,connection]=await Promise.all([api.cmsPages({type:'shared_module',locale}),api.layoutStorefrontRevalidateStatus()]);
     const relevant=rows.filter(row=>row.path.startsWith('/site-shell/'));
     const docs=await Promise.all(relevant.map(row=>api.cmsPage(row.id)));
     if(seq!==request.current)return;
     setRecords(Object.fromEntries(docs.map(doc=>[doc.path,doc])));
     const url=connection?.storefrontPublicOrigin;
     try{const parsed=new URL(url);setOrigin(['http:','https:'].includes(parsed.protocol)&&!parsed.username&&!parsed.password?parsed.origin:'')}catch{setOrigin('')}
   }catch(e){if(seq===request.current){setError(e.message||'读取失败');setOrigin('')}}
   finally{if(seq===request.current)setLoading(false)}
 };
 useEffect(()=>{if(active&&user?.role==='admin')void load();return()=>{request.current++;historyRequest.current++}},[active,locale,user?.role]);
 useEffect(()=>{if(!active||page!=='detail')return;let alive=true;setProducts([]);setSlug('');(async()=>{try{
   const list=[];let p=1,result;do{result=await api.catalogProducts(locale,p++);list.push(...(result.items||[]))}while(result.hasMore&&alive&&p<=50);
   if(alive){const vehicles=list.filter(x=>x.kind==='vehicle'&&x.slug);setProducts(vehicles);setSlug(vehicles[0]?.slug||'')}
 }catch(e){if(alive)setError(e.message||'读取车型失败')}})();return()=>{alive=false}},[active,page,locale]);
 const route=page==='home'?'/':page==='list'?'/e-bikes':page==='transaction'?'/cart':slug?'/e-bikes/'+encodeURIComponent(slug):'';
 const preview=origin&&route?origin+'/'+locale+(route==='/'?'':route):'';
 const focus=id=>{setFocusResult('');if(preview&&frame.current?.contentWindow)frame.current.contentWindow.postMessage({type:'alsvid:design-focus',id},origin)};
 useEffect(()=>{const handler=event=>{if(event.source!==frame.current?.contentWindow||event.origin!==origin||event.data?.type!=='alsvid:design-focus-result'||event.data.id!==selected)return;setFocusResult(event.data.found?'已定位当前模块':'前台当前未找到该模块（可能隐藏或尚未接入）')};window.addEventListener('message',handler);return()=>window.removeEventListener('message',handler)},[origin,selected]);
 useEffect(()=>{focus(selected)},[selected,preview]);
 const showHistory=async module=>{const row=records[module.path];if(!row)return;const seq=++historyRequest.current;setHistory({name:module.name,loading:true,rows:[]});try{const rows=await api.cmsVersions(row.id);if(seq===historyRequest.current)setHistory({name:module.name,rows})}catch(e){if(seq===historyRequest.current)setHistory({name:module.name,error:e.message,rows:[]})}};
 if(user?.role!=='admin')return <p className="hint">仅管理员可管理装修。</p>;
 return <div className="udw">
  <header className="udw-top"><h2>统一装修工作台</h2><button className="btn small" disabled={loading} onClick={load}>刷新数据</button></header>
  <nav className="udw-tabs" aria-label="页面">{pages.map(([key,label])=><button key={key} className={'btn small'+(page===key?' primary':'')} onClick={()=>{setPage(key);setSelected('ALSVID-G01');setHistory(null);historyRequest.current++}}>{label}</button>)}</nav>
  <div className="udw-top"><div className="udw-tabs">{DESIGN_LOCALES.map(([key,label])=><button key={key} className={'btn small'+(locale===key?' primary':'')} onClick={()=>setLocale(key)}>{label}</button>)}{DESIGN_DEVICES.map(([key,label])=><button key={key} className={'btn small'+(device===key?' primary':'')} onClick={()=>setDevice(key)}>{label}</button>)}</div>{page==='detail'&&<select aria-label="预览车型" value={slug} onChange={e=>setSlug(e.target.value)}><option value="">选择已发布车型</option>{products.map(p=><option key={p.slug} value={p.slug}>{p.title||p.slug}</option>)}</select>}</div>
  {error&&<p className="error-text" role="alert">{error}</p>}
  <div className="udw-body">
   <aside className="udw-directory"><h3>模块目录</h3>
   {modules.map(module=>{const row=records[module.path],s=module.kind?shellState(row):null;return <div key={module.id} className={'udw-module'+(selected===module.id?' selected':'')}>
     <button className="udw-select" type="button" aria-pressed={selected===module.id} onClick={()=>{if(selected===module.id)focus(module.id);setSelected(module.id);setHistory(null);historyRequest.current++}}><strong>{module.name}</strong><small>{module.id}</small></button>
     {module.kind?<><div className="udw-meta">{loading?'读取中…':error?'状态未核实':s.enabled+' · 正式 '+s.published+' · 草稿 '+s.draft}</div><div className="udw-tabs"><button type="button" className="btn small" disabled={loading||Boolean(error)} onClick={()=>onOpenEditor(module.id,locale)}>编辑</button><button className="btn small" disabled={!row||loading} onClick={()=>void showHistory(module)}>历史</button></div></>:<small className="udw-meta">{module.scope==='structural'?'固定容器 · 不单独编辑':'已登记 · 编辑适配待接入'}</small>}
   </div>})}
   {history&&<section className="udw-history"><h4>{history.name} · 历史版本</h4>{history.loading?<p>读取中…</p>:history.error?<p role="alert">{history.error}</p>:history.rows.length?history.rows.map(v=><div key={v.version}>v{v.version} · {v.label||'发布版本'}<small>{v.createdAt||''}</small></div>):<p>暂无发布记录</p>}<button className="btn small" onClick={()=>{historyRequest.current++;setHistory(null)}}>关闭</button></section>}
   </aside>
   <section className="udw-preview"><div className="udw-top"><strong>正式前台预览</strong><small>{focusResult||'点击模块定位；仅展示当前正式版本'}</small>{preview&&<a href={preview} target="_blank" rel="noreferrer">独立打开</a>}</div>
    {!preview?<p className="hint">{origin?'请选择已发布车型':'未获取到前台访问地址，请检查连接配置。'}</p>:<div className={'udw-viewport '+device}><iframe key={preview} ref={frame} title="正式前台预览" src={preview} onLoad={()=>focus(selected)}/></div>}
   </section>
  </div>
 </div>
}
