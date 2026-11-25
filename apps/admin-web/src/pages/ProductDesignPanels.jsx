import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { createBlock } from './cms-blocks.jsx';

// 产品装修面板：
// - CatalogLayoutPanel：「全部产品」列表页版式（分类导航 + 按销量自动展示），存 product_template 页草稿，走 CMS 发布流。
// - StandardDetailPanel：「商品详情页（图文）」按商品维护 ① 主图 + ⑤ 图文详情，走商品发布流。
// - GlobalModulesPanel：「商品详情页（公共模块）」②营销 ③④预留 ⑥评价 ⑦退换货 ⑧其他，存 product_template 页草稿，更新 1 处全部商品生效。

// 营销/预留模块默认值：三种标准样式共用一套内容 + 显示样式字段，与 server 端保持一致
const BANNER_DEFAULT = {
  enabled: false, style: 'banner', imageId: '', title: '', description: '', buttonText: '', href: '', text: '',
  theme: { background: 'none', spacing: 'normal', imageRatio: 'wide', buttonStyle: 'solid' },
};
const DEFAULT_MODULES = {
  marketing: { ...BANNER_DEFAULT },
  reserved3: { ...BANNER_DEFAULT, theme: { ...BANNER_DEFAULT.theme } },
  reserved4: { ...BANNER_DEFAULT, theme: { ...BANNER_DEFAULT.theme } },
  reviews: { enabled: true, limit: 20, style: 'list' },
  returns: { enabled: false, title: '', body: '' },
  other: { enabled: false, title: '', body: '' },
};

// 读取 product_template 页面草稿并维护本地副本 + 乐观锁 revision。
// 公共模块把它提升到工作区层调用：保存/发布/发布记录要统一放在顶部动作条，
// 状态留在面板里的话，父级拿不到 dirty，按钮就没法点亮。
export function useCmsDocument(row, enabled = true) {
  const [page, setPage] = useState(null);
  const [doc, setDoc] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    if (!row || !enabled) return undefined;
    let alive = true;
    setDoc(null); setError('');
    api.cmsPage(row.id).then(p => {
      if (!alive) return;
      const document = p.draft || p.published || { blocks: [], productLayout: {}, modules: {}, catalogLayout: null };
      const clone = JSON.parse(JSON.stringify(document));
      setPage(p); setDoc(clone); setBaseline(JSON.stringify(clone)); setRevision(p.revision);
    }).catch(e => { if (alive) setError(e.message || '读取页面草稿失败'); });
    return () => { alive = false; };
  }, [row && row.id, enabled]);
  useEffect(load, [load]);
  const dirty = Boolean(doc) && JSON.stringify(doc) !== baseline;
  const save = async () => {
    if (!row || busy || !doc) return null;
    setBusy(true); setError('');
    try {
      const seo = page?.draftSeo && (page.draftSeo.title || page.draftSeo.description) ? page.draftSeo : page?.publishedSeo || {};
      const updated = await api.saveCmsDraft(row.id, { draft: doc, seo, revision });
      setRevision(updated.revision); setPage(updated);
      const saved = updated.draft || doc;
      setDoc(current => JSON.stringify(current) === JSON.stringify(doc) ? saved : current);
      setBaseline(JSON.stringify(saved));
      return updated;
    } catch (e) { setError(e.message || '保存失败'); } finally { setBusy(false); }
    return null;
  };
  const publish = async () => {
    if (!row || busy || !doc || dirty) { if (dirty) setError('请先保存草稿，再发布'); return null; }
    setBusy(true); setError('');
    try { const updated = await api.publishCmsPage(row.id, revision); setPage(updated); setRevision(updated.revision); return updated; }
    catch (e) { setError(e.message || '发布失败'); } finally { setBusy(false); }
    return null;
  };
  return { page, doc, setDoc, dirty, busy, error, save, publish, reload: load };
}

