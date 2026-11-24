import React, { useEffect, useState } from 'react';
import { portalRequest } from './PortalPage.jsx';
import { uuidv7 } from '../uuidv7.js';

export default function SupplierPortalPage({ user, onLogout }) {
  const [orders, setOrders] = useState([]), [selectedId, setSelectedId] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState('');
  const reload = async () => { setError(''); try { const result = await portalRequest('/api/portal/supplier/purchase-orders'); setOrders(result.data || []); } catch (e) { setError(e.message); } };
  useEffect(() => { reload(); }, []);
  const requestKey = order => `alsvid.supplier.ack.${order.id}`;
  const selected = orders.find(order => order.id === selectedId);
  const confirm = async order => {
    const key = requestKey(order), saved = localStorage.getItem(key);
    let body;
    if (saved) body = JSON.parse(saved);
    else {
      if (note.trim().length < 5) return;
      body = { clientRequestId: uuidv7(), expectedVersion: order.version, note: note.trim(), lines: order.lines.map(line => ({ purchaseOrderLineId: line.id, confirmedQuantity: line.quantity, confirmedDate: line.requestedDate || undefined })) };
      localStorage.setItem(key, JSON.stringify(body));
    }
    setBusy(true); setError(''); setResult('');
    try {
      await portalRequest(`/api/portal/supplier/purchase-orders/${encodeURIComponent(order.id)}/confirm`, 'POST', body);
      localStorage.removeItem(key);setNote('');setResult('确认已保存。');await reload();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <main className="app-shell"><header className="topbar"><h1>ALSVID 供应商门户</h1><span>{user.username}</span><button className="btn" onClick={onLogout}>退出登录</button></header><section className="card"><h2>供应商采购单协同</h2><p className="hint">仅显示已发布且绑定到当前供应商组织的采购单；草稿和其他供应商的记录不会显示。</p>{error && <p role="alert" className="error-text">{error}</p>}{!orders.length && !error && <p className="hint">当前账号没有可访问的已发布采购单。</p>}{orders.length>0&&<div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>采购单号</th><th>供应商</th><th>状态</th><th>明细数</th><th>操作</th></tr></thead><tbody>{orders.map(order=><tr key={order.id}><td>{order.poNumber}</td><td>{order.supplier}</td><td>{order.status}</td><td>{order.lines.length}</td><td><button className="btn small" onClick={()=>{setSelectedId(order.id);setNote('');setError('');setResult('')}}>查看 / 确认</button></td></tr>)}</tbody></table></div>}{selected&&<article className="card"><h3>{selected.poNumber} · {selected.status}</h3><p>币种 {selected.currency} · 已发布版本 {selected.version}。采购条件只能由 ALSVID 采购负责人修改。</p><div style={{overflowX:'auto'}}><table className="table"><thead><tr><th>行号</th><th>行性质</th><th>SKU</th><th>物品</th><th>数量</th><th>要求交期</th></tr></thead><tbody>{selected.lines.map(line=><tr key={line.id}><td>{line.lineNo}</td><td>{line.lineKind==='GIFT'?'供应商赠品':'正常采购'}</td><td>{line.sku}</td><td>{line.description||'已登记物料'}</td><td>{line.quantity} {line.unit}</td><td>{line.requestedDate||'待定'}</td></tr>)}</tbody></table></div>{selected.status==='ISSUED'&&!localStorage.getItem(requestKey(selected))?<div className="field"><label htmlFor="supplier-confirm-note">确认说明（必填，不修改采购条件）</label><textarea id="supplier-confirm-note" rows={3} maxLength={1000} value={note} onChange={event=>setNote(event.target.value)} placeholder="已核对完整采购单，确认全部已发布数量及要求交期。"/><button className="btn primary" disabled={busy||note.trim().length<5} onClick={()=>confirm(selected)}>{busy?'提交中…':'确认全部采购单'}</button></div>:localStorage.getItem(requestKey(selected))?<div className="field"><p>有一笔确认尚未收到保存结果，可以使用原请求安全重试。</p><button className="btn primary" disabled={busy} onClick={()=>confirm(selected)}>{busy?'提交中…':'重试确认结果'}</button></div>:<p>该采购单不再等待供应商确认。如需更改数量或交期，请联系 ALSVID 采购负责人。</p>}{result&&<p role="status">{result}</p>}</article>}</section></main>;
}
