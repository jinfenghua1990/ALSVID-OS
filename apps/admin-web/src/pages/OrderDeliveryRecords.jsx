import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function OrderDeliveryRecords({ orderId, mode }) {
  const [rows, setRows] = useState([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  useEffect(() => { let current = true; setLoading(true); api.productionDeliveries(orderId).then(data => { if (current) { setRows(data); setError(''); } }).catch(e => { if (current) setError(e.message); }).finally(() => { if (current) setLoading(false); }); return () => { current = false; }; }, [orderId]);
  const isDispatch = mode === 'dispatch';
  return <div className="card">
    <div className="row"><div><h3>{isDispatch ? '发货记录' : '到货入库'}</h3><p className="hint">{isDispatch ? '同一订单可分多批次发往国内仓或德国仓。' : '按发货批次登记实际到货并确认入库。'}</p></div></div>
    {loading && <p className="hint">正在读取记录…</p>}{error && <p className="error-text">读取失败：{error}</p>}
    {!loading && !error && !rows.length && <p className="hint">暂无{isDispatch ? '发货' : '到货'}记录。订单保存后可在此登记实际业务。</p>}
    {!loading && !error && rows.length > 0 && <div className="table-scroll"><table className="table"><thead>{isDispatch ? <tr><th>发货批次号</th><th>发货日期</th><th>目的仓库</th><th>发货数量</th><th>物流方式 / 承运商</th><th>运单号 / 柜号</th><th>预计到货日期</th><th>发货状态</th><th>备注</th></tr> : <tr><th>关联发货批次</th><th>目的仓</th><th>已发货数量</th><th>实际到货数量</th><th>实际到货日期</th><th>已确认入库数量</th><th>待入库数量</th><th>入库状态 / 差异备注</th></tr>}</thead><tbody>{rows.map(row => isDispatch ? <tr key={row.id}><td>{row.shipmentNo}</td><td>{row.shippedAt ? String(row.shippedAt).slice(0, 10) : '待发货'}</td><td>{row.warehouse}</td><td>{row.plannedQuantity}</td><td>{row.deliveryMethod || '—'}</td><td>{row.trackingNo || '—'}</td><td>{row.eta ? String(row.eta).slice(0, 10) : '—'}</td><td>{row.status}</td><td>{row.note || '—'}</td></tr> : <tr key={row.id}><td>{row.shipmentNo}</td><td>{row.warehouse}</td><td>{row.plannedQuantity}</td><td>{row.receivedQuantity || 0}</td><td>{row.receivedAt ? String(row.receivedAt).slice(0, 10) : '—'}</td><td>{row.receivedQuantity || 0}</td><td>{Math.max(0, Number(row.plannedQuantity) - Number(row.receivedQuantity || 0))}</td><td>{row.status}{row.receiptNote ? ` · ${row.receiptNote}` : ''}</td></tr>)}</tbody></table></div>}
  </div>;
}
