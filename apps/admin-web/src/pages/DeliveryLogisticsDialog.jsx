import React, { useState } from 'react';
import { api } from '../api.js';

// 发运批次物流信息：承运商、物流运单号、预计到仓日期。待发运与在途批次可修改。
export default function DeliveryLogisticsDialog({ delivery, onClose, onSaved }) {
  const [form, setForm] = useState({ carrier: delivery.carrier || '', trackingNo: delivery.trackingNo || '', etaDate: delivery.etaDate || '' });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const submit = async e => {
    e.preventDefault();
    setBusy(true); setError('');
    try { await api.updateDeliveryLogistics(delivery.id, form); onSaved?.(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <div className="mask" role="dialog" aria-modal="true">
    <form className="modal" onSubmit={submit}>
      <div className="modal-head"><h3>物流信息 · {delivery.shipmentNo}</h3><button type="button" className="btn small" onClick={onClose} disabled={busy}>关闭</button></div>
      <div className="modal-body">
        <div className="form-grid">
          <div className="field"><label>承运商</label><input value={form.carrier} maxLength={80} placeholder="例如 DHL / 中欧班列" onChange={e => setForm({ ...form, carrier: e.target.value })}/></div>
          <div className="field"><label>物流运单号</label><input value={form.trackingNo} maxLength={120} placeholder="承运商提供的运单号" onChange={e => setForm({ ...form, trackingNo: e.target.value })}/></div>
          <div className="field"><label>预计到仓日期</label><input type="date" value={form.etaDate} onChange={e => setForm({ ...form, etaDate: e.target.value })}/></div>
        </div>
        <p className="hint">预计到仓日期用于在途跟进；批次签收入库后不再允许修改。</p>
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>取消</button>
        <button className="btn primary" disabled={busy}>{busy ? '保存中…' : '保存物流信息'}</button>
      </div>
    </form>
  </div>;
}
