import React, { useCallback, useEffect, useRef, useState } from 'react';
import { adminFetch, api } from '../api.js';
import { formatCents } from '../storefront-cart.js';
import { uuidv7 } from '../uuidv7.js';
import {openOrderOnDoubleClick} from '../orderInteractions.js';

// 状态文案与色调：与后端 storefront_orders.status 一一对应
const STATUS = {
  submitted: ['待报价', 'warn'],
  quoted: ['待客户确认', 'info'],
  accepted: ['待预占库存', 'info'],
  allocated: ['待收款', 'warn'],
  partially_paid: ['部分收款', 'warn'],
  paid: ['待发货', 'danger'],
  partially_shipped: ['部分发货', 'warn'],
  shipped: ['已发货', 'ok'],
  delivered: ['已完成', 'mute'],
  cancelled: ['已取消', 'mute'],
  declined: ['客户已拒绝', 'mute'],
};

const TABS = [
  ['all', '全部订单', 'total'],
  ['pending_quote', '待报价', 'pendingQuote'],
  ['pending_confirm', '待客户确认', 'pendingConfirm'],
  ['pending_alloc', '待预占', 'pendingAlloc'],
  ['pending_pay', '待收款', 'pendingPay'],
  ['pending_ship', '待发货', 'pendingShip'],
  ['shipped', '已发货', 'shipped'],
  ['done', '已完成', 'done'],
  ['after', '退款/售后', 'after'],
  ['closed', '已关闭', 'closed'],
];

const IMG_LETTER = row => String((row.items || [])[0]?.productName || '商').trim().slice(0, 1);

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(currency, minor) {
  return `${currency || ''} ${formatCents(String(minor ?? '0'))}`.trim();
}

// 商品单价在订单快照里是十进制金额字符串（如 "145000.00"），不是分
function unitPrice(currency, price) {
  const value = String(price ?? '').trim();
  return value ? `${currency || ''} ${value}`.trim() : '—';
}

// uuidv7 前缀是时间戳，前 12 位在同一批订单里几乎一样；取尾部才能唯一区分
function shortId(id) {
  const value = String(id || '').replace(/-/g, '');
  return (value.length > 12 ? value.slice(-12) : value).toUpperCase();
}

function stamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function Badge({ status }) {
  const [label, tone] = STATUS[status] || [status || '—', 'mute'];
  return <span className={'shop-badge is-' + tone}>{label}</span>;
}

const emptyCounts = {};
const componentLabel={body:'车体（不含电池）',battery:'电池',accessory:'配件'};
function remainingParcelItems(order,component){
 return (order.orderLines||[]).filter(i=>i.kind==='vehicle'?component!=='accessory':component==='accessory').map(i=>{
 const sent=(order.parcels||[]).filter(p=>p.component===component).flatMap(p=>p.items||[]).filter(x=>x.itemId===i.id).reduce((n,x)=>n+Number(x.quantity),0);
 return {itemId:i.id,sku:i.sku,remaining:Math.max(0,Number(i.quantity)-sent),quantity:''};
 }).filter(i=>i.remaining>0);
}
function shipForm(order){
 const component=['body','battery','accessory'].find(x=>remainingParcelItems(order,x).length)||'body';
 return {type:'ship',orderId:order.id,parcelId:uuidv7(),component,carrier:'',trackingNo:'',batteryApproved:false,order,items:remainingParcelItems(order,component)};
}

