import React, { useMemo } from 'react';
import {openOrderOnDoubleClick} from '../orderInteractions.js';

/*
 * B2B渠道 · 销售履约总览（驾驶舱）
 *
 * 移自 8090 OMS 的 salesOverview()：4 张 KPI + 交期预警 + 回款健康度 + 近 14 天下单趋势。
 * 这里只做「销售侧」的事——客户、合同、回款、交期。任何工厂动作（排产、报工、入库）都不出现在这，
 * 跟「生产交付 › 供应链生产总览」严格分工，两个总览不会互相重复。
 *
 * 数据全部来自 /api/sales-orders/summary 一次请求：orders（原始行）+ metrics + receivable，
 * 趋势与交期预警在前端算，不再额外开接口——跨境库一次往返 0.7–1.5s，能省就省。
 */

const CLOSED = ['COMPLETED', 'CANCELLED'];
const SHIPPED = ['IN_TRANSIT', 'DELIVERED', 'COMPLETED'];
const TONE_COLOR = { ok: 'var(--success)', info: '#2f7fd1', warn: '#d08a1e', danger: 'var(--danger)' };

const num = (value) => Number(value || 0);
/** KPI 主数字用紧凑写法：¥13.6万 比 ¥135,726.50 在卡片里好认 */
const compactCny = (value) => {
  const n = num(value);
  const abs = Math.abs(n);
  if (abs >= 100000000) return `¥${(n / 100000000).toFixed(2)}亿`;
  if (abs >= 10000) return `¥${(n / 10000).toFixed(1)}万`;
  return `¥${n.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
};
const fullCny = (value) => `¥${num(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (value) => (value ? String(value).slice(0, 10) : '—');
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
/** 距交期天数：正数 = 距到期还有几天，负数 = 已逾期几天 */
const daysTo = (value) => {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!m) return null;
  const target = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const base = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - base) / 86400000);
};

function DueBadge({ value }) {
  const left = daysTo(value);
  if (left === null) return <span className="so-due so-due--none">未定交期</span>;
  if (left < 0) return <span className="so-due so-due--late">逾期 {Math.abs(left)} 天</span>;
  if (left === 0) return <span className="so-due so-due--warn">今天到期</span>;
  if (left <= 3) return <span className="so-due so-due--warn">{left} 天后</span>;
  return <span className="so-due">{day(value)}</span>;
}

