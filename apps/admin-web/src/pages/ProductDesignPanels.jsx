import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

// 产品装修面板：
// - CatalogLayoutPanel：「全部产品」列表页版式（分类导航 + 按销量自动展示），存 product_template 页草稿，走 CMS 发布流。
// - DetailDesignPanel：「商品详情页」装修。标准详情=按商品（主图选择 + 图文详情，走商品发布流）；
//   公共模块=全局 ②营销 ③④预留 ⑥评价 ⑦退换货 ⑧其他，存 product_template 页草稿，更新 1 处全部商品生效。

const DEFAULT_MODULES = {
  marketing: { enabled: false, imageId: '', href: '', text: '' },
  reserved3: { enabled: false, imageId: '', href: '', text: '' },
  reserved4: { enabled: false, imageId: '', href: '', text: '' },
  reviews: { enabled: true, limit: 20, style: 'list' },
  returns: { enabled: false, title: '', body: '' },
  other: { enabled: false, title: '', body: '' },
};

// 读取 product_template 页面草稿并维护本地副本 + 乐观锁 revision。
function useCmsDocument(row) {
  const [page, setPage] = useState(null);
  const [doc, setDoc] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    if (!row) return undefined;
    let alive = true;
    setDoc(null); setError('');
    api.cmsPage(row.id).then(p => {
      if (!alive) return;
      const document = p.draft || p.published || { blocks: [], productLayout: {}, modules: {}, catalogLayout: null };
      const clone = JSON.parse(JSON.stringify(document));
      setPage(p); setDoc(clone); setBaseline(JSON.stringify(clone)); setRevision(p.revision);
    }).catch(e => { if (alive) setError(e.message || '读取页面草稿失败'); });
    return () => { alive = false; };
  }, [row && row.id]);
  useEffect(load, [load]);
  const dirty = Boolean(doc) && JSON.stringify(doc) !== baseline;
  const save = async () => {
    if (!row || busy) return null;
    setBusy(true);
    try {
      const seo = page?.draftSeo && (page.draftSeo.title || page.draftSeo.description) ? page.draftSeo : page?.publishedSeo || {};
      const updated = await api.saveCmsDraft(row.id, { draft: doc, seo, revision });
      setRevision(updated.revision); setPage(p => (p ? { ...p, draft: doc, revision: updated.revision } : p));
      setBaseline(JSON.stringify(doc));
      return updated;
    } catch (e) { setError(e.message || '保存失败'); } finally { setBusy(false); }
    return null;
  };
  const publish = async () => {
    if (!row || busy) return null;
    setBusy(true);
    try { return await api.publishCmsPage(row.id, revision); }
    catch (e) { setError(e.message || '发布失败'); } finally { setBusy(false); }
    return null;
  };
  return { page, doc, setDoc, dirty, busy, error, save, publish, reload: load };
}

function SaveBar({ dirty, busy, error, onSave, onPublish, publishedVersion, hint }) {
  return <div className="sdp__bar">
    <span className="sdp__status">{publishedVersion ? `线上版本 v${publishedVersion}` : '尚未发布'}{dirty ? ' · 有未保存修改' : ''}</span>
    <button type="button" className="btn small" disabled={!dirty || busy} onClick={onSave}>{busy ? '处理中…' : '保存草稿'}</button>
    <button type="button" className="btn small primary" disabled={busy} onClick={onPublish}>发布</button>
    {hint && <span className="hint">{hint}</span>}
    {error && <span className="error-text">{error}</span>}
  </div>;
}

