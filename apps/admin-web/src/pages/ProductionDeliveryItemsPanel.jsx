import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';

export default function ProductionDeliveryItemsPanel({ order, products = [], user, onChanged }) {
  const [deliveries, setDeliveries] = useState([]);
  const [allocations, setAllocations] = useState({});
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState('');
  const productNames = useMemo(() => Object.fromEntries(products.flatMap(product => (product.skus || []).map(sku => [sku.sku, product.name]))), [products]);
  const defaultItems = delivery => {
    const orderItems = order.items || [];
    return orderItems.map(item => {
      // 多车型批次不能根据订单顺序推断实际装车构成；只有单车型批次可以自动带出数量。
      const plannedQuantity = orderItems.length === 1 ? Number(delivery.plannedQuantity || 0) : 0;
      return { sku: item.sku, plannedQuantity };
    });
  };
  const load = async () => {
    if (!order?.id) return;
    try {
      const rows = await api.productionDeliveries(order.id);
      const pairs = await Promise.all(rows.map(async row => [row.id, await api.productionDeliveryItems(row.id).catch(() => [])]));
      setDeliveries(rows); setAllocations(Object.fromEntries(pairs)); setError('');
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, [order?.id]);
  const save = async delivery => {
    const items = drafts[delivery.id] || (allocations[delivery.id]?.length ? allocations[delivery.id] : defaultItems(delivery));
    setSaving(delivery.id); setError('');
    try {
      const validItems = items.filter(item => Number(item.plannedQuantity) > 0);
      if (validItems.reduce((sum, item) => sum + Number(item.plannedQuantity || 0), 0) !== Number(delivery.plannedQuantity || 0)) {
        throw new Error(`批次 ${delivery.shipmentNo} 的车型明细合计必须等于 ${delivery.plannedQuantity} 辆`);
      }
      await api.saveProductionDeliveryItems(delivery.id, { items: validItems });
      await load(); onChanged?.();
    }
    catch (e) { setError(e.message); }
    finally { setSaving(''); }
  };
  if (!order?.id || !deliveries.length) return null;
  return <section className="card pow-card pow-delivery-items">
    <div className="pow-card__head"><h3>批次车型明细</h3><span className="pow-card__hint">发运数量按实际车型拆分，合计必须等于批次数量；多车型不会自动猜测分配</span></div>
    {error && <p className="error-text" role="alert">{error}</p>}
    <div className="table-scroll"><table className="table"><thead><tr><th>发货批次</th><th>批次数量</th><th>车型 SKU</th><th>产品</th><th>车型发运数量</th><th>已入库</th><th>操作</th></tr></thead><tbody>{deliveries.map(delivery => {
      const current = drafts[delivery.id] || (allocations[delivery.id]?.length ? allocations[delivery.id] : defaultItems(delivery));
      const update = (sku, value) => setDrafts(state => ({ ...state, [delivery.id]: current.map(item => item.sku === sku ? { ...item, plannedQuantity: Number(value) || 0 } : item) }));
      return current.length ? current.map((item, index) => <tr key={`${delivery.id}-${item.sku}`}><td>{index === 0 ? delivery.shipmentNo : ''}</td><td>{index === 0 ? `${delivery.plannedQuantity} 辆` : ''}</td><td>{item.sku}</td><td>{productNames[item.sku] || '—'}</td><td><input type="number" min="0" step="1" value={item.plannedQuantity} disabled={delivery.status !== '待发运' || user?.role !== 'admin'} onChange={e => update(item.sku, e.target.value)} /></td><td>{item.receivedQuantity || 0} 辆</td><td>{index === 0 && delivery.status === '待发运' && user?.role === 'admin' && <button className="btn small" disabled={saving === delivery.id} onClick={() => save(delivery)}>{saving === delivery.id ? '保存中…' : '保存明细'}</button>}</td></tr>) : <tr key={delivery.id}><td>{delivery.shipmentNo}</td><td>{delivery.plannedQuantity} 辆</td><td colSpan="4" className="hint">暂无可分配的车型明细</td><td /></tr>;
    })}</tbody></table></div>
  </section>;
}
