import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ProductionAttachmentsPage from './ProductionAttachmentsPage.jsx';

const tabs = ['订单信息', '发运管理', '到货入库', '附件'];

export default function ProductionOrderDetail({ order, user, onClose, onOpenDelivery }) {
  const [tab, setTab] = useState(tabs[0]);
  const [data, setData] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let current = true;
    setData({}); setError('');
    if (tab !== '发运管理' && tab !== '到货入库') { setLoading(false); return () => { current = false; }; }
    setLoading(true);
    const request = api.productionDeliveries(order.id);
    request.then(rows => { if (current) setData({ rows }); })
      .catch(e => { if (current) setError(e.message); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [order.id, tab]);

  return <section className="card mt16">
    <div className="row"><h3>{order.orderNo} · 订单详情</h3><button type="button" className="btn small" onClick={onClose}>关闭</button></div>
    <div className="tabs" role="tablist" aria-label="生产订单详情">{tabs.map(name => <button type="button" role="tab" aria-selected={tab === name} className={'tab' + (tab === name ? ' active' : '')} key={name} onClick={() => setTab(name)}>{name}</button>)}</div>
    {tab === '订单信息' && <table className="table"><tbody><tr><th>订单号</th><td>{order.orderNo}</td><th>整车 SKU</th><td>{order.sku}</td></tr><tr><th>合作工厂</th><td>{order.factory}</td><th>批次</th><td>{order.batch}</td></tr><tr><th>计划数量</th><td>{order.plannedQuantity}</td><th>生产状态</th><td>{order.status}</td></tr></tbody></table>}
    {loading && <p>正在读取记录…</p>}{error && <p className="error-text" role="alert">读取失败：{error}</p>}
    {!loading && !error && (tab === '发运管理' || tab === '到货入库') && <><button type="button" className="btn small" onClick={onOpenDelivery}>打开{tab}</button>{data.rows?.length ? <div className="table-scroll"><table className="table"><thead><tr><th>发运单</th><th>目的地</th><th>数量</th><th>已入库</th><th>清关</th><th>状态</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.id}><td>{row.shipmentNo}</td><td>{row.warehouse}</td><td>{row.plannedQuantity}</td><td>{row.receivedQuantity || 0}</td><td>{row.customsStatus || '—'}</td><td>{row.status}</td></tr>)}</tbody></table></div> : <p>暂无{tab}记录。</p>}</>}
    {tab === '附件' && <ProductionAttachmentsPage key={order.id} user={user} initialOrderId={order.id} />}
  </section>;
}
