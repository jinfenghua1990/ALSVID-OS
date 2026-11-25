import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { productThumbUrl } from './ShopOverview.jsx';
import PublicationDialog from './PublicationDialog.jsx';
import ProductPriceDialog from './ProductPriceDialog.jsx';
import { indexOffers, priceState, formatAmount } from '../shop-price.js';
import { seoProductIdOf } from '../product-identity.js';

const PAGE_SIZE = 20;

/* ---------- 工具 ---------- */
function skuCode(product) {
  const skus = (product.skus || []).filter(sku => !sku.disabled);
  const first = skus[0] || (product.skus || [])[0];
  return first ? String(first.sku || '') : '';
}

function colorCount(product) {
  const names = new Set();
  for (const sku of product.skus || []) {
    const name = sku.colorName || sku.color;
    if (name) names.add(name);
  }
  return names.size;
}

function createdLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/* 价格：改用 storefront_offers 的真实公开状态推导，避免「后台已定价、前台没价」 */
const money = (currency, value) => formatAmount(currency, value);

/* 商品体检：只用真实可判定的条件推导，不编造 */
function healthOf(product, price) {
  const issues = [];
  if (!productThumbUrl(product)) issues.push('缺主图');
  if (price.state === 'none') issues.push('缺价格');
  else if (price.state === 'unpublished') issues.push('价格未公开');
  if (!(product.skus || []).length) issues.push('缺 SKU');
  if (!product.model && !product.officialModelName) issues.push('缺型号');

  if (!issues.length) return { level: 'ok', label: '健康', detail: '资料完整' };
  return {
    level: issues.length >= 2 ? 'bad' : 'warn',
    label: issues.length >= 2 ? '异常' : '待完善',
    detail: issues.join('、'),
  };
}

