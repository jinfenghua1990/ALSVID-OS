import React, { useMemo } from 'react';
import {openOrderOnDoubleClick} from '../orderInteractions.js';

/*
 * 生产交付 · 供应链生产总览（驾驶舱）
 *
 * 移自 8090 OMS 的 productionOverview()：4 张 KPI + 生产待办 + 代工厂负荷（含去向结构）。
 * 与「B2B渠道 › 销售履约总览」严格分工：这一页只讲供给端——在制、排产、代工厂、交期、入库。
 * 客户名、销售金额、回款一律不出现，避免两个总览看到同一批数字。
 */

const CLOSED = ['交货完成', '已取消'];
/**
 * 去向判定：生产单上有 b2b 客户，或者被一张销售单反指（servesSalesOrder），都算「客户直发」；否则为「仓库备货」。
 * 不能只看 production_orders.customer_id —— 那列在迁移过来的单上全是 null，会把所有单都判成备货。
 */
const isDirect = (order) => !!(order?.servesSalesOrder || order?.b2bCustomerId);

const num = (value) => Number(value || 0);
const compactCny = (value) => {
  const n = num(value);
  const abs = Math.abs(n);
  if (abs >= 100000000) return `¥${(n / 100000000).toFixed(2)}亿`;
  if (abs >= 10000) return `¥${(n / 10000).toFixed(1)}万`;
  return `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
};
const fullCny = (value) => `¥${num(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value) => (value ? String(value).slice(0, 10) : '');
/** 距计划完工天数：正数 = 还有几天，负数 = 已逾期几天 */
const daysTo = (value) => {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const base = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - base) / 86400000);
};

function PlanBadge({ value }) {
  const left = daysTo(value);
  if (left === null) return <span className="so-due so-due--none">未排期</span>;
  if (left < 0) return <span className="so-due so-due--late">逾期 {Math.abs(left)} 天</span>;
  if (left === 0) return <span className="so-due so-due--warn">今天完工</span>;
  if (left <= 3) return <span className="so-due so-due--warn">{left} 天后</span>;
  return <span className="so-due">{day(value)}</span>;
}

