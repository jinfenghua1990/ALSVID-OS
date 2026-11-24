import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import {createRequestIds} from '../request-ids.js';
import ProductionAttachmentsPage from './ProductionAttachmentsPage.jsx';
import DeliveryPage from './DeliveryPage.jsx';
import ProductionDeliveryItemsPanel from './ProductionDeliveryItemsPanel.jsx';

const tabs = ['订单信息', '发货记录', '附件'];
const DISPATCHED_DELIVERY_STATUSES = new Set(['已交运', '在途', '运输中', '已签收', '已入库', '异常']);
const IN_TRANSIT_DELIVERY_STATUSES = new Set(['在途', '运输中']);
const today = () => new Date().toISOString().slice(0, 10);
const blankItem = () => ({ sku: '', plannedQuantity: 1, unitPrice: '' });
const initial = { factoryId: '', currency: 'CNY', exchangeRate: '1', orderDate: today(), expectedDeliveryDate: '', note: '', items: [blankItem()] };
const amount = value => Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDate = value => {
  if (!value) return '—';
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text;
  // 后端返回 UTC 午夜（如 2026-11-15T00:00:00Z），本地 slice 会减一天；按 UTC 取日期。
  const y = date.getUTCFullYear(), m = String(date.getUTCMonth() + 1).padStart(2, '0'), d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const toForm = order => ({
  ...initial, ...(order || {}),
  orderDate: shortDate(order?.orderDate || initial.orderDate),
  expectedDeliveryDate: order?.expectedDeliveryDate ? shortDate(order.expectedDeliveryDate) : '',
  items: order?.items?.length ? order.items.map(item => ({ ...item })) : order?.sku
    ? [{ sku: order.sku, plannedQuantity: order.plannedQuantity || 1, unitPrice: order.unitPrice ?? order.supplierCost ?? '' }]
    : [blankItem()],
  exchangeRate: order?.exchangeRate ?? (order?.currency === 'CNY' ? 1 : ''),
});

export default function ProductionOrderWorkspace({ user, order, products, factories, onClose, onSaved, onChanged }) {
  const requestIds=useRef(createRequestIds());
  const [tab, setTab] = useState('订单信息');
  const [form, setForm] = useState(() => toForm(order));
  const [saved, setSaved] = useState(order || null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deliveries, setDeliveries] = useState([]);
  const [deliveryItems, setDeliveryItems] = useState({});
  const [finance, setFinance] = useState(null);
  const [parcelOverview, setParcelOverview] = useState(null);
  const [vinRows, setVinRows] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const current = saved || order;

  const vehicleProducts = useMemo(() => products.filter(product => product.kind === 'vehicle' && product.status === '启用'), [products]);
  // 真实数据：颜色在 sku.colorName，规格在 product.specs（sku 上没有 specs 对象）。
  const skuOptions = useMemo(() => vehicleProducts.flatMap(product => {
    const s = product.specs || {};
    const spec = [
      s.frame_material && `车架 ${s.frame_material}`,
      s.rated_power_w && `${s.rated_power_w}W`,
      s.drive_type,
      s.battery_capacity,
      s.range && `续航 ${s.range}`,
      s.transmission_set,
      s.brakes,
    ].filter(Boolean).join(' · ');
    return (product.skus || []).filter(sku => !sku.disabled && sku.enabled !== false).map(sku => ({
      value: sku.sku,
      label: sku.sku,
      product: product.name,
      colorName: sku.colorName || sku.color || '',
      spec,
    }));
  }), [vehicleProducts]);

  const itemTotal = item => Number(item.plannedQuantity || 0) * Number(item.unitPrice || 0);
  const originalTotal = form.items.reduce((sum, item) => sum + itemTotal(item), 0);
  const plannedTotal = form.items.reduce((sum, item) => sum + Number(item.plannedQuantity || 0), 0);
  const isCny = form.currency === 'CNY';
  const rate = isCny ? 1 : Number(form.exchangeRate || 0);
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(order));
  useEffect(() => { if (dirty) window.onbeforeunload = () => ''; else window.onbeforeunload = null; return () => { window.onbeforeunload = null; }; }, [dirty]);
  const refreshDetail = async () => {
    if (!current?.id) {
      setDeliveries([]); setDeliveryItems({}); setFinance(null); setParcelOverview(null); setVinRows([]); setDetailError('');
      return;
    }
    setDetailLoading(true);
    try {
      const results = await Promise.allSettled([
        api.productionDeliveries(current.id),
        api.productionFinance(current.id),
        api.deliveryOverview(current.id),
        api.vins(),
      ]);
      const [deliveriesResult, financeResult, overviewResult, vinsResult] = results;
      if (deliveriesResult.status === 'rejected') throw deliveriesResult.reason;
      const rows = deliveriesResult.value;
      const warnings = [];
      const nextFinance = financeResult.status === 'fulfilled' ? financeResult.value : (warnings.push('付款与发票汇总读取失败'), null);
      const nextOverview = overviewResult.status === 'fulfilled' ? overviewResult.value : (warnings.push('包裹汇总读取失败'), null);
      const nextVins = vinsResult.status === 'fulfilled' ? vinsResult.value : (warnings.push('VIN 关联数据读取失败'), []);
      const itemResults = await Promise.allSettled(rows.map(row => api.productionDeliveryItems(row.id)));
      const pairs = itemResults.map((result, index) => [rows[index].id, result.status === 'fulfilled' ? result.value : []]);
      if (itemResults.some(result => result.status === 'rejected')) warnings.push('部分发货车型明细读取失败');
      setDeliveries(rows); setDeliveryItems(Object.fromEntries(pairs));
      setFinance(nextFinance); setParcelOverview(nextOverview); setVinRows(nextVins); setDetailError(warnings.join('；'));
    } catch (e) {
      setDetailError(e.message || '订单汇总读取失败');
    } finally { setDetailLoading(false); }
  };
  useEffect(() => { refreshDetail(); }, [current?.id]);

  const deliveryStats = useMemo(() => {
    const active = deliveries.filter(row => row.status !== '已取消');
    return {
      count: active.length,
      receiptCount: active.filter(row => Number(row.receivedQuantity || 0) > 0).length,
      planned: active.reduce((sum, row) => sum + Number(row.plannedQuantity || 0), 0),
      shipped: active.filter(row => DISPATCHED_DELIVERY_STATUSES.has(row.status)).reduce((sum, row) => sum + Number(row.plannedQuantity || 0), 0),
      received: active.reduce((sum, row) => sum + Number(row.receivedQuantity || 0), 0),
      inTransit: active.some(row => IN_TRANSIT_DELIVERY_STATUSES.has(row.status)),
      exceptionCount: active.filter(row => row.status === '异常' || row.receiptNote || row.cancelReason).length,
    };
  }, [deliveries]);
  const canEdit = user?.role === 'admin' && (!current || (Number(current.actualQuantity || 0) === 0 && deliveryStats.count === 0));
  const vinByCode = useMemo(() => Object.fromEntries(vinRows.map(row => [row.vin, row])), [vinRows]);
  const itemStats = useMemo(() => {
    const stats = Object.fromEntries((current?.items || []).map(item => [item.sku, { shipped: 0, received: 0, allocated: false }]));
    deliveries.forEach(delivery => {
      if (delivery.status === '已取消') return;
      const items = deliveryItems[delivery.id] || [];
      items.forEach(item => {
        const row = stats[item.sku] || (stats[item.sku] = { shipped: 0, received: 0, allocated: false });
        row.allocated = true;
        if (DISPATCHED_DELIVERY_STATUSES.has(delivery.status)) row.shipped += Number(item.plannedQuantity || 0);
        row.received += Number(item.receivedQuantity || 0);
      });
    });
    return stats;
  }, [current?.items, deliveries, deliveryItems]);
  const componentStats = useMemo(() => {
    const stats = {};
    (parcelOverview?.parcels || []).forEach(parcel => {
      const sku = vinByCode[parcel.vin]?.sku;
      if (!sku || !['车体', '电池'].includes(parcel.componentType)) return;
      const row = stats[sku] || (stats[sku] = {});
      const component = row[parcel.componentType] || { shipped: 0, received: 0, hasData: false };
      component.hasData = true;
      if (['已交运', '运输中', '已签收'].includes(parcel.status)) component.shipped += Number(parcel.quantity || 1);
      if (parcel.status === '已签收') component.received += Number(parcel.quantity || 1);
      row[parcel.componentType] = component;
    });
    return stats;
  }, [parcelOverview, vinByCode]);
  const warehouseSummary = useMemo(() => {
    const rows = {};
    deliveries.filter(row => row.status !== '已取消').forEach(delivery => {
      const key = delivery.warehouse || '未指定仓库';
      const row = rows[key] || { warehouse: key, body: { shipped: 0, received: 0 }, battery: { shipped: 0, received: 0 }, inTransit: 0, hasParcelData: false };
      if (IN_TRANSIT_DELIVERY_STATUSES.has(delivery.status)) row.inTransit += 1;
      (parcelOverview?.parcels || []).filter(parcel => parcel.deliveryId === delivery.id && ['车体', '电池'].includes(parcel.componentType)).forEach(parcel => {
        row.hasParcelData = true;
        const component = row[parcel.componentType === '车体' ? 'body' : 'battery'];
        if (['已交运', '运输中', '已签收'].includes(parcel.status)) component.shipped += Number(parcel.quantity || 1);
        if (parcel.status === '已签收') component.received += Number(parcel.quantity || 1);
      });
      rows[key] = row;
    });
    return Object.values(rows);
  }, [deliveries, parcelOverview]);
  const unlinkedParcelQuantity = useMemo(() => (parcelOverview?.parcels || [])
    .filter(parcel => ['车体', '电池'].includes(parcel.componentType) && !vinByCode[parcel.vin]?.sku)
    .reduce((sum, parcel) => sum + Number(parcel.quantity || 1), 0), [parcelOverview, vinByCode]);
  // 共享生产交付工作区按生产完成与发运/收货情况计算状态。
  const flowStatus = !current ? '待交货'
    : current.status === '已取消' ? '已取消'
    : current.status === '已完成' ? '交货完成'
    : Number(current.plannedQuantity || 0) > 0
      && Number(current.actualQuantity || 0) >= Number(current.plannedQuantity || 0)
      && deliveryStats.received >= Number(current.plannedQuantity || 0) ? '交货完成'
    : Number(current.actualQuantity || 0) > 0 || deliveryStats.shipped > 0 || deliveryStats.received > 0 ? '部分交货'
    : '待交货';

  const handleChanged = async () => { await refreshDetail(); await onChanged?.(); };

  const updateItem = (index, patch) => setForm(prev => ({ ...prev, items: prev.items.map((row, i) => i === index ? { ...row, ...patch } : row) }));
  const addItem = () => setForm(prev => ({ ...prev, items: [...prev.items, blankItem()] }));
  const removeItem = index => setForm(prev => prev.items.length <= 1 ? prev : ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));

  const save = async event => {
    event?.preventDefault();
    if (!canEdit) return;
    setSaving(true); setError('');
    try {
      const payload = {
        ...form,
        items: form.items.map(item => ({ sku: item.sku, plannedQuantity: Number(item.plannedQuantity), unitPrice: Number(item.unitPrice) })),
        exchangeRate: rate,
        exchangeRateSource: isCny ? 'CNY 固定汇率' : '人工填写',
      };
      const createKeyPayload={...payload};
      const result = current ? await api.updateProductionOrder(current.id, payload) : await api.createProductionOrder({...payload,idempotencyKey:requestIds.current.get('production-order-create',createKeyPayload)});
      if(!current)requestIds.current.clear('production-order-create',createKeyPayload);
      const created = result.after || result;
      setSaved(created); setForm(toForm(created)); onSaved?.(created);
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const title = current ? `生产订单 · ${current.orderNo}` : '新建生产订单';
  const empty = message => <p className="hint">{current ? message : '请先保存订单；本页会保留已输入内容。'}</p>;

  return <div className="pow">
    {/* 顶部 Header：单号 / 状态 / 操作区 */}
    <div className="pow-head">
      <div className="pow-head__main">
        <div className="pow-head__title">
          <h2>{title}</h2>
          <span className={'pow-status' + (flowStatus === '交货完成' ? ' is-done' : '')}>{flowStatus}</span>
        </div>
      </div>
      <div className="pow-head__actions">
        {tab === '订单信息' && canEdit && <button className="btn primary" form="production-order-form" type="submit" disabled={saving}>{saving ? '保存中…' : current ? '保存订单' : '保存并生成订单号'}</button>}
        <button className="btn" type="button" onClick={onClose}>返回列表</button>
      </div>
    </div>

    <div className="tabs pow-tabs" role="tablist" aria-label="生产订单详情">
      {tabs.map((name, index) => <button key={name} type="button" role="tab" aria-selected={tab === name}
        className={'tab' + (tab === name ? ' active' : '')} onClick={() => setTab(name)}>
        {name}{name === '发货记录' && deliveryStats.count > 0 ? ` (${deliveryStats.count})` : ''}
      </button>)}
    </div>
    {error && <p className="error-text" role="alert">{error}</p>}
    {detailError && <p className="error-text" role="alert">{detailError} <button className="btn small" type="button" onClick={refreshDetail}>重新读取汇总</button></p>}
    {detailLoading && current && <p className="hint">正在刷新交付、发运和财务汇总…</p>}

    {tab === '订单信息' && <form id="production-order-form" className="pow-form" onSubmit={save}>
      <div className="pow-grid">
        {/* 左侧业务主表单 70% */}
        <div className="pow-main">
          <section className="card pow-card">
            <div className="pow-card__head"><h3>基础信息</h3><span className="pow-card__hint">订单号由系统按日期自动生成</span></div>
            <div className="pow-fields">
              <div className="field"><label>生产订单号</label><input readOnly value={current?.orderNo || '保存后自动生成'} /></div>
              <div className="field"><label>订单日期</label><input type="date" value={form.orderDate} onChange={e => setForm({ ...form, orderDate: e.target.value })} required disabled={!canEdit} /></div>
              <div className="field"><label>合作工厂</label><select value={form.factoryId} onChange={e => setForm({ ...form, factoryId: e.target.value })} required disabled={!canEdit}><option value="">选择已启用工厂</option>{factories.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></div>
              <div className="field"><label>预计交付日期</label><input type="date" value={form.expectedDeliveryDate} onChange={e => setForm({ ...form, expectedDeliveryDate: e.target.value })} required disabled={!canEdit} /></div>
              <div className="field pow-span-2"><label>结算币种</label><select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value, exchangeRate: e.target.value === 'CNY' ? '1' : '' })} disabled={!canEdit}>{['CNY', 'EUR', 'USD'].map(x => <option key={x}>{x}</option>)}</select></div>
              <div className="field pow-span-2"><label>备注说明</label><textarea value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} disabled={!canEdit} placeholder="填写交付、包装或运输说明" /></div>
            </div>
          </section>

          <section className="card pow-card">
            <div className="pow-card__head">
              <h3>车型明细</h3>
              <div className="pow-card__tools">{canEdit && <button className="btn small" type="button" onClick={addItem}>＋ 添加车型 SKU</button>}</div>
            </div>
            <div className="table-scroll">
              <table className="table pow-items">
                <thead><tr><th className="pow-col-no">#</th><th>车型 SKU / 产品名称</th><th>配置摘要</th><th className="pow-col-qty">采购数量</th><th className="pow-col-price">采购单价</th><th className="pow-col-total">小计金额</th>{canEdit && <th className="pow-col-act">操作</th>}</tr></thead>
                <tbody>
                  {form.items.map((item, index) => {
                    const option = skuOptions.find(x => x.value === item.sku);
                    return <tr key={index}>
                      <td className="pow-col-no">{String(index + 1).padStart(2, '0')}</td>
                      <td>
                        {canEdit ? <select value={item.sku} onChange={e => updateItem(index, { sku: e.target.value })} required><option value="">选择整车 SKU</option>{skuOptions.map(x => <option key={x.value} value={x.value}>{x.label} · {x.product}</option>)}</select>
                          : <><strong className="pow-sku">{item.sku || '—'}</strong><small>{[option?.product || item.productName, option?.colorName].filter(Boolean).join(' · ') || '—'}</small></>}
                      </td>
                      <td className="pow-spec">{option?.spec || '—'}</td>
                      <td>{canEdit ? <input type="number" min="1" step="1" value={item.plannedQuantity} onChange={e => updateItem(index, { plannedQuantity: e.target.value })} required /> : `${item.plannedQuantity} 辆`}</td>
                      <td>{canEdit ? <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => updateItem(index, { unitPrice: e.target.value })} required /> : `${form.currency} ${amount(item.unitPrice)}`}</td>
                      <td className="pow-num"><strong>{form.currency} {amount(itemTotal(item))}</strong></td>
                      {canEdit && <td className="pow-col-act"><button className="btn small" type="button" disabled={form.items.length === 1} onClick={() => removeItem(index)}>移除</button></td>}
                    </tr>;
                  })}
                </tbody>
                <tfoot><tr>
                  <td colSpan={3}>合计 {form.items.length} 个车型 SKU</td>
                  <td className="pow-num">{plannedTotal} 辆</td>
                  <td />
                  <td className="pow-num"><strong>{form.currency} {amount(originalTotal)}</strong></td>
                  {canEdit && <td />}
                </tr></tfoot>
              </table>
            </div>
          </section>
        </div>

        {/* 右侧结算摘要卡 30% */}
        <aside className="pow-side">
          <section className="card pow-card pow-settle">
            <div className="pow-card__head"><h3>费用与结算</h3></div>
            <dl className="pow-kv">
              <div><dt>计划总数</dt><dd>{plannedTotal} 辆</dd></div>
              <div><dt>原币订单总额</dt><dd className="pow-kv__strong">{form.currency} {amount(originalTotal)}</dd></div>
              <div><dt>参考汇率</dt><dd>{isCny ? '1.000000' : (rate ? Number(rate).toFixed(6) : '待录入')}{!isCny && <small> · {current?.exchangeRateSource || (canEdit ? '人工填写' : '—')}</small>}</dd></div>
              <div><dt>{isCny ? '结算币种' : '折合人民币'}</dt><dd className="pow-kv__strong">{isCny ? 'CNY 人民币结算' : `CNY ${amount(originalTotal * rate)}`}</dd></div>
            </dl>
            <div className="pow-settle__note">
              {!isCny && canEdit && <div className="field"><label>参考汇率（1 {form.currency} = CNY）</label><input type="number" min="0" step="0.000001" value={form.exchangeRate} onChange={e => setForm({ ...form, exchangeRate: e.target.value })} required /><span className="hint">保存后本次汇率固定。</span></div>}
              <p className="hint">人民币金额仅供成本参考，不改变原币结算金额。</p>
            </div>
          </section>

          <section className="card pow-card pow-links">
            <div className="pow-card__head"><h3>业务关联</h3></div>
            <div className="pow-links__grid">
              <button type="button" onClick={() => setTab('订单信息')}><span>工厂确认</span><strong>{current?.factoryConfirmedAt ? '已确认' : '待确认'}</strong></button>
              <button type="button" onClick={() => setTab('发货记录')}><span>发货单</span><strong>{deliveryStats.count}</strong></button>
              <button type="button" onClick={() => setTab('订单信息')}><span>已收数量</span><strong>{current ? `${deliveryStats.received} / ${current.plannedQuantity || 0}` : '—'}</strong></button>
              <button type="button" onClick={() => setTab('订单信息')}><span>发票状态</span><strong>{finance?.invoiceStatus || '—'}</strong></button>
              <button type="button" onClick={() => setTab('附件')}><span>附件</span><strong>—</strong></button>
            </div>
          </section>
        </aside>
      </div>

      {current && <section className="pow-overview">
        <div className="pow-card__head"><div><h3>采购与交付汇总</h3><span className="pow-card__hint">订单信息页展示采购结果；发货过程与凭证分别在对应 TAB 查看</span></div></div>
        <div className="table-scroll">
          <table className="table pow-hierarchy">
            <thead><tr><th>商品 / 交付项目</th><th>订购 / 应交</th><th>已发</th><th>已收</th><th>待发</th><th>采购金额</th></tr></thead>
            <tbody>{(current.items || []).map((item, index) => {
              const option = skuOptions.find(x => x.value === item.sku);
              const stat = itemStats[item.sku] || { shipped: 0, received: 0, allocated: false };
              const component = componentStats[item.sku] || {};
              return <React.Fragment key={item.sku}>
                <tr className="pow-hierarchy__parent"><td><strong>{String(index + 1).padStart(2, '0')}　{item.sku}</strong><small>{[option?.product || item.productName, option?.colorName].filter(Boolean).join(' · ') || '整车 SKU'} · {item.plannedQuantity} 辆 · {form.currency} {amount(item.unitPrice)}/辆</small></td><td>{item.plannedQuantity} 辆</td><td>{stat.allocated ? `${stat.shipped} 辆` : '待拆分'}</td><td>{stat.allocated ? `${stat.received} 辆` : '待拆分'}</td><td>{stat.allocated ? `${Math.max(0, Number(item.plannedQuantity || 0) - stat.shipped)} 辆` : '待拆分'}</td><td><strong>{form.currency} {amount(itemTotal(item))}</strong></td></tr>
                {['车体', '电池'].map(label => {
                  const row = component[label];
                  return <tr className="pow-hierarchy__child" key={`${item.sku}-${label}`}><td><span>↳ {label}</span><small>{row?.hasData ? '包裹追踪' : '待登记包裹明细'}</small></td><td>{item.plannedQuantity} 件</td><td>{row?.hasData ? `${row.shipped} 件` : '—'}</td><td>{row?.hasData ? `${row.received} 件` : '—'}</td><td>{row?.hasData ? `${Math.max(0, Number(item.plannedQuantity || 0) - row.shipped)} 件` : '—'}</td><td>—</td></tr>;
                })}
              </React.Fragment>;
            })}</tbody>
            <tfoot><tr><td><strong>采购合计</strong></td><td><strong>{current.plannedQuantity || 0} 辆</strong></td><td><strong>{deliveryStats.shipped} 辆</strong></td><td><strong>{deliveryStats.received} 辆</strong></td><td><strong>{Math.max(0, Number(current.plannedQuantity || 0) - deliveryStats.shipped)} 辆</strong></td><td><strong>{form.currency} {amount(originalTotal)}</strong></td></tr></tfoot>
          </table>
        </div>
        <p className="pow-overview__note">车体与电池按包裹、VIN / 电池 SN 分别追踪；未登记包裹时不推算组件数量，避免把两类实物混算为整车。</p>

        <div className="pow-summary-grid">
          <section className="pow-summary-card"><div className="pow-card__head"><h3>仓库与发货汇总</h3><span className="pow-card__hint">实际收货由库存中心确认</span></div><div className="table-scroll"><table className="table"><thead><tr><th>目的仓库</th><th>车体已发</th><th>电池已发</th><th>车体已收</th><th>电池已收</th><th>在途批次</th></tr></thead><tbody>{warehouseSummary.length ? warehouseSummary.map(row => <tr key={row.warehouse}><td>{row.warehouse}</td><td>{row.hasParcelData ? row.body.shipped : '—'}</td><td>{row.hasParcelData ? row.battery.shipped : '—'}</td><td>{row.hasParcelData ? row.body.received : '—'}</td><td>{row.hasParcelData ? row.battery.received : '—'}</td><td>{row.inTransit}</td></tr>) : <tr><td colSpan="6" className="hint">暂无发货批次</td></tr>}</tbody></table></div></section>
          <section className="pow-summary-card"><div className="pow-card__head"><h3>付款与发票</h3><span className="pow-card__hint">付款流水与发票分别对账</span></div>{finance ? <dl className="pow-kv"><div><dt>采购总额</dt><dd>{finance.currency} {amount(finance.orderTotal)}</dd></div><div><dt>已确认付款</dt><dd className="pow-kv__strong">{finance.currency} {amount(finance.paidTotal)}</dd></div><div><dt>待付款</dt><dd>{finance.currency} {amount(finance.remainingTotal)}</dd></div><div><dt>发票状态</dt><dd>{finance.invoiceStatus} · {finance.invoiceCount} 张</dd></div></dl> : <p className="hint">{detailLoading ? '正在读取付款与发票…' : '付款与发票汇总读取失败，请点击上方重新读取。'}</p>}</section>
        </div>
        <section className="pow-summary-card"><div className="pow-card__head"><h3>异常与对账</h3><span className="pow-card__hint">只显示需要人工核对的结果</span></div><div className="pow-reconcile"><div><span>物流 / 收货异常</span><strong className={deliveryStats.exceptionCount || parcelOverview?.totals?.abnormal ? 'is-warning' : ''}>{deliveryStats.exceptionCount + Number(parcelOverview?.totals?.abnormal || 0)} 条</strong></div><div><span>付款对账</span><strong>{finance?.paymentCount ? `${finance.paymentCount} 笔已记录` : '待核对'}</strong></div><div><span>发票对账</span><strong>{finance?.invoiceStatus || '待核对'}</strong></div><div><span>未配对包裹 / 未关联 SKU</span><strong className={parcelOverview?.unpairedParcels?.length || unlinkedParcelQuantity ? 'is-warning' : ''}>{parcelOverview ? `${parcelOverview.unpairedParcels.length} / ${unlinkedParcelQuantity} 件` : '—'}</strong></div></div></section>
        <section className="pow-summary-card pow-summary-card--activity"><div className="pow-card__head"><h3>生产时间线</h3><span className="pow-card__hint">按已记录的时间展示</span></div><ul className="pow-activity">{[
          { date: current.createdAt, title: '订单已建立', detail: current.orderNo },
          { date: current.factoryConfirmedAt, title: '工厂已确认', detail: current.factory },
          { date: current.productionStartedAt, title: '生产开始', detail: current.factory },
          { date: current.productionCompletedAt, title: '生产完成', detail: current.factory },
          ...deliveries.flatMap(row => [{ date: row.createdAt, title: '发货批次已建立', detail: row.shipmentNo }, { date: row.shippedAt, title: '发货批次已发运', detail: row.shipmentNo }]),
        ].filter(event => event.date).sort((a,b) => new Date(b.date) - new Date(a.date)).map((event,index) => <li key={`${event.title}-${event.detail}-${index}`}><span>{shortDate(event.date)}</span><b>{event.title}</b><em>{event.detail || '—'}</em></li>)}</ul></section>
        <section className="pow-summary-card"><div className="pow-card__head"><h3>物流包裹</h3><button type="button" className="btn small" onClick={() => setTab('发货记录')}>管理发货与包裹</button></div>{parcelOverview ? <div className="table-scroll"><table className="table"><thead><tr><th>包裹 / 组件</th><th>关联批次</th><th>物流公司 / 运单号</th><th>VIN / 电池 SN</th><th>状态</th><th>发运 / 签收</th></tr></thead><tbody>{parcelOverview.parcels?.length ? parcelOverview.parcels.map(parcel => <tr key={parcel.id}><td>{parcel.parcelNo || '—'}<small className="block">{parcel.componentType} · {parcel.quantity} 件</small></td><td>{parcel.shipmentNo || '—'}</td><td>{parcel.carrier || '—'}<small className="block">{parcel.trackingNo || '未填写运单号'}</small></td><td>{parcel.vin || parcel.batterySn || '—'}</td><td>{parcel.status || '—'}</td><td>{shortDate(parcel.dispatchedAt)} / {shortDate(parcel.deliveredAt)}</td></tr>) : <tr><td colSpan="6" className="hint">暂无物流包裹，请在发货记录中登记。</td></tr>}</tbody></table></div> : <p className="hint">{detailLoading ? '正在读取物流包裹…' : '物流包裹暂时无法读取，请重试。'}</p>}</section>
      </section>}

      {/* 底部常驻操作栏：与顶部主操作同步，长页面编辑无需回到顶部 */}
      <div className="pow-foot pow-foot--sticky">
        <span className="pow-foot__hint">{canEdit ? (current ? '修改后点击保存订单。' : '填写完成后保存生成订单号。') : current ? '当前订单已开工或已发运，订单信息只读。' : ''}</span>
        <div className="pow-foot__actions">
          <button className="btn" type="button" onClick={onClose}>取消</button>
          {tab === '订单信息' && canEdit && <button className="btn primary" form="production-order-form" type="submit" disabled={saving}>{saving ? '保存中…' : current ? '保存订单' : '保存并生成订单号'}</button>}
        </div>
      </div>
    </form>}

    {tab === '发货记录' && (current ? <><div className="pow-delivery pow-delivery--dispatch"><DeliveryPage user={user} active initialOrderId={current.id} mode="shipping" onChanged={handleChanged} /></div><ProductionDeliveryItemsPanel order={current} products={products} user={user} onChanged={handleChanged} /></> : empty(''))}
    {tab === '附件' && (current ? <ProductionAttachmentsPage user={user} active initialOrderId={current.id} /> : empty(''))}
  </div>;
}
