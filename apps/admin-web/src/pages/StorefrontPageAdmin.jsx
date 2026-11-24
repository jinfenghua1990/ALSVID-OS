import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const languages=[['zh','中文内容'],['en','英文内容'],['de','德文内容']];
const defaults={
  zh:{eyebrow:'ALSVID / ELECTRIC MOBILITY',title:'让每一次出发，都更从容。',intro:'探索已由 ALSVID 发布的产品、服务与车辆支持。',browse:'探索产品',featuredProductIds:[]},
  en:{eyebrow:'ALSVID / ELECTRIC MOBILITY',title:'Move with confidence.',intro:'Explore products, service and vehicle support published by ALSVID.',browse:'Explore products',featuredProductIds:[]},
  de:{eyebrow:'ALSVID / ELECTRIC MOBILITY',title:'Mit Vertrauen unterwegs.',intro:'Entdecken Sie von ALSVID veröffentlichte Produkte und Services.',browse:'Produkte entdecken',featuredProductIds:[]},
};
const fresh=()=>({languages:structuredClone(defaults)});

export default function StorefrontPageAdmin({user,active=true,onDirtyChange}) {
  const [record,setRecord]=useState(null),[document,setDocument]=useState(fresh),[lang,setLang]=useState('zh');
  const [page,setPage]=useState(1),[products,setProducts]=useState([]),[hasMore,setHasMore]=useState(false);
  const [dirty,setDirty]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const recordLoadVersion=useRef(0),productsLoadVersion=useRef(0);
  useEffect(()=>{onDirtyChange?.(dirty)},[dirty,onDirtyChange]);
  useEffect(()=>{if(!active||dirty)return;const version=++recordLoadVersion.current;api.homepageAdmin().then(row=>{if(version===recordLoadVersion.current){setRecord(row);setDocument(row?.draft||fresh())}}).catch(e=>{if(version===recordLoadVersion.current)setError(e.message)});return()=>{recordLoadVersion.current++}},[active,dirty]);
  useEffect(()=>{if(!active)return;const version=++productsLoadVersion.current;api.catalogProducts(lang,page).then(result=>{if(version===productsLoadVersion.current){setProducts(result.items||[]);setHasMore(!!result.hasMore)}}).catch(e=>{if(version===productsLoadVersion.current)setError(e.message)});return()=>{productsLoadVersion.current++}},[active,lang,page]);
  if(user.role!=='admin')return null;
  const locale=document.languages?.[lang]||defaults[lang];
  const edit=next=>{setDocument(next);setDirty(true);setError('');setMessage('')};
  const editLocale=patch=>edit({...document,languages:{...document.languages,[lang]:{...locale,...patch}}});
  const toggleProduct=product=>{const ids=locale.featuredProductIds||[],picked=ids.some(id=>id===product.productId||id===product.id);if(picked)editLocale({featuredProductIds:ids.filter(id=>id!==product.productId&&id!==product.id)});else if(ids.length<6)editLocale({featuredProductIds:[...ids,product.productId]});else setError('首页最多精选 6 个产品')};
  const run=async action=>{setBusy(true);setError('');setMessage('');try{let next;if(action==='save')next=await api.saveHomepage({revision:record.revision,document});else if(action==='publish')next=await api.publishHomepage(record.revision);else next=await api.unpublishHomepage(record.revision);setRecord(next);if(next.draft)setDocument(next.draft);setDirty(false);setMessage(action==='save'?'首页草稿已保存，访客看到的内容未改变。':action==='publish'?'官网首页已发布。':'官网首页已下架，恢复默认首页内容。')}catch(e){setError(e.message)}finally{setBusy(false)}};
  const stateText=record?(record.published?(record.revision===record.publishedRevision?'已发布':'已发布 · 草稿有新改动'):'使用系统默认首页'):'读取中';
  return <section className="card shop-homepage">
    <div className="shop-panel__head">
      <div style={{display:'flex',alignItems:'center',gap:10}}><b>官网首页内容</b><span className={'shop-status'+(record?.published?' is-on':'')}>{stateText}{dirty?' · 有未保存内容':''}</span></div>
      <a className="btn small" href="/www/zh" target="_blank" rel="noreferrer">打开官网首页 ↗</a>
    </div>
    <p className="hint">这里编辑的是「内置设计版式」的首页文案与精选产品。官网首页按下面顺序取内容：已发布的<b>可视化装修方案</b> › 本页文案套进内置版式 › 系统默认文案。只要可视化装修还处于已发布状态，本页改动就不会出现在访客页面，需先到「页面管理 › 首页可视化装修」下架装修方案。</p>
    {error&&<p className="error-text mt8" role="alert">{error}</p>}
    {message&&<p className="hint mt8" role="status" />}
    {!record?<p className="hint" />:<>
      <div className="tabs mt12">{languages.map(([code,label])=><button type="button" key={code} className={'tab'+(lang===code?' active':'')} onClick={()=>setLang(code)}>{label}</button>)}</div>
      <fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}>
        <div className="form-grid mt12">
          <div className="field"><label>眉题</label><input maxLength={100} value={locale.eyebrow||''} onChange={e=>editLocale({eyebrow:e.target.value})}/></div>
          <div className="field"><label>主标题</label><input maxLength={180} value={locale.title||''} onChange={e=>editLocale({title:e.target.value})}/></div>
          <div className="field"><label>按钮文字</label><input maxLength={80} value={locale.browse||''} onChange={e=>editLocale({browse:e.target.value})}/></div>
          <div className="field fg-span"><label>首页介绍</label><textarea rows={4} maxLength={1000} value={locale.intro||''} onChange={e=>editLocale({intro:e.target.value})}/></div>
        </div>
        <div className="mt16">
          <div className="shop-panel__head"><b>精选产品（最多 6 个）</b><span className="hint" /></div>
          <div className="shop-homepage__grid">
            {products.map(product=>{
              const picked=(locale.featuredProductIds||[]).some(id=>id===product.productId||id===product.id);
              return <label key={product.id} className={'shop-homepage__pick'+(picked?' is-on':'')}>
                <input type="checkbox" checked={picked} onChange={()=>toggleProduct(product)}/>
                <span><b>{product.title}</b><span className="hint" /></span>
              </label>;
            })}
            {!products.length&&<p className="hint" />}
          </div>
          <div className="row mt8" style={{gap:8}}>
            <button type="button" className="btn small" disabled={page===1||busy} onClick={()=>setPage(n=>n-1)}>上一页</button>
            <span className="hint" />
            <button type="button" className="btn small" disabled={!hasMore||busy} onClick={()=>setPage(n=>n+1)}>下一页</button>
          </div>
        </div>
        <div className="row mt16" style={{gap:10,paddingTop:12,borderTop:'1px solid var(--border)'}}>
          <button type="button" className="btn" disabled={!dirty||busy} onClick={()=>run('save')}>{busy?'保存中…':'保存草稿'}</button>
          <button type="button" className="btn primary" disabled={dirty||busy||!record.draft||record.revision===record.publishedRevision} onClick={()=>{if(window.confirm('将当前保存的首页内容发布给访客？'))run('publish')}}>发布首页</button>
          <button type="button" className="btn" disabled={!record.published||dirty||busy} onClick={()=>{if(window.confirm('下架自定义首页并恢复默认内容？'))run('unpublish')}}>恢复默认首页</button>
        </div>
      </fieldset>
    </>}
  </section>;
}