export default function ProductionOverview({ orders, extras, flowStatusOf, onOpenOrder, onGoOrders }) {
  const list = useMemo(() => (Array.isArray(orders) ? orders : []), [orders]);
  const flowOf = flowStatusOf || ((order) => (order.status === '已完成' ? '交货完成' : order.status === '已取消' ? '已取消' : '待交货'));

  const live = useMemo(() => list.filter((order) => !CLOSED.includes(flowOf(order))), [list, flowOf]);
  const liveQty = useMemo(() => live.reduce((sum, order) => sum + num(order.plannedQuantity), 0), [live]);
  /* 已交货占比：计划总量 vs 工厂确认/实交数量，口径沿用原来那张指标卡 */
  const plannedQty = useMemo(() => list.reduce((sum, order) => sum + num(order.plannedQuantity), 0), [list]);
  /**
   * 已交数量：不能用 handoverConfirmedQuantity / actualQuantity —— 迁过来的生产单这两列全是 0，
   * 直接算会永远显示「已交货 0%」。改用「状态已达交货完成」的单按计划量计入，这才是真实进度。
   */
  const handedQty = useMemo(() => list.reduce((sum, order) => (flowOf(order) === '交货完成' ? sum + num(order.plannedQuantity) : sum), 0), [list, flowOf]);
  const handoverRate = plannedQty ? Math.round((handedQty / plannedQty) * 1000) / 10 : 0;
  /** 已过计划完工日还没交完的，才算交期风险 */
  const lateOrders = useMemo(() => live.filter((order) => {
    const left = daysTo(order.expectedDeliveryDate);
    return left !== null && left < 0;
  }), [live]);

  /* 生产待办：在办单按计划完工日升序，没排期的排最后，只取前 5 张 */
  const todo = useMemo(() => live.slice().sort((a, b) => {
    const la = daysTo(a.expectedDeliveryDate);
    const lb = daysTo(b.expectedDeliveryDate);
    if (la === null && lb === null) return 0;
    if (la === null) return 1;
    if (lb === null) return -1;
    return la - lb;
  }).slice(0, 5), [live]);

  /* 代工厂负荷：按采购金额（折 CNY）排序，同时给出累计产量与最近完工 */
  const factories = useMemo(() => {
    const map = new Map();
    for (const order of list) {
      const key = order.factory || '未指派工厂';
      const row = map.get(key) || { name: key, units: 0, cny: 0, doing: 0, late: 0, nextDue: null };
      const cny = num(order.orderTotal) * (num(order.exchangeRate) || 1);
      row.units += num(order.plannedQuantity);
      row.cny += cny;
      if (!CLOSED.includes(flowOf(order))) {
        row.doing += 1;
        const left = daysTo(order.expectedDeliveryDate);
        if (left !== null && left < 0) row.late += 1;
        if (order.expectedDeliveryDate && (!row.nextDue || String(order.expectedDeliveryDate) < row.nextDue)) {
          row.nextDue = String(order.expectedDeliveryDate).slice(0, 10);
        }
      }
      map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.cny - a.cny);
  }, [list, flowOf]);

  const totalCny = useMemo(() => factories.reduce((sum, f) => sum + f.cny, 0), [factories]);
  /* 去向结构：挂了 B2B 客户的是客户直发，没挂客户的是仓库备货 */
  const dest = useMemo(() => {
    const dropship = list.filter(isDirect).length;
    const stocking = list.length - dropship;
    return { dropship, stocking, total: list.length };
  }, [list]);

  const inventoryUnits = extras?.inventoryUnits;
  const payableCny = extras?.payableCny;

  return <section className="so-ov" aria-label="供应链生产总览">
    <div className="so-ov__head">
      <span className="so-ov__tag" style={{ background: 'var(--acc-soft)', color: 'var(--acc-deep)' }}>总览</span>
      <b>供应链生产总览</b>
      <span className="so-ov__desc">代工厂排产、交期与入库视角 · 客户与收款在「B2B渠道」</span>
      <span className="so-ov__spacer" />
      <button type="button" className="btn small" onClick={onGoOrders}>前往 B2B渠道 →</button>
    </div>

    <div className="so-kpi-grid">
      <article className="so-kpi" style={{ '--so-edge': 'var(--acc)' }}>
        <span className="so-kpi__label">在制资产</span>
        <strong className="so-kpi__value">{liveQty}<small>台</small></strong>
        <span className="so-kpi__foot">在办 {live.length} 张 · 已交货 {handoverRate}%</span>
      </article>

      <article className="so-kpi" style={{ '--so-edge': lateOrders.length ? 'var(--danger)' : '#d08a1e' }}>
        <span className="so-kpi__label">待处理生产单</span>
        <strong className="so-kpi__value">{live.length}<small>张</small></strong>
        <span className="so-kpi__foot">
          {lateOrders.length
            ? <span className="so-kpi__bad">{lateOrders.length} 张已过计划完工日</span>
            : '全部在计划交期内'}
        </span>
      </article>

      <article className="so-kpi" style={{ '--so-edge': 'var(--accent)' }}>
        <span className="so-kpi__label">现货在库</span>
        <strong className="so-kpi__value">{inventoryUnits === null || inventoryUnits === undefined ? '—' : inventoryUnits}<small>台</small></strong>
        <span className="so-kpi__foot">
          {inventoryUnits === null || inventoryUnits === undefined
            ? '库存数据不可用'
            : `整车现货 · 覆盖 ${extras?.inventorySkus ?? 0} 个 SKU`}
        </span>
      </article>

      <article className="so-kpi" style={{ '--so-edge': '#d08a1e' }}>
        <span className="so-kpi__label">应付未结</span>
        <strong className="so-kpi__value">{payableCny === null || payableCny === undefined ? '—' : compactCny(payableCny)}</strong>
        <span className="so-kpi__foot">
          {payableCny === null || payableCny === undefined
            ? '财务视图不可用'
            : `${extras?.payableCount ?? 0} 笔 · 采购总额 ${compactCny(totalCny)}`}
        </span>
      </article>
    </div>

    <div className="so-ov__split">
      <div className="card so-panel">
        <div className="so-panel__head">
          <h3>生产待办</h3>
          <span className="so-panel__spacer" />
          <span className="so-panel__sub">按计划完工日排序 · 待处理 {live.length}</span>
        </div>
        {todo.length
          ? <table className="table so-mini-table">
            <thead><tr><th>生产单 / 工厂</th><th style={{ width: 64 }}>去向</th><th style={{ width: 104 }}>计划完工</th><th style={{ width: 92, textAlign: 'right' }}>操作</th></tr></thead>
            <tbody>{todo.map((order) => {
              const skus = (order.items || []).map((item) => item.sku).filter(Boolean);
              const direct = isDirect(order);
              return <tr key={order.id} className="so-row order-openable" title="双击打开订单详情" onClick={() => onOpenOrder?.(order)} onDoubleClick={event=>openOrderOnDoubleClick(event,()=>onOpenOrder?.(order))}>
                <td>
                  <span className="so-mono">{order.orderNo}</span>
                  <small>{order.factory || '未指派工厂'} · {skus.join('、') || '—'} × {num(order.plannedQuantity)}</small>
                </td>
                <td><span className={'tag ' + (direct ? 'sku' : 'plan')}>{direct ? '直发' : '备货'}</span></td>
                <td><PlanBadge value={order.expectedDeliveryDate} /></td>
                <td className="so-num"><button type="button" className="btn small" onClick={(event) => { event.stopPropagation(); onOpenOrder?.(order); }}>打开订单</button></td>
              </tr>;
            })}</tbody>
          </table>
          : <div className="so-empty">
            <span className="so-empty__icon">✓</span>
            <div>当前没有待推进的生产单</div>
            <small>在办 0 张 · 逾期 0 张</small>
          </div>}
      </div>

      <div className="card so-panel">
        <div className="so-panel__head">
          <h3>代工厂负荷</h3>
          <span className="so-panel__spacer" />
          <span className="so-panel__sub">直发 {dest.dropship} 张 · 备货 {dest.stocking} 张</span>
        </div>
        <div className="so-fact">
          {factories.length
            ? <>
              {factories.map((factory) => {
                const share = totalCny ? Math.max(3, Math.round((factory.cny / totalCny) * 100)) : 0;
                return <div className="so-fact__row" key={factory.name}>
                  <div className="so-fact__head">
                    <span className="so-fact__name">{factory.name}</span>
                    <span className="so-fact__amt">{compactCny(factory.cny)}</span>
                  </div>
                  <div className="so-fact__bar"><span style={{ width: `${share}%` }} /></div>
                  <div className="so-fact__meta">
                    <span>累计 {factory.units} 台</span>
                    <span>在办 {factory.doing} 张</span>
                    <span>{factory.late ? <span style={{ color: 'var(--danger)' }}>逾期 {factory.late} 张</span> : factory.nextDue ? `最近完工 ${factory.nextDue}` : '无在办排期'}</span>
                  </div>
                </div>;
              })}
              <div className="so-fact__foot">
                <span>去向结构</span>
                <span className="so-dest">
                  <span className="so-dest__seg is-direct" style={{ width: `${dest.total ? Math.round((dest.dropship / dest.total) * 100) : 0}%` }} />
                  <span className="so-dest__seg is-stock" style={{ width: `${dest.total ? Math.round((dest.stocking / dest.total) * 100) : 0}%` }} />
                </span>
                <span className="so-dest__legend">
                  <i className="is-direct" />客户直发
                  <i className="is-stock" />仓库备货
                </span>
              </div>
            </>
            : <div className="so-empty"><div>暂无生产单</div><small>新建生产订单后这里会按工厂汇总负荷</small></div>}
        </div>
      </div>
    </div>

  </section>;
}
