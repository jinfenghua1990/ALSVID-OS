import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { uuidv7 } from '../uuidv7.js';

const today = () => new Date().toISOString().slice(0, 10);
const money = value => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = value => {
  if (!value) return '—';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text;
  const y = date.getUTCFullYear(), m = String(date.getUTCMonth() + 1).padStart(2, '0'), d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const blankPayment = () => ({ id: uuidv7(), paidOn: today(), payerType: '对公', payerAccount: '', payee: '', amount: '', voucherType: '', note: '' });
const blankInvoice = () => ({ id: uuidv7(), status: '已开票', amount: '', issuedOn: today(), invoiceNumber: '', note: '' });
const attachmentUrl = (orderId, attachmentId) => `/api/production-orders/${encodeURIComponent(orderId)}/attachments/${encodeURIComponent(attachmentId)}`;

export default function ProductionFinancePage({ user, order, onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [payment, setPayment] = useState(blankPayment);
  const [paymentFile, setPaymentFile] = useState(null);
  const [paymentFileKey, setPaymentFileKey] = useState(0);
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [invoice, setInvoice] = useState(blankInvoice);
  const [invoiceFile, setInvoiceFile] = useState(null);
  const [invoiceFileKey, setInvoiceFileKey] = useState(0);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const canEdit = user?.role === 'admin';
  const currency = data?.currency || order?.currency || 'CNY';

  const load = () => {
    setError('');
    api.productionFinance(order.id).then(setData).catch(e => setError(e.message));
  };
  useEffect(load, [order.id]);

  const addPayment = async event => {
    event.preventDefault();
    if (!canEdit || paymentBusy) return;
    setPaymentBusy(true); setError(''); setNotice('');
    try {
      const result = await api.createProductionPayment(order.id, payment);
      const created = result.after || result;
      let uploadError = '';
      if (paymentFile) {
        try { await api.uploadProductionAttachment(order.id, paymentFile, { category: '付款凭证', refId: created.id }); }
        catch (e) { uploadError = e.message; }
      }
      setPayment(blankPayment()); setPaymentFile(null); setPaymentFileKey(key => key + 1);
      load(); onChanged?.();
      if (uploadError) setNotice(`付款已登记，但凭证上传失败：${uploadError}`);
    } catch (e) { setError(e.message); } finally { setPaymentBusy(false); }
  };

  const addInvoice = async event => {
    event.preventDefault();
    if (!canEdit || invoiceBusy) return;
    setInvoiceBusy(true); setError(''); setNotice('');
    try {
      const result = await api.createProductionInvoice(order.id, invoice);
      const created = result.after || result;
      let uploadError = '';
      if (invoiceFile) {
        try { await api.uploadProductionAttachment(order.id, invoiceFile, { category: '发票', refId: created.id }); }
        catch (e) { uploadError = e.message; }
      }
      setInvoice(blankInvoice()); setInvoiceFile(null); setInvoiceFileKey(key => key + 1);
      load(); onChanged?.();
      if (uploadError) setNotice(`发票已登记，但附件上传失败：${uploadError}`);
    } catch (e) { setError(e.message); } finally { setInvoiceBusy(false); }
  };

  if (!data) return <div className="card pow-card">
    {error
      ? <p className="error-text" role="alert">{error} <button type="button" className="btn small" onClick={load}>重新读取</button></p>
      : <p className="hint">正在读取付款与发票…</p>}
  </div>;

  return <div className="pow-fin">
    {notice && <p className="error-text" role="alert">{notice}</p>}
    {error && <p className="error-text" role="alert">{error}</p>}

    <section className="card pow-card">
      <div className="pow-fin-head">
        <h3>付款与发票汇总</h3>
        <span className={'pow-status' + (data.invoiceStatus === '已开票' ? ' is-done' : '')}>{data.invoiceStatus}</span>
      </div>
      <div className="pow-fin-summary">
        <div><span>订单总金额</span><strong>{currency} {money(data.orderTotal)}</strong></div>
        <div><span>累计已付款</span><strong>{currency} {money(data.paidTotal)}</strong></div>
        <div><span>剩余应付款</span><strong>{currency} {money(data.remainingTotal)}</strong></div>
        <div><span>已开票金额</span><strong>{currency} {money(data.invoicedTotal)}</strong></div>
      </div>
      <p className="hint">发票金额不计入已付款；累计已付款只统计已确认并关联本订单的付款记录。</p>
    </section>

    <section className="card pow-card">
      <div className="pow-card__head">
        <h3>付款记录</h3>
        <span className="pow-card__hint">共 {data.paymentCount} 笔 · 累计 {currency} {money(data.paidTotal)}</span>
      </div>
      {data.payments.length === 0 ? <p className="hint">暂无付款记录。</p> : <div className="table-scroll">
        <table className="table">
          <thead><tr><th>付款日期</th><th>付款主体</th><th>付款账户</th><th>收款方</th><th className="pow-num">付款金额</th><th>凭证</th><th>备注</th><th>状态</th></tr></thead>
          <tbody>{data.payments.map(row => <tr key={row.id}>
            <td>{shortDate(row.paidOn)}</td>
            <td>{row.payerType}</td>
            <td>{row.payerAccount || '—'}</td>
            <td>{row.payee}</td>
            <td className="pow-num"><strong>{currency} {money(row.amount)}</strong></td>
            <td>{row.attachmentId ? <a href={attachmentUrl(order.id, row.attachmentId)}>查看凭证</a> : (row.voucherType || '—')}</td>
            <td>{row.note || '—'}</td>
            <td>{row.status}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {canEdit && <form className="pow-fields pow-fin-form" onSubmit={addPayment}>
        <div className="field"><label>付款日期</label><input type="date" required value={payment.paidOn} onChange={e => setPayment({ ...payment, paidOn: e.target.value })} /></div>
        <div className="field"><label>付款主体</label><select value={payment.payerType} onChange={e => setPayment({ ...payment, payerType: e.target.value })}><option>对公</option><option>个人</option></select></div>
        <div className="field"><label>付款账户</label><input value={payment.payerAccount} maxLength={120} placeholder="如：公司基本户 / 个人卡号后四位" onChange={e => setPayment({ ...payment, payerAccount: e.target.value })} /></div>
        <div className="field"><label>收款方</label><input required maxLength={120} value={payment.payee} placeholder="工厂或收款单位" onChange={e => setPayment({ ...payment, payee: e.target.value })} /></div>
        <div className="field"><label>付款金额（{currency}）</label><input type="number" required min="0.01" step="0.01" value={payment.amount} onChange={e => setPayment({ ...payment, amount: e.target.value })} /></div>
        <div className="field"><label>凭证类型</label><select value={payment.voucherType} onChange={e => setPayment({ ...payment, voucherType: e.target.value })}><option value="">未上传</option><option>银行回单</option><option>银行流水</option><option>转账截图</option></select></div>
        <div className="field"><label>凭证文件</label><input key={paymentFileKey} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/avif" onChange={e => setPaymentFile(e.target.files?.[0] || null)} /></div>
        <div className="field"><label>备注</label><input value={payment.note} maxLength={2000} onChange={e => setPayment({ ...payment, note: e.target.value })} /></div>
        <div className="field pow-fin-submit"><button className="btn primary" disabled={paymentBusy}>{paymentBusy ? '保存中…' : '＋ 新增付款'}</button></div>
      </form>}
      {!canEdit && <p className="hint">仅管理员可登记付款。</p>}
    </section>

    <section className="card pow-card">
      <div className="pow-card__head">
        <h3>发票记录</h3>
        <span className="pow-card__hint">共 {data.invoiceCount} 张 · 已开票 {currency} {money(data.invoicedTotal)}</span>
      </div>
      {data.invoices.length === 0 ? <p className="hint">暂无发票记录。</p> : <div className="table-scroll">
        <table className="table">
          <thead><tr><th>发票状态</th><th className="pow-num">发票金额</th><th>开票日期</th><th>发票号码</th><th>附件</th><th>备注</th></tr></thead>
          <tbody>{data.invoices.map(row => <tr key={row.id}>
            <td>{row.status}</td>
            <td className="pow-num"><strong>{currency} {money(row.amount)}</strong></td>
            <td>{row.issuedOn ? shortDate(row.issuedOn) : '—'}</td>
            <td>{row.invoiceNumber || '—'}</td>
            <td>{row.attachmentId ? <a href={attachmentUrl(order.id, row.attachmentId)}>查看发票</a> : '—'}</td>
            <td>{row.note || '—'}</td>
          </tr>)}</tbody>
        </table>
      </div>}
      {canEdit && <form className="pow-fields pow-fin-form" onSubmit={addInvoice}>
        <div className="field"><label>发票状态</label><select value={invoice.status} onChange={e => setInvoice({ ...invoice, status: e.target.value })}><option>未开票</option><option>部分开票</option><option>已开票</option></select></div>
        <div className="field"><label>发票金额（{currency}）</label><input type="number" min="0" step="0.01" value={invoice.amount} onChange={e => setInvoice({ ...invoice, amount: e.target.value })} /></div>
        <div className="field"><label>开票日期</label><input type="date" value={invoice.issuedOn} onChange={e => setInvoice({ ...invoice, issuedOn: e.target.value })} /></div>
        <div className="field"><label>发票号码</label><input maxLength={120} value={invoice.invoiceNumber} onChange={e => setInvoice({ ...invoice, invoiceNumber: e.target.value })} /></div>
        <div className="field"><label>发票文件</label><input key={invoiceFileKey} type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/avif" onChange={e => setInvoiceFile(e.target.files?.[0] || null)} /></div>
        <div className="field pow-span-2"><label>备注</label><input value={invoice.note} maxLength={2000} onChange={e => setInvoice({ ...invoice, note: e.target.value })} /></div>
        <div className="field pow-fin-submit"><button className="btn primary" disabled={invoiceBusy}>{invoiceBusy ? '保存中…' : '＋ 新增发票'}</button></div>
      </form>}
      {!canEdit && <p className="hint">仅管理员可登记发票。</p>}
    </section>
  </div>;
}
