import React, { useEffect, useRef, useState } from 'react';
import { adminFetch } from '../api.js';
import ListingVersions from './ListingVersions.jsx';

const languages=[['zh','中文'],['en','英文'],['de','德文']];
const seoSlug=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
const defaultSeoSlug=product=>{
  const masterSeoId=String(product?.specs?._seoProductId||'').trim().toLowerCase();
  if(masterSeoId&&!/^[a-z][0-9]+-(?:std|ult|pro)-[a-z0-9]+-[a-z0-9]+$/.test(masterSeoId))return masterSeoId;
  const model=String(product?.model||'').trim().toUpperCase();
  const trim=String(product?.skus?.[0]?.spec||'').trim().toUpperCase();
  if(model==='A1'&&trim==='STD')return 'carbon-e-bike-klapprad-a1';
  if(model==='A1'&&trim==='ULT')return 'carbon-e-bike-klapprad-a1-ultra';
  if(model==='L1'&&trim==='STD')return 'carbon-e-bike-klapprad-l1';
  if(model==='L1'&&trim==='PRO')return 'carbon-e-bike-klapprad-mittelmotor-l1-pro';
  return '';
};
const emptyDocument=product=>({model:'',languages:{zh:{title:'',description:'',delivery:'',warranty:'',specifications:[]}},mediaIds:[],seo:{slug:defaultSeoSlug(product),title:'',description:'',keywords:'',canonical:''}});
const emptyForm=product=>({channel:'website',document:emptyDocument(product),skus:[]});
async function request(path,method='GET',body){const response=await adminFetch(path,{method,headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});const data=await response.json();if(!response.ok)throw Error(data.error||'商品操作失败');return data}

