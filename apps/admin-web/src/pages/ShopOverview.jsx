import React, { useEffect, useState } from 'react';
import { api, adminFetch } from '../api.js';
import { indexOffers, priceState, formatAmount } from '../shop-price.js';
import { seoProductIdOf } from '../product-identity.js';

// 页面头：只保留右侧主操作区，不再展示面包屑与标题。
export function ShopPageHead({ actions }) {
  if (!actions) return null;
  return <div className="shop-pagehead"><div className="shop-pagehead__actions">{actions}</div></div>;
}

// 商品数据直接复用产品主档（api.products()）：首图、SKU 价格、状态都在同一条记录里。
export function productThumbUrl(product) {
  const image = (product.images || []).find(item => String(item.contentType || '').startsWith('image/')) || (product.images || [])[0];
  // 历史 product_media 为空时回落到统一素材库关联的主图（后端实时取自 R2）。
  return image ? `/api/products/${encodeURIComponent(product.id)}/media/${encodeURIComponent(image.id)}` : (product.coverImage?.url || '');
}

// offers 传入时按 storefront_offers 的真实公开状态计算，与前台口径一致；
// 不传则退回后端 sku.price（该口径不判断 published，仅供未加载时报数）。
export function productPriceRange(product, offers = null) {
  const price = priceState(product, offers);
  if (price.state === 'none') return '';
  const text = `${formatAmount(price.currency, price.min)}${price.max > price.min ? ` – ${formatAmount(price.currency, price.max)}` : ''}`;
  return price.state === 'unpublished' ? `${text}（未公开）` : text;
}

