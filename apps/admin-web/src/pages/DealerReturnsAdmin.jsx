import { adminFetch } from '../api.js';
import React, { useEffect, useRef, useState } from 'react';
import { uuidv7 } from '../uuidv7.js';

async function request(path, method = 'GET', body) {
  const response = await adminFetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || '操作失败');
  return data;
}

const labels = { pending: '待审核', approved: '待收货', rejected: '未批准', received: '已收货' };
const LAMP = { pending: 'is-warn is-pulse', approved: 'is-info', rejected: 'is-err', received: 'is-ok' };
const Lamp = ({ status }) => <span className={'ck-lamp ' + (LAMP[status] || 'is-off')}>{labels[status] || status}</span>;

export default function DealerReturnsAdmin({ active = true }) {
  const [rows, setRows] = useState([]), [warehouses, setWarehouses] = useState([]), [message, setMessage] = useState(''), [reloadError, setReloadError] = useState(''), [busy, setBusy] = useState(false);
  const [receiving, setReceiving] = useState(null), [refund, setRefund] = useState(null), [detail, setDetail] = useState(null);
  const loadVersion = useRef(0);
  const reload = async () => { const version = ++loadVersion.current; const [returns, stockrooms] = await Promise.all([request('/api/portal-management/dealer-returns'), request('/api/warehouses')]); if (version !== loadVersion.current) return; setRows(returns); setWarehouses(stockrooms.filter(w => w.status === '启用' && ['国内仓', '海外仓'].includes(w.kind))); };
  useEffect(() => { if (!active) return; reload().catch(e => setReloadError(e.message)); return () => { loadVersion.current++ }; }, [active]);
  const run = async fn => { setBusy(true); setMessage(''); setReloadError(''); try { await fn(); } catch (e) { setMessage(e.message); setBusy(false); return; } try { await reload(); } catch (e) { setMessage('退货操作已保存，但列表刷新失败。'); setReloadError(e.message); } finally { setBusy(false); } };
  const retryReload = async () => { setBusy(true); setReloadError(''); try { await reload(); setMessage('退货记录已刷新。'); } catch (e) { setReloadError(e.message); } finally { setBusy(false); } };
  const closeDrawer = () => { if (busy) return; setDetail(null); setReceiving(null); setRefund(null); };
  const review = (row, decision) => { const note = window.prompt(decision === 'approve' ? '审核通过说明' : '不批准原因'); if (note === null || !note.trim()) return; run(() => request(`/api/portal-management/dealer-returns/${encodeURIComponent(row.id)}/review`, 'POST', { decision, note })); };
  const beginReceive = row => { setDetail(null); setReceiving({ row, id: uuidv7(), note: '', items: row.items.map(item => ({ returnItemId: item.id, quantity: item.quantity, disposition: '', warehouseId: '', note: '' })) }); };
  const saveReceipt = async e => { e.preventDefault(); if (!receiving || busy) return; await run(async () => { await request(`/api/portal-management/dealer-returns/${encodeURIComponent(receiving.row.id)}/receive`, 'POST', { id: receiving.id, note: receiving.note, items: receiving.items.map(x => ({ ...x, quantity: Number(x.quantity), warehouseId: x.disposition === 'restocked' ? x.warehouseId : null })) }); setReceiving(null); setDetail(null); }); };
  const beginRefund = row => { setDetail(null); setRefund({ row, id: uuidv7(), amount: '', reference: '', note: '' }); };
  const saveRefund = async e => { e.preventDefault(); if (!refund || busy) return; await run(async () => { await request(`/api/portal-management/dealer-returns/${encodeURIComponent(refund.row.id)}/refunds`, 'POST', { id: refund.id, amount: refund.amount, reference: refund.reference, note: refund.note }); setRefund(null); setDetail(null); }); };
  const counts = { pending: rows.filter(r => r.status === 'pending').length, approved: rows.filter(r => r.status === 'approved').length, received: rows.filter(r => r.status === 'received').length };
  const isErr = /失败|不能|无效|超过|不足/.test(message);
  const drawerRow = receiving?.row || refund?.row || detail;

  const detailBody = row => row && <>
    <div className="ck-kv">
      <div><b>{row.username}</b> · <Lamp status={row.status} /> · {row.currency} · <span className="ck-dim">{new Date(row.createdAt).toLocaleString('zh-CN')}</span></div>
      <div>关联订单 <span className="ck-mono ck-dim">{row.orderId}</span></div>
      <div style={{ whiteSpace: 'pre-wrap' }}>退货原因：{row.reason}</div>
      {row.reviewNote && <div>审核说明：{row.reviewNote}</div>}
    </div>
    <div className="ck-section">申请明细</div>
    <table className="ck-table"><thead><tr><th>SKU</th><th className="num">申请数量</th><th className="num">单价</th></tr></thead><tbody>{row.items.map(item => <tr key={item.id}><td className="ck-mono">{item.sku} · {item.productName}</td><td className="num">{item.quantity}</td><td className="num">{row.currency} {item.unitPrice}</td></tr>)}</tbody></table>
    {row.receipt && <>
      <div className="ck-section">收货记录</div>
      <div className="ck-kv"><div>收货说明：{row.receipt.note || '—'} · <span className="ck-dim">{new Date(row.receipt.receivedAt).toLocaleString('zh-CN')}</span></div></div>
      <table className="ck-table"><thead><tr><th>SKU</th><th className="num">实收数量</th><th>处置</th><th>仓库</th><th>差异说明</th></tr></thead><tbody>{row.receipt.items.map(item => <tr key={item.returnItemId}><td className="ck-mono">{row.items.find(x => x.id === item.returnItemId)?.sku}</td><td className="num">{item.quantity}</td><td>{item.disposition === 'restocked' ? '重新入库' : item.disposition === 'not_restocked' ? '不入库' : '未收到'}</td><td className="ck-dim">{item.warehouseName || '—'}</td><td className="ck-dim">{item.note || '—'}</td></tr>)}</tbody></table>
    </>}
    {row.refunds?.length > 0 && <>
      <div className="ck-section">退款记录</div>
      <table className="ck-table"><thead><tr><th>退款时间</th><th className="num">金额</th><th>银行流水/参考号</th><th>说明</th><th>登记人</th></tr></thead><tbody>{row.refunds.map(x => <tr key={x.id}><td className="ck-dim">{new Date(x.refundedAt).toLocaleString('zh-CN')}</td><td className="num">{row.currency} {x.amount}</td><td className="ck-mono">{x.reference}</td><td className="ck-dim">{x.note || '—'}</td><td className="ck-dim">{x.recordedBy}</td></tr>)}</tbody></table>
    </>}
    <div className="ck-section">处理操作</div>
    <div className="ck-row">
      {row.status === 'pending' && <><button type="button" className="ck-btn is-primary" disabled={busy} onClick={() => review(row, 'approve')}>批准退货</button><button type="button" className="ck-btn is-danger" disabled={busy} onClick={() => review(row, 'reject')}>不批准</button></>}
      {row.status === 'approved' && <button type="button" className="ck-btn is-primary" disabled={busy} onClick={() => beginReceive(row)}>登记退货收货</button>}
      {row.status === 'received' && <button type="button" className="ck-btn is-primary" disabled={busy} onClick={() => beginRefund(row)}>登记退款</button>}
      {row.status === 'rejected' && <span className="ck-note">该申请已不批准，无可执行操作。</span>}
    </div>
  </>;

  return <>
    <div className="ck-instruments" role="group" aria-label="退货关键指标">
      <div className="ck-inst"><div className="ck-inst__label">退货申请</div><div className="ck-inst__num">{rows.length}</div></div>
      <div className={'ck-inst' + (counts.pending ? ' is-warn' : '')}><div className="ck-inst__label">待审核</div><div className="ck-inst__num">{counts.pending}</div></div>
      <div className={'ck-inst' + (counts.approved ? ' is-info' : '')}><div className="ck-inst__label">待收货</div><div className="ck-inst__num">{counts.approved}</div></div>
      <div className="ck-inst is-ok"><div className="ck-inst__label">已收货</div><div className="ck-inst__num">{counts.received}</div></div>
    </div>
    <div className="ck-toolbar">
      {message && <span className={'ck-flash' + (isErr ? ' is-err' : '')} role="status">{message}</span>}
      {reloadError && <span className="ck-flash is-err" role="alert">退货列表刷新失败：{reloadError} <button type="button" className="ck-btn is-sm" disabled={busy} onClick={retryReload}>重试刷新</button></span>}
    </div>
    <div className="ck-gridwrap"><div className="ck-grid">
      <table className="ck-table"><thead><tr><th>经销商</th><th>状态</th><th>关联订单</th><th className="num">件数</th><th>币种</th><th>退货原因</th><th>提交时间</th><th style={{ textAlign: 'right' }}>操作</th></tr></thead><tbody>
        {rows.map(row => <tr key={row.id}>
          <td className="ck-strong">{row.username}</td>
          <td><Lamp status={row.status} /></td>
          <td className="ck-mono ck-dim">{row.orderId}</td>
          <td className="num">{row.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
          <td className="ck-mono">{row.currency}</td>
          <td className="ck-dim" style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.reason}</td>
          <td className="ck-dim">{new Date(row.createdAt).toLocaleString('zh-CN')}</td>
          <td style={{ textAlign: 'right' }}><button type="button" className="ck-link" onClick={() => { setReceiving(null); setRefund(null); setDetail(row); }}>处理</button></td>
        </tr>)}
        {!rows.length && <tr><td colSpan={8}><div className="ck-empty"><b>暂无退货申请</b>经销商在门户提交退货后会显示在这里，可审核、登记收货与退款。</div></td></tr>}
      </tbody></table>
    </div></div>

    {drawerRow && <>
      <div className="ck-scrim" onClick={closeDrawer} aria-hidden="true" />
      {detail && !receiving && !refund
        ? <aside className="ck-drawer" role="dialog" aria-modal="true" aria-label="退货处理面板">
          <div className="ck-drawer__head"><div><div className="ck-drawer__title">退货处理 · {detail.username}</div><div className="ck-drawer__sub">DEALER RMA OPS</div></div><button type="button" className="ck-drawer__close" onClick={closeDrawer} aria-label="关闭面板">×</button></div>
          <div className="ck-drawer__body">{detailBody(detail)}</div>
          <div className="ck-drawer__foot"><button type="button" className="ck-btn" onClick={closeDrawer}>关闭</button></div>
        </aside>
        : <form className="ck-drawer" onSubmit={receiving ? saveReceipt : saveRefund}>
          <div className="ck-drawer__head"><div><div className="ck-drawer__title">{receiving ? '登记退货收货' : '登记退款'} · {drawerRow.username}</div><div className="ck-drawer__sub">DEALER RMA OPS</div></div><button type="button" className="ck-drawer__close" onClick={closeDrawer} aria-label="关闭面板">×</button></div>
          <div className="ck-drawer__body">
            {receiving && <>
              <div className="ck-field"><span>收货说明</span><textarea className="ck-input" rows={2} maxLength={2000} value={receiving.note} onChange={e => setReceiving({ ...receiving, note: e.target.value })} /></div>
              <table className="ck-table"><thead><tr><th>SKU</th><th className="num">申请量</th><th className="num">实收量</th><th>处置</th><th>入库仓</th><th>差异说明</th></tr></thead><tbody>{receiving.items.map((item, index) => { const source = receiving.row.items.find(x => x.id === item.returnItemId); return <tr key={item.returnItemId}><td className="ck-mono">{source.sku}</td><td className="num">{source.quantity}</td><td className="num"><input className="ck-input" style={{ width: 84 }} required type="number" min="0" max={source.quantity} step="1" value={item.quantity} onChange={e => setReceiving({ ...receiving, items: receiving.items.map((x, i) => i === index ? { ...x, quantity: e.target.value } : x) })} /></td><td><select className="ck-input" required value={item.disposition} onChange={e => setReceiving({ ...receiving, items: receiving.items.map((x, i) => i === index ? { ...x, disposition: e.target.value, warehouseId: '' } : x) })}><option value="">选择</option><option value="restocked">重新入库</option><option value="not_restocked">不入库</option><option value="not_received">未收到</option></select></td><td>{item.disposition === 'restocked' && <select className="ck-input" required value={item.warehouseId} onChange={e => setReceiving({ ...receiving, items: receiving.items.map((x, i) => i === index ? { ...x, warehouseId: e.target.value } : x) })}><option value="">选择仓库</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</select>}</td><td><input className="ck-input" maxLength={2000} value={item.note} onChange={e => setReceiving({ ...receiving, items: receiving.items.map((x, i) => i === index ? { ...x, note: e.target.value } : x) })} /></td></tr> })}</tbody></table>
            </>}
            {refund && <>
              <div className="ck-field"><span>退款金额（{refund.row.currency}）</span><input className="ck-input" type="number" min="0.01" step="0.01" required value={refund.amount} onChange={e => setRefund({ ...refund, amount: e.target.value })} /></div>
              <div className="ck-field"><span>银行流水/参考号</span><input className="ck-input" required maxLength={200} value={refund.reference} onChange={e => setRefund({ ...refund, reference: e.target.value })} /></div>
              <div className="ck-field"><span>说明</span><textarea className="ck-input" rows={2} maxLength={2000} value={refund.note} onChange={e => setRefund({ ...refund, note: e.target.value })} /></div>
            </>}
          </div>
          <div className="ck-drawer__foot"><button type="button" className="ck-btn" disabled={busy} onClick={closeDrawer}>取消</button><button className="ck-btn is-primary" disabled={busy}>{busy ? '保存中…' : receiving ? '保存收货记录' : '保存退款'}</button></div>
        </form>}
    </>}
  </>;
}