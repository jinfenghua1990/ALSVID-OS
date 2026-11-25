import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { createBlock, blockLabel, BlockRenderer, BlocksRenderer } from './cms-blocks.jsx';

const LANGUAGES = [['zh', '中文'], ['en', '英文'], ['de', '德文']];
const PAGE_TYPES = [['custom', '自定义页面'], ['product_template', '商品详情模板']];
const TYPE_LABELS = { home: '官网首页', custom: '自定义页面', product_template: '商品详情模板' };
const STATE_LABELS = { active: '启用', disabled: '已停用' };
const LANG_LABEL = { zh: '中文', en: '英文', de: '德文', '*': '多语言' };
const PRODUCT_CONTENT_BLOCKS = new Set(['twoColumn', 'video', 'specs', 'features', 'faq', 'cta']);
const DEFAULT_PRODUCT_LAYOUT = { gallery: 'standard', specifications: 'list', reviews: 'list' };
const emptyDraft = () => ({ blocks: [], seo: { title: '', description: '' }, productLayout: DEFAULT_PRODUCT_LAYOUT });

/* 时间版本制：统一 YYYY-MM-DD HH:mm:ss，不再使用 V1/V2 编号 */
function fmtTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/* 模块库分组：ready=false 表示后端尚未登记该组件，暂为占位 */
const PALETTE_GROUPS = [
  { title: '首屏模块', items: [
    { key: 'hero', label: 'KV 首屏', ready: true },
    { key: null, label: '图片轮播', ready: false },
    { key: 'video', label: '视频展示', ready: true },
  ] },
  { title: '商品模块', items: [
    { key: 'productGallery', label: '精选商品', ready: true },
    { key: null, label: '商品列表', ready: false },
    { key: null, label: '商品分类', ready: false },
  ] },
  { title: '内容模块', items: [
    { key: 'twoColumn', label: '图文介绍', ready: true },
    { key: 'specs', label: '技术参数', ready: true },
    { key: 'features', label: '卖点卡片', ready: true },
    { key: 'faq', label: '常见问题', ready: true },
    { key: null, label: '单张图片', ready: false },
  ] },
  { title: '营销模块', items: [
    { key: 'cta', label: '行动按钮', ready: true },
    { key: null, label: '活动 Banner', ready: false },
  ] },
  { title: '基础模块', items: [
    { key: null, label: '页面标题', ready: false },
    { key: null, label: '分隔区域', ready: false },
    { key: null, label: '留白区域', ready: false },
    { key: null, label: '页脚', ready: false },
  ] },
];

function TypeBadge({ type }) { return <span className="cms-badge">{TYPE_LABELS[type] || type}</span>; }