export default function ShopOverview({ active = true, onNavigate }) {
  const [data, setData] = useState({ products: [], assets: [], published: [], orders: [], pages: [], offers: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    const safe = (promise, fallback) => Promise.resolve(promise).catch(() => fallback);
    const orders = adminFetch('/api/storefront/orders?page=1')
      .then(r => r.ok ? r.json() : [])
      .catch(() => []);
    Promise.all([
      safe(api.products(), []),
      safe(api.assets({}), { items: [] }),
      safe(api.catalogProducts('zh'), { items: [] }),
      safe(orders, []),
      safe(api.cmsPages({}), []),
      safe(api.storefrontOffers(), []),
    ]).then(([products, assetData, published, orderRows, pages, offerRows]) => {
      if (!alive) return;
      setData({
        products: Array.isArray(products) ? products : [],
        assets: Array.isArray(assetData?.items) ? assetData.items : [],
        published: Array.isArray(published?.items) ? published.items : [],
        orders: Array.isArray(orderRows) ? orderRows : [],
        pages: Array.isArray(pages) ? pages : [],
        offers: Array.isArray(offerRows) ? indexOffers(offerRows) : null,
      });
      setLoading(false);
    }).catch(e => { if (alive) { setError(e.message); setLoading(false); } });
    return () => { alive = false; };
  }, [active]);

  const { products, assets, published, orders, pages, offers } = data;
  const enabled = products.filter(p => p.status !== '停用');
  const publishedIds = new Set(published.map(p => String(p.id || p.productId || p.model || '')));
  const liveCount = products.filter(p => publishedIds.has(String(p.id)) || publishedIds.has(String(p.model))).length;
  const pendingPublish = Math.max(products.length - liveCount, 0);

  const metrics = [
    { label: '商品总数', value: products.length, note: `在售档案 ${enabled.length} 个`, key: 'products' },
    { label: '官网已发布', value: liveCount, note: `待发布 ${pendingPublish} 个`, key: 'products' },
    { label: '图片素材', value: assets.length, note: assets.length ? '可在素材库统一管理' : '尚未上传素材', key: 'media' },
    { label: '订单申请', value: orders.length, note: orders.length ? '请及时处理' : '暂无待处理', key: 'orders' },
  ];

  const todos = [
    { label: '待发布官网内容', value: pendingPublish, section: 'products', hint: '产品主档尚未同步到官网目录' },
    { label: '商品主图待补充', value: assets.length ? 0 : products.length, section: 'media', hint: '在素材库上传后可被商品与页面引用' },
    { label: '订单申请待处理', value: orders.length, section: 'orders', hint: '报价、分配与发货在订单模块完成' },
    { label: '页面草稿', value: pages.length, section: 'pages', hint: '页面管理维护官网多语言内容' },
  ];

  const shortcuts = [
    { key: 'products', title: '商品列表', desc: '查看主档与官网发布状态' },
    { key: 'media', title: '素材库', desc: '上传产品、营销与页面素材' },
    { key: 'pages', title: '页面管理', desc: '装修官网首页与 CMS 页面' },
    { key: 'orders', title: '订单申请', desc: '处理询价、报价与发货' },
  ];

  return <div className="shop-overview">
    {error && <p className="error-text" role="alert">部分数据读取失败：{error}</p>}

    <div className="shop-metrics">
      {metrics.map(m => <button type="button" key={m.label} className="shop-metric" onClick={() => onNavigate?.(m.key)}>
        <span className="shop-metric__label">{m.label}</span>
        <strong className="shop-metric__value">{loading ? '—' : m.value}</strong>
        <span className="shop-metric__note">{m.note}</span>
      </button>)}
    </div>

    <div className="shop-columns">
      <section className="card shop-panel">
        <div className="shop-panel__head"><b>待办事项</b><span className="hint" /></div>
        {todos.map(todo => <button type="button" className="shop-todo" key={todo.label} onClick={() => onNavigate?.(todo.section)}>
          <span className="shop-todo__dot" />
          <span className="shop-todo__label">{todo.label}<span className="hint" /></span>
          <span className={'shop-todo__value' + (todo.value ? ' is-pending' : '')}>{loading ? '—' : todo.value}</span>
          <span className="shop-todo__go">›</span>
        </button>)}
      </section>
      <section className="card shop-panel">
        <div className="shop-panel__head"><b>常用入口</b><span className="hint" /></div>
        <div className="shop-shortcuts">
          {shortcuts.map(s => <button type="button" className="shop-shortcut" key={s.key} onClick={() => onNavigate?.(s.key)}>
            <b>{s.title}</b><span className="hint" /><span className="shop-shortcut__go">进入 ›</span>
          </button>)}
        </div>
      </section>
    </div>

    <section className="card shop-panel">
      <div className="shop-panel__head"><b>商品状态</b><button type="button" className="btn small" onClick={() => onNavigate?.('products')}>查看全部</button></div>
      {products.length ? <table className="table shop-table">
        <thead><tr><th>商品</th><th>车型代号</th><th>SKU 数</th><th>价格</th><th>档案状态</th><th>官网发布</th><th>操作</th></tr></thead>
        <tbody>{products.slice(0, 6).map(p => {
          const live = publishedIds.has(String(p.id)) || publishedIds.has(String(p.model));
          const thumb = productThumbUrl(p);
          return <tr key={p.id}>
            <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {thumb ? <img className="shop-thumb" src={thumb} alt={p.name} loading="lazy" /> : <span className="shop-thumb shop-thumb--empty">无图</span>}
              <span><b>{p.name}</b><span className="hint" style={{ display: 'block' }}>SEO 商品 ID: {seoProductIdOf(p) || '未设置'}</span></span>
            </div></td>
            <td className="mono">{p.model || '—'}</td>
            <td>{p.skuCount ?? (p.skus || []).length}</td>
            <td className="mono">{productPriceRange(p, offers) || '—'}</td>
            <td><span className={'shop-status' + (p.status === '启用' ? ' is-on' : '')}>{p.status || '—'}</span></td>
            <td><span className={'shop-status' + (live ? ' is-on' : '')}>{live ? '已发布' : '未发布'}</span></td>
            <td><button type="button" className="btn small" onClick={() => onNavigate?.('products')}>查看商品</button></td>
          </tr>;
        })}</tbody>
      </table> : <div className="shop-empty">{loading ? '正在加载商品…' : '暂无商品主档，请先在「产品」模块建档。'}</div>}
    </section>
  </div>;
}
