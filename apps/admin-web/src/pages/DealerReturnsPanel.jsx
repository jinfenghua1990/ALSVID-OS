import React, { useEffect, useState } from 'react';
import { uuidv7 } from '../uuidv7.js';

async function portalRequest(path, method = 'GET', body) {
  const response = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '操作失败');
  return data;
}

const statusText = { pending: '待审核', approved: '待退回', rejected: '未批准', received: '已收货' };

export default function DealerReturnsPanel({ orders }) {
  const [requests, setRequests] = useState([]), [active, setActive] = useState(null);
  const [reason, setReason] = useState(''), [quantities, setQuantities] = useState({}), [requestId, setRequestId] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [reloadError, setReloadError] = useState('');
  const reload = async () => setRequests(await portalRequest('/api/portal/dealer/returns'));
  useEffect(() => { reload().catch(e => setReloadError(e.message)); }, []);
  const retryReload = async () => { setBusy(true); setReloadError(''); try { await reload(); } catch (e) { setReloadError(e.message); } finally { setBusy(false); } };
  const begin = order => { setActive(order); setReason(''); setRequestId(uuidv7()); setQuantities(Object.fromEntries(order.items.map(item => [item.id, 0]))); setMessage(''); };
  const submit = async e => {
    e.preventDefault(); if (!active || busy) return;
    const items = active.items.filter(item => Number(quantities[item.id]) > 0).map(item => ({ itemId: item.id, quantity: Number(quantities[item.id]) }));
    if (!items.length) { setMessage('请选择需要退回的商品和数量。'); return; }
    setBusy(true); setMessage(''); setReloadError('');
    try {
      await portalRequest(`/api/portal/dealer/orders/${encodeURIComponent(active.id)}/returns`, 'POST', { id: requestId, reason, items });
      setActive(null); setMessage('退货申请已提交，管理员审核后会更新处理进度。');
      try { await reload(); } catch (e) { setReloadError(e.message); }
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  };
  const usedQuantity = (orderId, itemId) => requests.filter(r => r.orderId === orderId && ['pending', 'approved', 'received'].includes(r.status)).reduce((total, r) => total + r.items.filter(i => i.orderItemId === itemId).reduce((n, item) => {
    if (r.status !== 'received') return n + Number(item.quantity);
    return n + Number(r.receipt?.items?.find(x => x.returnItemId === item.id)?.quantity || 0);
  }, 0), 0);
  return <section className="card mt16"><h3>退货申请</h3><p className="hint" />{message && <p role="status">{message}</p>}{reloadError && <p className="error-text" role="alert">退货列表刷新失败：{reloadError} <button type="button" className="btn small" disabled={busy} onClick={retryReload}>重试刷新</button></p>}
    {orders.filter(o => o.status === 'delivered').map(order => <article key={order.id} className="row" style={{justifyContent:'space-between',borderTop:'1px solid var(--border)',padding:'10px 0'}}><span>{order.id} · {new Date(order.receivedAt).toLocaleDateString()}</span><button type="button" className="btn small" disabled={busy} onClick={() => begin(order)}>申请退货</button></article>)}
    {active && <form className="card" style={{marginTop:12}} onSubmit={submit}><h4>退货申请 · {active.id}</h4><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>SKU</th><th>购买数量</th><th>尚可申请</th><th>退货数量</th></tr></thead><tbody>{active.items.map(item => { const remaining=Number(item.quantity)-usedQuantity(active.id,item.id);return <tr key={item.id}><td>{item.sku} · {item.productName}</td><td>{item.quantity}</td><td>{remaining}</td><td><input aria-label={`退货数量 ${item.sku}`} type="number" min="0" max={remaining} step="1" value={quantities[item.id]||0} onChange={e=>setQuantities({...quantities,[item.id]:e.target.value})}/></td></tr>})}</tbody></table></div><label>退货原因<textarea required rows={3} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)}/></label><div className="row mt16"><button className="btn primary" disabled={busy}>提交申请</button><button className="btn" type="button" disabled={busy} onClick={()=>setActive(null)}>取消</button></div></form>}
    {requests.map(r => <article className="card" key={r.id} style={{marginTop:12}}><h4>{statusText[r.status]} · {r.orderId}</h4><p>{r.reason}</p>{r.reviewNote&&<p>审核说明：{r.reviewNote}</p>}<table className="table"><thead><tr><th>SKU</th><th>申请数量</th><th>实收数量</th></tr></thead><tbody>{r.items.map(i=>{const received=r.receipt?.items?.find(x=>x.returnItemId===i.id);return <tr key={i.id}><td>{i.sku}</td><td>{i.quantity}</td><td>{received?`${received.quantity} · ${received.disposition==='restocked'?'已入库':received.disposition==='not_restocked'?'未入库':'未收到'}`:'—'}</td></tr>})}</tbody></table>{r.receipt?.note&&<p>收货说明：{r.receipt.note}</p>}{r.refunds?.length>0&&<p>已登记退款：{r.refunds.map(x=>`${x.amount} (${x.reference})`).join('、')}</p>}</article>)}
  </section>;
}