// 素材库图片选择（营销横幅 / 预留位 / 图文详情共用）
function AssetImageSelect({ assets, value, onChange, placeholder = '从素材库选择图片' }) {
  return <label className="sdp__field">图片
    <select value={value || ''} onChange={e => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {assets.map(asset => <option key={asset.id} value={asset.id}>{asset.label || asset.fileName || asset.id}</option>)}
    </select>
  </label>;
}

function BannerEditor({ title, note, value, assets, onChange }) {
  const module = { ...DEFAULT_MODULES.marketing, ...(value || {}) };
  const patch = next => onChange({ ...module, ...next });
  return <section className="sdp__module">
    <header><strong>{title}</strong>{note && <span className="hint">{note}</span>}</header>
    <label className="sdp__check"><input type="checkbox" checked={module.enabled} onChange={e => patch({ enabled: e.target.checked })}/> 启用</label>
    {module.enabled && <>
      <AssetImageSelect assets={assets} value={module.imageId} onChange={imageId => patch({ imageId })}/>
      {module.imageId && <img className="sdp__thumb" src={api.assetUrl(module.imageId)} alt=""/>}
      <label className="sdp__field">跳转链接<input value={module.href} maxLength={500} placeholder="/www/zh/products/… 或 https://…" onChange={e => patch({ href: e.target.value })}/></label>
      <label className="sdp__field">促销文案<textarea rows={2} maxLength={600} value={module.text} onChange={e => patch({ text: e.target.value })}/></label>
    </>}
  </section>;
}

function CopyEditor({ title, value, onChange, defaultTitle }) {
  const module = { enabled: false, title: '', body: '', ...(value || {}) };
  const patch = next => onChange({ ...module, ...next });
  return <section className="sdp__module">
    <header><strong>{title}</strong></header>
    <label className="sdp__check"><input type="checkbox" checked={module.enabled} onChange={e => patch({ enabled: e.target.checked })}/> 启用</label>
    {module.enabled && <>
      <label className="sdp__field">栏目标题<input value={module.title} maxLength={180} placeholder={defaultTitle} onChange={e => patch({ title: e.target.value })}/></label>
      <label className="sdp__field">正文<textarea rows={4} maxLength={4000} value={module.body} onChange={e => patch({ body: e.target.value })}/></label>
    </>}
  </section>;
}

export function CatalogLayoutPanel({ row, locale, products, publishedMap, onPublished, notify }) {
  const { doc, setDoc, dirty, busy, error, save, publish } = useCmsDocument(row);
  if (!doc) return <p className="sdw__tip">{error || '正在读取版式配置…'}</p>;
  const enabled = doc.catalogLayout != null;
  const layout = doc.catalogLayout || { sort: 'sales', categories: [] };
  const patch = next => setDoc({ ...doc, catalogLayout: next });
  const publishedVehicles = products.filter(p => p.kind === 'vehicle' && p.status === '启用' && publishedMap.has(p.id));
  const doSave = async () => { if (await save()) notify('列表页版式草稿已保存'); };
  const doPublish = async () => { if (await publish()) { notify('列表页版式已发布'); onPublished?.(); } };
  return <div className="sdp">
    <SaveBar dirty={dirty} busy={busy} error={error} onSave={doSave} onPublish={doPublish} publishedVersion={row.publishedVersion}/>
    <section className="sdp__module">
      <header><strong>启用装修版式</strong></header>
      <label className="sdp__check"><input type="checkbox" checked={enabled} onChange={e => patch(e.target.checked ? { sort: 'sales', categories: [] } : null)}/> 分类导航 + 产品自动展示</label>
      <label className="sdp__field">展示顺序
        <select value={layout.sort} disabled={!enabled} onChange={e => patch({ ...layout, sort: e.target.value })}>
          <option value="sales">按销量</option>
          <option value="default">默认顺序</option>
        </select>
      </label>
    </section>
    {enabled && <section className="sdp__module">
      <header><strong>分类导航</strong><span className="hint">最多 20 个</span></header>
      {layout.categories.map((category, index) => <div className="sdp__category" key={index}>
        <div className="sdp__category-head">
          <input value={category.name} maxLength={80} placeholder="分类名称" onChange={e => patch({ ...layout, categories: layout.categories.map((row, i) => i === index ? { ...row, name: e.target.value } : row) })}/>
          <button type="button" className="btn small" disabled={busy} onClick={() => patch({ ...layout, categories: layout.categories.filter((_, i) => i !== index) })}>删除</button>
        </div>
        <select multiple size={6} value={category.productIds} onChange={e => patch({ ...layout, categories: layout.categories.map((row, i) => i === index ? { ...row, productIds: [...e.target.selectedOptions].map(o => o.value) } : row) })}>
          {publishedVehicles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {!publishedVehicles.length && <p className="hint">当前语言（{locale}）暂无已发布整车，先去「商品列表」发布商品。</p>}
      </div>)}
      <button type="button" className="btn small" disabled={layout.categories.length >= 20} onClick={() => patch({ ...layout, categories: [...layout.categories, { name: '', productIds: [] }] })}>＋ 添加分类</button>
    </section>}
  </div>;
}

function StandardDetailPanel({ locale, products, publishedMap, productId }) {
  const [listing, setListing] = useState(null);
  const [doc, setDoc] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [assets, setAssets] = useState([]);
  const product = products.find(p => p.id === productId);
  useEffect(() => { api.assetsAll({ category: 'page', kind: 'image' }).then(rows => setAssets(Array.isArray(rows) ? rows : [])).catch(() => setAssets([])); }, []);
  useEffect(() => {
    if (!productId) { setListing(null); setDoc(null); return undefined; }
    let alive = true;
    setLoading(true); setError(''); setListing(null); setDoc(null);
    api.productListings(productId).then(rows => {
      if (!alive) return;
      const website = (rows || []).find(row => row.channel === 'website') || null;
      setListing(website);
      const document = website ? (website.draft || website.published) : null;
      if (document) { const clone = JSON.parse(JSON.stringify(document)); setDoc(clone); setBaseline(JSON.stringify(clone)); setRevision(website.revision); }
    }).catch(e => { if (alive) setError(e.message || '读取商品失败'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [productId]);
  if (!productId) return <p className="sdw__tip">先在左侧选择要装修的商品。</p>;
  if (loading) return <p className="sdw__tip">正在读取商品发布内容…</p>;
  if (error) return <p className="error-text" role="alert">{error}</p>;
  if (!listing) return <p className="sdw__tip">该商品还没有官网发布记录，请先在「商品列表」发布。</p>;
  if (!doc) return <p className="sdw__tip">该商品还没有内容草稿，请先在「商品列表」完善。</p>;
  const dirty = JSON.stringify(doc) !== baseline;
  const localeDoc = doc.languages?.[locale];
  const mediaIds = doc.mediaIds || [];
  const patchMedia = next => setDoc({ ...doc, mediaIds: next });
  const patchDetail = next => setDoc({ ...doc, languages: { ...doc.languages, [locale]: { ...localeDoc, detailBlocks: next } } });
  const doSave = async () => {
    setBusy(true); setError('');
    try { const updated = await api.saveListing(listing.id, { channel: listing.channel, slug: listing.slug, document: doc, skus: listing.skus, revision }); setRevision(updated.revision); setBaseline(JSON.stringify(doc)); }
    catch (e) { setError(e.message || '保存失败'); } finally { setBusy(false); }
  };
  const doPublish = async () => {
    setBusy(true); setError('');
    try {
      if (dirty) { const updated = await api.saveListing(listing.id, { channel: listing.channel, slug: listing.slug, document: doc, skus: listing.skus, revision }); setRevision(updated.revision); setBaseline(JSON.stringify(doc)); await api.publishListing(listing.id, updated.revision); }
      else await api.publishListing(listing.id, revision);
      const rows = await api.productListings(productId);
      const website = (rows || []).find(row => row.channel === 'website');
      if (website) { setListing(website); setRevision(website.revision); const clone = JSON.parse(JSON.stringify(website.draft || website.published || {})); setDoc(clone); setBaseline(JSON.stringify(clone)); }
    } catch (e) { setError(e.message || '发布失败'); } finally { setBusy(false); }
  };
  const detailBlocks = localeDoc?.detailBlocks || [];
  const blockImageOptions = [...(product?.images || []).map(image => ({ id: image.id, label: `商品图 · ${image.label || image.id}` })), ...assets.map(asset => ({ id: asset.id, label: `素材库 · ${asset.label || asset.fileName || asset.id}` }))];
  const imagePreview = id => (product?.images || []).some(image => image.id === id) ? `/api/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(id)}` : api.assetUrl(id);
  return <div className="sdp">
    <SaveBar dirty={dirty} busy={busy} error={error} onSave={doSave} onPublish={doPublish} publishedVersion={listing.published ? 1 : null}/>
    <section className="sdp__module">
      <header><strong>① 商品主图</strong><span className="hint">第一张为封面</span></header>
      <div className="sdp__images">
        {(product?.images || []).map(image => {
          const order = mediaIds.indexOf(image.id);
          return <button type="button" key={image.id} className={'sdp__image' + (order >= 0 ? ' is-on' : '')} onClick={() => patchMedia(order >= 0 ? mediaIds.filter(id => id !== image.id) : [...mediaIds, image.id])}>
            <img src={`/api/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(image.id)}`} alt={image.label || ''}/>
            {order >= 0 && <i className="sdp__image-order">{order + 1}</i>}
          </button>;
        })}
        {!product?.images?.length && <p className="hint">该商品还没有图片，请先在产品研发里上传。</p>}
      </div>
      {mediaIds.length > 1 && <div className="sdp__order">
        主图顺序：{mediaIds.map((id, index) => <span key={id} className="sdp__order-chip">
          {index + 1}. {(product?.images || []).find(image => image.id === id)?.label || id.slice(0, 8)}
          <button type="button" aria-label="前移" disabled={index === 0} onClick={() => { const next = [...mediaIds]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; patchMedia(next); }}>↑</button>
          <button type="button" aria-label="后移" disabled={index === mediaIds.length - 1} onClick={() => { const next = [...mediaIds]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; patchMedia(next); }}>↓</button>
        </span>)}
      </div>}
    </section>
    <section className="sdp__module">
      <header><strong>⑤ 图文详情</strong><span className="hint">为空时回退商品描述</span></header>
      {!localeDoc && <p className="hint">该商品尚未提供 {locale} 语言内容，请先在「商品列表」补充该语言后再装修图文详情。</p>}
      {localeDoc && <>
        {detailBlocks.map((block, index) => <div className="sdp__block" key={index}>
          <span className="sdp__block-tag">{block.type === 'image' ? '图片' : '文字'}</span>
          {block.type === 'image'
            ? <span className="sdp__block-image"><img src={imagePreview(block.imageId)} alt=""/><select value={block.imageId} onChange={e => patchDetail(detailBlocks.map((row, i) => i === index ? { ...row, imageId: e.target.value } : row))}>{blockImageOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></span>
            : <textarea rows={3} maxLength={2000} value={block.text} placeholder="详情文字段落" onChange={e => patchDetail(detailBlocks.map((row, i) => i === index ? { ...row, text: e.target.value } : row))}/>}
          <span className="sdp__block-ops">
            <button type="button" className="btn small" disabled={index === 0} onClick={() => { const next = [...detailBlocks]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; patchDetail(next); }}>↑</button>
            <button type="button" className="btn small" disabled={index === detailBlocks.length - 1} onClick={() => { const next = [...detailBlocks]; [next[index + 1], next[index]] = [next[index], next[index + 1]]; patchDetail(next); }}>↓</button>
            <button type="button" className="btn small" disabled={busy} onClick={() => patchDetail(detailBlocks.filter((_, i) => i !== index))}>删除</button>
          </span>
        </div>)}
        <div className="sdp__block-add">
          <button type="button" className="btn small" disabled={detailBlocks.length >= 50} onClick={() => patchDetail([...detailBlocks, { type: 'text', text: '' }])}>＋ 文字段</button>
          <button type="button" className="btn small" disabled={detailBlocks.length >= 50 || !blockImageOptions.length} onClick={() => patchDetail([...detailBlocks, { type: 'image', imageId: blockImageOptions[0]?.id || '', alt: '' }])}>＋ 图片段</button>
        </div>
      </>}
    </section>
  </div>;
}

function GlobalModulesPanel({ row, locale, onPublished, notify }) {
  const { doc, setDoc, dirty, busy, error, save, publish } = useCmsDocument(row);
  const [assets, setAssets] = useState([]);
  useEffect(() => { api.assetsAll({ category: 'page', kind: 'image' }).then(rows => setAssets(Array.isArray(rows) ? rows : [])).catch(() => setAssets([])); }, []);
  if (!doc) return <p className="sdw__tip">{error || '正在读取公共模块配置…'}</p>;
  const modules = { ...DEFAULT_MODULES, ...(doc.modules || {}) };
  const patchModules = next => setDoc({ ...doc, modules: { ...modules, ...next } });
  const productLayout = { gallery: 'standard', specifications: 'list', reviews: 'list', ...(doc.productLayout || {}) };
  const doSave = async () => { if (await save()) notify('公共模块草稿已保存'); };
  const doPublish = async () => { if (await publish()) { notify('公共模块已发布，全部商品详情页生效'); onPublished?.(); } };
  return <div className="sdp">
    <SaveBar dirty={dirty} busy={busy} error={error} onSave={doSave} onPublish={doPublish} publishedVersion={row.publishedVersion} hint="全部商品共用，发布一次即生效"/>
    <BannerEditor title="② 营销模块" note="图片 + 链接 + 文案" value={modules.marketing} assets={assets} onChange={marketing => patchModules({ marketing })}/>
    <BannerEditor title="③ 预留位一" note="空则自动隐藏" value={modules.reserved3} assets={assets} onChange={reserved3 => patchModules({ reserved3 })}/>
    <BannerEditor title="④ 预留位二" note="空则自动隐藏" value={modules.reserved4} assets={assets} onChange={reserved4 => patchModules({ reserved4 })}/>
    <section className="sdp__module">
      <header><strong>⑤ 图文详情</strong><span className="hint">见「标准详情」</span></header>
    </section>
    <section className="sdp__module">
      <header><strong>⑥ 用户评价</strong><span className="hint">来自「评价管理」</span></header>
      <label className="sdp__check"><input type="checkbox" checked={modules.reviews.enabled} onChange={e => patchModules({ reviews: { ...modules.reviews, enabled: e.target.checked } })}/> 显示评价区</label>
      <label className="sdp__field">显示条数<input type="number" min={1} max={50} value={modules.reviews.limit} onChange={e => patchModules({ reviews: { ...modules.reviews, limit: Number(e.target.value) || 20 } })}/></label>
      <label className="sdp__field">评价样式<select value={productLayout.reviews} onChange={e => setDoc({ ...doc, productLayout: { ...productLayout, reviews: e.target.value } })}><option value="list">列表</option><option value="cards">卡片</option></select></label>
    </section>
    <CopyEditor title="⑦ 退换货政策" defaultTitle="退换货政策" value={modules.returns} onChange={returns => patchModules({ returns })}/>
    <CopyEditor title="⑧ 其他说明" defaultTitle="其他说明" value={modules.other} onChange={other => patchModules({ other })}/>
  </div>;
}

export function DetailDesignPanel({ row, locale, products, publishedMap, productId, onPublished, notify }) {
  const [tab, setTab] = useState('standard');
  return <div className="sdp__wrap">
    <div className="sdp__tabs" role="tablist" aria-label="详情页装修范围">
      <button type="button" role="tab" aria-selected={tab === 'standard'} title="按商品维护：① 主图与型号颜色、⑤ 图文详情" className={'sdp__tab' + (tab === 'standard' ? ' is-active' : '')} onClick={() => setTab('standard')}>标准详情</button>
      <button type="button" role="tab" aria-selected={tab === 'global'} title="装修一次全部商品生效：② 营销 ③④ 预留 ⑥ 评价 ⑦ 退换货 ⑧ 其他" className={'sdp__tab' + (tab === 'global' ? ' is-active' : '')} onClick={() => setTab('global')}>公共模块</button>
    </div>
    {tab === 'standard'
      ? <StandardDetailPanel locale={locale} products={products} publishedMap={publishedMap} productId={productId}/>
      : <GlobalModulesPanel row={row} locale={locale} onPublished={onPublished} notify={notify}/>}
  </div>;
}
