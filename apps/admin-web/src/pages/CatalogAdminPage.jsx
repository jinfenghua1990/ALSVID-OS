import StorefrontOrdersAdmin from './StorefrontOrdersAdmin.jsx';
import StorefrontReviewsAdmin from './StorefrontReviewsAdmin.jsx';
import AssetLibrary from './AssetLibrary.jsx';
import AssetWorkspaceV2 from './AssetWorkspaceV2.jsx';
import CmsPageManager from './CmsPageManager.jsx';
import PageManager from './PageManager.jsx';
import ShopOverview, { ShopPageHead } from './ShopOverview.jsx';
import ShopProductList from './ShopProductList.jsx';
import ShopPricingPage from './ShopPricingPage.jsx';
import StorefrontPageAdmin from './StorefrontPageAdmin.jsx';
import StorefrontListingsAdmin from './StorefrontListingsAdmin.jsx';
import UnifiedDesignWorkspace from './UnifiedDesignWorkspace.jsx';
import SeoTrafficCenter from './SeoTrafficCenter.jsx';
import PaymentProviders from './PaymentProviders.jsx';
import ModuleLedger from './ModuleLedger.jsx';
import React, { Suspense, lazy, startTransition, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const StorefrontBuilderAdmin = lazy(() => import('./StorefrontBuilderAdmin.jsx'));

export default function CatalogAdminPage({ user, active = true, workspaceKey, onWorkspaceDirtyChange, section = 'overview', pageQuery = '', pageId = '', productId = '', onSectionChange, onOpenProduct, onCreateProduct, onOpenDesignEditor }) {
  const [publishedIds,setPublishedIds]=useState(()=>new Map());
  const [pageView,setPageView]=useState('list');
  const [editingPage,setEditingPage]=useState('');
  const [products, setProducts] = useState([]);
  const [builderDirty,setBuilderDirty]=useState(false),[cmsDirty,setCmsDirty]=useState(false),[ordersDirty,setOrdersDirty]=useState(false),[reviewsDirty,setReviewsDirty]=useState(false),[homepageDirty,setHomepageDirty]=useState(false);
  const productsLoadVersion=useRef(0);
  const reportWorkspaceDirty=useCallback(value=>onWorkspaceDirtyChange?.(workspaceKey,value),[onWorkspaceDirtyChange,workspaceKey]);
  // 独立编辑窗口：装修编辑在 window.open 打开的独立窗口里进行，与后台隔离。
  // 这里识别出来后，编辑器头部的返回按钮改为「关闭窗口」，避免在孤立窗口里返回版本列表却找不到出口。
  const isEditorWindow = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('adminWindow') === 'storefront-design';
  const closeEditorWindow = () => { try { window.close(); } catch {} if (!window.closed) window.location.href = '/'; };
  // 关闭类操作统一放进编辑器自己的顶栏（导入 / 导出右侧），这里只保留标题栏
  const editorHeader = <ShopPageHead />;
  useEffect(()=>{reportWorkspaceDirty(builderDirty||cmsDirty||ordersDirty||reviewsDirty||homepageDirty)},[builderDirty,cmsDirty,ordersDirty,reviewsDirty,homepageDirty,reportWorkspaceDirty]);
  const reloadProducts=useCallback(()=>{const version=++productsLoadVersion.current;return api.products(undefined,true).then(rows=>{if(version===productsLoadVersion.current)setProducts(rows);return rows}).catch(()=>[])},[]);
  useEffect(() => { if(!active)return;const version=++productsLoadVersion.current;api.products(undefined,true).then(rows=>{if(version===productsLoadVersion.current)setProducts(rows)}).catch(()=>{});return()=>{productsLoadVersion.current++}; }, [active]);
  useEffect(() => { if(!active||section!=='products')return;let cancelled=false;(async()=>{const items=[];let page=1,result;do{result=await api.catalogProducts('zh',page++);items.push(...(result.items||[]))}while(result.hasMore&&!cancelled);if(!cancelled)setPublishedIds(new Map(items.filter(item=>item.productId&&item.slug).map(item=>[String(item.productId),item.slug])));})().catch(()=>{});return()=>{cancelled=true}; }, [active,section,products]);
  // 平铺入口：切换 section 时重置内部子视图，避免从 design hub 遗留的 builder/cms 状态串味
  useEffect(() => { setPageView('list'); setEditingPage(''); }, [section]);
  // 版本总览直达：带 pageId 进入 pages 时直接打开该页面的 CMS 编辑器
  useEffect(() => { if (pageId) { setPageView('cms'); setEditingPage(pageId); } }, [pageId]);
  useEffect(() => { if (productId && section === 'product-design') setEditingPage(productId); }, [productId, section]);
  if (section === 'overview') return <ShopOverview active={active} onNavigate={onSectionChange}/>;
  // 「流量」分区升级为 SEO 与流量中心；旧 key 保留跳转，避免历史入口 404
  if (section === 'traffic') return <SeoTrafficCenter active={active} />;
  if (section === 'seo-traffic') return <SeoTrafficCenter active={active} />;
  if (section === 'payments') return <PaymentProviders active={active} />;
  if (section === 'module-ledger') return <ModuleLedger />;
  if (section === 'media' || section === 'assets-v2') return user?.role === 'admin' ? <AssetWorkspaceV2 embedded /> : <p>仅管理员可访问素材资产中心。</p>;
  if (section === 'pricing') return <ShopPricingPage/>;
  if (section === 'product-design') return <>
    <ShopPageHead actions={<button type="button" className="btn small" onClick={() => onSectionChange?.('design')}>← 返回店铺装修</button>} />
    <StorefrontListingsAdmin products={products} initialProductId={editingPage} active={active} onDirtyChange={setBuilderDirty}/>
  </>;
  // 平铺入口：侧栏「首页装修」直达可视化编辑器（不再经过 design hub）
  if (section === 'home-design') return <>
    {isEditorWindow ? editorHeader : <ShopPageHead />}
    <Suspense fallback={<p className="hint">正在载入装修工作区…</p>}><StorefrontBuilderAdmin active={active} user={user} onDirtyChange={setBuilderDirty} onClose={isEditorWindow ? closeEditorWindow : undefined}/></Suspense>
  </>;
  // 店铺装修统一工作区
  if (section === 'unified-design' || section === 'design') return <UnifiedDesignWorkspace active={active} user={user} onOpenEditor={onOpenDesignEditor}/>;
  if (section === 'orders') return <div className="shop-work">
    <ShopPageHead />
    <StorefrontOrdersAdmin active={active} onDirtyChange={setOrdersDirty} onGotoReviews={()=>onSectionChange?.('reviews')}/>
  </div>;
  if (section === 'reviews') return <div className="shop-work">
    <ShopPageHead />
    <StorefrontReviewsAdmin active={active} onDirtyChange={setReviewsDirty}/>
  </div>;
  // 官网首页内容（眉题 / 主标题 / 按钮 / 介绍 / 精选产品）：内置设计版式的文案来源
  if (section === 'homepage') return <div className="shop-work">
    <ShopPageHead />
    <StorefrontPageAdmin user={user} active={active} onDirtyChange={setHomepageDirty}/>
  </div>;
  // 首页可视化装修工作区（保留现有布局引擎）
  if (section === 'pages' && pageView === 'builder') return <>
    <ShopPageHead actions={<button type="button" className="btn small" onClick={() => setPageView('list')}>← 返回页面管理</button>} />
    <Suspense fallback={<p className="hint">正在载入可视化编辑器…</p>}><StorefrontBuilderAdmin active={active} user={user} onDirtyChange={setBuilderDirty} onClose={isEditorWindow ? closeEditorWindow : undefined}/></Suspense>
  </>;
  // 页面装修工作区（独立三栏编辑器，不嵌在列表下方）
  if (section === 'pages' && pageView === 'cms') return <>
    {isEditorWindow && editorHeader}
    <CmsPageManager
      active={active} user={user} openPageId={editingPage} onDirtyChange={setCmsDirty}
      onBack={isEditorWindow ? closeEditorWindow : ()=>{setPageView('list');setEditingPage('');}}
    />
  </>;
  // 页面管理列表（纯清单，不嵌入任何编辑器）
  if (section === 'pages') return <>
    <ShopPageHead actions={<button type="button" className="btn small" onClick={() => startTransition(() => setPageView('builder'))}>首页可视化装修</button>} />
    <PageManager active={active} user={user} initialQuery={pageQuery} onDirtyChange={setCmsDirty}
      onOpenBuilder={id=>{setEditingPage(id);setPageView('cms');}}
      onOpenHomeBuilder={()=>startTransition(()=>setPageView('builder'))}
    />
  </>;
  return <div className="shop-work">
    <ShopPageHead actions={<>
      <button type="button" className="btn small" onClick={()=>onSectionChange?.('media')}>上传图片</button>
      <a className="btn small" href="/www/zh/products" target="_blank" rel="noreferrer">查看官网商品目录 ↗</a>
      <details className="shop-newwrap">
        <summary className="btn small primary">＋ 新建商品</summary>
        <div className="shop-menu">
          <button type="button" onClick={()=>onCreateProduct?.('vehicle')}><b>新建整车</b><span className="hint" /></button>
          <button type="button" onClick={()=>onCreateProduct?.('part')}><b>新建零配件</b><span className="hint" /></button>
        </div>
      </details>
    </>} />
    <ShopProductList products={products} publishedIds={publishedIds} user={user} onOpenProduct={onOpenProduct} onOpenListing={id=>onSectionChange?.('product-design',{productId:id})} onGotoMedia={()=>onSectionChange?.('media')} onRefresh={reloadProducts}/>
  </div>;
}