export default function ShopProductList({
  products = [], publishedIds, user, onOpenProduct, onOpenListing, onGotoMedia, onRefresh,
}) {
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('default');
  const [order, setOrder] = useState('asc');
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [publishTarget, setPublishTarget] = useState(null);
  const [priceTarget, setPriceTarget] = useState(null);
  const [offers, setOffers] = useState(null);
  const canWrite = user?.role === 'admin';

  // 报价决定「是否真的在官网可见」，所以列表必须自己读一份 storefront_offers，
  // 不能只依赖后端 sku.price（它不判断 published）。读取失败时保持 null，退回兜底口径。
  const reloadOffers = useCallback(() => {
    if (!canWrite) return Promise.resolve();
    return api.storefrontOffers()
      .then(rows => setOffers(indexOffers(rows)))
      .catch(() => setOffers(null));
  }, [canWrite]);

  useEffect(() => { reloadOffers(); }, [reloadOffers]);

  const enriched = useMemo(() => products.map(product => {
    const price = priceState(product, offers);
    return {
      ...product,
      _thumb: productThumbUrl(product),
      _live: publishedIds.has(String(product.id)) || Boolean(product.catalogPublished) || Boolean(product.storefrontPublished),
      _publishedSlug: publishedIds.get(String(product.id)),
      _seoId: seoProductIdOf(product),
      _sku: skuCode(product),
      _colors: colorCount(product),
      _price: price,
      _health: healthOf(product, price),
    };
  }), [products, publishedIds, offers]);

  const bucket = product => {
    if (tab === 'deleted') return Boolean(product.deletedAt);
    if (product.deletedAt) return false;
    if (tab === 'on') return product.status === '启用' && product._live;
    if (tab === 'draft') return product.status === '启用' && !product._live;
    if (tab === 'off') return product.status === '停用';
    if (tab === 'nophoto') return !product._thumb;
    if (tab === 'noprice') return product._price.state === 'none';
    if (tab === 'unpublished') return product._price.state === 'unpublished';
    return true;
  };

  const counts = useMemo(() => ({
    all: enriched.filter(p => !p.deletedAt).length,
    deleted: enriched.filter(p => p.deletedAt).length,
    on: enriched.filter(p => p.status === '启用' && p._live).length,
    draft: enriched.filter(p => p.status === '启用' && !p._live).length,
    off: enriched.filter(p => p.status === '停用').length,
    nophoto: enriched.filter(p => !p._thumb).length,
    noprice: enriched.filter(p => p._price.state === 'none').length,
    unpublished: enriched.filter(p => p._price.state === 'unpublished').length,
  }), [enriched]);

  const categories = useMemo(() => [...new Set(enriched.map(p => p.productType).filter(Boolean))].sort(), [enriched]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const rows = enriched.filter(product => {
      if (!bucket(product)) return false;
      if (category && product.productType !== category) return false;
      if (!keyword) return true;
      return [product.name, product.model, product.officialModelName, product._sku, product.productType, product._seoId]
        .some(v => String(v || '').toLowerCase().includes(keyword));
    });
    const minOf = p => (p._price.min == null ? Number.POSITIVE_INFINITY : p._price.min);
    const compare = {
      name: (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh'),
      price: (a, b) => minOf(a) - minOf(b),
      created: (a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0),
      model: (a, b) => String(a.model || '').localeCompare(String(b.model || '')),
    }[sort];
    if (compare) rows.sort((a, b) => (order === 'asc' ? compare(a, b) : -compare(a, b)));
    return rows;
  }, [enriched, tab, query, category, sort, order]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages);
  const pageRows = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  useEffect(() => { setPicked(new Set()); }, [tab, query, category]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const pageAllPicked = pageRows.length > 0 && pageRows.every(row => picked.has(row.id));
  const togglePageAll = () => {
    const next = new Set(picked);
    if (pageAllPicked) pageRows.forEach(row => next.delete(row.id));
    else pageRows.forEach(row => next.add(row.id));
    setPicked(next);
  };
  const toggleOne = id => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  };

  const setStatus = async (ids, status) => {
    if (!ids.length) return;
    setBusy(true); setNote('');
    try {
      for (const id of ids) await api.setProductStatus(id, status);
      setNote(`已将 ${ids.length} 个商品设为「${status}」。`);
      setPicked(new Set());
      await onRefresh?.();
    } catch (error) { setNote(error.message); }
    finally { setBusy(false); }
  };

  const deleteProduct = async product => {
    if (product.status !== '停用') return;
    if (!window.confirm(`永久删除已下架商品「${product.name}」？有关联业务单据或库存记录时系统会阻止删除并列出关联记录，此操作不可恢复。`)) return;
    setBusy(true); setNote('');
    try {
      await api.deleteProduct(product.id);
      setPicked(current => { const next = new Set(current); next.delete(product.id); return next; });
      setNote(`已永久删除「${product.name}」。`);
      await onRefresh?.();
    } catch (error) {
      if (error.code === 'ENTITY_REFERENCED') {
        const details = (error.references || []).map(ref => `• ${ref.type}：${ref.documentNo}${ref.detail ? `（${ref.detail}）` : ''}`).join('\n');
        setNote(`${error.message}${details ? `\n关联记录：\n${details}` : ''}`);
      } else setNote(`删除失败：${error.message}`);
    } finally { setBusy(false); }
  };

  const deleteSelected = async () => {
    const targets = enriched.filter(product => picked.has(product.id) && product.status === '停用' && !product.deletedAt);
    if (!targets.length) return;
    if (!window.confirm(`永久删除选中的 ${targets.length} 个已下架商品？存在业务关联的商品会被阻止删除并列出关联记录，此操作不可恢复。`)) return;
    setBusy(true); setNote('');
    for (const product of targets) {
      try {
        await api.deleteProduct(product.id);
        setPicked(current => { const next = new Set(current); next.delete(product.id); return next; });
      } catch (error) {
        const details = (error.references || []).map(ref => `• ${ref.type}：${ref.documentNo}${ref.detail ? `（${ref.detail}）` : ''}`).join('\n');
        setNote(error.code === 'ENTITY_REFERENCED' ? `${error.message}${details ? `\n关联记录：\n${details}` : ''}` : `删除失败「${product.name}」：${error.message}`);
      }
    }
    try { await onRefresh?.(); } finally { setBusy(false); }
  };

  const restoreProduct = async product => {
    setBusy(true); setNote('');
    try { await api.restoreProduct(product.id); setNote(`已恢复「${product.name}」，仍保持下架状态。`); await onRefresh?.(); }
    catch (error) { setNote(`恢复失败：${error.message}`); }
    finally { setBusy(false); }
  };

  const reset = () => { setQuery(''); setCategory(''); setSort('default'); setOrder('asc'); setPage(1); setNote(''); };

  const sortHead = (key, label) => (
    <th className="shop-grid__sort" onClick={() => { if (sort === key) setOrder(order === 'asc' ? 'desc' : 'asc'); else { setSort(key); setOrder('asc'); } }}>
      {label}<span className={'shop-grid__caret' + (sort === key ? ' is-active' : '')}>{sort === key && order === 'desc' ? '▾' : '▴'}</span>
    </th>
  );

  const tips = [];
  if (counts.noprice) tips.push(
    <span key="price">
      有 <b>{counts.noprice}</b> 个商品还没有价格，列表和官网都不会显示金额。
      <button type="button" className="shop-tips__link" onClick={() => setTab('noprice')}>查看未定价 →</button>
    </span>,
  );
  if (counts.unpublished) tips.push(
    <span key="unpublished">
      有 <b>{counts.unpublished}</b> 个商品填了价格但没勾「官网公开」，官网列表和商品详情页都不会显示金额。
      <button type="button" className="shop-tips__link" onClick={() => setTab('unpublished')}>查看未公开 →</button>
    </span>,
  );
  if (counts.nophoto) tips.push(
    <span key="photo">
      有 <b>{counts.nophoto}</b> 个商品还没有主图，买家看到的列表将是空白图。
      <button type="button" className="shop-tips__link" onClick={onGotoMedia}>去素材库上传 →</button>
    </span>,
  );
  if (counts.draft) tips.push(
    <span key="draft">
      有 <b>{counts.draft}</b> 个商品已建档但尚未发布到官网。
      <button type="button" className="shop-tips__link" onClick={() => setTab('draft')}>查看未发布 →</button>
    </span>,
  );

  return <>
    <section className="card shop-grid">
      <div className="shop-grid__tabs">
        {[['all', '全部商品'], ['on', '出售中'], ['draft', '未发布'], ['off', '已下架'], ['deleted', '已删除'], ['nophoto', '缺主图'], ['noprice', '未定价'], ['unpublished', '价格未公开']].map(([key, label]) => (
          <button type="button" key={key} className={'shop-grid__tab' + (tab === key ? ' is-active' : '')} onClick={() => { setTab(key); setPage(1); }}>
            {label}<em>{(counts[key] ?? 0).toLocaleString()}</em>
          </button>
        ))}
        <div className="shop-grid__tabs-right">
          <input type="search" className="shop-grid__search" placeholder="搜索商品名称 / 车型代号 / SKU" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} aria-label="搜索商品" />
          <button type="button" className="btn small" onClick={reset}>重置</button>
        </div>
      </div>

      <div className="shop-grid__bar">
        {tab !== 'deleted' && <><button type="button" className="btn small" disabled={!canWrite || !picked.size} onClick={() => setStatus([...picked], '启用')}>批量上架</button>
        <button type="button" className="btn small" disabled={!canWrite || !picked.size} onClick={() => setStatus([...picked], '停用')}>批量下架</button></>}
        {tab === 'off' && <button type="button" className="btn small" disabled={!canWrite || busy || !picked.size} onClick={deleteSelected}>删除已选下架商品</button>}
        {tab === 'deleted' && picked.size > 0 && <button type="button" className="btn small" disabled={!canWrite || busy} onClick={async()=>{for(const product of enriched.filter(p=>picked.has(p.id)&&p.deletedAt))await restoreProduct(product);setPicked(new Set())}}>恢复已选商品</button>}
        <span className="shop-grid__bar-sep" />
        <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} aria-label="品类筛选">
          <option value="">全部品类</option>
          {categories.map(code => <option key={code} value={code}>{code}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)} aria-label="排序">
          <option value="default">默认排序</option>
          <option value="created">创建时间</option>
          <option value="price">价格</option>
          <option value="name">名称</option>
          <option value="model">车型代号</option>
        </select>
        <span className="shop-grid__picked">已选 {picked.size} 项</span>
        <span className="shop-grid__count">共 {filtered.length} 件商品</span>
      </div>

      {tips.length > 0 && <div className="shop-tips">{tips}</div>}
      {note && <div className="shop-tips shop-tips--note" role="status" style={{ whiteSpace: 'pre-line' }}>{note}</div>}

      {pageRows.length ? (
        <div className="shop-grid__scroll">
          <table className="shop-grid__table">
            <colgroup>
              <col style={{ width: 34 }} />
              <col style={{ width: 'auto', minWidth: 300 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 92 }} />
              <col style={{ width: 108 }} />
              <col style={{ width: 88 }} />
              <col style={{ width: 84 }} />
              <col style={{ width: 126 }} />
              <col style={{ width: 126 }} />
            </colgroup>
            <thead>
              <tr>
                <th className="shop-grid__check"><input type="checkbox" checked={pageAllPicked} onChange={togglePageAll} aria-label="全选本页" /></th>
                {sortHead('name', '商品信息')}
                {sortHead('price', '价格')}
                <th>SKU / 颜色</th>
                <th>商品体检</th>
                <th>官网发布</th>
                <th>档案状态</th>
                {sortHead('created', '创建时间')}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map(product => (
                <tr key={product.id} className={picked.has(product.id) ? 'is-picked' : undefined}>
                  <td className="shop-grid__check"><input type="checkbox" checked={picked.has(product.id)} onChange={() => toggleOne(product.id)} aria-label={`选择 ${product.name}`} /></td>
                  <td>
                    <div className="shop-grid__item">
                      {product._thumb
                        ? <img className="shop-grid__thumb" src={product._thumb} alt={product.name} loading="lazy" />
                        : <span className="shop-grid__thumb shop-grid__thumb--empty">无图</span>}
                      <div className="shop-grid__meta">
                        <b title={product.name}>{product.name}</b>
                        <span className="shop-grid__id">SEO 商品 ID: {product._seoId || '未设置'}</span>
                        <div className="shop-grid__tags">
                          <span className="shop-chip">{product.kind === 'vehicle' ? '整车' : '零配件'}</span>
                          {product.productType && <span className="shop-chip shop-chip--plain">{product.productType}</span>}
                          {product.model && <span className="shop-chip shop-chip--plain">代号 {product.model}</span>}
                          {product._sku && <span className="shop-chip shop-chip--plain">{product._sku}</span>}
                          {!product._thumb && <span className="shop-chip shop-chip--warn">缺主图</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="shop-price">
                    {product._price.state === 'none' ? (
                      <button type="button" className="shop-price__missing" onClick={() => setPriceTarget(product)} disabled={!canWrite}>
                        未定价<span>去设定 →</span>
                      </button>
                    ) : (
                      <>
                        <span className="shop-price__main">{money(product._price.currency, product._price.min)}</span>
                        {product._price.max > product._price.min && <span className="shop-price__range"> – {money(product._price.currency, product._price.max)}</span>}
                        {product._price.otherCurrencies?.length > 0 && <span className="shop-price__hint">另有 {product._price.otherCurrencies.join(' / ')} 报价</span>}
                        <span className="shop-price__hint">{product._price.pricedSkus}/{product._price.totalSkus} 个 SKU 已定价</span>
                        {product._price.state === 'unpublished' && (
                          <span className="shop-price__warn" title="报价存在但未勾选「官网公开」，前台列表、商品详情与购物车都不会显示">未公开 · 前台看不到</span>
                        )}
                        {canWrite && <button type="button" className="shop-link shop-price__edit" onClick={() => setPriceTarget(product)}>改价</button>}
                      </>
                    )}
                  </td>
                  <td>
                    {(product.skus || []).length}<span className="shop-grid__muted"> 个</span>
                    {product._colors > 0 && <><br /><span className="shop-grid__muted">{product._colors} 色</span></>}
                  </td>
                  <td>
                    <span className={'shop-health is-' + product._health.level} title={product._health.detail}>{product._health.label}</span>
                    <br /><span className="shop-grid__muted">{product._health.detail}</span>
                  </td>
                      <td><span className={'shop-status' + (product._live ? ' is-on' : '')}>{product._live ? '已发布' : '未发布'}</span></td>
                  <td><span className={'shop-status' + (product.status === '启用' ? ' is-on' : ' is-off')}>{product.status || '—'}</span></td>
                  <td className="shop-grid__time">{createdLabel(product.createdAt)}</td>
                  <td>
                    <div className="shop-grid__ops">
                      {product._live && <a className="shop-link" href="/www/zh/products" target="_blank" rel="noreferrer">查看官网商品页</a>}
                      {product.deletedAt ? <>{canWrite && <><button type="button" className="shop-link" disabled={busy} onClick={() => restoreProduct(product)}>恢复</button><button type="button" className="shop-link" disabled={busy} onClick={() => deleteProduct(product)}>彻底删除</button></>}<span className="shop-grid__muted">旧版已删除记录</span></> : <>
                        {canWrite && <button type="button" className="shop-link" onClick={() => setPublishTarget(product)}>{product._live ? '发布设置' : '发布到官网'}</button>}
                        {canWrite && onOpenListing && <button type="button" className="shop-link" onClick={() => onOpenListing(product.id)}>商品装修</button>}
                        {onOpenProduct && <button type="button" className="shop-link" onClick={() => onOpenProduct(product.id)}>产品资料</button>}
                        {canWrite && <button type="button" className="shop-link" disabled={busy} onClick={() => setStatus([product.id], product.status === '启用' ? '停用' : '启用')}>{product.status === '启用' ? '下架' : '上架'}</button>}
                        {canWrite && product.status === '停用' && <button type="button" className="shop-link" disabled={busy} onClick={() => deleteProduct(product)}>删除</button>}
                      </>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="shop-empty">没有符合当前条件的商品，试试切换标签或重置筛选。</div>
      )}

      <div className="shop-grid__foot">
        <span className="shop-grid__picked">已选 {picked.size} 项</span>
        {!!picked.size && <button type="button" className="shop-link" onClick={() => setPicked(new Set())}>清除选择</button>}
        <div className="shop-pager">
          <span>共 {filtered.length} 件</span>
          <button type="button" className="btn small" disabled={current <= 1} onClick={() => setPage(current - 1)}>上一页</button>
          <span>{current} / {totalPages}</span>
          <button type="button" className="btn small" disabled={current >= totalPages} onClick={() => setPage(current + 1)}>下一页</button>
        </div>
      </div>

      {publishTarget && <PublicationDialog
        product={publishTarget}
        onClose={() => setPublishTarget(null)}
        onChanged={() => { onRefresh?.(); }}
      />}
      {priceTarget && <ProductPriceDialog
        product={priceTarget}
        onClose={() => setPriceTarget(null)}
        onChanged={() => { onRefresh?.(); reloadOffers(); }}
      />}
    </section>
  </>;
}
