import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { portalRequest } from './PortalPage.jsx';

const localDateKey = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
};

export function WorkbenchPage({ onOpen, user, active = true }) {
  const [summary, setSummary] = useState(null);
  const [products, setProducts] = useState([]);
  const [summaryError, setSummaryError] = useState('');
  const [followups, setFollowups] = useState([]);
  const [followupError, setFollowupError] = useState('');
  const [todos, setTodos] = useState(null);
  const [todoError, setTodoError] = useState('');
  const [today, setToday] = useState(localDateKey);
  const loadVersion = useRef(0);
  useEffect(() => {
    const refreshToday = () => setToday(current => {
      const next = localDateKey();
      return current === next ? current : next;
    });
    const timer = window.setInterval(refreshToday, 60_000);
    window.addEventListener('focus', refreshToday);
    document.addEventListener('visibilitychange', refreshToday);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshToday);
      document.removeEventListener('visibilitychange', refreshToday);
    };
  }, []);
  const load = () => {
    const version = ++loadVersion.current;
    setSummaryError('');
    Promise.all([api.summary(), api.products()]).then(([s, p]) => { if (version === loadVersion.current) { setSummary(s); setProducts(p); setSummaryError(''); } }).catch(e => { if (version === loadVersion.current) setSummaryError(e.message); });
    if (user?.role === 'admin') { setFollowupError(''); api.pendingCustomerFollowups().then(rows => { if (version === loadVersion.current) setFollowups(rows); }).catch(e => { if (version === loadVersion.current) setFollowupError(e.message); }); }
    if (user?.role === 'admin') {
      setTodoError('');
      Promise.allSettled([
        portalRequest('/api/portal-management/vehicle-requests'),
        portalRequest('/api/portal-management/service-requests'),
        portalRequest('/api/portal-management/dealer-orders'),
        portalRequest('/api/portal-management/dealer-returns'),
      ]).then(([vehicles, services, orders, returns]) => {
        if (version !== loadVersion.current) return;
        const failed = [vehicles, services, orders, returns].filter(r => r.status === 'rejected');
        setTodos({
          vehicles: vehicles.status === 'fulfilled' ? vehicles.value.filter(r => r.status === 'pending').length : 0,
          services: services.status === 'fulfilled' ? services.value.filter(r => r.status === 'submitted').length : 0,
          orders: orders.status === 'fulfilled' ? orders.value.filter(o => ['submitted', 'quoted', 'accepted', 'allocated'].includes(o.status)).length : 0,
          returns: returns.status === 'fulfilled' ? returns.value.filter(r => r.status === 'pending').length : 0,
        });
        setTodoError(failed.length ? failed[0].reason?.message || '部分待办读取失败' : '');
      });
    }
  };
  useEffect(() => {
    if (!active) return;
    load();
    return () => { loadVersion.current++; };
  }, [user?.role, active]);
  if (!summary) return <div className={summaryError ? 'error-text' : 'hint'}>{summaryError ? <>{summaryError} <button type="button" className="btn small" onClick={load}>重新加载</button></> : '加载工作台…'}</div>;
  const cards = [['vehicles', '整车产品', 'product', summary.vehicles], ['parts', '零配件', 'product', summary.parts], ['vins', 'VIN 车辆档案', 'service', summary.vins], ['repairsOpen', '待处理维修', 'service', summary.repairsOpen], ['fitments', '适配关系', 'service', summary.fitments], ['substitutes', '替代关系', 'service', summary.substitutes]];
  const overdue = followups.filter(item => item.followupOn < today).length;
  const dueToday = followups.filter(item => item.followupOn === today).length;
  const todoRows = [
    ['车辆授权待审核', todos?.vehicles ?? 0, 'settings', 'vehicleRequests'],
    ['服务申请待受理', todos?.services ?? 0, 'service', 'serviceRequests'],
    ['经销订单待处理', todos?.orders ?? 0, 'customers', 'dealerOrders'],
    ['经销退货待审核', todos?.returns ?? 0, 'customers', 'dealerReturns'],
  ];
  return <div className="dashboard">
    {summaryError && <p className="error-text" role="alert">工作台摘要刷新失败：{summaryError} <button type="button" className="btn small" onClick={load}>重新加载</button></p>}
    <div className="page-title"><div><h2 /><span className="hint" /></div><span className="tag on">业务服务已连接</span></div>
    <div className="metric-grid">{cards.map(([key, label, domain, value]) => <button key={key} className="metric-card" onClick={() => onOpen(domain, key)}><span className="metric-label">{label}</span><strong>{value}</strong><span className="hint" /></button>)}</div>
    {user?.role === 'admin' && <div className="card mb16">
      <div className="section-title" style={{ marginTop: 0 }}>待办处理 <span className="hint">跨模块待处理事项汇总</span></div>
      {todoError && <p className="error-text" role="alert">待办读取失败：{todoError} <button type="button" className="btn small" onClick={load}>重新加载</button></p>}
      {!todos && !todoError && <p className="hint">加载待办…</p>}
      {todos && <table className="table"><thead><tr><th>待办</th><th>数量</th><th>状态</th><th></th></tr></thead><tbody>{todoRows.map(([label, count, targetDomain, key]) => <tr key={label}><td>{label}</td><td>{count}</td><td><span className={'tag ' + (count ? 'plan' : '')}>{count ? '需处理' : '已清空'}</span></td><td><button type="button" className="btn small" onClick={() => onOpen(targetDomain, key)}>去处理 →</button></td></tr>)}</tbody></table>}
    </div>}
    {user?.role === 'admin' && <div className="card mb16"><div className="section-title" style={{ marginTop: 0 }}>客户回访提醒 <span className="hint" /></div>{followupError ? <p className="error-text">{followupError} <button type="button" className="btn small" onClick={load}>重新加载</button></p> : followups.length ? <><table className="table"><thead><tr><th>计划日期</th><th>状态</th><th>客户</th><th>电话</th><th>车辆</th></tr></thead><tbody>{followups.slice(0, 5).map(item => <tr key={item.id}><td>{item.followupOn}</td><td>{item.followupOn < today ? '已逾期' : item.followupOn === today ? '今日回访' : '计划中'}</td><td>{item.customerName}</td><td>{item.phone || '—'}</td><td>{item.vin || '—'}</td></tr>)}</tbody></table><button type="button" className="btn mt8" onClick={() => onOpen('service', 'customerFollowups')}>打开客户跟进 →</button></> : <p className="hint" />}</div>}
    <div className="dashboard-grid">
      <div className="card"><div className="section-title" style={{ marginTop: 0 }}>产品资产</div><table className="table"><thead><tr><th>名称</th><th>类型</th><th>SKU</th><th>状态</th></tr></thead><tbody>{products.slice(0, 6).map(p => <tr key={p.id}><td><span className="link" onClick={() => onOpen('product', p.kind)}>{p.name}</span></td><td>{p.kind === 'vehicle' ? '整车' : '配件'}</td><td>{p.skuCount}</td><td><span className="tag on">{p.status}</span></td></tr>)}</tbody></table></div>
      <div className="card"><div className="section-title" style={{ marginTop: 0 }}>业务范围</div><p className="hint" style={{ lineHeight: 1.8 }} /><div className="notice mt16">本工作台只显示产品与服务摘要；生产、商城、经销商和财务数据请查看对应业务模块。</div></div>
    </div>
  </div>;
}
