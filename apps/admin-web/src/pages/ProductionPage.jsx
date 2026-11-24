import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import ProductionOverview from '../components/ProductionOverview.jsx';
import ProductionBoard from '../components/ProductionBoard.jsx';
import ProductionOrderWorkspace from './ProductionOrderWorkspace.jsx';
import {openOrderOnDoubleClick} from '../orderInteractions.js';

const money = value => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statuses = ['待交货', '部分交货', '交货完成', '已取消'];

export default function ProductionPage({ user, active = true, onNavigate, section = 'orders' }) {
  const [orders, setOrders] = useState([]); const [products, setProducts] = useState([]); const [factories, setFactories] = useState([]);
  const [extras, setExtras] = useState(null);
  const [openOrder, setOpenOrder] = useState(undefined); const [query, setQuery] = useState(''); const [status, setStatus] = useState(''); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const sequence = useRef(0);
  const load = async () => { const id = ++sequence.current; setLoading(true); try { const [nextOrders, nextProducts, nextFactories, nextExtras] = await Promise.all([api.productionOrders(), api.products('vehicle'), api.factories(), api.productionOverviewExtras().catch(() => null)]); if (id !== sequence.current) return; setOrders(nextOrders); setProducts(nextProducts); setFactories(nextFactories.filter(x => x.status === '启用')); setExtras(nextExtras); setError(''); } catch (e) { if (id === sequence.current) setError(e.message); } finally { if (id === sequence.current) setLoading(false); } };
  useEffect(() => { if (active) load(); return () => { sequence.current++; }; }, [active]);
  if (openOrder !== undefined) return <ProductionOrderWorkspace user={user} order={openOrder || null} products={products} factories={factories} onClose={() => setOpenOrder(undefined)} onSaved={saved => { const next = { ...saved, flowStatus: saved.flowStatus || '待交货' }; setOrders(current => { const exists = current.some(x => x.id === saved.id); return exists ? current.map(x => x.id === saved.id ? { ...x, ...next } : x) : [next, ...current]; }); }} onChanged={load} />;
  const flowStatus = order => {
    if (order.status === '已取消') return '已取消';
    if (order.status === '已完成') return '交货完成';
    const planned = Number(order.plannedQuantity || 0);
    const confirmed = Number(order.handoverConfirmedQuantity || 0);
    const legacyCompleted = Number(order.actualQuantity || 0);
    if (planned > 0 && (confirmed >= planned || (confirmed === 0 && legacyCompleted >= planned && Number(order.deliveryReceivedQuantity || 0) >= planned))) return '交货完成';
    if (confirmed > 0 || legacyCompleted > 0 || Number(order.deliveryPlannedQuantity || 0) > 0 || Number(order.deliveryReceivedQuantity || 0) > 0) return '部分交货';
    return order.flowStatus === '已取消' ? '已取消' : '待交货';
  };
  const needle = query.trim().toLowerCase(); const rows = orders.filter(order => { const skus = (order.items || []).map(item => item.sku).join(' '); return (!needle || [order.orderNo, skus, order.factory].join(' ').toLowerCase().includes(needle)) && (!status || flowStatus(order) === status); });
  const count = names => orders.filter(order => names.includes(flowStatus(order))).length;
  const summary = [
    { label: '全部订单', value: orders.length, filter: '' },
    { label: '待交货', value: count(['待交货']), filter: '待交货' },
    { label: '部分交货', value: count(['部分交货']), filter: '部分交货' },
    { label: '交货完成', value: count(['交货完成']), filter: '交货完成' },
    { label: '已取消', value: count(['已取消']), filter: '已取消' },
  ];
  // 总览口径（在制量 / 代工厂负荷 / 交期风险 / 去向结构）全部收进 ProductionOverview，
  // 这个页面只负责筛选、列表与打开订单，避免同一套数字在两处各算一遍、算出不一样的结果。
  return <div className="prod">
    <div className="prod-head"><div><div className="prod-head__eyebrow">工厂生产</div><h2>{section === 'overview' ? '生产总览' : '工厂订单'}</h2><p className="hint">{section === 'overview' ? '查看生产进度、交期风险和工厂负荷。' : '一张订单管理多个整车 SKU，集中查看采购、交付、仓库和结算结果。'}</p></div>{section === 'orders' && user.role === 'admin' && <button className="btn primary" onClick={() => setOpenOrder(null)}>＋ 新建生产订单</button>}</div>
    {/* 供应链生产总览：4 张 KPI + 生产待办 + 代工厂负荷（含去向结构），移自 8090 */}
    {section === 'overview' && <><ProductionOverview
      orders={orders}
      extras={extras}
      flowStatusOf={flowStatus}
      onOpenOrder={order=>setOpenOrder(order)}
      onGoOrders={()=>onNavigate?.('sales-orders')}
    />
    {/* 生产看板（对齐 8090）：待制造 / 制造中 / 已交货 / 已结案归档 四列状态卡片 */}
    <ProductionBoard orders={orders} onOpenOrder={order=>setOpenOrder(order)} /></>}
    {section === 'orders' && <>
    <div className="prod-stats" aria-label="订单状态筛选">{summary.map(item => <button key={item.label} type="button" className={'prod-stat' + (status === item.filter ? ' is-active' : '')} onClick={() => setStatus(item.filter)}><span className="prod-stat__label">{item.label}</span><strong className="prod-stat__num">{item.value}</strong></button>)}</div>
    <div className="prod-filters"><input type="search" value={query} placeholder="搜索生产订单号、整车 SKU 或合作工厂" onChange={e => setQuery(e.target.value)} /><select value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option>{statuses.map(x => <option key={x}>{x}</option>)}</select><span className="prod-filters__count">当前显示 <b>{rows.length}</b> / {orders.length} 单</span></div>
    {error && <p className="error-text">{error} <button className="btn small" onClick={load}>重新读取</button></p>}{loading && <p className="hint">正在读取生产订单…</p>}
    {!loading && <div className="card table-scroll prod-table"><table className="table"><thead><tr><th>生产订单</th><th>合作工厂</th><th>整车 SKU</th><th>订单数量</th><th>订单金额</th><th>已付款金额</th><th>发运情况</th><th>入库情况</th><th>订单状态</th><th>操作</th></tr></thead><tbody>{rows.map(order => { const total = Number(order.orderTotal || 0), paid = Number(order.paidTotal || 0), currency = order.currency || order.costCurrency || 'CNY', planned = Number(order.plannedQuantity || 0), skus = (order.items || []).map(item => item.sku), flow = flowStatus(order); return <tr key={order.id} className="order-openable" title="双击打开订单详情" onDoubleClick={event=>openOrderOnDoubleClick(event,()=>setOpenOrder(order))}><td><strong>{order.orderNo}</strong><small>计划 {planned} 辆 · {skus.length} 个车型</small></td><td>{order.factory}</td><td><span className="prod-sku" title={skus.join('、')}>{skus.join('、') || '—'}</span></td><td>{planned} 辆</td><td><strong>{currency} {money(total)}</strong></td><td><strong>{currency} {money(paid)}</strong><small>剩余 {money(Math.max(0, total - paid))}</small></td><td>{Number(order.deliveryCount || 0)} 批 / {Number(order.deliveryPlannedQuantity || 0)} 辆</td><td>{Number(order.receiptCount || 0)} 批 / {Number(order.deliveryReceivedQuantity || 0)} 辆</td><td><span className={'prod-status prod-status--' + String(flow).replaceAll(' ', '')}>{flow}</span></td><td><button className="btn small" onClick={() => setOpenOrder(order)}>打开订单</button></td></tr>; })}{!rows.length && <tr><td colSpan="10" className="hint empty-cell"><strong>暂无生产订单</strong><span>点击右上角“新建生产订单”，开始建立首个工厂采购订单。</span></td></tr>}</tbody></table></div>}</>}{section === 'overview' && <>{error && <p className="error-text">{error} <button className="btn small" onClick={load}>重新读取</button></p>}{loading && <p className="hint">正在读取生产数据…</p>}</>}</div>;
}
