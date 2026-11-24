import React, { useEffect, useState } from 'react';
import { portalRequest } from './PortalPage.jsx';
import DealerCompaniesAdmin from './DealerCompaniesAdmin.jsx';
import DealerOrdersAdmin from './DealerOrdersAdmin.jsx';
import DealerReturnsAdmin from './DealerReturnsAdmin.jsx';
import '../cockpit.css';

const TABS = [['companies', '经销商管理与价格'], ['orders', '经销商订货'], ['returns', '退货处理']];

export default function DealerChannelPage({ user, active = true, section = 'companies' }) {
  const [tab, setTab] = useState(section);
  const [accounts, setAccounts] = useState([]);
  useEffect(() => { setTab(section); }, [section]);
  useEffect(() => {
    if (user.role !== 'admin' || !active) return;
    let alive = true;
    portalRequest('/api/portal-management/accounts').then(rows => { if (alive) setAccounts(rows); }).catch(() => {});
    return () => { alive = false; };
  }, [user.role, active]);
  if (user.role !== 'admin') return <div className="card">仅管理员可管理经销商渠道。</div>;
  return <div className="ckpit">
    <div className="ck-toolbar">
      <div>
        <div style={{ fontFamily: 'var(--ck-display)', fontSize: 16, letterSpacing: '0.04em' }}>B2B 分销运营</div>
        <div className="ck-drawer__sub">DEALER CHANNEL · 订货 / 专属价 / 配货 / 发运 / 对账 / 退货</div>
      </div>
      <div className="ck-toolbar__spacer" />
      <a className="ck-btn is-sm" href="/dealer" target="_blank" rel="noreferrer">经销商入口 ↗</a>
    </div>
    <nav className="ck-seg" aria-label="渠道与经销分区">
      {TABS.map(([key, label]) => <button type="button" key={key} className={tab === key ? 'is-on' : ''} onClick={() => setTab(key)}>{label}</button>)}
    </nav>
    {tab === 'companies' && <div className="ck-scroll"><DealerCompaniesAdmin active={active} accounts={accounts} /></div>}
    {tab === 'orders' && <DealerOrdersAdmin active={active} user={user} />}
    {tab === 'returns' && <DealerReturnsAdmin active={active} />}
  </div>;
}