export default function StorefrontOrdersAdmin({ active = true, onDirtyChange, onGotoReviews }) {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState(emptyCounts);
  const [reviewPending, setReviewPending] = useState(0);
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [keyword, setKeyword] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [expanded, setExpanded] = useState('');
  const [form, setForm] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadError, setLoadError] = useState('');
  const loadVersion = useRef(0);

  // 搜索输入防抖，避免每敲一个字打一次接口
  useEffect(() => {
    const timer = setTimeout(() => { setKeyword(query.trim()); setPage(1); }, 320);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true);
    try {
      const data = await api.storefrontOrders({ page, status: tab, q: keyword, from: range.from, to: range.to });
      if (version !== loadVersion.current) return;
      setRows(Array.isArray(data.items) ? data.items : []);
      setHasMore(Boolean(data.hasMore));
      setCounts(data.counts || emptyCounts);
      setLoadError('');
    } catch (e) {
      if (version === loadVersion.current) { setLoadError(e.message); throw e; }
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, [page, tab, keyword, range]);

  useEffect(() => { if (active) load().catch(() => {}); }, [active, load]);
  useEffect(() => () => { loadVersion.current++; }, []);

  useEffect(() => {
    if (!active) return;
    adminFetch('/api/warehouses')
      .then(r => { if (!r.ok) throw Error('仓库读取失败'); return r.json(); })
      .then(list => setWarehouses((list || []).filter(w => w.status === '启用')))
      .catch(e => setError(e.message));
  }, [active]);

  // 待回复评价：给交易页一个跳转到评价管理的入口
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    api.storefrontReviews({ page: 1, status: 'pending' })
      .then(result => { if (!cancelled) setReviewPending(num(result?.counts?.pending)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [active]);

  useEffect(() => { onDirtyChange?.(Boolean(form)); }, [form, onDirtyChange]);

  const post = async (url, body, label) => {
    const response = await adminFetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw Error(data?.error || `${label}失败`);
    return data;
  };

  const run = async (action, label) => {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await action();
      setForm(null);
      await load().catch(() => {});
      setNotice(`${label}已保存，列表已刷新。`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // ---- 各类业务动作 ----
  const submitQuote = () => run(() => post(`/api/storefront/orders/${encodeURIComponent(form.orderId)}/quote`, {
    id: form.id, expectedRevision: form.expectedRevision, shipping: form.shipping, tax: form.tax, note: form.note,
  }, '报价'), '报价');

  const submitAllocation = () => run(() => post(`/api/storefront/orders/${encodeURIComponent(form.orderId)}/allocate`, {
    items: form.items.map(item => ({ itemId: item.itemId, warehouseId: item.warehouseId })),
  }, '预占'), '库存预占');

  const submitPayment = () => run(() => post(`/api/storefront/orders/${encodeURIComponent(form.orderId)}/payments`, form, '收款登记'), '收款登记');

  const submitReversal = () => run(() => post(`/api/storefront/orders/${encodeURIComponent(form.orderId)}/payments/${encodeURIComponent(form.paymentId)}/reverse`, form, '收款更正'), '收款更正');

  const submitShip = () => run(() => post(`/api/storefront/orders/${encodeURIComponent(form.orderId)}/ship`, { parcelId:form.parcelId,component:form.component,carrier:form.carrier,trackingNo:form.trackingNo,batteryApproved:form.batteryApproved,items:form.items.filter(i=>Number(i.quantity)>0).map(i=>({itemId:i.itemId,quantity:Number(i.quantity)})) }, '发运'), '发运出库');

  const submitCancel = () => run(() => post(`/api/storefront/orders/${encodeURIComponent(form.orderId)}/cancel`, { reason: form.reason }, '取消'), '取消订单');

  const submitReturnReview = () => run(() => post(`/api/storefront/returns/${encodeURIComponent(form.returnId)}/review`, { decision: form.decision, note: form.note }, '退货审核'), form.decision === 'approved' ? '批准退货' : '驳回退货');

  const submitReturnReceipt = () => run(() => post(`/api/storefront/returns/${encodeURIComponent(form.returnId)}/receive`, {
    id: form.id,
    note: form.note,
    confirmedSaleable: form.confirmedSaleable,
    items: form.items.filter(i => Number(i.quantity) > 0).map(i => ({
      returnItemId: i.returnItemId,
      quantity: Number(i.quantity),
      disposition: i.disposition,
      warehouseId: i.disposition === 'restocked' ? i.warehouseId : null,
    })),
  }, '退货收货'), '退货收货');

  const submitRestock = () => run(() => post(`/api/storefront/return-receipt-items/${encodeURIComponent(form.receiptItemId)}/restock`, {
    ...form, quantity: Number(form.quantity),
  }, '退货入库'), '退货入库');

  const submitDisposal = () => run(() => post(`/api/storefront/return-receipt-items/${encodeURIComponent(form.receiptItemId)}/dispose`, {
    ...form, quantity: Number(form.quantity),
  }, '退货处置'), '退货处置');

  const submitRefund = () => run(() => post(`/api/storefront/returns/${encodeURIComponent(form.returnId)}/refunds`, form, '退款登记'), '退款登记');

  const submitRefundReversal = () => run(() => post(`/api/storefront/returns/${encodeURIComponent(form.returnId)}/refunds/${encodeURIComponent(form.refundId)}/reverse`, form, '退款更正'), '退款更正');

  const submitCancelRefund = () => run(() => post(`/api/storefront/orders/${encodeURIComponent(form.orderId)}/cancel-refunds`, form, '取消退款登记'), '取消退款登记');

  const submitCancelRefundReversal = () => run(() => post(`/api/storefront/orders/${encodeURIComponent(form.orderId)}/cancel-refunds/${encodeURIComponent(form.refundId)}/reverse`, form, '取消退款更正'), '取消退款更正');

  const reset = () => { setQuery(''); setKeyword(''); setRange({ from: '', to: '' }); setTab('all'); setPage(1); setError(''); setNotice(''); };

  const totalCount = num(counts.total);
  const toReview = reviewPending;
  const tips = [];
  if (num(counts.pendingQuote)) tips.push(<span key="quote">有 <b>{counts.pendingQuote}</b> 单待报价，客户还在等回音。<button type="button" className="shop-tips__link" onClick={() => { setTab('pending_quote'); setPage(1); }}>去处理 →</button></span>);
  if (num(counts.pendingShip)) tips.push(<span key="ship">有 <b>{counts.pendingShip}</b> 单已收款待发货。<button type="button" className="shop-tips__link" onClick={() => { setTab('pending_ship'); setPage(1); }}>去发货 →</button></span>);
  if (toReview > 0) tips.push(<span key="review">有 <b>{toReview}</b> 条买家评价待回复。<button type="button" className="shop-tips__link" onClick={() => onGotoReviews?.()}>去评价管理 →</button></span>);

  const primaryAction = order => {
    const status = order.status;
    if (['submitted', 'quoted', 'declined'].includes(status)) {
      return <button type="button" className="shop-link is-strong" disabled={busy} onClick={() => setForm({ type: 'quote', orderId: order.id, id: uuidv7(), expectedRevision: order.quote?.revision || 0, shipping: '', tax: '', note: '' })}>{order.quote ? '重新报价' : '填写报价'}</button>;
    }
    if (status === 'accepted') {
      return <button type="button" className="shop-link is-strong" disabled={busy} onClick={() => setForm({ type: 'allocation', orderId: order.id, items: (order.allocationItems || []).map(i => ({ itemId: i.id, sku: i.sku, quantity: i.quantity, warehouseId: '' })) })}>预占库存</button>;
    }
    if (['allocated', 'partially_paid'].includes(status)) {
      return <button type="button" className="shop-link is-strong" disabled={busy} onClick={() => setForm({ type: 'payment', orderId: order.id, id: uuidv7(), amount: '', method: 'bank_transfer', reference: '', receivedOn: '', note: '', verified: false })}>登记收款</button>;
    }
    if (['paid','partially_shipped'].includes(status)) {
      return <button type="button" className="shop-link is-strong" disabled={busy} onClick={() => setForm(shipForm(order))}>登记包裹发运</button>;
    }
    return null;
  };

  return <>
    <section className="card shop-grid">
      <div className="shop-grid__tabs">
        {TABS.map(([key, label, counter]) => (
          <button type="button" key={key} className={'shop-grid__tab' + (tab === key ? ' is-active' : '')} onClick={() => { setTab(key); setPage(1); setExpanded(''); }}>
            {label}<em>{(num(counts[counter]) || 0).toLocaleString()}</em>
          </button>
        ))}
        <div className="shop-grid__tabs-right">
          <input type="search" className="shop-grid__search" placeholder="搜索订单号 / 买家 / 商品" value={query} onChange={e => setQuery(e.target.value)} aria-label="搜索订单" />
          <button type="button" className="btn small" onClick={reset}>重置</button>
        </div>
      </div>

      <div className="shop-grid__bar">
        <span className="shop-grid__filter">下单时间</span>
        <input type="date" value={range.from} onChange={e => { setRange({ ...range, from: e.target.value }); setPage(1); }} aria-label="下单开始日期" />
        <span className="shop-grid__filter">至</span>
        <input type="date" value={range.to} onChange={e => { setRange({ ...range, to: e.target.value }); setPage(1); }} aria-label="下单结束日期" />
        <span className="shop-grid__bar-sep" />
        <button type="button" className="btn small" disabled={loading || busy} onClick={() => load().catch(() => {})}>{loading ? '读取中…' : '刷新'}</button>
        <span className="shop-grid__count">共 {totalCount.toLocaleString()} 单{keyword || range.from || range.to ? ` · 当前筛选 ${rows.length} 单` : ''}</span>
      </div>

      {tips.length > 0 && <div className="shop-tips">{tips}</div>}
      {error && <div className="shop-tips shop-tips--error" role="alert">{error}</div>}
      {notice && <div className="shop-tips shop-tips--note" role="status">{notice}</div>}
      {loadError && <div className="shop-tips shop-tips--error" role="alert">订单读取失败：{loadError} <button type="button" className="shop-tips__link" onClick={() => load().catch(() => {})}>重试</button></div>}

      {rows.length ? (
        <div className="shop-grid__scroll">
          <table className="shop-grid__table shop-trade__table">
            <colgroup>
              <col style={{ width: 'auto', minWidth: 360 }} />
              <col style={{ width: 172 }} />
              <col style={{ width: 158 }} />
              <col style={{ width: 104 }} />
              <col style={{ width: 132 }} />
            </colgroup>
            <thead>
              <tr>
                <th>订单信息</th>
                <th>金额</th>
                <th>买家 / 收货人</th>
                <th>订单状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(order => {
                const open = expanded === order.id;
                const refunded = num(order.refundedMinor);
                const paid = num(order.paidMinor);
                const pendingReturns = (order.returns || []).filter(r => r.status === 'pending').length;
                return (
                  <React.Fragment key={order.id}>
                    <tr className={(open ? 'is-open ' : '') + 'order-openable'} title="双击打开订单详情" onDoubleClick={event=>openOrderOnDoubleClick(event,()=>setExpanded(open ? '' : order.id))}>
                      <td>
                        <div className="shop-trade__order">
                          <button type="button" className="shop-trade__code" onClick={() => setExpanded(open ? '' : order.id)} title={order.id}>
                            {shortId(order.id)}<span className={'shop-grid__caret is-active'}>{open ? '▾' : '▸'}</span>
                          </button>
                          <span className="shop-grid__time">{stamp(order.createdAt)}</span>
                          {pendingReturns > 0 && <span className="shop-badge is-danger">有退货待审</span>}
                        </div>
                        <div className="shop-trade__lines">
                          {(order.items || []).map(line => (
                            <div className="shop-trade__line" key={line.sku + line.currency}>
                              <span className="shop-grid__thumb shop-grid__thumb--letter">{String(line.productName || '商').slice(0, 1)}</span>
                              <div className="shop-grid__meta">
                                <b title={line.productName}>{line.productName || '未命名商品'}</b>
                                <span className="shop-grid__id">{line.sku}{line.spec ? ` · ${line.spec}` : ''}{line.color ? ` · ${line.color}` : ''}</span>
                              </div>
                              <span className="shop-trade__qty">{line.quantity} × {unitPrice(line.currency, line.unitPrice)}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="shop-grid__price">
                        <div>{money(order.currency, order.subtotalMinor)}<span className="shop-grid__muted"> 商品</span></div>
                        {paid > 0 && <div className="shop-trade__paid">{money(order.currency, order.paidMinor)}<span className="shop-grid__muted"> 已收</span></div>}
                        {refunded > 0 && <div className="shop-trade__refund">-{money(order.currency, order.refundedMinor)}<span className="shop-grid__muted"> 已退</span></div>}
                        {order.quote && <div className="shop-grid__muted">报价合计 {money(order.currency, order.quote.totalMinor)}</div>}
                      </td>
                      <td>
                        <div className="shop-trade__buyer">{order.username || '—'}</div>
                        <div className="shop-grid__muted">{order.delivery?.name} · {order.delivery?.country}</div>
                        <div className="shop-grid__muted">{order.delivery?.phone}</div>
                      </td>
                      <td><Badge status={order.status} />{order.shipment && <div className="shop-grid__muted" style={{ marginTop: 4 }}>{order.shipment.carrier}</div>}</td>
                      <td>
                        <div className="shop-grid__ops">
                          {primaryAction(order)}
                          <button type="button" className="shop-link" onClick={() => setExpanded(open ? '' : order.id)}>{open ? '收起详情' : '订单详情'}</button>
                          {['submitted', 'quoted', 'accepted', 'allocated', 'partially_paid', 'paid', 'declined'].includes(order.status) && (
                            <button type="button" className="shop-link" disabled={busy} onClick={() => setForm({ type: 'cancel', orderId: order.id, reason: '', hasPayment: num(order.paidMinor) > 0 })}>取消订单</button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr className="shop-trade__detail-row">
                        <td colSpan={5}>
                          <OrderDetail order={order} warehouses={warehouses} busy={busy} setForm={setForm} onReviewReturn={(r, decision) => setForm({ type: 'returnReview', returnId: r.id, decision, note: '' })} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="shop-empty">{loading ? '正在读取订单…' : totalCount ? '当前筛选条件下没有订单，试试切换状态标签或清空时间范围。' : '还没有官网订单。买家在官网商城提交订单申请后会出现在这里。'}</div>
      )}

      <div className="shop-grid__foot">
        <span className="shop-grid__picked">{rows.length ? `本页 ${rows.length} 单` : ''}</span>
        <div className="shop-pager">
          <span>共 {totalCount.toLocaleString()} 单</span>
          <button type="button" className="btn small" disabled={page <= 1 || loading || busy} onClick={() => { setRows([]); setExpanded(''); setPage(p => p - 1); }}>上一页</button>
          <span>第 {page} 页</span>
          <button type="button" className="btn small" disabled={!hasMore || loading || busy} onClick={() => { setRows([]); setExpanded(''); setPage(p => p + 1); }}>下一页</button>
        </div>
      </div>
    </section>

    {form && (
      <div className="mask" role="presentation" onClick={e => { if (e.target === e.currentTarget && !busy) setForm(null); }}>
        <div className="modal shop-modal" role="dialog" aria-modal="true" aria-label="订单操作">
          <div className="modal-head"><h3>{FORM_TITLES[form.type] || '订单操作'}</h3><button type="button" className="btn small" disabled={busy} onClick={() => setForm(null)}>关闭</button></div>
          <div className="modal-body">
            {error && <p className="shop-modal__error" role="alert">{error}</p>}
            {renderForm({ form, setForm, warehouses, busy, actions: { submitQuote, submitAllocation, submitPayment, submitReversal, submitShip, submitCancel, submitReturnReview, submitReturnReceipt, submitRestock, submitDisposal, submitRefund, submitRefundReversal, submitCancelRefund, submitCancelRefundReversal } })}
          </div>
        </div>
      </div>
    )}
  </>;
}

const FORM_TITLES = {
  quote: '核实费用后报价',
  allocation: '选择仓库并预占库存',
  payment: '登记线下收款',
  reversal: '更正错误收款登记',
  ship: '确认发货并出库',
  cancel: '取消订单',
  returnReview: '退货申请审核',
  returnReceipt: '登记实际退货收货',
  restock: '检查后入库',
  disposal: '登记退货处置',
  refund: '登记线下退款',
  refundReversal: '更正错误退款登记',
  cancelRefund: '登记取消退款',
  cancelRefundReversal: '更正取消退款登记',
};

function Row({ label, children }) {
  return <div className="shop-form__row"><label>{label}</label>{children}</div>;
}

function renderForm({ form, setForm, warehouses, busy, actions }) {
  const patch = next => setForm({ ...form, ...next });
  const ok = (label) => <button type="button" className="btn primary" disabled={busy} onClick={actions[FORM_ACTIONS[form.type]]}>{label}</button>;

  if (form.type === 'quote') return <>
    <p className="hint" />
    <Row label="运费"><input type="number" min="0" step="0.01" value={form.shipping} onChange={e => patch({ shipping: e.target.value })} /></Row>
    <Row label="另加税费"><input type="number" min="0" step="0.01" value={form.tax} onChange={e => patch({ tax: e.target.value })} /></Row>
    <Row label="报价说明"><input maxLength={2000} value={form.note} onChange={e => patch({ note: e.target.value })} placeholder="交期、运费口径等" /></Row>
    <div className="shop-modal__foot">{ok('发送报价')}</div>
  </>;

  if (form.type === 'allocation') return <>
    <p className="hint" />
    {form.items.map((item, index) => (
      <Row key={item.itemId} label={`${item.sku} × ${item.quantity}`}>
        <select value={item.warehouseId} onChange={e => patch({ items: form.items.map((x, i) => i === index ? { ...x, warehouseId: e.target.value } : x) })}>
          <option value="">选择仓库</option>
          {warehouses.filter(w => ['国内仓', '海外仓'].includes(w.kind)).map(w => <option key={w.id} value={w.id}>{w.name} · {w.kind}</option>)}
        </select>
      </Row>
    ))}
    <div className="shop-modal__foot">{ok('确认预占')}</div>
  </>;

  if (form.type === 'payment') return <>
    <p className="hint" />
    <Row label="金额"><input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => patch({ amount: e.target.value })} /></Row>
    <Row label="方式"><select value={form.method} onChange={e => patch({ method: e.target.value })}><option value="bank_transfer">银行转账</option><option value="cash">现金</option><option value="other">其他</option></select></Row>
    <Row label="收款凭据号"><input maxLength={200} value={form.reference} onChange={e => patch({ reference: e.target.value })} /></Row>
    <Row label="到账日期"><input type="date" value={form.receivedOn} onChange={e => patch({ receivedOn: e.target.value })} /></Row>
    <Row label="备注"><input maxLength={2000} value={form.note} onChange={e => patch({ note: e.target.value })} /></Row>
    <label className="shop-form__check"><input type="checkbox" checked={form.verified} onChange={e => patch({ verified: e.target.checked })} /> 我已核实实际到账</label>
    <div className="shop-modal__foot">{ok('确认登记')}</div>
  </>;

  if (form.type === 'reversal') return <>
    <p className="hint" />
    <Row label="更正原因"><input maxLength={2000} value={form.reason} onChange={e => patch({ reason: e.target.value })} /></Row>
    <div className="shop-modal__foot">{ok('确认更正')}</div>
  </>;

  if (form.type === 'ship') return <>
    <p className="hint">按包裹登记；整车车体与电池分别发运，全部组件发出后扣减该商品行整车库存。</p>
    <Row label="包裹类型"><select value={form.component} onChange={e=>patch({component:e.target.value,items:remainingParcelItems(form.order,e.target.value),batteryApproved:false})}>{Object.entries(componentLabel).map(([key,label])=><option key={key} value={key} disabled={!remainingParcelItems(form.order,key).length}>{label}</option>)}</select></Row>
    {form.items.map((i,index)=><Row key={i.itemId} label={i.sku+'（剩余 '+i.remaining+'）'}><input type="number" min="0" max={i.remaining} value={i.quantity} onChange={e=>patch({items:form.items.map((x,j)=>j===index?{...x,quantity:e.target.value}:x)})}/></Row>)}
    {form.component==='battery'&&<label className="shop-form__check"><input type="checkbox" checked={form.batteryApproved} onChange={e=>patch({batteryApproved:e.target.checked})}/>已核实承运商接受符合要求的电池运输</label>}
    <Row label="承运商"><input maxLength={120} value={form.carrier} onChange={e => patch({ carrier: e.target.value })} placeholder="DHL / 顺丰 / 海运…" /></Row>
    <Row label="运单号"><input maxLength={120} value={form.trackingNo} onChange={e => patch({ trackingNo: e.target.value })} /></Row>
    <div className="shop-modal__foot">{ok('确认发货')}</div>
  </>;

  if (form.type === 'cancel') return <>
    {form.hasPayment ? <p className="hint">该订单已登记收款。取消后请在订单详情里登记「取消退款」退回款项。</p> : <p className="hint" />}
    <Row label="取消原因"><input maxLength={2000} value={form.reason} onChange={e => patch({ reason: e.target.value })} /></Row>
    <div className="shop-modal__foot">{ok('确认取消')}</div>
  </>;

  if (form.type === 'returnReview') return <>
    <p className="hint" />
    <Row label="审核结论"><select value={form.decision} onChange={e => patch({ decision: e.target.value })}><option value="approved">批准</option><option value="rejected">不批准</option></select></Row>
    <Row label="审核说明"><input maxLength={2000} value={form.note} onChange={e => patch({ note: e.target.value })} /></Row>
    <div className="shop-modal__foot">{ok('提交审核')}</div>
  </>;

  if (form.type === 'returnReceipt') return <>
    <p className="hint" />
    {form.items.map((item, index) => (
      <div className="shop-form__row" key={item.returnItemId}>
        <label>{item.sku} · 剩余 {item.remaining}</label>
        <div className="row" style={{ gap: 8 }}>
          <input aria-label="实际收到数量" type="number" min="0" max={item.remaining} step="1" style={{ width: 80 }} value={item.quantity} onChange={e => patch({ items: form.items.map((x, i) => i === index ? { ...x, quantity: e.target.value } : x) })} />
          <select value={item.disposition} onChange={e => patch({ items: form.items.map((x, i) => i === index ? { ...x, disposition: e.target.value, warehouseId: '' } : x) })}>
            <option value="not_restocked">暂不入库</option>
            <option value="restocked">已检验可售，入库</option>
          </select>
          {item.disposition === 'restocked' && Number(item.quantity) > 0 && (
            <select value={item.warehouseId} onChange={e => patch({ items: form.items.map((x, i) => i === index ? { ...x, warehouseId: e.target.value } : x) })}>
              <option value="">选择入库仓库</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} · {w.kind}</option>)}
            </select>
          )}
        </div>
      </div>
    ))}
    <Row label="收货备注"><input maxLength={2000} value={form.note} onChange={e => patch({ note: e.target.value })} /></Row>
    {form.items.some(i => i.disposition === 'restocked' && Number(i.quantity) > 0) && <label className="shop-form__check"><input type="checkbox" checked={form.confirmedSaleable} onChange={e => patch({ confirmedSaleable: e.target.checked })} /> 我已检查入库商品可售</label>}
    <div className="shop-modal__foot">{ok('确认登记')}</div>
  </>;

  if (form.type === 'restock') return <>
    <p className="hint" />
    <Row label="数量"><input type="number" min="1" max={form.remaining} step="1" value={form.quantity} onChange={e => patch({ quantity: e.target.value })} /></Row>
    <Row label="入库仓库"><select value={form.warehouseId} onChange={e => patch({ warehouseId: e.target.value })}><option value="">选择仓库</option>{warehouses.map(w => <option key={w.id} value={w.id}>{w.name} · {w.kind}</option>)}</select></Row>
    <Row label="检查备注"><input maxLength={2000} value={form.note} onChange={e => patch({ note: e.target.value })} /></Row>
    <label className="shop-form__check"><input type="checkbox" checked={form.confirmedSaleable} onChange={e => patch({ confirmedSaleable: e.target.checked })} /> 我已检查商品可售</label>
    <div className="shop-modal__foot">{ok('确认入库')}</div>
  </>;

  if (form.type === 'disposal') return <>
    <p className="hint" />
    <Row label="数量"><input type="number" min="1" max={form.remaining} step="1" value={form.quantity} onChange={e => patch({ quantity: e.target.value })} /></Row>
    <Row label="处置结果"><select value={form.disposition} onChange={e => patch({ disposition: e.target.value })}><option value="scrapped">已报废</option><option value="returned_to_supplier">已退回供应商</option></select></Row>
    <Row label="处置原因"><input maxLength={2000} value={form.reason} onChange={e => patch({ reason: e.target.value })} /></Row>
    <Row label="凭据/运单号"><input maxLength={200} value={form.reference} onChange={e => patch({ reference: e.target.value })} placeholder={form.disposition === 'returned_to_supplier' ? '退回供应商必填' : '可选'} /></Row>
    <Row label="处置日期"><input type="date" value={form.disposedOn} onChange={e => patch({ disposedOn: e.target.value })} /></Row>
    <label className="shop-form__check"><input type="checkbox" checked={form.confirmed} onChange={e => patch({ confirmed: e.target.checked })} /> 我已确认实际处置</label>
    <div className="shop-modal__foot">{ok('确认登记')}</div>
  </>;

  if (form.type === 'refund' || form.type === 'cancelRefund') return <>
    <p className="hint" />
    <Row label="金额"><input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => patch({ amount: e.target.value })} /></Row>
    <Row label="方式"><select value={form.method} onChange={e => patch({ method: e.target.value })}><option value="bank_transfer">银行转账</option><option value="cash">现金</option><option value="other">其他</option></select></Row>
    <Row label="退款凭据号"><input maxLength={200} value={form.reference} onChange={e => patch({ reference: e.target.value })} /></Row>
    <Row label="退款日期"><input type="date" value={form.refundedOn} onChange={e => patch({ refundedOn: e.target.value })} /></Row>
    <Row label="备注"><input maxLength={2000} value={form.note} onChange={e => patch({ note: e.target.value })} /></Row>
    <label className="shop-form__check"><input type="checkbox" checked={form.verified} onChange={e => patch({ verified: e.target.checked })} /> 我已确认实际退款</label>
    <div className="shop-modal__foot">{ok('确认登记')}</div>
  </>;

  if (form.type === 'refundReversal' || form.type === 'cancelRefundReversal') return <>
    <p className="hint" />
    <Row label="更正原因"><input maxLength={2000} value={form.reason} onChange={e => patch({ reason: e.target.value })} /></Row>
    <div className="shop-modal__foot">{ok('确认更正')}</div>
  </>;

  return null;
}

const FORM_ACTIONS = {
  quote: 'submitQuote',
  allocation: 'submitAllocation',
  payment: 'submitPayment',
  reversal: 'submitReversal',
  ship: 'submitShip',
  cancel: 'submitCancel',
  returnReview: 'submitReturnReview',
  returnReceipt: 'submitReturnReceipt',
  restock: 'submitRestock',
  disposal: 'submitDisposal',
  refund: 'submitRefund',
  refundReversal: 'submitRefundReversal',
  cancelRefund: 'submitCancelRefund',
  cancelRefundReversal: 'submitCancelRefundReversal',
};

function OrderDetail({ order, warehouses, busy, setForm, onReviewReturn }) {
  const refunded = num(order.refundedMinor);
  const paid = num(order.paidMinor);
  const returns = order.returns || [];
  return (
    <div className="shop-trade__detail">
      <div className="shop-trade__col">
        <h5>收货资料</h5>
        <p>{order.delivery?.name} · {order.delivery?.phone}</p>
        <p>{order.delivery?.address}</p>
        <p>{order.delivery?.postalCode} {order.delivery?.city} · {order.delivery?.country}</p>
        <h5>物流</h5>
        {(order.parcels||[]).length?order.parcels.map(p=><div key={p.id}><p>{componentLabel[p.component]} · {p.carrier} · {p.trackingNo}</p><p className="shop-grid__muted">{(p.items||[]).map(i=>i.sku+' × '+i.quantity).join('；')} · 发运 {stamp(p.shippedAt)} · {p.receivedAt?'签收 '+stamp(p.receivedAt):'未签收'}</p></div>):order.shipment ? <><p>{order.shipment.carrier} · {order.shipment.trackingNo}</p><p className="shop-grid__muted">发运 {stamp(order.shipment.shippedAt)}</p></> : <p className="shop-grid__muted">尚未发运</p>}
        {order.receipt && <p className="shop-grid__muted">签收 {stamp(order.receipt.receivedAt)}{order.receipt.note ? ` · ${order.receipt.note}` : ''}</p>}
        {order.cancelReason && <><h5>取消原因</h5><p>{order.cancelReason}</p></>}
        {(order.allocationItems || []).some(i => i.warehouseName) && <><h5>预占仓库</h5><p>{(order.allocationItems || []).map(i => `${i.sku} · ${i.warehouseName || '—'}`).join('；')}</p></>}
      </div>

      <div className="shop-trade__col">
        <h5>报价</h5>
        {order.quote ? <p>运费 {money(order.currency, order.quote.shippingMinor)} · 税费 {money(order.currency, order.quote.taxMinor)} · 合计 <b>{money(order.currency, order.quote.totalMinor)}</b>{order.quote.note ? ` · ${order.quote.note}` : ''}</p> : <p className="shop-grid__muted">尚未报价</p>}
        <h5>收款记录</h5>
        {paid > 0 && <p>已登记收款合计 <b>{money(order.currency, order.paidMinor)}</b>{refunded > 0 && <> · 已退款 {money(order.currency, order.refundedMinor)}</>}</p>}
        {(order.payments || []).length ? (order.payments || []).map(p => (
          <p key={p.id} className="shop-trade__payline">
            {p.receivedOn} · {money(order.currency, p.amountMinor)} · {p.reference} · {p.reversed ? '已更正' : '已登记'}
            {!p.reversed && ['partially_paid', 'paid'].includes(order.status) && <button type="button" className="shop-link" disabled={busy} onClick={() => setForm({ type: 'reversal', orderId: order.id, paymentId: p.id, id: uuidv7(), reason: '' })}>更正</button>}
          </p>
        )) : <p className="shop-grid__muted">还没有收款记录</p>}
        {(order.refunds || []).length > 0 && <>
          <h5>退款记录</h5>
          {(order.refunds || []).map(f => (
            <p key={f.id} className="shop-trade__payline">
              {f.refundedOn} · {money(order.currency, f.amountMinor)} · {f.reference} · {f.returnId ? '' : '取消退款 · '}{f.reversed ? '已更正' : '已登记'}
              {!f.reversed && (f.returnId
                ? <button type="button" className="shop-link" disabled={busy} onClick={() => setForm({ type: 'refundReversal', returnId: f.returnId, refundId: f.id, id: uuidv7(), reason: '' })}>更正</button>
                : <button type="button" className="shop-link" disabled={busy} onClick={() => setForm({ type: 'cancelRefundReversal', orderId: order.id, refundId: f.id, id: uuidv7(), reason: '' })}>更正</button>)}
            </p>
          ))}
        </>}
        {order.status === 'cancelled' && paid > refunded && (
          <div className="shop-trade__inline-ops">
            <button type="button" className="btn small" disabled={busy} onClick={() => setForm({ type: 'cancelRefund', orderId: order.id, id: uuidv7(), amount: '', method: 'bank_transfer', reference: '', refundedOn: '', note: '', verified: false })}>登记取消退款</button>
          </div>
        )}
      </div>

      <div className="shop-trade__col">
        <h5>退货与售后</h5>
        {returns.length ? returns.map(r => {
          const received = (r.items || []).reduce((sum, i) => sum + num(i.receivedQuantity), 0);
          const canReceive = r.status === 'approved' && (r.items || []).some(i => num(i.receivedQuantity) < num(i.quantity));
          return (
            <div className="shop-trade__return" key={r.id}>
              <p>
                <span className={'shop-badge ' + (r.status === 'pending' ? 'is-warn' : r.status === 'approved' ? 'is-ok' : 'is-mute')}>{r.status === 'pending' ? '待审核' : r.status === 'approved' ? '已批准' : '未批准'}</span>
                <span className="shop-grid__muted"> {stamp(r.createdAt)}</span>
              </p>
              <p>{r.reason}</p>
              {(r.items || []).map(i => <p key={i.returnItemId} className="shop-grid__muted">{i.sku} · 申请 {i.quantity} · 已收 {i.receivedQuantity}</p>)}
              {r.reviewNote && <p className="shop-grid__muted">审核说明：{r.reviewNote}</p>}
              {r.status === 'pending' && (
                <div className="shop-trade__inline-ops">
                  <button type="button" className="btn small" disabled={busy} onClick={() => onReviewReturn(r, 'approved')}>批准</button>
                  <button type="button" className="btn small" disabled={busy} onClick={() => onReviewReturn(r, 'rejected')}>不批准</button>
                </div>
              )}
              {canReceive && (
                <div className="shop-trade__inline-ops">
                  <button type="button" className="btn small" disabled={busy} onClick={() => setForm({
                    type: 'returnReceipt',
                    id: uuidv7(),
                    returnId: r.id,
                    note: '',
                    confirmedSaleable: false,
                    items: (r.items || []).filter(i => num(i.receivedQuantity) < num(i.quantity)).map(i => ({ returnItemId: i.returnItemId, sku: i.sku, remaining: num(i.quantity) - num(i.receivedQuantity), quantity: 0, disposition: 'not_restocked', warehouseId: '' })),
                  })}>登记退货收货</button>
                </div>
              )}
              {(r.heldItems || []).map(i => {
                const remaining = num(i.quantity) - num(i.restockedQuantity) - num(i.disposedQuantity);
                if (remaining <= 0) return null;
                return (
                  <div className="shop-trade__inline-ops" key={i.id}>
                    <span className="shop-grid__muted">{i.sku} 待处理 {remaining} 件</span>
                    <button type="button" className="btn small" disabled={busy} onClick={() => setForm({ type: 'restock', id: uuidv7(), receiptItemId: i.id, sku: i.sku, remaining, quantity: 1, warehouseId: '', note: '', confirmedSaleable: false })}>检查后入库</button>
                    <button type="button" className="btn small" disabled={busy} onClick={() => setForm({ type: 'disposal', id: uuidv7(), receiptItemId: i.id, sku: i.sku, remaining, quantity: 1, disposition: 'scrapped', reason: '', reference: '', disposedOn: '', confirmed: false })}>登记处置</button>
                  </div>
                );
              })}
              {r.status === 'approved' && received > 0 && paid > refunded && (
                <div className="shop-trade__inline-ops">
                  <button type="button" className="btn small" disabled={busy} onClick={() => setForm({ type: 'refund', returnId: r.id, id: uuidv7(), amount: '', method: 'bank_transfer', reference: '', refundedOn: '', note: '', verified: false })}>登记退款</button>
                </div>
              )}
            </div>
          );
        }) : <p className="shop-grid__muted">没有退货申请</p>}
        {(order.disposals || []).length > 0 && <>
          <h5>处置记录</h5>
          {(order.disposals || []).map(d => <p key={d.id} className="shop-grid__muted">{d.disposedOn} · {d.sku} · {d.quantity} 件 · {d.disposition === 'scrapped' ? '已报废' : '已退回供应商'} · {d.reason}</p>)}
        </>}
      </div>
    </div>
  );
}
