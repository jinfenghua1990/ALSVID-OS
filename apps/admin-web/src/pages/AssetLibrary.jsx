import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';

const CATEGORIES = [['product', '产品素材'], ['marketing', '营销素材'], ['page', '页面素材']];
const KINDS = [['', '全部类型'], ['image', '图片'], ['video', '视频'], ['other', '文档']];
const STATUSES = [['', '全部状态'], ['draft', '草稿'], ['published', '已发布'], ['archived', '已归档']];
const VISIBILITIES = [['', '全部可见性'], ['public', '对外公开'], ['internal', '仅内部']];
const USAGES = [['hero', '主图'], ['detail', '详情页'], ['technical', '技术图'], ['part', '零部件'], ['package', '包装'], ['manual', '说明书'], ['other', '其他'], ['uncategorized', '未分类']];
const USAGE_LABEL = Object.fromEntries(USAGES);
// asset_links.role 受数据库 CHECK 约束，用途落库时映射到合法 role
const USAGE_ROLE = { hero: 'hero', detail: 'detail', technical: 'drawing', part: 'gallery', package: 'package', manual: 'gallery', other: 'gallery', uncategorized: 'gallery' };
const ROLE_LABEL = { hero: '主图', gallery: '图库', detail: '详情页', package: '包装', certificate: '证书', drawing: '技术图', banner: '横幅', kv: '主视觉' };
const LINK_TARGETS = { product: '整车产品', part: '零配件', sku: 'SKU 变体', page: '页面', campaign: '营销活动' };
const LINK_CHANNELS = { product: '产品', storefront: '商城' };
const ACCEPT = 'image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,application/pdf';
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 30 * 1024 * 1024;
const PAGE_SIZE = 60;

