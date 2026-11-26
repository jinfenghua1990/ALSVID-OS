import React from 'react';
import MarketingModule from './MarketingModules.jsx';
import AssetLibrary from './AssetLibrary.jsx';

const SECTIONS = {
  coupons: {
    title: '优惠券管理',
    description: '管理券种模板、发放批次与车主持有权益。',
    items: ['券种模板与适用范围', '发放批次与领取核销统计', '车主权益记录（只读展示入口）'],
  },
  referrals: {
    title: '推荐返利计划',
    description: '规划邀请关系、购车转化追踪与返利审核。',
    items: ['推荐规则与奖励方式', '邀请链接及转化记录', '返利结算审核'],
  },
  messaging: {
    title: '消息与触达',
    description: '规划自动化触达、分群条件、多语言模板与发送记录。',
    items: ['自动化营销流程', '国家、语言与许可筛选', '邮件模板及发送记录'],
  },
};

export default function MarketingCenterPage({ section = 'overview', active = true, user }) {
  if (section === 'materials') return <div className="page">
    <header className="prod-head"><div><div className="prod-head__eyebrow">MARKETING DEPT · 市场部</div><h2>营销素材</h2><p className="hint">与商城共用素材库 · 分类、检索、版本及使用记录</p></div></header>
    <AssetLibrary active={active} user={user} initialCategory="marketing"/>
  </div>;
  // 市场部新增八个子模块由 MarketingModules 承载；优惠券/返利/触达保留原结构
  if (['overview', 'ads', 'ai', 'channels', 'social', 'publishing', 'brand'].includes(section)) {
    return <div className="page">
      <header className="prod-head">
        <div><div className="prod-head__eyebrow">MARKETING DEPT · 市场部</div><h2>{({ overview: '市场概览', ads: '站外推广', materials: '营销素材', ai: 'AI 内容生成', channels: '推广渠道管理', social: '社交媒体管理', publishing: '内容发布管理', brand: '品牌推广' })[section]}</h2></div>
        <span className="tag plan">框架阶段</span>
      </header>
      <MarketingModule section={section} />
    </div>;
  }
  const item = SECTIONS[section] || SECTIONS.coupons;
  return <div className="page">
    <header className="prod-head">
      <div><div className="prod-head__eyebrow">MARKETING CENTER</div><h2>{item.title}</h2><p className="hint">{item.description}</p></div>
      <span className="tag plan">框架阶段</span>
    </header>
    <section className="card">
      <h3>模块规划</h3>
      <p className="hint">当前仅建立功能结构，不执行发券、返利结算、邮件或推送。</p>
      <div className="metric-grid">
        {item.items.map((label, index) => <article className="metric-card" key={label}>
          <span className="metric-label">功能 {String(index + 1).padStart(2, '0')}</span>
          <strong style={{ fontSize: 16 }}>{label}</strong>
          <span className="hint">待后续建设</span>
        </article>)}
      </div>
    </section>
  </div>;
}
