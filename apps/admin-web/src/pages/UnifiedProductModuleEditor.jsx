import React,{useCallback,useEffect,useState} from 'react';
import {api} from '../api.js';
import {StandardDetailPanel} from './ProductDesignPanels.jsx';
import {DESIGN_LOCALES,pageModule} from './design-module-registry.js';

export default function UnifiedProductModuleEditor({moduleId,locale,slug,onWorkspaceDirtyChange,workspaceKey,onBack}){
 const module=pageModule(moduleId);
 const [products,setProducts]=useState([]),[published,setPublished]=useState([]),[selectedSlug,setSelectedSlug]=useState(slug||''),[listing,setListing]=useState(null),[versions,setVersions]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{if(slug)setSelectedSlug(slug)},[slug]);
 useEffect(()=>{let alive=true;setLoading(true);setError('');(async()=>{try{
   const [allProducts,first]=await Promise.all([api.products(undefined,true),api.catalogProducts(locale,1)]);
   const rows=[...(first.items||[])];let page=2,result=first;
   while(result.hasMore&&alive&&page<=50){result=await api.catalogProducts(locale,page++);rows.push(...(result.items||[]))}
   if(alive){setProducts(Array.isArray(allProducts)?allProducts:[]);setPublished(rows.filter(row=>row.kind==='vehicle'&&row.slug&&row.productId));setSelectedSlug(current=>current||rows.find(row=>row.kind==='vehicle'&&row.slug&&row.productId)?.slug||'')}
 }catch(e){if(alive)setError(e.message||'读取已发布车型失败')}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[locale]);
 const current=published.find(row=>row.slug===selectedSlug);
 const reportDirty=useCallback(value=>onWorkspaceDirtyChange?.(workspaceKey,value),[onWorkspaceDirtyChange,workspaceKey]);
 const onListingChange=useCallback(value=>setListing(value),[]);
 useEffect(()=>{let alive=true;setVersions([]);if(!listing?.id)return()=>{alive=false};api.listingVersions(listing.id).then(rows=>{if(alive)setVersions(Array.isArray(rows)?rows:[])}).catch(e=>{if(alive)setError(e.message||'读取商品历史失败')});return()=>{alive=false}},[listing?.id]);
 if(!module||!module.editor)return <p role="alert">无有效商品模块。</p>;
 return <div className="udw-edit">
  <header className="udw-top"><div><h2>{module.name}</h2><small>{moduleId} · {DESIGN_LOCALES.find(([code])=>code===locale)?.[1]} · 按车型维护</small></div><div className="udw-tabs"><select aria-label="编辑车型" value={selectedSlug} onChange={event=>{setSelectedSlug(event.target.value);setListing(null);setVersions([])}}><option value="">选择已发布车型</option>{published.map(row=><option key={row.slug} value={row.slug}>{row.title||row.slug}</option>)}</select><button className="btn" onClick={onBack}>返回工作台</button></div></header>
  <p className="hint">复用现有官网商品草稿与版本记录。此入口仅保存草稿；六项真实预览审核接入后再开放发布。P05–P07、P09、P10 的内容由商品资料驱动。</p>
  {error&&<p className="error-text" role="alert">{error}</p>}{loading?<p className="hint">正在读取车型…</p>:!published.length?<p className="hint">当前语言没有已发布整车，先在商品列表完成车型发布。</p>:!current?<p className="hint">请选择一款已发布车型。</p>:<StandardDetailPanel key={current.productId+':'+locale+':'+moduleId} locale={locale} products={products} publishedMap={new Map()} productId={current.productId} moduleId={moduleId} publishEnabled={false} onDirtyChange={reportDirty} onListingChange={onListingChange}/>}
  {current&&<section className="udw-review"><h3>商品版本历史</h3>{versions.length?versions.map((version,index)=><div className="udw-top" key={version.revision||index}><span>版本 {version.revision??index+1} · {version.action||'记录'} · {version.createdAt||''}</span><small>{version.actor||''}</small></div>):<p className="hint">{listing?'暂无历史版本':'正在读取商品发布记录…'}</p>}</section>}
 </div>;
}