function SaveBar({ dirty, busy, error, onSave, onPublish, publishedVersion, hint }) {
  return <div className="sdp__bar">
    <span className="sdp__status">{publishedVersion ? `线上版本 v${publishedVersion}` : '尚未发布'}{dirty ? ' · 有未保存修改' : ''}</span>
    <button type="button" className="btn small" disabled={!dirty || busy} onClick={onSave}>{busy ? '处理中…' : '保存草稿'}</button>
    <button type="button" className="btn small primary" disabled={busy || dirty} onClick={onPublish}>发布</button>
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

// 营销组件：三种标准样式（不做自由拖拽），内容 + 显示样式统一
const MARKET_STYLES = [
  ['banner', '横幅广告', '整图铺满，文案在下方'],
  ['imageText', '图片 + 文案', '左图右文，带按钮'],
  ['promoBar', '促销信息条', '细横条，文字 + 按钮'],
];
const THEME_OPTIONS = {
  background: [['none', '透明'], ['soft', '浅色底'], ['dark', '深色底']],
  spacing: [['compact', '紧凑'], ['normal', '标准'], ['loose', '宽松']],
  imageRatio: [['wide', '宽图 16:9'], ['square', '方图 1:1'], ['auto', '原图比例']],
  buttonStyle: [['solid', '实心按钮'], ['outline', '描边按钮'], ['text', '文字链接']],
};
// 多语言：营销内容按语言分别落库（每个语言一条 product_template 记录），
// 这里只负责在编辑区就地切换，省得用户来回跑去顶部工具条。
const LOCALE_TABS = [['zh', '中文'], ['de', 'Deutsch'], ['en', 'English']];

// 样式缩略：直接用当前模块的真实图片与文案渲染三种版式，
// 选之前就能看到「选完长什么样」，比灰色占位条有说服力。
function StyleThumb({ styleKey, module }) {
  const src = module.imageId ? api.assetUrl(module.imageId) : '';
  const title = module.title || module.text || '标题预览';
  const desc = module.description || '';
  const button = module.buttonText || '';
  const media = <span className="sdpv__media">{src ? <img src={src} alt=""/> : <i className="sdpv__ph" aria-hidden="true"/>}</span>;
  if (styleKey === 'promoBar') return <div className="sdpv sdpv--bar">
    <b>{title}</b>{desc && <i>{desc}</i>}{button && <em>{button}</em>}
  </div>;
  if (styleKey === 'imageText') return <div className="sdpv sdpv--split">
    {media}
    <span className="sdpv__copy"><b>{title}</b>{desc && <i>{desc}</i>}{button && <em>{button}</em>}</span>
  </div>;
  return <div className="sdpv sdpv--banner">
    {media}
    <span className="sdpv__copy"><b>{title}</b>{desc && <i>{desc}</i>}{button && <em>{button}</em>}</span>
  </div>;
}

function MarketingEditor({ title, note, value, assets, locale, onChange, onSwitchLocale }) {
  const module = { ...BANNER_DEFAULT, ...(value || {}) };
  const theme = { ...BANNER_DEFAULT.theme, ...(module.theme || {}) };
  const patch = next => onChange({ ...module, ...next });
  const patchTheme = next => patch({ theme: { ...theme, ...next } });
  return <section className="sdp__module">
    <header><strong>{title}</strong>{note && <span className="hint">{note}</span>}</header>
    <label className="sdp__check"><input type="checkbox" checked={module.enabled} onChange={e => patch({ enabled: e.target.checked })}/> 启用</label>
    {module.enabled && <>
      <div className="sdp__group">选择模块样式</div>
      <div className="sdp__styles">
        {MARKET_STYLES.map(([key, label, desc]) => <button type="button" key={key} className={'sdp__style' + (module.style === key ? ' is-active' : '')} onClick={() => patch({ style: key })}>
          <StyleThumb styleKey={key} module={module}/>
          <span className="sdp__style-label"><b>{label}</b><small>{desc}</small></span>
        </button>)}
      </div>
      <div className="sdp__group">营销内容</div>
      <AssetImageSelect assets={assets} value={module.imageId} onChange={imageId => patch({ imageId })}/>
      {module.imageId && <img className="sdp__thumb" src={api.assetUrl(module.imageId)} alt=""/>}
      <label className="sdp__field">标题<input value={module.title} maxLength={120} placeholder="如 Discover Your Freedom" onChange={e => patch({ title: e.target.value })}/></label>
      <label className="sdp__field">描述<textarea rows={2} maxLength={400} value={module.description} placeholder="一句话说明，可留空" onChange={e => patch({ description: e.target.value })}/></label>
      <label className="sdp__field">按钮文字<input value={module.buttonText} maxLength={40} placeholder="如 了解详情，留空则不显示" onChange={e => patch({ buttonText: e.target.value })}/></label>
      <label className="sdp__field">跳转链接<input value={module.href} maxLength={500} placeholder="/www/zh/products/… 或 https://…" onChange={e => patch({ href: e.target.value })}/></label>
      <div className="sdp__group">显示样式</div>
      <div className="sdp__grid2">
        <label className="sdp__field">背景<select value={theme.background} onChange={e => patchTheme({ background: e.target.value })}>{THEME_OPTIONS.background.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="sdp__field">间距<select value={theme.spacing} onChange={e => patchTheme({ spacing: e.target.value })}>{THEME_OPTIONS.spacing.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="sdp__field">图片比例<select value={theme.imageRatio} onChange={e => patchTheme({ imageRatio: e.target.value })}>{THEME_OPTIONS.imageRatio.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label className="sdp__field">按钮<select value={theme.buttonStyle} onChange={e => patchTheme({ buttonStyle: e.target.value })}>{THEME_OPTIONS.buttonStyle.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      </div>
      <div className="sdp__group">多语言</div>
      <div className="sdp__locales">
        {LOCALE_TABS.map(([code, label]) => <button type="button" key={code}
          className={'sdp__locale' + (code === locale ? ' is-active' : '')}
          onClick={() => onSwitchLocale?.(code)}>
          {label}{code === locale && <small>当前</small>}
        </button>)}
      </div>
      <p className="hint">每个语言各自保存一份营销内容，切换后编辑的就是该语言的草稿；当前为 {locale}。</p>
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

export function StandardDetailPanel({ locale, products, publishedMap, productId }) {
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
  const productImages = product?.images || [];
  // 主图与图文详情共用同一份商品素材库，但顺序各管各的：
  // mediaIds 决定主图顺序（第一张是封面），detailBlocks 里的 imageId 只决定详情段落顺序。
  const poolImages = productImages.filter(image => !mediaIds.includes(image.id));
  const imageLabel = id => {
    const found = productImages.find(image => image.id === id);
    return found?.label || '未命名图片';
  };
  const setCover = index => {
    if (index <= 0) return;
    const next = [...mediaIds];
    const [moved] = next.splice(index, 1);
    next.unshift(moved);
    patchMedia(next);
  };
  const moveMedia = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= mediaIds.length) return;
    const next = [...mediaIds];
    [next[index], next[target]] = [next[target], next[index]];
    patchMedia(next);
  };
  const blockImageOptions = [...productImages.map((image, index) => ({ id: image.id, label: `商品图 ${index + 1}${image.label ? ` · ${image.label}` : ''}` })), ...assets.map(asset => ({ id: asset.id, label: `素材库 · ${asset.label || asset.fileName || asset.id}` }))];
  const imagePreview = id => productImages.some(image => image.id === id) ? `/api/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(id)}` : api.assetUrl(id);
  return <div className="sdp">
    <SaveBar dirty={dirty} busy={busy} error={error} onSave={doSave} onPublish={doPublish} publishedVersion={listing.published ? 1 : null}/>
    <section className="sdp__module sdp__gallery">
      <header className="sdg__head">
        <div className="sdg__head-main">
          <strong>① 商品主图 / 图片图库</strong>
          <p className="hint">固定位置，第一张作为商品封面，PC 与移动端共用</p>
        </div>
        <span className="sdg__count">{mediaIds.length} 张已选</span>
      </header>

      {!mediaIds.length && <div className="sdg__empty">
        <strong>当前商品还没有选择主图</strong>
        <p>图片在「产品研发 → 素材」维护；这里只保存引用和展示顺序，不重复上传原图。</p>
      </div>}

      {mediaIds.length > 0 && <div className="sdg__grid">
        {mediaIds.map((id, index) => <article className="sdg__card" key={id}>
          <div className="sdg__thumb">
            <img src={`/api/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(id)}`} alt={imageLabel(id)} loading="lazy"/>
            {index === 0 && <span className="sdg__cover">商品封面</span>}
            <span className="sdg__no">{String(index + 1).padStart(2, '0')}</span>
          </div>
          <div className="sdg__meta" title={imageLabel(id)}>{imageLabel(id)}</div>
          <div className="sdg__ops">
            {index !== 0 && <button type="button" onClick={() => setCover(index)}>设为封面</button>}
            <button type="button" aria-label="前移" disabled={index === 0} onClick={() => moveMedia(index, -1)}>↑</button>
            <button type="button" aria-label="后移" disabled={index === mediaIds.length - 1} onClick={() => moveMedia(index, 1)}>↓</button>
            <button type="button" className="sdg__remove" onClick={() => patchMedia(mediaIds.filter(item => item !== id))}>移除</button>
          </div>
        </article>)}
      </div>}

      <div className="sdg__pool">
        <div className="sdg__pool-head">
          <strong>从商品素材库添加</strong>
          <span className="hint">{poolImages.length ? `还有 ${poolImages.length} 张未使用` : '商品图片已全部加入'}</span>
        </div>
        {poolImages.length > 0 && <div className="sdg__pool-grid">
          {poolImages.map(image => <button type="button" key={image.id} className="sdg__pool-item" onClick={() => patchMedia([...mediaIds, image.id])} title={`加入主图：${image.label || '未命名图片'}`}>
            <img src={`/api/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(image.id)}`} alt="" loading="lazy"/>
            <span aria-hidden="true">＋</span>
          </button>)}
        </div>}
        {!poolImages.length && !productImages.length && <p className="hint">该商品在产品研发里还没有图片，先去「产品研发 → 素材」上传。</p>}
      </div>

      <p className="sdg__tip">只保存素材引用与展示顺序，不会删除原始素材，也不影响 SKU 与库存。</p>
    </section>
    <section className="sdp__module">
      <header><strong>⑤ 图文详情</strong><span className="hint">按商品 · 与主图是两套配置</span></header>
      <p className="hint">主图管封面与顺序，图文详情管内容段落顺序；两者共用同一份商品素材库，互不影响。</p>
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

// 公共模块的 8 个固定模块：序号、名称、是否属于全局装修
const GLOBAL_MODULES = [
  ['productNavigation', '00', '商品专属导航栏'],
  ['info', '01', '主信息区'],
  ['marketing', '02', '营销模块'],
  ['reserved3', '03', '核心性能展示'],
  ['reserved4', '04', '预留位二'],
  ['detail', '05', '图文详情'],
  ['reviews', '06', '用户评价'],
  ['returns', '07', '退换货'],
  ['other', '08', '其他说明'],
];

// 每个模块在编辑区顶部的定位说明 + 预览侧是否有对应区块（决定点击能否真的滚过去）
const MODULE_META = {
  productNavigation: { desc:'整车详情页单行吸顶导航；PC 与手机共用', anchor:()=>false },
  info: { desc: '固定模块，由商品数据自动生成', anchor: () => true },
  marketing: { desc: '促销展现 · 标准模板 3 选 1' },
  reserved3: { desc: '全宽视觉 · 四项参数读取整车主档', anchor: m => m?.showParameters !== false || Boolean(m?.imageId || m?.videoId || m?.title || m?.text) },
  reserved4: { desc: '预留位 · 未配置内容时自动隐藏' },
  detail: { desc: '按商品维护，位置固定', anchor: () => true },
  reviews: { desc: '读取「评价管理」真实评价', anchor: (m) => m?.enabled !== false },
  returns: { desc: '全局文案，所有商品共用', anchor: (m) => Boolean(m?.enabled && (m.title || m.body)) },
  other: { desc: '全局文案，所有商品共用', anchor: (m) => Boolean(m?.enabled && (m.title || m.body)) },
};
const BANNER_KEYS = ['marketing', 'reserved3', 'reserved4'];
// 预览端（CatalogPage）只渲染「已启用且填了内容」的模块，没内容就没有锚点，
// 提前算出来，免得点了目录什么都没发生还不给提示。
function moduleAnchor(key, modules) {
  const module = modules?.[key] || {};
  if (MODULE_META[key]?.anchor) return MODULE_META[key].anchor(module);
  if (BANNER_KEYS.includes(key)) {
    return Boolean(module.enabled && (module.imageId || module.title || module.description || module.text || module.href));
  }
  return false;
}

function moduleBadge(key, modules) {
  if (key === 'info' || key === 'productNavigation') return '固定';
  if (key === 'detail') return '按商品';
  if (key === 'reserved3') return modules.reserved3?.showParameters !== false || modules.reserved3?.imageId || modules.reserved3?.videoId || modules.reserved3?.title || modules.reserved3?.text ? '已启用' : '自动隐藏';
  if (key === 'reserved4') {
    const m = modules[key] || {};
    return m.enabled && (m.imageId || m.text || m.href) ? '已配置' : '自动隐藏';
  }
  return modules[key]?.enabled ? '已启用' : '已关闭';
}

export function GlobalModulesPanel({ cms, row, locale, onEditGraphic, onSelectModule, onLocaleChange }) {
  const { doc, setDoc, dirty } = cms;
  const [assets, setAssets] = useState([]);
  const [active, setActive] = useState('marketing');
  const [fields, setFields] = useState([]);
  const [coreVideos, setCoreVideos] = useState([]);
  useEffect(() => { let alive=true; api.assetsAll({ category:'page', kind:'video' }).then(rows=>{if(alive)setCoreVideos(Array.isArray(rows)?rows:[])}).catch(()=>{}); return ()=>{alive=false}; }, []);
  const [fieldError, setFieldError] = useState('');
  useEffect(() => { let alive = true; api.fields().then(rows => { if (alive) setFields(Array.isArray(rows) ? rows : []); }).catch(e => { if (alive) setFieldError(e.message || '读取参数字典失败'); }); return () => { alive = false; }; }, []);
  useEffect(() => { api.assetsAll({ category: 'page', kind: 'image' }).then(rows => setAssets(Array.isArray(rows) ? rows : [])).catch(() => setAssets([])); }, []);
  if (!doc) return <p className="sdw__tip">{cms.error || '正在读取公共模块配置…'}</p>;
  const modules = { ...DEFAULT_MODULES, ...(doc.modules || {}) };
  const patchModules = next => setDoc({ ...doc, modules: { ...modules, ...next } });
  const productLayout = { gallery: 'standard', specifications: 'list', reviews: 'list', ...(doc.productLayout || {}) };
  const fixedSpec = (doc.blocks || []).find(block => block.componentKey === 'specs' && block.visible !== false);
  const availableFields = fields.filter(field => field.enabled && field.shopVisible && field.level === 'product' && !field.code.startsWith('_') && (!field.templates?.length || field.templates.includes('EBI')));
  const selectedCodes = fixedSpec?.bindings?.fieldCodes || [];
  const setSpecBinding = codes => {
    const block = fixedSpec || createBlock('specs');
    setDoc({ ...doc, blocks: [...(doc.blocks || []).filter(item => item.componentKey !== 'specs'), { ...block, visible: true, bindings: { ...block.bindings, productId: '', fieldSet: 'public_specs', fieldCodes: codes } }] });
  };
  const toggleSpecField = (code, checked) => {
    const current = selectedCodes.length ? selectedCodes : availableFields.map(field => field.code);
    const next = checked ? [...new Set([...current, code])] : current.filter(value => value !== code);
    if (next.length) setSpecBinding(next);
  };
  const current = GLOBAL_MODULES.find(([key]) => key === active) || GLOBAL_MODULES[1];
  const [no, name] = [current[1], current[2]];
  const meta = MODULE_META[active] || {};
  const anchor = moduleAnchor(active, modules);
  // 目录点击与「在预览中定位」共用同一套载荷：预览侧据此决定滚不滚、并给一句人话提示
  const focusModule = key => {
    const item = GLOBAL_MODULES.find(([itemKey]) => itemKey === key);
    onSelectModule?.({ key, no: item?.[1], name: item?.[2], anchor: moduleAnchor(key, modules) });
  };
  const pickModule = key => { setActive(key); focusModule(key); };
  // 切语言会换成另一条 product_template 记录，有未保存修改必须先确认，不能静默丢弃
  const switchLocale = code => {
    if (code === locale) return;
    if (dirty && !window.confirm('当前语言还有未保存的修改，切换语言会离开这份草稿，未保存内容将丢失。继续切换？')) return;
    onLocaleChange?.(code);
  };

  const editor = (() => {
    if (active === 'productNavigation') return <section className="sdp__module"><header><strong>商品专属导航栏</strong><span className="hint">固定模块 · ALSVID-P00</span></header><p>PC 与手机共用一条吸顶导航，不显示品牌 Logo 或品牌名称。营销公告开启时位于其上方。</p><div aria-label="导航结构示意（非实时预览）" style={{display:'flex',alignItems:'center',gap:12,overflowX:'auto',whiteSpace:'nowrap',background:'#111',color:'#fff',padding:'12px 14px',borderRadius:4}}><span>☰</span><strong>当前车型</strong><span>概览</span><span>技术参数</span><span>视频</span><span>下载</span><span style={{background:'#fff',color:'#111',padding:'7px 10px',borderRadius:3}}>配置车型 / 购物车</span><span>个人账户</span></div><p>汉堡菜单保留返回首页；购买入口展开后可配置当前车型或查看购物车。无内容的快捷导航显示禁用状态，避免无效链接。手机端中间导航可横向滑动，两端不删减功能。</p><p className="sdw__tip">该区为四款及后续车型共用的固定结构，模块 ID 保持不变。以上为后台结构示意；真实预览同步和样式编辑仍待完善。</p></section>;
    if (active === 'info') return <div className="sdp">
      <section className="sdp__module">
        <header><strong>主图 · 型号颜色 · 价格</strong><span className="hint">固定模块</span></header>
        <p className="sdw__tip">由商品数据自动生成，不可删除或移动；主图顺序在「商品详情页（图文）」按商品调整。</p>
        <div><button type="button" className="btn small" onClick={onEditGraphic}>去按商品装修 →</button></div>
        <label className="sdp__check"><input type="checkbox" checked={Boolean(fixedSpec)} onChange={e => e.target.checked ? setSpecBinding([]) : setDoc({ ...doc, blocks: (doc.blocks || []).map(block => block.componentKey === 'specs' ? { ...block, visible: false } : block) })}/> 技术参数读取整车主档</label>
        <label className="sdp__field">技术参数样式<select value={productLayout.specifications} onChange={e => setDoc({ ...doc, productLayout: { ...productLayout, specifications: e.target.value } })}><option value="list">列表</option><option value="table">表格</option><option value="accordion">折叠</option></select></label>
        {fixedSpec && <div className="cms-spec-field-picker">
          <p className="hint">{selectedCodes.length ? '已选择 ' + selectedCodes.length + ' 个字段' : '显示全部公开参数'} · 固定位置，不重复录入</p>
          {selectedCodes.length > 0 && <button type="button" className="btn small" onClick={() => setSpecBinding([])}>恢复全部公开参数</button>}
          {fieldError && <p className="error-text">{fieldError}</p>}
          {!availableFields.length && <p className="hint">请先在字段字典中启用需要展示的整车参数。</p>}
          <div className="cms-spec-field-list">{availableFields.map(field => <label key={field.code} className="sdp__check"><input type="checkbox" checked={!selectedCodes.length || selectedCodes.includes(field.code)} disabled={selectedCodes.length ? selectedCodes.length === 1 && selectedCodes.includes(field.code) : availableFields.length === 1} onChange={e => toggleSpecField(field.code, e.target.checked)}/>{field.nameZh || field.code}{field.unit ? '（' + field.unit + '）' : ''}</label>)}</div>
        </div>}
      </section>
    </div>;
    if (active === 'reserved3') {
      const core = {...BANNER_DEFAULT, ...modules.reserved3};
      const slots = Array.isArray(core.fieldCodes) && core.fieldCodes.length === 4 ? core.fieldCodes : ['', '', '', ''];
      const patch = next => patchModules({reserved3:{...core,...next}});
      const defaults = ['整车重量','续航里程','车架材质','折叠尺寸'];
      return <section className="sdp__module">
        <header><strong>P03 · 核心性能展示</strong><span className="hint">全宽视觉 · 四项参数</span></header>
        <label className="sdp__field">背景图片<select value={core.imageId || ''} onChange={e=>patch({imageId:e.target.value,videoId:''})}><option value="">无图片</option>{assets.map(a=><option key={a.id} value={a.id}>{a.label || a.fileName || a.id}</option>)}</select></label>
        <label className="sdp__field">背景视频<select value={core.videoId || ''} onChange={e=>patch({videoId:e.target.value})}><option value="">无视频（显示图片）</option>{coreVideos.map(a=><option key={a.id} value={a.id}>{a.label || a.fileName || a.id}</option>)}</select></label>
        <label className="sdp__field">主文案<input maxLength={120} value={core.title || ''} onChange={e=>patch({title:e.target.value})}/></label>
        <label className="sdp__field">文字位置<select value={core.alignment || 'center'} onChange={e=>patch({alignment:e.target.value})}><option value="left">左</option><option value="center">中</option><option value="right">右</option></select></label>
        <label className="sdp__check"><input type="checkbox" checked={core.showParameters !== false} onChange={e=>patch({showParameters:e.target.checked})}/> 显示四项核心参数</label>
        {core.showParameters !== false && <div>{fieldError && <p className="error-text">{fieldError}</p>}{slots.map((code,i)=><label key={i} className="sdp__field">参数 {i+1}<select value={code} onChange={e=>patch({fieldCodes:slots.map((v,j)=>j===i?e.target.value:v)})}><option value="">默认 · {defaults[i]}</option>{code && !availableFields.some(f=>f.code===code) && <option value={code}>已选字段不可用：{code}</option>}{availableFields.map(f=><option key={f.code} value={f.code} disabled={slots.some((v,j)=>j!==i&&v===f.code)}>{f.nameZh || f.code}{f.unit ? '（'+f.unit+'）':''}</option>)}</select></label>)}<p className="hint">实际数值只读取整车主档，不可手填；未录入的数值显示 —。</p></div>}
      </section>;
    }
    if (active === 'detail') return <div className="sdp">
      <section className="sdp__module">
        <header><strong>05 图文详情</strong><span className="hint">按商品</span></header>
        <p className="sdw__tip">每个商品内容不同，内部可自由组合文字段与图片段；位置固定，不随公共模块变化。</p>
        <div><button type="button" className="btn small" onClick={onEditGraphic}>去按商品装修 →</button></div>
      </section>
    </div>;
    if (active === 'reviews') return <div className="sdp">
      <section className="sdp__module">
        <header><strong>06 用户评价</strong><span className="hint">标准模板</span></header>
        <label className="sdp__check"><input type="checkbox" checked={modules.reviews.enabled} onChange={e => patchModules({ reviews: { ...modules.reviews, enabled: e.target.checked } })}/> 显示评价区</label>
        <label className="sdp__field">显示条数<input type="number" min={1} max={50} value={modules.reviews.limit} onChange={e => patchModules({ reviews: { ...modules.reviews, limit: Number(e.target.value) || 20 } })}/></label>
        <label className="sdp__field">评价样式<select value={productLayout.reviews} onChange={e => setDoc({ ...doc, productLayout: { ...productLayout, reviews: e.target.value } })}><option value="list">列表</option><option value="cards">卡片</option></select></label>
        <p className="sdw__tip">内容读取「评价管理」，公共模板不覆盖商品真实评价。</p>
      </section>
    </div>;
    if (active === 'returns') return <div className="sdp">
      <CopyEditor title="07 退换货政策" defaultTitle="退换货政策" value={modules.returns} onChange={returns => patchModules({ returns })}/>
    </div>;
    if (active === 'other') return <div className="sdp">
      <CopyEditor title="08 其他说明" defaultTitle="其他说明" value={modules.other} onChange={other => patchModules({ other })}/>
    </div>;
    return <div className="sdp">
      <MarketingEditor title={`${no} ${name}`} note={meta.desc} value={modules[active]} assets={assets} locale={locale} onSwitchLocale={switchLocale} onChange={next => patchModules({ [active]: next })}/>
    </div>;
  })();

  return <>
    <aside className="sdw__panel gmp__nav">
      <div className="sdw__side-head">
        <h3 className="sdw__side-title">模块目录</h3>
        <span className="gmp__fixed">固定顺序</span>
      </div>
      <p className="sdw__tip gmp__hint">商品导航 + 原 8 个模块位置固定，不可拖动、不可调整顺序。</p>
      <div className="gmp__list">
        {GLOBAL_MODULES.map(([key, itemNo, itemName]) => <button type="button" key={key} className={'gmp__item' + (active === key ? ' is-active' : '')} onClick={() => pickModule(key)}>
          <b>{itemNo}</b><span>{itemName}<small style={{display:'block',fontSize:10}}>ALSVID-P{itemNo}</small></span><i className={'gmp__badge' + (moduleBadge(key, modules) === '已启用' || moduleBadge(key, modules) === '已配置' ? ' is-on' : '')}>{moduleBadge(key, modules)}</i>
        </button>)}
      </div>
      <p className="sdw__tip">保存草稿 / 发布 / 发布记录统一在页面顶部动作条，此处只管选模块。</p>
    </aside>
    <section className="sdw__panel sdw__panel--editor">
      <div className="sdp__cast">
        <div className="sdp__cast-main">
          <span className="sdp__cast-no">{no}</span>
          <b>{name}</b><button type="button" className="btn small" onClick={()=>navigator.clipboard.writeText('ALSVID-P'+no).catch(()=>window.alert('复制失败，请手动复制模块编号'))}>复制 ALSVID-P{no}</button>
          {meta.desc && <small>{meta.desc}</small>}
        </div>
        <button type="button" className="btn small" onClick={() => focusModule(active)}
          title={anchor ? '在右侧官网预览里滚动到该模块并高亮' : '该模块当前未启用或没有内容，官网预览里没有对应区块'}>在预览中定位</button>
      </div>
      {editor}
    </section>
  </>;
}
