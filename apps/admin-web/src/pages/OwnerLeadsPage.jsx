import React, { useState } from 'react';
import TestRidesAdmin from './TestRidesAdmin.jsx';
import ColourInterestAdmin from './ColourInterestAdmin.jsx';

export default function OwnerLeadsPage({ active = true, user }) {
  const [section, setSection] = useState('test-rides');
  return <div className="page">
    <header className="prod-head">
      <div><div className="prod-head__eyebrow">OWNERS & VEHICLES</div><h2>试骑与线索</h2><p className="hint">试骑意向与匿名车型偏好分开展示；颜色偏好不代表可识别或可联系的个人线索。</p></div>
    </header>
    <div className="tabs" role="tablist" aria-label="试骑与线索类型">
      <button type="button" role="tab" aria-selected={section === 'test-rides'} className={'tab' + (section === 'test-rides' ? ' active' : '')} onClick={() => setSection('test-rides')}>试骑意向</button>
      <button type="button" role="tab" aria-selected={section === 'colour-interest'} className={'tab' + (section === 'colour-interest' ? ' active' : '')} onClick={() => setSection('colour-interest')}>颜色偏好（匿名统计）</button>
    </div>
    {section === 'test-rides' ? <TestRidesAdmin active={active} user={user} /> : <ColourInterestAdmin active={active} user={user} />}
  </div>;
}