export default function StorefrontListingsAdmin({ products, initialProductId='', active=true, onDirtyChange }) {
  const [productId,setProductId]=useState(initialProductId),[rows,setRows]=useState([]),[selected,setSelected]=useState(''),[form,setForm]=useState(emptyForm()),[baseline,setBaseline]=useState(emptyForm()),[lang,setLang]=useState('zh'),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const initializedProductId=useRef('');
  const product=products.find(p=>p.id===productId), dirty=JSON.stringify(form)!==JSON.stringify(baseline);
  useEffect(()=>{
    if(!initialProductId||initializedProductId.current===initialProductId)return;
    const initialProduct=products.find(p=>p.id===initialProductId);
    if(!initialProduct)return;
    initializedProductId.current=initialProductId;
    setProductId(initialProductId);
    setSelected('');
    const next=emptyForm(initialProduct);
    setForm(next);
    setBaseline(next);
    setMessage('');
  },[initialProductId,products]);
  useEffect(()=>{onDirtyChange?.(dirty)},[dirty,onDirtyChange]);
  const load=async id=>{if(!id){setRows([]);return}setRows(await request(`/api/products/${encodeURIComponent(id)}/listings`))};
  useEffect(()=>{if(!active||!productId)return;let cancelled=false;request(`/api/products/${encodeURIComponent(productId)}/listings`).then(data=>{if(!cancelled)setRows(data)}).catch(e=>{if(!cancelled)setMessage(e.message)});return()=>{cancelled=true}},[active,productId]);
  const confirmLeave=()=>!dirty||window.confirm('当前商品有未保存的修改，确定切换吗？');
  const selectProduct=id=>{if(!confirmLeave())return;setProductId(id);setSelected('');const next=emptyForm(products.find(p=>p.id===id));setForm(next);setBaseline(next);setMessage('');if(!id)setRows([])};
  const selectListing=id=>{if(!confirmLeave())return;setSelected(id);const row=rows.find(item=>item.id===id);const next=row?{channel:row.channel,document:{...emptyDocument(product),...row.draft,seo:{...emptyDocument(product).seo,...(row.draft?.seo||{})}},skus:row.skus||[]}:emptyForm(product);setForm(next);setBaseline(next);setMessage('')};
  const updateDocument=patch=>setForm(current=>({...current,document:{...current.document,...patch}}));
  const updateLocale=patch=>updateDocument({languages:{...form.document.languages,[lang]:{...form.document.languages[lang],...patch}}});
  const updateSeo=patch=>updateDocument({seo:{...emptyDocument(product).seo,...form.document.seo,...patch}});
  const toggleSku=(sku,checked)=>setForm(current=>({...current,skus:checked?[...current.skus,{sku,prices:[]}]:current.skus.filter(row=>row.sku!==sku)}));
  const updatePrice=(sku,currency,value)=>setForm(current=>({...current,skus:current.skus.map(row=>row.sku!==sku?row:{...row,prices:value===''?row.prices.filter(price=>price.currency!==currency):[...row.prices.filter(price=>price.currency!==currency),{currency,unitPrice:value,published:true}]})}));
  const selectedRow=rows.find(row=>row.id===selected),pricesLocked=!!selectedRow?.published,hasUnpublishedChanges=pricesLocked&&JSON.stringify(selectedRow.draft)!==JSON.stringify(selectedRow.published);
  const save=async()=>{if(!productId||busy)return;setBusy(true);setMessage('');try{const result=await request(selected?`/api/storefront/listings/${encodeURIComponent(selected)}`:'/api/storefront/listings',selected?'PUT':'POST',{...form,productId,revision:selectedRow?.revision});setSelected(result.id);const next={channel:result.channel,document:{...emptyDocument(product),...result.draft,seo:{...emptyDocument(product).seo,...(result.draft?.seo||{})}},skus:result.skus};setForm(next);setBaseline(next);await load(productId);setMessage('商品草稿已保存。')}catch(e){setMessage(e.message)}finally{setBusy(false)}};
  const transition=async action=>{if(!selectedRow||dirty)return;setBusy(true);setMessage('');try{await request(`/api/storefront/listings/${encodeURIComponent(selected)}/${action}`,'POST',{revision:selectedRow.revision});await load(productId);setMessage(action==='publish'?'商品已发布。':'商品已下架。')}catch(e){setMessage(e.message)}finally{setBusy(false)}};
  const locale=form.document.languages[lang];
  // SEO 商品 ID 的唯一真源在产品编辑页：有主档值时这里只读展示，
  // 让运营不会在装修页改出一个跟主档不一致的 URL（服务端也会拒绝）。
  const masterSeoId=String(product?.specs?._seoProductId||'').trim().toLowerCase();
  return <section className="card shop-panel"><div className="shop-panel__head"><b>渠道商品管理</b><span className="hint" /></div>
    <div className="row"><label>物理产品 <select value={productId} onChange={e=>selectProduct(e.target.value)}><option value="">选择产品</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.status}</option>)}</select></label>{productId&&<label>商品 <select value={selected} onChange={e=>selectListing(e.target.value)}><option value="">新建商品</option>{rows.map(row=><option key={row.id} value={row.id}>{row.channel} · {row.slug||row.id} {row.isDefault?'（原有商品）':''}</option>)}</select></label>}</div>
    {product&&<p className="hint">SEO 商品 ID 用于商品 URL 和商城首页跳转；新建时会按产品真实属性生成建议。</p>}
    {product&&<fieldset disabled={busy} style={{border:0,padding:0,margin:0,minWidth:0}}><p className="hint" />{pricesLocked&&<p className="hint">商品仍在发布：可编辑商品详情草稿；SKU 与价格保持线上版本。保存后可直接发布详情更新。</p>}<div className="form-grid"><div className="field"><label>渠道代码</label><input disabled={pricesLocked} value={form.channel} maxLength={80} placeholder="website / marketplace" onChange={e=>setForm({...form,channel:e.target.value.toLowerCase()})}/></div><div className="field"><label>公开型号</label><input maxLength={100} value={form.document.model||''} onChange={e=>setForm({...form,model:e.target.value})}/></div><div className="field"><label>SEO 商品 ID</label><input disabled={pricesLocked||!!masterSeoId} title={masterSeoId?'由产品编辑页维护，改那里 URL 会自动同步到各渠道':'可直接填写'} maxLength={80} value={form.document.seo?.slug||''} onChange={e=>updateSeo({slug:seoSlug(e.target.value)})}/>{masterSeoId&&<span className="hint">由产品编辑页维护（{masterSeoId}），修改后所有渠道 URL 自动同步</span>}</div><div className="field"><label>SEO 标题</label><input maxLength={180} value={form.document.seo?.title||''} onChange={e=>updateSeo({title:e.target.value})}/></div><div className="field"><label>SEO 描述</label><textarea maxLength={500} value={form.document.seo?.description||''} onChange={e=>updateSeo({description:e.target.value})}/></div><div className="field"><label>SEO 关键词</label><input maxLength={500} value={form.document.seo?.keywords||''} onChange={e=>updateSeo({keywords:e.target.value})}/></div><div className="field"><label>Canonical URL</label><input maxLength={500} value={form.document.seo?.canonical||''} onChange={e=>updateSeo({canonical:e.target.value})}/></div></div>
      <div className="tabs">{languages.map(([code,label])=><button key={code} type="button" className={'tab'+(lang===code?' active':'')} onClick={()=>setLang(code)}>{label}</button>)}</div><label><input type="checkbox" checked={!!locale} onChange={e=>{const next={...form.document.languages};if(e.target.checked)next[lang]={title:'',description:'',delivery:'',warranty:'',specifications:[]};else delete next[lang];updateDocument({languages:next})}}/> 提供此语言</label>{locale&&<div className="form-grid"><div className="field"><label>商品标题</label><input maxLength={160} value={locale.title} onChange={e=>updateLocale({title:e.target.value})}/></div><div className="field"><label>商品描述</label><textarea maxLength={10000} value={locale.description} onChange={e=>updateLocale({description:e.target.value})}/></div><div className="field"><label>配送与交付说明</label><textarea maxLength={2000} placeholder="填写该商品适用的配送范围、时效或交付方式" value={locale.delivery||''} onChange={e=>updateLocale({delivery:e.target.value})}/></div><div className="field"><label>质保说明</label><textarea maxLength={2000} placeholder="填写适用期限、覆盖范围与申请方式" value={locale.warranty||''} onChange={e=>updateLocale({warranty:e.target.value})}/></div></div>}
      {product.kind==='vehicle'&&<section className="catalog-related-source"><h3>适配配件</h3><p className="hint">从产品研发中已建立的配件适配关系自动生成；配件需有官网发布内容才会显示。</p><ul>{products.filter(item=>item.kind==='part'&&(item.fitments||[]).some(fit=>fit.vehicleUuid===product.entityUuid||fit.vehicleModel===product.model)).map(item=><li key={item.id}>{item.name} · {item.model}</li>)}</ul>{!products.some(item=>item.kind==='part'&&(item.fitments||[]).some(fit=>fit.vehicleUuid===product.entityUuid||fit.vehicleModel===product.model))&&<p className="hint">当前车型尚无适配配件关系。</p>}</section>}
      <h3>选择商品图片</h3><div className="row" style={{flexWrap:'wrap'}}>{(product.images||[]).map(image=><label key={image.id}><img src={`/api/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(image.id)}`} alt={image.label||'产品图片'} style={{width:90,height:70,objectFit:'contain'}}/><input type="checkbox" checked={form.document.mediaIds.includes(image.id)} onChange={e=>updateDocument({mediaIds:e.target.checked?[...form.document.mediaIds,image.id]:form.document.mediaIds.filter(id=>id!==image.id)})}/>{image.label}</label>)}</div>
      <h3>可销售 SKU 与渠道价格</h3><table className="table"><thead><tr><th>选择</th><th>工业 SKU</th><th>EUR</th><th>CNY</th></tr></thead><tbody>{(product.skus||[]).map(sku=>{const selectedSku=form.skus.find(row=>row.sku===sku.sku);return <tr key={sku.sku}><td><input type="checkbox" disabled={pricesLocked} checked={!!selectedSku} onChange={e=>toggleSku(sku.sku,e.target.checked)}/></td><td>{sku.sku}</td>{['EUR','CNY'].map(currency=><td key={currency}><input type="number" min="0" step="0.01" disabled={pricesLocked||!selectedSku} value={selectedSku?.prices.find(price=>price.currency===currency)?.unitPrice||''} onChange={e=>updatePrice(sku.sku,currency,e.target.value)}/></td>)}</tr>})}</tbody></table>
      <button type="button" className="btn primary mt16" disabled={busy||!dirty} onClick={save}>保存商品草稿</button>
    </fieldset>}
    {selectedRow&&<div className="row mt16"><span>{hasUnpublishedChanges?'有待发布的详情更新':selectedRow.published?'已发布':'草稿'} · 版本 {selectedRow.revision}</span><button type="button" className="btn" disabled={busy||dirty||(!selectedRow.published&&product?.status!=='启用')} onClick={()=>transition(selectedRow.published?(hasUnpublishedChanges?'publish':'unpublish'):'publish')}>{selectedRow.published?(hasUnpublishedChanges?'发布详情更新':'下架'):'发布'}</button></div>}
    {selectedRow&&<ListingVersions key={selectedRow.id} listing={selectedRow} disabled={busy||dirty} onRolledBack={()=>load(productId)}/>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
