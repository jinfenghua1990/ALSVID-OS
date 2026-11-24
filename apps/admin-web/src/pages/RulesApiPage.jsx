import React from 'react';

/*
 * 规则与接口（对应 8090「RULES & API」页）
 * 展示驱动 8089 全部业务动作的领域规则：销售订单状态机、履约路由、以及核心开放接口清单。
 * 纯静态展示页：规则改在服务端实现里，这里只负责让运营与对接方看得见。
 */

const STATUS_FLOW = [
  ['WAIT_PRODUCTION', '待排产'],
  ['IN_PRODUCTION', '生产中'],
  ['READY_TO_SHIP', '生产完成/待出运'],
  ['IN_TRANSIT', '已发货/国际在途'],
  ['DELIVERED', '客户妥投'],
  ['COMPLETED', '已完成'],
];

const TRANSITIONS = '待排产 → 生产中 / 生产完成/待出运 / 已取消；生产中 → 生产完成/待出运 / 已取消；生产完成/待出运 → 已发货/国际在途 / 已取消；已发货/国际在途 → 客户妥投；客户妥投 → 已完成；已完成 / 已取消 → 终态';

const FULFILLMENT = [
  ['WAREHOUSE_PICK · 实体仓现货出库', '目标仓现货充足时直接出库，不创建生产单；整车资产从在库切到买方/在途。'],
  ['FACTORY_DROPSHIP · 国内工厂直发', '现货不足时以销定产：自动生成生产采购订单（PO），工厂交货先做 GRN 逻辑入库再 GDO 出库核销，成对过账。'],
];

const APIS = [
  ['GET', '/api/sales-orders', '销售订单列表（含履约策略、状态、VIN、运单）'],
  ['POST', '/api/sales-orders', '创建销售订单，自动判定履约策略并生成生产单'],
  ['GET', '/api/sales-orders/summary', '销售履约总览：已出运销售额、综合毛利、回款健康度'],
  ['POST', '/api/sales-orders/:id/ship', '工厂直发出运：VIN 绑定 + 双段过账 + 运单创建'],
  ['POST', '/api/sales-orders/:id/deliver', '包裹妥投签收，全部签收后订单自动结案'],
  ['GET', '/api/sales-orders/assets', '整车资产归属四态台账（在库/虚拟/在途/买方）'],
  ['GET', '/api/production-deliveries', '生产发运单（GRN/GDO、清关、签收）'],
  ['POST', '/api/production-deliveries/:id/receipts', '签收入库：生成 GRN，按 VIN 登记，账实一致校验'],
  ['GET', '/api/production-orders/overview-extras', '供应链生产总览补充（现货在库、应付未结）'],
  ['GET', '/api/finance', '财务台账汇总：单据、应收应付、收付款、核销、汇率'],
  ['GET', '/api/finance/aging', '账龄分析：六档分桶，支持 asOf 基准日推演'],
  ['POST', '/api/finance/obligations/:id/settle', '应收应付一步核销（生成收付款 + 核销记录）'],
  ['GET', '/api/stock', '实时库存（按仓库 / SKU）'],
  ['GET', '/api/stock/valuation', '库存货值：最近采购单价优先，主档成本回退'],
  ['GET', '/api/stock/ledger', '出入库流水（来源单据可回溯）'],
  ['POST', '/api/stock/movements', '库存调拨 / 入库 / 出库'],
  ['POST', '/api/stock/adjustments', '手工库存调整（仅管理员）'],
  ['GET', '/api/inventory-8090/snapshot', '8090 口径库存台账快照（均价成本 / 流水金额 / 仓库健康度）'],
  ['GET', '/api/vins', 'VIN 档案与归属状态'],
  ['GET', '/api/audit', '审计留痕：全部业务动作自动记录，不可手工删除'],
];

export default function RulesApiPage() {
  // 徽标显示当前实际访问的主机，不写死端口（换端口/换域名时自动跟着变）
  const host = typeof window === 'undefined' ? '' : window.location.host;
  return <div className="page">
    <header className="prod-head">
      <div>
        <div className="prod-head__eyebrow">RULES &amp; API</div>
        <h2>规则与接口</h2>
        <p className="hint">状态机、履约路由与开放接口。所有业务动作都由同一套领域规则驱动，前端只负责发起。</p>
      </div>
      <div className="prod-head__actions"><span className="tag on">ALSVID V2 · {host}</span></div>
    </header>

    <section className="card" style={{ marginBottom: 16 }}>
      <h3>主订单状态机</h3>
      <p className="hint">销售订单唯一主线：从下单到结案，全部状态由服务端状态机推进并写入审计。</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        {STATUS_FLOW.map(([code, label], index) => <React.Fragment key={code}>
          {index > 0 && <span style={{ color: 'var(--text-sub)' }}>→</span>}
          <span className="tag on">{label}</span>
          <small className="hint mono">{code}</small>
        </React.Fragment>)}
        <span style={{ color: 'var(--text-sub)' }}>→</span>
        <span className="tag plan">已取消 <small className="mono">CANCELLED</small></span>
      </div>
      <p className="hint mt16" style={{ lineHeight: 1.7 }}>允许流转：{TRANSITIONS}。每次流转同时写入销售订单事件与审计日志。</p>
    </section>

    <section className="card" style={{ marginBottom: 16 }}>
      <h3>履约路由</h3>
      <p className="hint">下单即判定：够现货就走仓，不够就下单给工厂，全程免人工分派。</p>
      <div className="form-grid mt16" style={{ gridTemplateColumns: '1fr' }}>
        {FULFILLMENT.map(([title, note]) => <div key={title} className="card" style={{ background: 'var(--panel-2, #fff)' }}>
          <strong>{title}</strong>
          <p className="hint" style={{ marginTop: 6 }}>{note}</p>
        </div>)}
      </div>
    </section>

    <section className="card">
      <h3>接口清单 <span className="hint" style={{ fontSize: 11, fontWeight: 400 }}>JSON over HTTP · 全部需要登录会话</span></h3>
      <div className="table-scroll mt16"><table className="table">
        <thead><tr><th style={{ width: 90 }}>方法</th><th>路径</th><th>说明</th></tr></thead>
        <tbody>{APIS.map(([method, path, note]) => <tr key={method + path}>
          <td><span className={'tag ' + (method === 'GET' ? 'on' : 'plan')}>{method}</span></td>
          <td className="mono" style={{ fontSize: 12 }}>{path}</td>
          <td className="hint">{note}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}
