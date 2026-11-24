import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import PublicationDialog from './PublicationDialog.jsx';
import CmsPageManager from './CmsPageManager.jsx';

const locales = [['zh','中文'],['en','English'],['de','Deutsch']];

export default function ProductDetailEditorDialog({ product, user, active, onClose, onDirtyChange, onChanged }) {
  const [tab,setTab]=useState('content'),[locale,setLocale]=useState('zh'),[pageId,setPageId]=useState(''),[layoutEditorOpen,setLayoutEditorOpen]=useState(false),[pages,setPages]=useState([]),[pagesLoading,setPagesLoading]=useState(false),[contentBusy,setContentBusy]=useState(false),[layoutBusy,setLayoutBusy]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[contentDirty,setContentDirty]=useState(false),[layoutDirty,setLayoutDirty]=useState(false);
  const dirty=contentDirty||layoutDirty;
  const editorBusy=contentBusy||layoutBusy||busy;
  useEffect(()=>{onDirtyChange?.(dirty)},[dirty,onDirtyChange]);
  const switchTab=next=>{if(next===tab||editorBusy)return;if(dirty&&!window.confirm('当前编辑页有未保存修改，切换将丢弃这些修改，继续吗？'))return;setContentDirty(false);setLayoutDirty(false);setTab(next)};
  useEffect(()=>{setPageId('');setLayoutEditorOpen(false);setPages([]);setMessage('')},[product?.id]);
  useEffect(()=>{if(!active||!product)return;let cancelled=false;setPagesLoading(true);Promise.all([api.cmsPages({type:'product_template',locale}),api.cmsPages({type:'product_template',locale,path:`/products/${product.id}`})]).then(([allRows,productRows])=>{if(!cancelled){setPages([...productRows,...allRows.filter(row=>!row.path.startsWith('/products/'))]);setPageId(productRows[0]?.id||'');setLayoutEditorOpen(Boolean(productRows[0]?.id))}}).catch(e=>{if(!cancelled)setMessage(e.message)}).finally(()=>{if(!cancelled)setPagesLoading(false)});return()=>{cancelled=true}},[active,product,locale]);
  const createLayout=async()=>{
    if(busy||pagesLoading)return;setBusy(true);setMessage('');
    try{
      const base=pages.find(row=>!row.path.startsWith('/products/'));
      const source=base?await api.cmsPage(base.id):null;
      const seed=source?.draft?.blocks?.length?source.draft:source?.published||source?.draft||{blocks:[]};
      const draft={...seed,blocks:(seed.blocks||[]).map(block=>block.componentKey==='specs'?{...block,bindings:{...block.bindings,productId:product.id}}:block.componentKey==='productGallery'?{...block,bindings:{...block.bindings,productIds:[product.id]}}:block)};
      const created=await api.createCmsPage({pageType:'product_template',locale,path:`/products/${product.id}`,name:`${product.name||product.model||'商品'}详情`,draft,seo:source?.draftSeo||source?.publishedSeo||{}});
      setPageId(created.id);setLayoutEditorOpen(true);setPages(rows=>[created,...rows]);setMessage('已建立商品专属布局草稿，可开始编辑；仅点击发布后才会影响官网。');
    }catch(e){setMessage(e.message);if(e.status===409){const found=await api.cmsPages({type:'product_template',locale,path:`/products/${product.id}`}).catch(()=>[]);if(found.length){setPages(rows=>[...found,...rows.filter(row=>!row.path.startsWith('/products/'))]);setPageId(found[0].id);setLayoutEditorOpen(true)}}}finally{setBusy(false)}
  };
  const close=()=>{if(editorBusy)return;if(dirty&&!window.confirm('当前有未保存的修改，确定关闭？'))return;onClose?.()};
  if(!product)return null;
  return <div className="product-detail-dialog__backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}}>
    <section className="product-detail-dialog" role="dialog" aria-modal="true" aria-label="商品详情编辑">
      <header className="product-detail-dialog__head"><div><h2>编辑商品详情</h2><p>{product.name||product.model||product.id}</p></div><button className="btn small" type="button" onClick={close} disabled={editorBusy}>关闭</button></header>
      <nav className="product-detail-dialog__tabs"><button className={tab==='content'?'is-active':''} onClick={()=>switchTab('content')}>详情内容</button><button className={tab==='layout'?'is-active':''} onClick={()=>switchTab('layout')}>页面模块</button></nav>
      {tab==='content'?<PublicationDialog product={product} embedded onDirtyChange={setContentDirty} onBusyChange={setContentBusy} onChanged={onChanged}/>:<div className="product-detail-dialog__layout">
        <div className="row"><label>语言 <select value={locale} disabled={layoutBusy} onChange={e=>{if(layoutDirty&&!window.confirm('页面模块有未保存修改，切换语言将丢弃这些修改，继续吗？'))return;setLayoutDirty(false);setPageId('');setLayoutEditorOpen(false);setLocale(e.target.value)}}>{locales.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label></div>
        {pageId&&layoutEditorOpen?<CmsPageManager key={`${product.id}-${locale}-${pageId}`} active={active} user={user} openPageId={pageId} previewProductId={product.id} onDirtyChange={setLayoutDirty} onBusyChange={setLayoutBusy} onBack={()=>{setLayoutDirty(false);setLayoutBusy(false);setLayoutEditorOpen(false)}}/>:pageId?<div className="padmin-empty"><strong>商品专属布局已建立</strong>继续编辑当前商品在{locales.find(([code])=>code===locale)?.[1]}的详情模块。<p><button type="button" className="btn primary" disabled={layoutBusy} onClick={()=>setLayoutEditorOpen(true)}>继续编辑页面模块</button></p></div>:<div className="padmin-empty"><strong>{pagesLoading?'正在检查商品专属布局…':'此商品尚无专属页面布局'}</strong>现有商品详情设计会继续显示，建立专属布局并发布后才会替换该商品页面。<p><button type="button" className="btn primary" disabled={busy||pagesLoading||layoutBusy} onClick={createLayout}>{busy?'正在建立…':'建立商品专属布局'}</button></p></div>}
      </div>}
      {message&&<p className="product-detail-dialog__message" role="status">{message}</p>}
    </section>
  </div>;
}