export default function SalesOrderOverview({ summary, onOpenOrder, onGoProduction, onGoFinance }) {
  const orders = useMemo(() => (Array.isArray(summary?.orders) ? summary.orders : []), [summary]);
  const m = summary?.metrics || {};
  const ar = summary?.receivable || null;
  const labels = summary?.statusLabels || {};

  const openOrders = useMemo(() => orders.filter((o) => !CLOSED.includes(o.status)), [orders]);
  const shippedCount = useMemo(() => orders.filter((o) => SHIPPED.includes(o.status)).length, [orders]);
  const readyCount = useMemo(() => openOrders.filter((o) => o.status === 'READY_TO_SHIP').length, [openOrders]);

  /* 交期预警：逾期 + 3 天内到期，取最紧急的 4 单。已结案的不算（CLOSED 已被 openOrders 过滤） */
  const alerts = useMemo(() => {
    const scored = openOrders.map((o) => ({ order: o, left: daysTo(o.due_date) })).filter((x) => x.left !== null);
    const late = scored.filter((x) => x.left < 0).sort((a, b) => a.left - b.left);
    const soon = scored.filter((x) => x.left >= 0 && x.left <= 3).sort((a, b) => a.left - b.left);
    return { late, soon, list: [...late, ...soon].slice(0, 4) };
  }, [openOrders]);

  /* 近 14 天下单趋势：按 created_at 的日历日落桶，空日补 0，否则柱子会挤在一起看不出节奏 */
  const trend = useMemo(() => {
    const days = 14;
    const today = startOfDay(new Date());
    const slots = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(today.getTime() - i * 86400000);
      slots.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, date: d, count: 0, amount: 0 });
    }
    const index = new Map(slots.map((s) => [s.key, s]));
    for (const order of orders) {
      if (!order.created_at) continue;
      const created = new Date(order.created_at);
      if (Number.isNaN(created.getTime())) continue;
      const key = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')}`;
      const slot = index.get(key);
      if (!slot) continue;
      slot.count += 1;
      slot.amount += num(order.sale_amount);
    }
    const max = Math.max(1, ...slots.map((s) => s.count));
    return { slots, max, total: slots.reduce((sum, s) => sum + s.count, 0) };
  }, [orders]);

  const marginTone = num(m.grossMargin) >= 30 ? 'ok' : num(m.grossMargin) >= 15 ? 'warn' : 'danger';
  const arTone = ar && ar.overdueAmount > 0 ? 'danger' : ar && ar.dueSoonAmount > 0 ? 'warn' : 'ok';

  return <section className="so-ov" aria-label="销售履约总览">
    <div className="so-ov__head">
      <span className="so-ov__tag">总览</span>
      <b>销售履约总览</b>
      <span className="so-ov__desc">客户合同、回款与交期视角 · 生产执行在「生产交付」</span>
      <span className="so-ov__spacer" />
      <button type="button" className="btn small" onClick={onGoProduction}>前往生产交付 →</button>
    </div>

    <div className="so-kpi-grid">
      <article className="so-kpi" style={{ '--so-edge': 'var(--accent)' }}>
        <span className="so-kpi__label">已出运销售额</span>
        <strong className="so-kpi__value">{compactCny(m.shippedAmountCny)}</strong>
        <span className="so-kpi__foot">已出运 {shippedCount} 单 · 折人民币 {fullCny(m.shippedAmountCny)}</span>
      </article>

      <article className="so-kpi" style={{ '--so-edge': TONE_COLOR[marginTone] }}>
        <span className="so-kpi__label">综合毛利率</span>
        <strong className="so-kpi__value" style={{ color: TONE_COLOR[marginTone] }}>
          {num(m.grossMargin).toFixed(1)}%
          <small>毛利 {compactCny(m.grossProfit)}</small>
        </strong>
        <span className="so-kpi__foot">已扣采购 + 头程 · 仅统计已出运订单</span>
      </article>

      <article className="so-kpi" style={{ '--so-edge': TONE_COLOR[arTone] }}>
        <span className="so-kpi__label">应收未结</span>
        <strong className="so-kpi__value">{ar ? compactCny(ar.total) : '—'}</strong>
        <span className="so-kpi__foot">
          {!ar ? '财务视图不可用'
            : ar.overdueAmount > 0
              ? <span className="so-kpi__bad">逾期 {compactCny(ar.overdueAmount)} · 最长 {ar.maxOverdueDays} 天</span>
              : <span>无逾期 · 30 天内到期 {compactCny(ar.dueSoonAmount)}</span>}
        </span>
      </article>

      <article className="so-kpi" style={{ '--so-edge': 'var(--acc)' }}>
        <span className="so-kpi__label">在办 / 待出运</span>
        <strong className="so-kpi__value">
          {openOrders.length}<small>单</small>
          <small style={{ color: 'var(--acc-deep)' }}>待出运 {readyCount}</small>
        </strong>
        <span className="so-kpi__foot">在办敞口 {compactCny(m.openAmountCny)} · 国际在途 {num(m.inTransit)} 单</span>
      </article>
    </div>

    <div className="so-ov__split">
      <div className="card so-panel">
        <div className="so-panel__head">
          <h3>交期预警</h3>
          <span className="so-panel__spacer" />
          <span className="so-panel__sub">逾期 {alerts.late.length} 单 · 3 天内到期 {alerts.soon.length} 单</span>
        </div>
        {alerts.list.length
          ? <table className="table so-mini-table">
            <thead><tr><th>订单 / 客户</th><th style={{ width: 96 }}>交期</th><th style={{ width: 88 }}>状态</th><th style={{ width: 62, textAlign: 'right' }}>数量</th></tr></thead>
            <tbody>{alerts.list.map(({ order }) => <tr key={order.id} className="so-row order-openable" title="双击打开订单详情" onClick={() => onOpenOrder?.(order.id)} onDoubleClick={event=>openOrderOnDoubleClick(event,()=>onOpenOrder?.(order.id))}>
              <td>
                <span className="so-mono">{order.order_no}</span>
                <small className="block">{order.customer_name || '—'}</small>
              </td>
              <td><DueBadge value={order.due_date} /></td>
              <td><span className={'tag ' + (order.status === 'READY_TO_SHIP' || order.status === 'IN_PRODUCTION' ? 'on' : 'plan')}>{labels[order.status] || order.status}</span></td>
              <td className="so-num">{order.quantity} 台</td>
            </tr>)}</tbody>
          </table>
          : <div className="so-empty">
            <span className="so-empty__icon">✓</span>
            <div>所有在办订单交期正常</div>
            <small>逾期 0 单 · 3 天内到期 0 单</small>
          </div>}
      </div>

      <div className="card so-panel">
        <div className="so-panel__head">
          <h3>回款健康度</h3>
          <span className="so-panel__spacer" />
          <button type="button" className="btn small" onClick={onGoFinance}>财务对账 →</button>
        </div>
        {ar
          ? <div className="so-ar">
            <div className="so-ar__main">
              <span className="so-ar__label">应收未结</span>
              <b>{fullCny(ar.total)}</b>
              <span className="so-ar__sub">{ar.count} 笔 · 逾期占比 {ar.overdueRatio}%</span>
            </div>
            <div className="so-ar__buckets">
              {ar.buckets.filter((b) => b.amount > 0).map((b) => <div className="so-ar__row" key={b.key}>
                <span className="so-ar__dot" style={{ background: TONE_COLOR[b.tone] }} />
                <span className="so-ar__name">{b.label}</span>
                <span className="so-ar__amt">{compactCny(b.amount)}</span>
                <span className="so-ar__ratio">{b.ratio}%</span>
              </div>)}
              {ar.buckets.every((b) => b.amount <= 0) && <p className="hint">暂无未结应收</p>}
            </div>
            <div className="so-ar__foot">
              <span>加权平均逾期 <b>{ar.avgOverdueDays} 天</b></span>
              <span>最长 <b>{ar.maxOverdueDays} 天</b></span>
            </div>
          </div>
          : <div className="so-empty"><div>暂无应收数据</div><small>财务视图不可用或尚未建账</small></div>}
      </div>
    </div>

    <div className="card so-trend">
      <div className="so-panel__head" style={{ padding: '12px 14px 0' }}>
        <h3>近 14 天下单趋势</h3>
        <span className="so-panel__spacer" />
        <span className="so-panel__sub">共 {trend.total} 单 · 柱高为当日单量</span>
      </div>
      <div className="so-trend__bars">
        {trend.slots.map((slot) => {
          const height = slot.count ? Math.max(8, Math.round((slot.count / trend.max) * 100)) : 2;
          const label = `${slot.key.slice(5)} · ${slot.count} 单${slot.amount ? ` · ${compactCny(slot.amount)}` : ''}`;
          return <div className="so-trend__col" key={slot.key} title={label}>
            <span className={'so-trend__bar' + (slot.count ? '' : ' is-zero')} style={{ height: `${height}%` }}>
              {slot.count > 0 && <em>{slot.count}</em>}
            </span>
          </div>;
        })}
      </div>
      <div className="so-trend__labels">
        {trend.slots.map((slot) => <span key={slot.key}>{slot.key.slice(5)}</span>)}
      </div>
    </div>
  </section>;
}