function formatSize(value) {
  const size = Number(value) || 0;
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}
const listToText = list => (Array.isArray(list) ? list.join(', ') : '');
const textToList = text => [...new Set(String(text || '').split(/[,;，；\s]+/).map(item => item.trim()).filter(Boolean))];
const limitOf = file => (/^video\//.test(file.type) ? MAX_VIDEO : MAX_IMAGE);
const categoryLabel = value => CATEGORIES.find(([key]) => key === value)?.[1] || '未分类';
const statusLabel = value => STATUSES.find(([key]) => key === value)?.[1] || value || '—';
const visibilityLabel = value => (value === 'public' ? '对外公开' : '仅内部');
// 车型短名：从产品档案名称提取 A1 / A1 Ultra / L1 / L1 PRO 这类型号，完整名仍保留在副标题与 title 中。
const shortName = p => {
  const full = String(p?.name || '');
  const name = full.replace(/^ALSVID\s*/i, '').trim();
  const match = name.match(/^([A-Za-z0-9][A-Za-z0-9 ._-]*?)(?=\s*(?:折叠|20\s*寸|\d{2}\s*寸|E-Bike|电动自行车|碳纤维|中置|$))/i);
  const value = (match ? match[1] : name).trim();
  return (value && value.length <= 16) ? value : (p?.model || name.slice(0, 12) || p?.id || '未命名产品');
};

function Thumb({ asset }) {
  if (asset.kind === 'image') return <img src={api.assetUrl(asset.id)} alt={asset.label || asset.fileName || '素材图片'} loading="lazy" />;
  if (asset.kind === 'video') return <span className="shop-media__kind">视频 · {formatSize(asset.sizeBytes)}</span>;
  return <span className="shop-media__kind">文档 · {formatSize(asset.sizeBytes)}</span>;
}

function UsageBadges({ asset }) {
  return <div className="al-card__badges">
    <span className={'al-badge' + (asset.usage ? '' : ' al-badge--muted')}>{asset.usageLabel || '未分类'}</span>
    <span className="al-badge al-badge--muted">{statusLabel(asset.status)}</span>
    <span className="al-badge al-badge--muted">{visibilityLabel(asset.visibility)}</span>
  </div>;
}

function RefLine({ asset }) {
  const links = Number(asset.linkCount) || 0;
  const refs = Number(asset.legacyRefCount) || 0;
  const products = (asset.linkedProducts || []).map(item => shortName(item));
  return <>
    <div className="al-card__line" title={products.join('、')}>
      关联产品：<b>{products.length ? products.join('、') : (asset.shared ? '通用素材' : '待分类')}</b>
    </div>
    <div className="al-card__line">
      引用状态：<b>{links ? `关联 ${links} 处` : '未被引用'}</b>{refs ? ` · 官网/装修 ${refs} 处` : ''}
    </div>
  </>;
}

export default function AssetLibrary({ active = true, user, initialCategory = 'product' }) {
  const canEdit = user?.role === 'admin';
  const [category, setCategory] = useState(initialCategory);
  const [selection, setSelection] = useState({ type: 'all', id: '' });
  const [usage, setUsage] = useState('all');
  const [index, setIndex] = useState(null);
  const [folders, setFolders] = useState([]);
  const [filters, setFilters] = useState({ q: '', kind: '', tag: '', lang: '', market: '', status: '', visibility: '', folder: '' });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [detailId, setDetailId] = useState(''), [detail, setDetail] = useState(null), [detailError, setDetailError] = useState('');
  const [form, setForm] = useState(null), [references, setReferences] = useState(null), [conflict, setConflict] = useState(null);
  const [linkPicker, setLinkPicker] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false), [uploading, setUploading] = useState(false);
  const [skuOptions, setSkuOptions] = useState([]);
  const [uploadMeta, setUploadMeta] = useState({
    files: [], productIds: [], shared: false, usage: 'hero', sku: '',
    label: '', tags: '', langs: '', markets: '', visibility: 'public', status: 'published',
  });
  const loadVersion = useRef(0);
  const fileRef = useRef(null);
  const replaceRef = useRef(null);
  const replaceNote = useRef({ value: '' });

  const products = index?.products || [];
  const isProductView = category === 'product';
  const usageCounts = useMemo(() => {
    if (!isProductView) return {};
    if (selection.type === 'product') return products.find(item => item.id === selection.id)?.usages || {};
    if (selection.type === 'all') return index?.globalUsage || {};
    return {};
  }, [isProductView, selection, products, index]);

  const selectionLabel = useMemo(() => {
    if (!isProductView) return categoryLabel(category);
    if (selection.type === 'product') return shortName(products.find(item => item.id === selection.id) || { name: selection.id });
    if (selection.type === 'shared') return '通用素材';
    if (selection.type === 'unclassified') return '待分类';
    return '全部车型';
  }, [isProductView, category, selection, products]);

  const query = useMemo(() => {
    const q = { category, ...filters, folder: filters.folder === '__none__' ? '' : filters.folder, unfiled: filters.folder === '__none__' ? '1' : '', page, pageSize: PAGE_SIZE };
    if (isProductView) {
      if (selection.type === 'product' && selection.id) q.productId = selection.id;
      else if (selection.type === 'shared') q.scope = 'shared';
      else if (selection.type === 'unclassified') q.scope = 'unclassified';
      if (usage !== 'all') q.usage = usage;
    }
    return q;
  }, [category, filters, page, isProductView, selection, usage]);

  const load = useCallback(async () => {
    if (!active) return;
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const data = await api.assets(query);
      if (version !== loadVersion.current) return;
      setRows(Array.isArray(data.items) ? data.items : []);
      setTotal(Number(data.total) || 0);
      setError('');
    } catch (e) {
      if (version === loadVersion.current) setError(e.message);
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [active, query]);

  const loadIndex = useCallback(async () => {
    if (!active) return;
    try { setIndex(await api.assetProductIndex()); }
    catch (_) { /* 索引读取失败不阻断主列表 */ }
  }, [active]);

  const loadFolders = useCallback(async () => {
    if (!active) return;
    try {
      const data = await api.assetFolders({ category });
      setFolders(Array.isArray(data.items) ? data.items : []);
    } catch (_) { /* 目录读取失败不影响主列表 */ }
  }, [active, category]);

  useEffect(() => {
    if (!active) return undefined;
    const timer = setTimeout(load, filters.q ? 250 : 0);
    return () => { clearTimeout(timer); loadVersion.current++; };
  }, [active, load, filters.q]);

  useEffect(() => { loadIndex(); }, [loadIndex]);
  useEffect(() => { loadFolders(); }, [loadFolders]);

  const refreshAll = async () => { await Promise.all([load(), loadIndex(), loadFolders()]); };

  const switchCategory = key => {
    setCategory(key); setPage(1); setUsage('all');
    setSelection({ type: 'all', id: '' });
    setFilters(current => ({ ...current, folder: '', q: '' }));
  };
  // 不清空 rows：切换车型时保留上一批卡片直到新数据到达，避免整片空白闪烁。
  const selectNode = node => { setSelection(node); setPage(1); setUsage('all'); };
  const switchUsage = key => { setUsage(key); setPage(1); };

  // 上传弹窗：预填当前选中车型；产品列表直接来自「产品研发」档案。
  const openUpload = files => {
    setUploadMeta(current => ({
      ...current,
      files: files || [],
      productIds: isProductView && selection.type === 'product' && selection.id ? [selection.id] : [],
      shared: isProductView && selection.type === 'shared',
      sku: '',
    }));
    setUploadOpen(true);
  };

  useEffect(() => {
    if (!uploadOpen) return undefined;
    let cancelled = false;
    (async () => {
      const ids = uploadMeta.productIds;
      if (!ids.length) { setSkuOptions([]); return; }
      const results = await Promise.all(ids.map(id => api.product(id).catch(() => null)));
      if (cancelled) return;
      const options = [];
      results.forEach((product, i) => {
        const name = shortName(products.find(item => item.id === ids[i]) || { name: ids[i] });
        for (const sku of (product?.skus || [])) options.push({ code: sku.sku, label: `${name} · ${sku.sku}` });
      });
      setSkuOptions(options);
    })();
    return () => { cancelled = true; };
  }, [uploadOpen, uploadMeta.productIds, products]);

  const onPickUploadFiles = event => {
    const files = Array.from(event.currentTarget.files || []);
    event.currentTarget.value = '';
    setUploadMeta(current => ({ ...current, files }));
  };

  const doUpload = async () => {
    const files = uploadMeta.files;
    if (!files.length) { setError('请先选择要上传的文件'); return; }
    if (!uploadMeta.productIds.length && !uploadMeta.shared && !uploadMeta.sku) {
      setError('请选择关联产品，或勾选「通用素材」'); return;
    }
    setUploading(true); setError(''); setMessage('');
    let saved = 0, reused = 0, linked = 0;
    const failures = [];
    for (const file of files) {
      if (file.size > limitOf(file)) { failures.push(`${file.name}：超过大小限制`); continue; }
      try {
        const result = await api.uploadAsset(file, {
          category,
          usage: uploadMeta.usage,
          shared: uploadMeta.shared,
          label: uploadMeta.label.trim(),
          tags: textToList(uploadMeta.tags),
          langs: textToList(uploadMeta.langs),
          markets: textToList(uploadMeta.markets),
          visibility: uploadMeta.visibility,
          status: uploadMeta.status,
        });
        if (result.reused) reused++; else saved++;
        const assetId = result.id;
        for (const productId of uploadMeta.productIds) {
          try {
            await api.addAssetLink(assetId, { targetType: 'product', targetId: productId, role: USAGE_ROLE[uploadMeta.usage] || 'gallery', channel: 'product', sortOrder: 0 });
            linked++;
          } catch (e) { if (e.status !== 409) failures.push(`${file.name} 关联产品失败：${e.message}`); }
        }
        if (uploadMeta.sku) {
          try {
            await api.addAssetLink(assetId, { targetType: 'sku', targetId: uploadMeta.sku, role: 'hero', channel: 'product' });
            linked++;
          } catch (e) { if (e.status !== 409) failures.push(`${file.name} 关联 SKU 失败：${e.message}`); }
        }
      } catch (e) { failures.push(`${file.name}：${e.message}`); }
    }
    setMessage(`上传完成：新增 ${saved} 个${reused ? `，复用 ${reused} 个已有素材（同一文件不重复存储）` : ''}，建立关联 ${linked} 条${failures.length ? `；失败 ${failures.length} 项` : ''}。`);
    if (failures.length) setError(failures.join('；'));
    setUploadOpen(false);
    setUploadMeta(current => ({ ...current, files: [] }));
    await refreshAll();
    setUploading(false);
  };

  const onDrop = event => {
    event.preventDefault(); setDragOver(false);
    if (canEdit) openUpload(Array.from(event.dataTransfer.files || []));
  };

  const openDetail = async id => {
    setDetailId(id); setDetail(null); setDetailError(''); setReferences(null); setConflict(null); setLinkPicker('');
    try {
      const data = await api.asset(id);
      setDetail(data);
      setForm({
        label: data.label || '',
        folder: data.folder || '',
        tags: listToText(data.tags),
        langs: listToText(data.langs),
        markets: listToText(data.markets),
        visibility: data.visibility || 'internal',
        status: data.status || 'draft',
        category: data.category || 'product',
        usage: data.usage || '',
        shared: Boolean(data.shared),
      });
    } catch (e) { setDetailError(e.message); }
  };

  const closeDetail = () => { setDetailId(''); setDetail(null); setForm(null); setReferences(null); setDetailError(''); setConflict(null); };

  const saveMeta = async () => {
    if (!detail || !form) return;
    setDetailError('');
    try {
      const body = {
        label: form.label,
        tags: textToList(form.tags),
        langs: textToList(form.langs),
        markets: textToList(form.markets),
        visibility: form.visibility,
        status: form.status,
        category: form.category,
        usage: form.usage,
        shared: form.shared,
      };
      if (!form.usage && !form.shared) body.folder = '';
      const updated = await api.updateAsset(detail.id, body);
      setDetail(current => ({ ...current, ...updated }));
      setMessage('素材信息已保存。');
      await refreshAll();
    } catch (e) { setDetailError(e.message); }
  };

  const replaceFile = async event => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || !detail) return;
    if (file.size > limitOf(file)) { setDetailError('文件超过当前类型的大小限制。'); return; }
    setDetailError(''); setConflict(null);
    try {
      await api.replaceAsset(detail.id, file, { note: replaceNote.current.value.trim() });
      replaceNote.current.value = '';
      setMessage('已上传新版本，旧版本继续保留。');
      await openDetail(detail.id);
      await refreshAll();
    } catch (e) {
      setDetailError(e.message);
      if (e.status === 409 && e.existingAssetId) setConflict({ id: e.existingAssetId, label: e.existingLabel || '' });
    }
  };

  const remove = async () => {
    if (!detail) return;
    if (!window.confirm(`确定删除素材「${detail.label || detail.fileName || detail.id}」？正在被引用的素材不能删除。`)) return;
    setReferences(null); setDetailError('');
    try {
      await api.deleteAsset(detail.id);
      setMessage('素材已删除。');
      closeDetail();
      await refreshAll();
    } catch (e) {
      setDetailError(e.message);
      if (e.references) setReferences(e.references);
    }
  };

  const unlink = async linkId => {
    if (!window.confirm('解除该引用？页面或商品中将不再显示这张素材。')) return;
    try {
      await api.removeAssetLink(linkId);
      setMessage('引用已解除。');
      await openDetail(detail.id);
      await refreshAll();
    } catch (e) { setDetailError(e.message); }
  };

  const addProductLink = async () => {
    if (!detail || !linkPicker) return;
    setDetailError('');
    try {
      await api.addAssetLink(detail.id, { targetType: 'product', targetId: linkPicker, role: USAGE_ROLE[form?.usage] || 'gallery', channel: 'product', sortOrder: 0 });
      setLinkPicker('');
      setMessage('已关联到所选产品。');
      await openDetail(detail.id);
      await refreshAll();
    } catch (e) { setDetailError(e.message); }
  };

  const copyLink = async asset => {
    const link = `${window.location.origin}${api.assetUrl(asset.id)}`;
    try { await navigator.clipboard.writeText(link); setMessage('素材链接已复制。'); }
    catch { setError(`复制失败，请手动复制：${link}`); }
  };

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const activeFilter = ['kind', 'tag', 'lang', 'market', 'status', 'visibility', 'folder'].some(key => filters[key]) || Boolean(filters.q);
  const productTotal = index?.categories?.product ?? 0;

  return <div className="shop-media">
    <aside className="shop-media__side">
      <div className="shop-media__title">素材库</div>
      {CATEGORIES.map(([key, label]) => <button type="button" key={key} className={'shop-media__folder' + (category === key ? ' is-active' : '')} onClick={() => switchCategory(key)}>
        <span>{label}</span><span className="shop-media__count">{key === 'product' ? productTotal : (index?.categories?.[key] ?? 0)}</span>
      </button>)}

      <div className="shop-media__sep" />

      {isProductView ? <>
        <div className="al-group-label">独立车型 · 来自产品研发</div>
        <button type="button" className={'al-vehicle' + (selection.type === 'all' ? ' is-active' : '')} onClick={() => selectNode({ type: 'all', id: '' })}>
          <span className="al-vehicle__body"><span className="al-vehicle__name">全部车型</span><span className="al-vehicle__sub">所有已关联产品的素材</span></span>
          <span className="al-count">{productTotal}</span>
        </button>
        {products.map(item => <button type="button" key={item.id} title={item.name}
          className={'al-vehicle' + (selection.type === 'product' && selection.id === item.id ? ' is-active' : '')}
          onClick={() => selectNode({ type: 'product', id: item.id })}>
          <span className="al-vehicle__body">
            <span className="al-vehicle__name">{shortName(item)}</span>
            <span className="al-vehicle__sub" title={item.name}>{item.name} · {item.status || '—'}</span>
          </span>
          <span className="al-count">{item.total}</span>
        </button>)}
        <div className="shop-media__sep" />
        <button type="button" className={'al-vehicle' + (selection.type === 'shared' ? ' is-active' : '')} onClick={() => selectNode({ type: 'shared', id: '' })}>
          <span className="al-vehicle__body"><span className="al-vehicle__name">通用素材</span><span className="al-vehicle__sub">不归属单一产品的共享文件</span></span>
          <span className="al-count">{index?.shared ?? 0}</span>
        </button>
        <button type="button" className={'al-vehicle' + (selection.type === 'unclassified' ? ' is-active' : '')} onClick={() => selectNode({ type: 'unclassified', id: '' })}>
          <span className="al-vehicle__body"><span className="al-vehicle__name">待分类</span><span className="al-vehicle__sub">尚未建立产品 ID 关联</span></span>
          <span className="al-count">{index?.unclassified ?? 0}</span>
        </button>
        <div className="shop-media__sep" />
        <p className="shop-media__tip">新增产品会自动出现在这里，无需手工建目录；归属以产品 ID 关联为准，不按文件名判断。</p>
      </> : <>
        <div className="shop-media__title" style={{ fontSize: 12 }}>目录</div>
        <button type="button" className={'shop-media__folder' + (!filters.folder ? ' is-active' : '')} onClick={() => { setPage(1); setFilters({ ...filters, folder: '' }); }}>
          <span>全部目录</span>
        </button>
        {folders.filter(item => item.folder).map(item => <button type="button" key={item.folder}
          className={'shop-media__folder' + (filters.folder === item.folder ? ' is-active' : '')}
          onClick={() => { setPage(1); setFilters({ ...filters, folder: item.folder }); }}>
          <span title={item.folder}>{item.folder.split('/').pop()}</span><span className="shop-media__count">{item.total}</span>
        </button>)}
        {folders.some(item => !item.folder) && <button type="button" className={'shop-media__folder' + (filters.folder === '__none__' ? ' is-active' : '')} onClick={() => { setPage(1); setFilters({ ...filters, folder: '__none__' }); }}>
          <span>未归档</span><span className="shop-media__count">{folders.find(item => !item.folder)?.total || 0}</span>
        </button>}
      </>}

      <div className="shop-media__sep" />
      <p className="shop-media__tip">一个文件只存一次，可关联多个产品、SKU 变体与页面；替换会保留旧版本，已发布页面不受影响。</p>
      <div className="shop-media__sep" />
      <p className="shop-media__tip">支持 JPG / PNG / WebP / AVIF / MP4 / WebM / PDF；图片与 PDF ≤10 MB，视频 ≤30 MB。</p>
    </aside>

    <div className="shop-media__main"
      onDragOver={e => { if (canEdit) { e.preventDefault(); setDragOver(true); } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
      onDrop={onDrop}>

      <div className="al-head">
        <div>
          <div className="al-head__title">{selectionLabel}</div>
          <div className="al-head__meta">{categoryLabel(category)} · {total} 个素材</div>
        </div>
        <span className="al-head__spacer" />
        {canEdit && <button type="button" className="btn small primary" onClick={() => openUpload([])}>上传素材</button>}
      </div>

      {isProductView && <div className="al-tabs">
        <button type="button" className={'al-tab' + (usage === 'all' ? ' is-active' : '')} onClick={() => switchUsage('all')}>全部<em>{Object.values(usageCounts).reduce((a, b) => a + b, 0) || (selection.type === 'shared' ? index?.shared : selection.type === 'unclassified' ? index?.unclassified : productTotal)}</em></button>
        {USAGES.map(([key, label]) => <button type="button" key={key} className={'al-tab' + (usage === key ? ' is-active' : '')} onClick={() => switchUsage(key)}>
          {label}<em>{usageCounts[key] ?? 0}</em>
        </button>)}
      </div>}

      <div className="shop-media__toolbar">
        <input type="search" value={filters.q} placeholder="搜索文件名、标签、产品" aria-label="搜索素材" onChange={e => { setPage(1); setFilters({ ...filters, q: e.target.value }); }} />
        <div className="al-kind-filter" role="group" aria-label="按媒体类型筛选">
          {KINDS.map(([value, label]) => <button type="button" key={value} className={'al-kind-filter__button' + (filters.kind === value ? ' is-active' : '')} aria-pressed={filters.kind === value} onClick={() => { setPage(1); setFilters({ ...filters, kind: value }); }}>{label}</button>)}
        </div>
        <select value={filters.status} aria-label="素材状态" onChange={e => { setPage(1); setFilters({ ...filters, status: e.target.value }); }}>{STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={filters.visibility} aria-label="可见性" onChange={e => { setPage(1); setFilters({ ...filters, visibility: e.target.value }); }}>{VISIBILITIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        {activeFilter && <button type="button" className="btn small" onClick={() => { setPage(1); setFilters({ q: '', kind: '', tag: '', lang: '', market: '', status: '', visibility: '', folder: '' }); }}>清除筛选</button>}
        <span className="hint" style={{ marginLeft: 'auto' }} />
      </div>

      {error && <p className="error-text mt8" role="alert">{error}</p>}
      {message && <p className="hint mt8" role="status" />}

      {!rows.length && !loading && <div className={'shop-media__drop' + (dragOver ? ' is-over' : '')}>
        <div className="shop-media__drop-icon">+</div>
        <b>{activeFilter || usage !== 'all' ? '没有匹配的素材' : `${selectionLabel}还没有上传内容`}</b>
        <span className="hint" />
        {canEdit && <button type="button" className="btn" onClick={() => openUpload([])}>选择文件上传</button>}
      </div>}

      {rows.length > 0 && <>
        <div className="shop-media__grid">
          {rows.map(asset => <article key={asset.id} className="shop-media__card">
            <div className="shop-media__thumb" onClick={() => openDetail(asset.id)} title="查看详情"><Thumb asset={asset} /></div>
            <div className="shop-media__info">
              <strong className="shop-media__name" title={asset.fileName}>{asset.label || asset.fileName || '未命名素材'}</strong>
              <UsageBadges asset={asset} />
              <RefLine asset={asset} />
              {asset.folder && <div className="hint" style={{ fontSize: 11 }} title={asset.folder} />}
            </div>
            <div className="shop-media__ops">
              <button type="button" className="btn small" onClick={() => openDetail(asset.id)}>详情</button>
              <button type="button" className="btn small" onClick={() => copyLink(asset)}>复制链接</button>
            </div>
          </article>)}
        </div>
        <div className="shop-media__foot">
          <span>第 {page} / {pages} 页 · 显示 {rows.length} 个</span>
          <span className="row" style={{ gap: 6 }}>
            <button type="button" className="btn small" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>上一页</button>
            <button type="button" className="btn small" disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>下一页</button>
          </span>
        </div>
      </>}
    </div>

    {uploadOpen && <div className="al-modal" onClick={() => !uploading && setUploadOpen(false)}>
      <div className="al-modal__card" onClick={e => e.stopPropagation()}>
        <div className="al-modal__head">
          <span className="al-modal__title">上传素材 · {categoryLabel(category)}</span>
          <button type="button" className="btn small" disabled={uploading} onClick={() => setUploadOpen(false)}>关闭</button>
        </div>

        <div className="field"><label>选择文件（可多选）</label>
          <input ref={fileRef} type="file" multiple accept={ACCEPT} onChange={onPickUploadFiles} />
          {uploadMeta.files.length > 0 && <div className="al-files">已选择 {uploadMeta.files.length} 个文件：{uploadMeta.files.map(f => f.name).join('、')}</div>}
        </div>

        {isProductView && <>
          <div className="al-field-label mt8">关联产品（可多选，一份素材可关联多个产品，不会重复上传）</div>
          <div className="al-products mt8">
            {products.map(item => <label key={item.id} className="al-product">
              <input type="checkbox" checked={uploadMeta.productIds.includes(item.id)} disabled={uploadMeta.shared}
                onChange={e => setUploadMeta(current => ({
                  ...current,
                  productIds: e.target.checked ? [...current.productIds, item.id] : current.productIds.filter(id => id !== item.id),
                }))} />
              <span title={item.name}>{shortName(item)}</span>
            </label>)}
            {!products.length && <span className="hint" />}
          </div>

          <label className="al-product mt8">
            <input type="checkbox" checked={uploadMeta.shared}
              onChange={e => setUploadMeta(current => ({ ...current, shared: e.target.checked, productIds: e.target.checked ? [] : current.productIds }))} />
            <span>通用素材（不归属单一产品，供多产品共享）</span>
          </label>

          {isProductView && <div className="field mt8"><label>素材用途</label>
            <select value={uploadMeta.usage} onChange={e => setUploadMeta({ ...uploadMeta, usage: e.target.value })}>
              {USAGES.filter(([key]) => key !== 'uncategorized').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>}

          {skuOptions.length > 0 && <div className="field mt8"><label>指定 SKU 变体专属（可选，留空则同产品所有 SKU 共用）</label>
            <select value={uploadMeta.sku} onChange={e => setUploadMeta({ ...uploadMeta, sku: e.target.value })}>
              <option value="">不指定变体（共用）</option>
              {skuOptions.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
            </select>
          </div>}
        </>}

        <div className="form-grid mt8" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))' }}>
          <div className="field"><label>素材名称</label><input value={uploadMeta.label} maxLength={200} placeholder="留空则使用文件名" onChange={e => setUploadMeta({ ...uploadMeta, label: e.target.value })} /></div>
          <div className="field"><label>标签（逗号分隔）</label><input value={uploadMeta.tags} onChange={e => setUploadMeta({ ...uploadMeta, tags: e.target.value })} /></div>
          <div className="field"><label>语言（逗号分隔）</label><input value={uploadMeta.langs} placeholder="de, en, fr" onChange={e => setUploadMeta({ ...uploadMeta, langs: e.target.value })} /></div>
          <div className="field"><label>市场（逗号分隔）</label><input value={uploadMeta.markets} placeholder="DE, AT, FR" onChange={e => setUploadMeta({ ...uploadMeta, markets: e.target.value })} /></div>
          <div className="field"><label>可见性</label><select value={uploadMeta.visibility} onChange={e => setUploadMeta({ ...uploadMeta, visibility: e.target.value })}><option value="public">对外公开</option><option value="internal">仅内部</option></select></div>
          <div className="field"><label>状态</label><select value={uploadMeta.status} onChange={e => setUploadMeta({ ...uploadMeta, status: e.target.value })}><option value="published">已发布</option><option value="draft">草稿</option><option value="archived">已归档</option></select></div>
        </div>

        <div className="al-modal__foot">
          <button type="button" className="btn small" disabled={uploading} onClick={() => setUploadOpen(false)}>取消</button>
          <button type="button" className="btn small primary" disabled={uploading || !uploadMeta.files.length} onClick={doUpload}>{uploading ? '上传中…' : '开始上传'}</button>
        </div>
      </div>
    </div>}

    {detailId && <div className="shop-media__preview" onClick={closeDetail}>
      <button type="button" className="shop-media__preview-close" aria-label="关闭详情" onClick={closeDetail}>×</button>
      <div className="card" style={{ width: '100%', maxWidth: 880, maxHeight: '88vh', overflow: 'auto', padding: 16 }} onClick={e => e.stopPropagation()}>
        {!detail && !detailError && <p className="hint" />}
        {detailError && <p className="error-text" role="alert">{detailError}</p>}
        {conflict && <div className="warn mt8">
          <p>该文件与素材库中的「{conflict.label || conflict.id}」完全相同，未创建新版本，也无需重复存储。</p>
          <button type="button" className="btn small" onClick={() => openDetail(conflict.id)}>查看已有素材</button>
        </div>}
        {detail && form && <>
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h3 style={{ margin: 0 }}>{detail.label || detail.fileName || '未命名素材'}</h3>
              <p className="hint" />
            </div>
            <span className="tag">{categoryLabel(detail.category)}</span>
          </div>

          <div style={{ background: 'var(--hover)', border: '1px solid var(--border)', borderRadius: 4, padding: 10, textAlign: 'center', marginBottom: 12 }}>
            {detail.kind === 'image' && <img src={api.assetUrl(detail.id)} alt={detail.label || detail.fileName || '素材预览'} style={{ maxWidth: '100%', maxHeight: 320, objectFit: 'contain' }} />}
            {detail.kind === 'video' && <video src={api.assetUrl(detail.id)} controls style={{ maxWidth: '100%', maxHeight: 320 }} />}
            {detail.kind !== 'image' && detail.kind !== 'video' && <p><a href={api.assetUrl(detail.id)} target="_blank" rel="noreferrer">打开预览</a></p>}
          </div>

          <div className="al-card__badges" style={{ marginBottom: 12 }}>
            <span className="al-badge">{detail.usageLabel || '未分类用途'}</span>
            <span className="al-badge al-badge--muted">关联 {detail.links?.length || 0} 处</span>
            <span className="al-badge al-badge--muted">官网/装修引用 {detail.legacyRefCount || 0} 处</span>
            {detail.shared && <span className="al-badge">通用素材</span>}
          </div>

          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
            <div className="field"><label>素材名称</label><input disabled={!canEdit} value={form.label} maxLength={200} onChange={e => setForm({ ...form, label: e.target.value })} /></div>
            <div className="field"><label>分类</label><select disabled={!canEdit} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}<option value="other">其他素材</option></select></div>
            {form.category === 'product' && <div className="field"><label>素材用途</label><select disabled={!canEdit} value={form.usage} onChange={e => setForm({ ...form, usage: e.target.value })}>
              <option value="">未分类</option>
              {USAGES.filter(([key]) => key !== 'uncategorized').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></div>}
            <div className="field"><label>标签（逗号分隔）</label><input disabled={!canEdit} value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} /></div>
            <div className="field"><label>语言（逗号分隔）</label><input disabled={!canEdit} value={form.langs} onChange={e => setForm({ ...form, langs: e.target.value })} /></div>
            <div className="field"><label>市场（逗号分隔）</label><input disabled={!canEdit} value={form.markets} onChange={e => setForm({ ...form, markets: e.target.value })} /></div>
            <div className="field"><label>可见性</label><select disabled={!canEdit} value={form.visibility} onChange={e => setForm({ ...form, visibility: e.target.value })}><option value="internal">仅内部</option><option value="public">对外公开</option></select></div>
            <div className="field"><label>状态</label><select disabled={!canEdit} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">已归档</option></select></div>
          </div>
          {form.category === 'product' && <label className="al-product mt8">
            <input type="checkbox" disabled={!canEdit} checked={form.shared} onChange={e => setForm({ ...form, shared: e.target.checked })} />
            <span>标记为通用素材（不归属单一产品）</span>
          </label>}
          {canEdit && <div className="row mt8" style={{ gap: 8 }}>
            <button type="button" className="btn small primary" onClick={saveMeta}>保存素材信息</button>
            <button type="button" className="btn small" onClick={() => copyLink(detail)}>复制链接</button>
            <button type="button" className="btn small danger" onClick={remove}>删除素材</button>
          </div>}

          <h4 className="mt16">关联产品（{detail.links?.filter(link => link.targetType === 'product').length || 0}）</h4>
          {canEdit && <div className="row" style={{ gap: 8, alignItems: 'center' }}>
            <select value={linkPicker} onChange={e => setLinkPicker(e.target.value)} style={{ maxWidth: 320 }}>
              <option value="">选择要关联的产品…</option>
              {products.map(item => <option key={item.id} value={item.id}>{shortName(item)}</option>)}
            </select>
            <button type="button" className="btn small" disabled={!linkPicker} onClick={addProductLink}>添加关联</button>
          </div>}
          <p className="hint" style={{ marginTop: 6 }} />

          <h4 className="mt16">引用位置（{detail.links?.length || 0}）</h4>
          {detail.links?.length ? <table className="table">
            <thead><tr><th>渠道</th><th>对象</th><th>用途</th><th>排序</th><th></th></tr></thead>
            <tbody>{detail.links.map(link => <tr key={link.id}>
              <td>{LINK_CHANNELS[link.channel] || link.channel}</td>
              <td>{LINK_TARGETS[link.targetType] || link.targetType} · {link.targetLabel || link.targetId}</td>
              <td>{ROLE_LABEL[link.role] || link.role}</td>
              <td>{link.sortOrder}</td>
              <td>{canEdit && <button type="button" className="btn small danger" onClick={() => unlink(link.id)}>解除</button>}</td>
            </tr>)}</tbody>
          </table> : <p className="hint" />}

          {references && <div className="warn mt16">
            <b>该素材仍被引用，无法删除：</b>
            <ul style={{ margin: '6px 0 0 18px' }}>
              {references.map((item, i) => <li key={i}>{item.kind === 'link'
                ? `${LINK_CHANNELS[item.channel] || item.channel || '引用'} · ${LINK_TARGETS[item.targetType] || item.targetType} ${item.targetLabel || item.targetId}`
                : `${item.label}（${item.count} 处）`}</li>)}
            </ul>
            <p className="hint" style={{ marginTop: 6 }} />
          </div>}

          <h4 className="mt16">版本记录（{detail.versions?.length || 0}）</h4>
          <table className="table">
            <thead><tr><th>版本</th><th>文件名</th><th>大小</th><th>说明</th><th>上传人</th><th>时间</th><th></th></tr></thead>
            <tbody>{(detail.versions || []).map(version => <tr key={version.id}>
              <td>v{version.version}{version.isCurrent ? '（当前）' : ''}</td>
              <td className="mono">{version.fileName || '—'}</td>
              <td>{formatSize(version.sizeBytes)}</td>
              <td>{version.note || '—'}</td>
              <td>{version.createdBy || '—'}</td>
              <td>{version.createdAt ? new Date(version.createdAt).toLocaleString('zh-CN') : '—'}</td>
              <td><a className="btn small" href={api.assetUrl(detail.id, { version: version.version })} target="_blank" rel="noreferrer">下载</a></td>
            </tr>)}</tbody>
          </table>

          {canEdit && <details className="mt16">
            <summary>替换文件（保留旧版本）</summary>
            <div className="row mt8" style={{ gap: 8, alignItems: 'flex-end' }}>
              <div className="field" style={{ flex: 1 }}><label>替换说明</label><input ref={replaceNote} placeholder="例：更换为 2026 款灰色整车图" maxLength={200} /></div>
              <button type="button" className="btn small" onClick={() => replaceRef.current?.click()}>选择新文件</button>
              <input ref={replaceRef} type="file" hidden accept={ACCEPT} onChange={replaceFile} />
            </div>
            <p className="hint" />
          </details>}
        </>}
      </div>
    </div>}
  </div>;
}
