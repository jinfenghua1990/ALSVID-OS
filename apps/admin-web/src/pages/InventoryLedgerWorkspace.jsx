import React, { useState } from 'react';
import WarehouseLogisticsPage from './WarehouseLogisticsPage.jsx';
import OutboundOrders from './OutboundOrders.jsx';

const tabs = ['库存流水', '出库单'];

export default function InventoryLedgerWorkspace({ user, active = true }) {
  const [tab, setTab] = useState(tabs[0]);
  return <div className="prod">
    <div className="tabs" role="tablist" aria-label="库存操作">
      {tabs.map(name => <button key={name} type="button" role="tab" aria-selected={tab === name} className={'tab' + (tab === name ? ' active' : '')} onClick={() => setTab(name)}>{name}</button>)}
    </div>
    {tab === '库存流水' && <WarehouseLogisticsPage section="ledger" user={user} active={active} />}
    {tab === '出库单' && <OutboundOrders user={user} />}
  </div>;
}
