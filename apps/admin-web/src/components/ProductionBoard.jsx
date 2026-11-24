import React from 'react';
import {openOrderOnDoubleClick} from '../orderInteractions.js';

/*
 * 生产看板（对齐 8090 PRODUCTION & DELIVERY · 生产看板）
 * 四列状态看板：待制造 / 制造中 / 已交货 / 已结案归档，点击卡片进入生产订单详情。
 * 状态映射（8089 production_orders.status → 8090 看板列）：
 *   计划中 / 待工厂确认 → 待制造；生产中 → 制造中；
 *   数量口径交货完成但未结案 → 已交货；已完成 → 已结案归档；已取消不显示。
 * 卡片行序照 8090：PO 号 → 去向徽标 + 目标客户/仓库 → 商品 × 数量 → 工厂 + 金额
 *   → 来源订单 / 备货采购 + 交期 → 动作按钮（动作统一进订单工作台，8089 的交货/入库流程在工作台内）。
 */
const money = v => `¥${Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const columnOf = o => {
  if (o.status === '已完成') return 'done';
  if (o.flowStatus === '交货完成') return 'delivered';
  if (o.status === '生产中' || Number(o.deliveryPlannedQuantity || 0) > 0 || Number(o.actualQuantity || 0) > 0) return 'making';
  if (o.status === '已取消') return null;
  return 'todo';
};

const COLUMNS = [
  ['todo', '待制造', '待排产确认'],
  ['making', '制造中', '按交期交货'],
  ['delivered', '已交货', '待结案'],
  ['done', '已结案归档', '暂无生产单'],
];

function BoardCard({ o, onOpen }) {
  const col = columnOf(o);
  const direct = !!o.sourceOrderNo; // 有来源销售单 = 客户直发；无 = 仓库备货
  const item = (o.items || []).find(x => x.sku) || {};
  const productName = item.productName || item.sku || '';
  const qty = Number(o.plannedQuantity || 0);
  const eta = o.expectedDeliveryDate ? String(o.expectedDeliveryDate).slice(0, 10) : '';
  return (
    <article className={'pb-card pb-card--' + col} title="双击打开订单详情" onClick={() => onOpen(o)} onDoubleClick={event=>openOrderOnDoubleClick(event,()=>onOpen(o))}>
      <div className="pb-card__no mono">{o.orderNo}</div>
      <div className="pb-card__row">
        <span className={'pb-tag' + (direct ? '' : ' is-stock')}>{direct ? '客户直发 · B2B' : '仓库备货 · B2C'}</span>
        <span className="pb-card__target">{direct ? `目标客户：${o.soCustomerName || o.b2bCustomerCode || '—'}` : `目标仓库：${o.targetWarehouse || '未指定入库仓'}`}</span>
      </div>
      <div className="pb-card__item">{productName}{qty ? ` × ${qty}` : ''}</div>
      <div className="pb-card__row"><span>{o.factory}</span><b className="pb-card__amount">{money(o.orderTotal)}</b></div>
      <div className="pb-card__row pb-card__meta">
        <span>{direct ? `来源订单 ${o.sourceOrderNo}` : '备货采购（无销售单）'}</span>
        <span>{eta ? `交期 ${eta}` : '未排期'}</span>
      </div>
      <div className="pb-card__actions">
        {col === 'done'
          ? <span className="pb-archived">已对账归档</span>
          : <>
              {col === 'todo' && <button type="button" className="btn small" onClick={e => { e.stopPropagation(); onOpen(o); }}>开工</button>}
              <button type="button" className="btn small primary" onClick={e => { e.stopPropagation(); onOpen(o); }}>
                {col === 'making' ? (direct ? '完工交货' : '入库交货') : '完工交货'}
              </button>
            </>}
      </div>
    </article>
  );
}

export default function ProductionBoard({ orders, onOpenOrder }) {
  const groups = { todo: [], making: [], delivered: [], done: [] };
  (orders || []).forEach(o => { const c = columnOf(o); if (c) groups[c].push(o); });
  return (
    <section className="card pb-board">
      <div className="pb-board__head">
        <h3>生产看板</h3>
        <span className="hint">按状态分列 · 点击卡片进入生产单详情</span>
      </div>
      <div className="pb-cols">
        {COLUMNS.map(([key, label]) => (
          <div key={key} className="pb-col">
            <div className={'pb-col__head pb-col__head--' + key}><i className="pb-dot" /><span>{label}</span><strong>{groups[key].length}</strong></div>
            {groups[key].length
              ? groups[key].map(o => <BoardCard key={o.id} o={o} onOpen={onOpenOrder} />)
              : <p className="pb-col__empty">暂无生产单</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
