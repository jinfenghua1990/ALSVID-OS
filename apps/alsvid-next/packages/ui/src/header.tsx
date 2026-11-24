'use client';

import { useState } from 'react';
import type { AppNavItem } from './index';
import { Icon } from './icon';

export function AppHeader({ navigation, accountName }: { navigation: readonly AppNavItem[]; accountName?: string }) {
  const [search, setSearch] = useState('');
  const topItems = navigation.filter((item) => item.topLevel);
  return <header className="appHeader">
    <nav className="topNavigation" aria-label="快捷导航">{topItems.map((item) => item.disabled ? <span className="topLink disabled" aria-disabled="true" key={item.label} title={item.status}>{item.label}</span> : <a key={item.label} className={`topLink${item.active ? ' selected' : ''}`} href={item.href} aria-current={item.active ? 'page' : undefined}>{item.label}</a>)}</nav>
    <div className="headerActions">
      <details className="headerPopover"><summary aria-label="搜索功能"><Icon name="search" /></summary><div className="popoverPanel"><label htmlFor="module-search">搜索功能</label><input id="module-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="产品、经销商、采购…" /><nav>{navigation.filter((item) => !item.disabled && item.label.includes(search.trim())).map((item) => <a key={item.label} href={item.href}>{item.label}<Icon name="arrow" size={15} /></a>)}</nav>{!navigation.some((item) => !item.disabled && item.label.includes(search.trim())) ? <p>没有找到对应功能</p> : null}</div></details>
      <details className="headerPopover"><summary aria-label="通知"><Icon name="bell" /></summary><div className="popoverPanel"><strong>通知中心</strong><p>通知服务尚未接入，暂无可显示的通知。</p></div></details>
      <details className="headerPopover accountPopover"><summary><span className="accountAvatar"><Icon name="user" size={20} /></span><span className="accountLabel"><strong>{accountName ?? '账户'}</strong><small>{accountName ? '内部管理' : '登录 / 管理员'}</small></span><Icon name="chevron" size={15} /></summary><div className="popoverPanel"><a href="/login">登录 / 切换账户</a><a href="/portal-launcher">门户入口</a><a href="/settings/environment">环境与基础设施</a></div></details>
    </div>
  </header>;
}