export default function CmsPageManager({ active = true, user, onDirtyChange, onBusyChange, openPageId = '', onBack, previewProductId = '' }) {
  const [rows, setRows] = useState([]), [filters, setFilters] = useState({ type: '', locale: '', q: '' });
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [mode, setMode] = useState('list'), [record, setRecord] = useState(null), [draft, setDraft] = useState(emptyDraft());
  const [name, setName] = useState(''), [path, setPath] = useState(''), [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState(''), [device, setDevice] = useState('desktop'), [preview, setPreview] = useState(false);
  const [media, setMedia] = useState([]), [videos, setVideos] = useState([]), [products, setProducts] = useState([]), [fields, setFields] = useState([]), [previewProduct, setPreviewProduct] = useState(null);
  const [versions, setVersions] = useState(null), [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', pageType: 'custom', locale: 'de', path: '' });
  const loadVersion = useRef(0);
  const canEdit = user?.role === 'admin';

  const notify = useCallback((text, isError = false) => { if (isError) { setError(text); setMessage(''); } else { setMessage(text); setError(''); } }, []);
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

  const loadRows = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try { const data = await api.cmsPages(filters); if (version === loadVersion.current) { setRows(data); setError(''); } }
    catch (e) { if (version === loadVersion.current) setError(e.message); }
    finally { if (version === loadVersion.current) setLoading(false); }
  }, [filters]);
  useEffect(() => { if (active && mode === 'list') loadRows(); }, [active, mode, loadRows]);

  const [hist, setHist] = useState({ canUndo: false, canRedo: false });
  const histRef = useRef({ stack: [], index: -1 });
  const openedRef = useRef('');
  const syncHist = () => {
    const h = histRef.current;
    setHist({ canUndo: h.index > 0, canRedo: h.index < h.stack.length - 1 });
  };

  const openEditor = async page => {
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await api.cmsPage(page.id);
      const loaded = data.draft || emptyDraft();
      const next = { blocks: loaded.blocks || [], seo: data.draftSeo || loaded.seo || { title: '', description: '' }, productLayout: { ...DEFAULT_PRODUCT_LAYOUT, ...(loaded.productLayout || {}) } };
      setRecord(data); setName(data.name || ''); setPath(data.path || '');
      setDraft(next);
      histRef.current = { stack: [next], index: 0 }; syncHist();
      setDirty(false); setSelectedId(loaded.blocks?.[0]?.id || ''); setPreview(false); setMode('editor'); setVersions(null);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  // 由页面管理点「装修」直接进入该页面的编辑工作区
  // 注意：返回列表时 openPageId 会置空，必须同时重置 openedRef，
  // 否则第二次点同一个页面会被判为「已打开」而进不去。
  useEffect(() => {
    if (!active) return;
    if (!openPageId) { openedRef.current = ''; return; }
    if (openedRef.current === openPageId) return;
    openedRef.current = openPageId;
    openEditor({ id: openPageId });
  }, [active, openPageId]);
  const loadAssets = useCallback(async () => {
    if (!active) return;
    try { setMedia(await api.assetsAll({ category: 'page', kind: 'image' })); } catch (_) {}
    try { const response = await fetch('/api/media-assets?category=page&kind=video', { cache: 'no-store' }); if (response.ok) setVideos(await response.json()); } catch (_) { setVideos([]); }
    try { setFields(await api.fields()); } catch (_) { setFields([]); }
  }, [active]);
  const loadProducts = useCallback(async locale => { if (!active || !locale) return; try { const data = await api.catalogProducts(locale, 1); setProducts(data.items || []); } catch (_) { setProducts([]); } }, [active]);
  useEffect(() => { if (mode === 'editor') { loadAssets(); loadProducts(record?.locale); } }, [mode, record?.locale, loadAssets, loadProducts]);
  useEffect(() => {
    if (!active || !previewProductId || !record?.locale) { setPreviewProduct(null); return; }
    let cancelled = false;
    fetch(`/api/catalog/products/${encodeURIComponent(previewProductId)}?lang=${encodeURIComponent(record.locale)}`).then(response => response.ok ? response.json() : null).then(data => { if (!cancelled) setPreviewProduct(data); }).catch(() => { if (!cancelled) setPreviewProduct(null); });
    return () => { cancelled = true; };
  }, [active, previewProductId, record?.locale]);
  const renderBlock = block => {
    if (block.componentKey === 'video' && block.props?.videoId) return { ...block, data: { ...block.data, videoUrl: block.data?.videoUrl || `/api/media-assets/${encodeURIComponent(block.props.videoId)}/file` } };
    if (!previewProduct) return block;
    if (block.componentKey === 'specs' && block.bindings?.productId === previewProductId) return { ...block, data: { specifications: previewProduct.specifications || [] } };
    if (block.componentKey === 'productGallery' && block.bindings?.productIds?.includes(previewProductId)) return { ...block, data: { products: [{ id: previewProduct.id, kind: previewProduct.kind, title: previewProduct.title, image: previewProduct.images?.[0] || null }] } };
    return block;
  };
  const previewBlocks = draft.blocks.map(renderBlock);

  const edit = next => {
    const h = histRef.current;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(next);
    if (h.stack.length > 60) h.stack.shift();
    h.index = h.stack.length - 1;
    syncHist();
    setDraft(next); setDirty(true); setError(''); setMessage('');
  };
  const undo = () => {
    const h = histRef.current;
    if (h.index <= 0) return;
    h.index -= 1; setDraft(h.stack[h.index]); setDirty(true); syncHist();
  };
  const redo = () => {
    const h = histRef.current;
    if (h.index >= h.stack.length - 1) return;
    h.index += 1; setDraft(h.stack[h.index]); setDirty(true); syncHist();
  };
  const patchBlock = (id, patch) => edit({ ...draft, blocks: draft.blocks.map(block => block.id === id ? { ...block, ...patch } : block) });
  const patchProps = (id, patch) => edit({ ...draft, blocks: draft.blocks.map(block => block.id === id ? { ...block, props: { ...block.props, ...patch } } : block) });
  const patchBindings = (id, patch) => edit({ ...draft, blocks: draft.blocks.map(block => block.id === id ? { ...block, bindings: { ...block.bindings, ...patch } } : block) });
  const moveBlock = (index, direction) => {
    const target = index + direction;
    if (target < 0 || target >= draft.blocks.length) return;
    const blocks = [...draft.blocks];
    [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
    edit({ ...draft, blocks });
  };
  const dropBlock = (from, to) => {
    if (from === to || from < 0 || to < 0) return;
    const blocks = [...draft.blocks];
    const [moved] = blocks.splice(from, 1);
    blocks.splice(to, 0, moved);
    edit({ ...draft, blocks });
  };
  const addBlock = key => { const block = createBlock(key); edit({ ...draft, blocks: [...draft.blocks, block] }); setSelectedId(block.id); };
  const duplicateBlock = block => { const copy = { ...structuredClone(block), id: createBlock(block.componentKey).id }; edit({ ...draft, blocks: [...draft.blocks, copy] }); setSelectedId(copy.id); };
  const removeBlock = id => { edit({ ...draft, blocks: draft.blocks.filter(block => block.id !== id) }); if (selectedId === id) setSelectedId(draft.blocks.find(block => block.id !== id)?.id || ''); };

  const save = async () => {
    setBusy(true);
    try {
      const next = await api.saveCmsDraft(record.id, { revision: record.revision, name, path, draft, seo: draft.seo });
      setRecord(next); setDirty(false); notify('页面草稿已保存，公开官网未改变。');
    } catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  };
  const publish = async () => {
    if (!window.confirm('将当前已保存的草稿发布为正式版本？旧版本会保留在历史记录中。')) return;
    setBusy(true);
    try {
      const next = await api.publishCmsPage(record.id, record.revision);
      setRecord(next); notify('已发布，公开页面已更新。');
    } catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  };
  const openVersions = async () => {
    setBusy(true);
    try { setVersions(await api.cmsVersions(record.id)); }
    catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  };
  const rollback = async version => {
    if (!window.confirm('将已发布内容回滚到该时间版本？会生成一个新的发布版本，旧版本记录不会被删除。')) return;
    setBusy(true);
    try { const next = await api.rollbackCmsPage(record.id, version, record.revision); setRecord(next); setVersions(await api.cmsVersions(record.id)); notify('已回滚到所选时间版本，并生成新的发布记录。'); }
    catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  };
  const toggleStatus = async row => {
    try { await api.setCmsPageStatus(row.id, row.status === 'active' ? 'disabled' : 'active'); loadRows(); notify(row.status === 'active' ? '页面已停用，公开访问将返回未发布。' : '页面已启用。'); }
    catch (e) { notify(e.message, true); }
  };
  const remove = async row => {
    if (!window.confirm(`删除页面「${row.name}」？已发布页面需先停用，且删除不可恢复。`)) return;
    try { await api.deleteCmsPage(row.id); loadRows(); notify('页面已删除。'); }
    catch (e) { notify(e.message, true); }
  };
  const create = async () => {
    setBusy(true);
    try {
      const created = await api.createCmsPage({ ...form, draft: emptyDraft(), seo: {} });
      setCreateOpen(false); setForm({ name: '', pageType: 'custom', locale: 'de', path: '' });
      await loadRows(); await openEditor(created); notify('页面已创建，可开始添加组件。');
    } catch (e) { notify(e.message, true); }
    finally { setBusy(false); }
  };
  const leaveEditor = () => {
    if (dirty && !window.confirm('当前草稿有未保存的修改，确定返回页面管理？')) return;
    setMode('list'); setRecord(null); setDirty(false); setPreview(false); setVersions(null);
    histRef.current = { stack: [], index: -1 }; syncHist();
    onBack?.();
  };

  if (!canEdit) return <section className="card"><h3>页面管理</h3><p className="hint" /></section>;

  if (mode === 'editor' && record) {
    const selected = draft.blocks.find(block => block.id === selectedId) || null;
    const paletteGroups = record.pageType === 'product_template'
      ? PALETTE_GROUPS.map(group => ({ ...group, items: group.items.filter(item => item.key && PRODUCT_CONTENT_BLOCKS.has(item.key)) })).filter(group => group.items.length)
      : PALETTE_GROUPS;
    const updateProductLayout = patch => edit({ ...draft, productLayout: { ...DEFAULT_PRODUCT_LAYOUT, ...(draft.productLayout || {}), ...patch } });
    const publicUrl = previewProductId ? (previewProduct?.slug ? `/www/${record.locale}/products/${encodeURIComponent(previewProduct.slug)}` : '') : `/www/${record.locale}${record.path}`;
    const deviceClass = device === 'mobile' ? ' is-mobile' : device === 'tablet' ? ' is-tablet' : '';
    return <div className="cms-editor">
      <div className="cms-editor-head">
        <button type="button" className="btn small" disabled={busy} onClick={leaveEditor}>{previewProductId ? '← 返回商品布局' : '← 返回页面管理'}</button>
        <div className="cms-editor-title">
          <strong>{name || '未命名页面'}</strong>
          <span className="hint">
            {record.pageType === 'home' ? '/' : publicUrl || (previewProductId ? '商品详情链接暂不可用' : '')} · {LANG_LABEL[record.locale] || record.locale} · {
              dirty ? '有未保存修改' : record.publishedVersion ? '与线上一致' : '尚未发布'
            }
          </span>
        </div>
        <div className="cms-device">
          {[['desktop', 'PC'], ['tablet', '平板'], ['mobile', '手机']].map(([key, label]) => (
            <button type="button" key={key} className={'cms-device__btn' + (device === key ? ' is-active' : '')} onClick={() => setDevice(key)}>{label}</button>
          ))}
        </div>
        <div className="row">
          <button type="button" className="btn small" disabled={!hist.canUndo} onClick={undo} title="撤销">↶ 撤销</button>
          <button type="button" className="btn small" disabled={!hist.canRedo} onClick={redo} title="重做">↷ 重做</button>
          <button type="button" className={'btn small' + (preview ? ' primary' : '')} onClick={() => setPreview(value => !value)}>{preview ? '返回编辑' : '预览'}</button>
          {record.publishedVersion && publicUrl ? <a className="btn small" href={publicUrl} target="_blank" rel="noreferrer">线上页 ↗</a> : null}
          <button type="button" className="btn small" disabled={busy} onClick={openVersions}>历史</button>
          <button type="button" className="btn small" disabled={!dirty || busy} onClick={save}>{busy ? '处理中…' : '保存草稿'}</button>
          <button type="button" className="btn primary small" disabled={dirty || busy || !record.draft} onClick={publish}>发布</button>
        </div>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {message && <p className="hint" role="status" />}
      <div className="cms-editor-meta">
        <label>页面名称<input value={name} maxLength={120} onChange={e => { setName(e.target.value); setDirty(true); }}/></label>
        <label>页面路径<input value={path} maxLength={160} disabled={record.pageType === 'home' || record.pageType === 'product_template' && path.startsWith('/products/')} onChange={e => { setPath(e.target.value); setDirty(true); }}/></label>
        <label className="fg-span">SEO 标题<input value={draft.seo?.title || ''} maxLength={180} onChange={e => edit({ ...draft, seo: { ...draft.seo, title: e.target.value } })}/></label>
        <label className="fg-span">SEO 描述<textarea rows={2} maxLength={500} value={draft.seo?.description || ''} onChange={e => edit({ ...draft, seo: { ...draft.seo, description: e.target.value } })}/></label>
      </div>
      {record.pageType === 'product_template' && <section className="cms-product-module-settings">
        <div><strong>固定商品模块</strong><span>图库、商品信息与购买逻辑固定展示，不能移动或删除</span></div>
        <label>图库样式<select value={draft.productLayout?.gallery || 'standard'} onChange={event => updateProductLayout({ gallery: event.target.value })}><option value="standard">Standard · 标准</option><option value="immersive">Immersive · 沉浸</option><option value="mosaic">Mosaic · 拼图</option><option value="columns">Columns · 侧栏缩略图</option></select></label>
        <div><strong>标准业务模块</strong><span>数据来自商品、评价与商城业务资料；在商品详情页固定呈现</span></div>
        <label>技术参数样式<select value={draft.productLayout?.specifications || 'list'} onChange={event => updateProductLayout({ specifications: event.target.value })}><option value="list">列表</option><option value="table">表格</option><option value="accordion">折叠</option></select></label>
        <label>用户评价样式<select value={draft.productLayout?.reviews || 'list'} onChange={event => updateProductLayout({ reviews: event.target.value })}><option value="list">列表</option><option value="cards">卡片</option></select></label>
        <p className="hint">配送与质保文案在单个商品的官网发布资料中维护；适配配件从产品研发的车型适配关系读取。</p>
      </section>}
      {preview ? <div className={'cms-preview' + deviceClass}>
        {record.pageType === 'product_template' && <div className="cms-product-fixed-preview">
          <h2>商品固定区域 · 不参与拖动</h2>
          <div className={`cms-product-fixed-preview__grid cms-product-fixed-preview__grid--${draft.productLayout?.gallery || 'standard'}`}>
            <div className="cms-product-fixed-preview__image">{previewProduct?.images?.[0]?.url ? <img src={previewProduct.images[0].url} alt=""/> : '商品图库'}</div>
            <div><strong>{previewProduct?.title || '商品名称与型号'}</strong><p>版本与颜色 · 价格与库存</p><p>数量选择 · 加入购物车</p></div>
          </div>
          <div className={`cms-product-standard-preview cms-product-standard-preview--${draft.productLayout?.specifications || 'list'}`}><h3>标准业务模块 · 技术参数</h3>{draft.productLayout?.specifications === 'accordion' ? <details><summary>查看技术参数</summary><div>{(previewProduct?.specifications||[]).map(row=><p key={row.label}>{row.label}：{row.value}</p>)}</div></details> : draft.productLayout?.specifications === 'table' ? <table><tbody>{(previewProduct?.specifications||[]).map(row=><tr key={row.label}><th>{row.label}</th><td>{row.value}</td></tr>)}</tbody></table> : <div>{(previewProduct?.specifications||[]).map(row=><p key={row.label}>{row.label}：{row.value}</p>)}</div>}</div>
          <div className={`cms-product-standard-preview cms-product-standard-preview--${draft.productLayout?.reviews || 'list'}`}><h3>标准业务模块 · 用户评价</h3><p>只展示已公开评价；评价样式：{draft.productLayout?.reviews === 'cards' ? '卡片' : '列表'}</p></div>
          {previewProduct?.delivery&&<div className="cms-product-standard-preview"><h3>标准业务模块 · 配送与交付</h3><p>{previewProduct.delivery}</p></div>}
          {previewProduct?.warranty&&<div className="cms-product-standard-preview"><h3>标准业务模块 · 质保</h3><p>{previewProduct.warranty}</p></div>}
          <div className="cms-product-standard-preview"><h3>标准业务模块 · 适配配件</h3><p>{previewProduct?.relatedAccessories?.length ? `${previewProduct.relatedAccessories.length} 个官网已发布的适配配件，来自车型适配关系` : '当前没有官网已发布的适配配件'}</p></div>
        </div>}
        <BlocksRenderer blocks={record.pageType === 'product_template' ? previewBlocks.filter(block => PRODUCT_CONTENT_BLOCKS.has(block.componentKey)) : previewBlocks} lang={record.locale}/>
      </div> : <div className="cms-editor-body">
        <aside className="cms-palette">
          <h4>模块库</h4>
          {record.pageType === 'product_template' && <p className="hint">图库、标题、SKU、价格、加购、参数、配送、质保、适配配件与评价由固定业务模块呈现；下方仅编排图文、视频、卖点与营销内容。</p>}
          {paletteGroups.map(group => <div key={group.title} className="cms-palette-group">
            <p className="cms-palette-group__title">{group.title}</p>
            {group.items.map(item => <button type="button" key={group.title + item.label}
              className={'cms-palette-item' + (item.ready ? '' : ' is-pending')}
              disabled={!item.ready}
              title={item.ready ? '' : '后端尚未登记该组件，接入后可用'}
              onClick={() => { if (item.ready) addBlock(item.key); }}>
              <strong>{item.label}</strong>
              {!item.ready && <span>待接入</span>}
            </button>)}
          </div>)}
        </aside>
        <div className={'cms-canvas' + deviceClass}>
          {!draft.blocks.length && <p className="hint" />}
          {draft.blocks.map((block, index) => <div key={block.id} draggable className={'cms-block-wrap' + (block.id === selectedId ? ' is-selected' : '') + (block.visible === false ? ' is-hidden' : '')} onClick={() => setSelectedId(block.id)} onDragStart={e => e.dataTransfer.setData('text/plain', String(index))} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); dropBlock(Number(e.dataTransfer.getData('text/plain')), index); }}>
            <div className="cms-block-bar"><span>{index + 1}. {blockLabel(block)}{block.visible === false ? '（已隐藏）' : ''}{record.pageType === 'product_template' && !PRODUCT_CONTENT_BLOCKS.has(block.componentKey) ? '（旧模块不会发布到商品详情）' : ''}</span><span className="row">
              <button type="button" className="btn small" onClick={e => { e.stopPropagation(); moveBlock(index, -1); }} disabled={index === 0}>↑</button>
              <button type="button" className="btn small" onClick={e => { e.stopPropagation(); moveBlock(index, 1); }} disabled={index === draft.blocks.length - 1}>↓</button>
              <button type="button" className="btn small" onClick={e => { e.stopPropagation(); patchBlock(block.id, { visible: block.visible === false }); }}>{block.visible === false ? '显示' : '隐藏'}</button>
              <button type="button" className="btn small" onClick={e => { e.stopPropagation(); duplicateBlock(block); }}>复制</button>
              <button type="button" className="btn small" onClick={e => { e.stopPropagation(); removeBlock(block.id); }}>删除</button>
            </span></div>
            <BlockRenderer block={renderBlock(block)} lang={record.locale}/>
          </div>)}
        </div>
        <aside className="cms-props">
          <h4>组件属性</h4>
          {!selected && <p className="hint" />}
          {selected && <BlockProps block={selected} media={media} videos={videos} products={products} fields={fields} pageType={record.pageType} locale={record.locale} onProps={patch => patchProps(selected.id, patch)} onBindings={patch => patchBindings(selected.id, patch)}/>} 
        </aside>
      </div>}
      {versions && <div className="cms-modal" role="dialog" aria-label="历史版本"><div className="cms-modal-body"><div className="row" style={{ justifyContent: 'space-between' }}><h3>历史版本</h3><button type="button" className="btn small" onClick={() => setVersions(null)}>关闭</button></div>
        <p className="hint">版本按时间标识，保留全部历史快照，不删除旧记录。</p>
        <table className="table"><thead><tr><th>时间</th><th>类型</th><th>状态</th><th>操作人</th><th>操作</th></tr></thead><tbody>{versions.map(version => <tr key={version.version}><td className="pg-time">{fmtTime(version.createdAt)}</td><td>{version.version === record.publishedVersion ? '发布' : '草稿'}</td><td>{version.version === record.publishedVersion ? <span className="pg-pub">当前线上</span> : <span className="muted">历史版本</span>}</td><td>{version.createdBy || '—'}</td><td><button type="button" className="btn small" disabled={busy || dirty || version.version === record.publishedVersion} onClick={() => rollback(version.version)}>回滚到此版本</button></td></tr>)}</tbody></table>
      </div></div>}
    </div>;
  }

  return <section className="card">
    <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}><div><h3>页面管理</h3><p className="hint" /></div><button type="button" className="btn primary" onClick={() => setCreateOpen(true)}>+ 新建页面</button></div>
    <div className="media-toolbar">
      <input type="search" value={filters.q} placeholder="搜索页面名称或路径" onChange={e => setFilters({ ...filters, q: e.target.value })}/>
      <select value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}><option value="">全部类型</option>{PAGE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <select value={filters.locale} onChange={e => setFilters({ ...filters, locale: e.target.value })}><option value="">全部语言</option>{LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <span className="hint" />
    </div>
    {error && <p className="error-text" role="alert">{error}</p>}
    {message && <p className="hint" role="status" />}
    {createOpen && <div className="card mt16"><h4>新建页面</h4><div className="form-grid">
      <label>页面名称<input value={form.name} maxLength={120} onChange={e => setForm({ ...form, name: e.target.value })}/></label>
      <label>页面类型<select value={form.pageType} onChange={e => setForm({ ...form, pageType: e.target.value })}>{PAGE_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>语言<select value={form.locale} onChange={e => setForm({ ...form, locale: e.target.value })}>{LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>页面路径<input value={form.path} maxLength={160} placeholder="/about" onChange={e => setForm({ ...form, path: e.target.value })}/></label>
      <p className="hint fg-span" />
    </div><div className="row mt16"><button type="button" className="btn primary" disabled={busy || !form.name || !form.path} onClick={create}>{busy ? '创建中…' : '创建'}</button><button type="button" className="btn" onClick={() => setCreateOpen(false)}>取消</button></div></div>}
    <table className="table mt16"><thead><tr><th>页面名称</th><th>类型</th><th>语言</th><th>官网路径</th><th>状态</th><th>草稿</th><th>已发布版本</th><th>修改时间</th><th>操作</th></tr></thead><tbody>
      {rows.map(row => <tr key={row.id}>
        <td>{row.name || '未命名页面'}</td>
        <td><TypeBadge type={row.pageType}/></td>
        <td>{row.pageType === 'home' ? '多语言' : row.locale}</td>
        <td>{row.pageType === 'home' ? '/' : `/www/${row.locale}${row.path}`}</td>
        <td>{STATE_LABELS[row.status] || row.status}</td>
        <td>{row.hasDraft ? `修订 ${row.revision}` : '—'}</td>
        <td>{row.publishedVersion ? '已发布' : '未发布'}</td>
        <td>{row.updatedAt ? new Date(row.updatedAt).toLocaleString() : '—'}</td>
        <td className="row">
          {row.pageType !== 'home' && <button type="button" className="btn small" onClick={() => openEditor(row)}>编辑</button>}
          {row.publishedVersion ? <a className="btn small" href={`/www/${row.locale}${row.path}`} target="_blank" rel="noreferrer">查看</a> : null}
          {row.pageType !== 'home' && <button type="button" className="btn small" onClick={() => toggleStatus(row)}>{row.status === 'active' ? '停用' : '启用'}</button>}
          {row.pageType !== 'home' && !row.publishedVersion && <button type="button" className="btn small" onClick={() => remove(row)}>删除</button>}
          {row.pageType === 'home' && <span className="hint" />}
        </td>
      </tr>)}
      {!rows.length && !loading && <tr><td colSpan={9} className="hint" /></tr>}
    </tbody></table>
  </section>;
}

function BlockProps({ block, media, videos, products, fields = [], pageType = 'custom', locale = 'zh', onProps, onBindings }) {
  const { props, bindings, componentKey } = block;
  if (componentKey === 'hero') return <div className="cms-fields">
    <label>眉题<input value={props.eyebrow || ''} maxLength={100} onChange={e => onProps({ eyebrow: e.target.value })}/></label>
    <label>主标题<input value={props.title || ''} maxLength={180} onChange={e => onProps({ title: e.target.value })}/></label>
    <label>介绍<textarea rows={3} maxLength={1000} value={props.intro || ''} onChange={e => onProps({ intro: e.target.value })}/></label>
    <label>按钮文字<input value={props.ctaLabel || ''} maxLength={60} onChange={e => onProps({ ctaLabel: e.target.value })}/></label>
    <label>按钮链接<input value={props.ctaHref || ''} maxLength={500} placeholder="/www/zh/products 或 https://" onChange={e => onProps({ ctaHref: e.target.value })}/></label>
  </div>;
  if (componentKey === 'twoColumn') return <div className="cms-fields">
    <label>标题<input value={props.title || ''} maxLength={180} onChange={e => onProps({ title: e.target.value })}/></label>
    <label>正文<textarea rows={5} maxLength={4000} value={props.body || ''} onChange={e => onProps({ body: e.target.value })}/></label>
    <label>图片<select value={props.imageId || ''} onChange={e => onProps({ imageId: e.target.value })}><option value="">不选择图片</option>{media.map(asset => <option key={asset.id} value={asset.id}>{asset.label || asset.fileName || asset.id}</option>)}</select></label>
    <label>图片位置<select value={props.imageSide || 'right'} onChange={e => onProps({ imageSide: e.target.value })}><option value="right">左文右图</option><option value="left">左图右文</option></select></label>
    <p className="hint" />
  </div>;
  if (componentKey === 'video') return <div className="cms-fields">
    <label>标题<input value={props.title || ''} maxLength={180} onChange={e => onProps({ title: e.target.value })}/></label>
    <label>页面视频素材<select required value={props.videoId || ''} onChange={e => onProps({ videoId: e.target.value })}><option value="">选择 MP4 / WebM 视频</option>{videos.map(asset => <option key={asset.id} value={asset.id}>{asset.label || asset.fileName || asset.id}</option>)}</select></label>
    <label>说明文字<textarea rows={3} maxLength={600} value={props.caption || ''} onChange={e => onProps({ caption: e.target.value })}/></label>
    {!videos.length && <p className="hint">请先在素材库上传并归类到“页面素材”的 MP4 或 WebM 视频。</p>}
  </div>;
  if (componentKey === 'productGallery') return <div className="cms-fields">
    <label>标题<input value={props.heading || ''} maxLength={120} onChange={e => onProps({ heading: e.target.value })}/></label>
    <div><strong>关联商品（最多 8 个）</strong>{products.map(product => <label key={product.id} className="row" style={{ justifyContent: 'flex-start', gap: 8 }}><input type="checkbox" checked={(bindings.productIds || []).some(id => id === product.productId || id === product.id)} onChange={e => onBindings({ productIds: [...(bindings.productIds || []).filter(id => id !== product.productId && id !== product.id), ...(e.target.checked ? [product.productId] : [])] })}/><span>{product.title}</span></label>)}</div>
    <p className="hint" />
  </div>;
  if (componentKey === 'specs') {
    const availableFields = fields.filter(field => field.enabled && field.shopVisible && field.level === 'product' &&
      (!Array.isArray(field.templates) || !field.templates.length || field.templates.includes('EBI')));
    const selectedCodes = Array.isArray(bindings.fieldCodes) ? bindings.fieldCodes : [];
    const allSelected = selectedCodes.length === 0;
    const fieldLabel = field => (locale === 'de' ? field.nameDe : locale === 'en' ? field.nameEn : field.nameZh) || field.nameZh || field.code;
    const toggleField = (code, checked) => {
      const next = allSelected
        ? (checked ? [] : availableFields.map(field => field.code).filter(value => value !== code))
        : (checked ? [...selectedCodes, code] : selectedCodes.filter(value => value !== code));
      onBindings({ fieldCodes: [...new Set(next)] });
    };
    return <div className="cms-fields">
      <label>模块标题<input value={props.heading || ''} maxLength={120} onChange={e => onProps({ heading: e.target.value })}/></label>
      {pageType === 'product_template'
        ? <div><strong>数据来源</strong><p className="hint">自动绑定当前商品的整车产品主档，不固定到某一辆车型。</p></div>
        : <label>绑定商品<select value={products.find(product => product.productId === bindings.productId || product.id === bindings.productId)?.productId || bindings.productId || ''} onChange={e => onBindings({ productId: e.target.value })}>
          <option value="">请选择商品</option>
          {products.map(product => <option key={product.id} value={product.productId}>{product.title}</option>)}
        </select></label>}
      <div className="cms-spec-field-picker">
        <strong>展示参数字段</strong>
        <p className="hint">{allSelected ? '当前自动显示该车型全部公开参数。' : `已选择 ${selectedCodes.length} 个字段。`}</p>
        {!allSelected && <button type="button" className="btn small" onClick={() => onBindings({ fieldCodes: [] })}>恢复全部公开参数</button>}
        <div className="cms-spec-field-list">
          {availableFields.map(field => <label key={field.code} className="row" style={{ justifyContent: 'flex-start', gap: 8 }}>
            <input type="checkbox" checked={allSelected || selectedCodes.includes(field.code)} onChange={e => toggleField(field.code, e.target.checked)}/>
            <span>{fieldLabel(field)}{field.unit ? \`（\${field.unit}）\` : ''}</span>
          </label>)}
        </div>
        {!availableFields.length && <p className="hint">没有可展示的公开整车参数。请先在整车产品字段字典中启用「商城可见」。</p>}
      </div>
      <p className="hint">{pageType === 'product_template' && !bindings.productId ? '此模块会自动读取当前商品的整车产品参数；修改整车产品参数后，所有引用页面同步显示最新值。' : '参数值只来自整车产品主档，装修模块不保存重复参数。'}</p>
    </div>;
  }
  if (componentKey === 'features') return <div className="cms-fields">
    <label>标题<input value={props.heading || ''} maxLength={120} onChange={e => onProps({ heading: e.target.value })}/></label>
    {(props.items || []).map((item, index) => <div key={index} className="cms-subitem"><input value={item.title} placeholder="卖点标题" onChange={e => { const items = [...props.items]; items[index] = { ...item, title: e.target.value }; onProps({ items }); }}/><textarea rows={2} value={item.text} placeholder="卖点说明" onChange={e => { const items = [...props.items]; items[index] = { ...item, text: e.target.value }; onProps({ items }); }}/><button type="button" className="btn small" onClick={() => onProps({ items: props.items.filter((_, i) => i !== index) })}>删除</button></div>)}
    <button type="button" className="btn small" disabled={(props.items || []).length >= 6} onClick={() => onProps({ items: [...(props.items || []), { title: '', text: '' }] })}>+ 添加卖点</button>
  </div>;
  if (componentKey === 'faq') return <div className="cms-fields">
    <label>标题<input value={props.heading || ''} maxLength={120} onChange={e => onProps({ heading: e.target.value })}/></label>
    {(props.items || []).map((item, index) => <div key={index} className="cms-subitem"><input value={item.question} placeholder="问题" onChange={e => { const items = [...props.items]; items[index] = { ...item, question: e.target.value }; onProps({ items }); }}/><textarea rows={2} value={item.answer} placeholder="回答" onChange={e => { const items = [...props.items]; items[index] = { ...item, answer: e.target.value }; onProps({ items }); }}/><button type="button" className="btn small" onClick={() => onProps({ items: props.items.filter((_, i) => i !== index) })}>删除</button></div>)}
    <button type="button" className="btn small" disabled={(props.items || []).length >= 12} onClick={() => onProps({ items: [...(props.items || []), { question: '', answer: '' }] })}>+ 添加问题</button>
  </div>;
  return <div className="cms-fields">
    <label>标题<input value={props.title || ''} maxLength={180} onChange={e => onProps({ title: e.target.value })}/></label>
    <label>说明<textarea rows={3} maxLength={600} value={props.text || ''} onChange={e => onProps({ text: e.target.value })}/></label>
    <label>按钮文字<input value={props.buttonLabel || ''} maxLength={60} onChange={e => onProps({ buttonLabel: e.target.value })}/></label>
    <label>按钮链接<input value={props.buttonHref || ''} maxLength={500} onChange={e => onProps({ buttonHref: e.target.value })}/></label>
  </div>;
}
