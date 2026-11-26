import React,{useCallback,useEffect,useState} from 'react';
import {api} from '../api.js';
import {CatalogLayoutPanel} from './ProductDesignPanels.jsx';
import {DESIGN_LOCALES} from './design-module-registry.js';

export default function UnifiedCatalogModuleEditor({moduleId,locale,workspaceKey,onWorkspaceDirtyChange,onBack}){
 const [row,setRow]=useState(null),[products,setProducts]=useState([]),[publishedMap,setPublishedMap]=useState(new Map()),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{let alive=true;setLoading(true);setError('');(async()=>{try{
   const [rows,allProducts]=await Promise.all([api.cmsPages({type:'product_template',locale,path:'/products'}),api.products(undefined,true)]);
   const page=rows.find(item=>item.pageType==='product_template'&&item.path==='/products'&&item.locale===locale)||null;
   const listings=new Map();let pageNumber=1,result;
   do{result=await api.catalogProducts(locale,pageNumber++);for(const item of result.items||[])if(item.productId&&item.slug)listings.set(String(item.productId),item.slug)}while(result.hasMore&&pageNumber<=20);
   if(alive){setRow(page);setProducts(Array.isArray(allProducts)?allProducts:[]);setPublishedMap(listings)}
 }catch(e){if(alive)setError(e.message||'读取列表页装修资料失败')}finally{if(alive)setLoading(false)}})();return()=>{alive=false}},[locale]);
 const reportDirty=useCallback(value=>onWorkspaceDirtyChange?.(workspaceKey,value),[workspaceKey,onWorkspaceDirtyChange]);
 return <div className="udw-edit">
   <header className="udw-top"><div><h2>{moduleId==='ALSVID-L02'?'整车展示与快速购买':moduleId==='ALSVID-L03'?'配件与增值服务商品':moduleId==='ALSVID-L04'?'服务与支持':'分类导航'}</h2><small>{moduleId} · {DESIGN_LOCALES.find(([code])=>code===locale)?.[1]} · 列表页共享配置</small></div><button className="btn" onClick={onBack}>返回工作台</button></header>
   <p className="hint">沿用现有 `/products` 商品模板和 CMS 草稿版本。商品、SKU、库存及价格继续从真实商品数据读取；此入口只保存草稿，六项真实预览审核接入前不开放发布。</p>
   {error&&<p className="error-text" role="alert">{error}</p>}{notice&&<p className="hint" role="status">{notice}</p>}
   {loading?<p className="hint">正在读取列表页配置…</p>:row?<CatalogLayoutPanel moduleId={moduleId} row={row} locale={locale} products={products} publishedMap={publishedMap} publishEnabled={false} notify={setNotice} onDirtyChange={reportDirty}/>:<p className="hint">当前语言尚无 `/products` 商品模板记录。请先在现有页面管理中建立模板；此处不会创建第二份装修数据。</p>}
 </div>;
}
