'use client';

import { useState } from 'react';
import { AppShell, Icon } from '@alsvid/ui';
import { navigationFor } from '../app-navigation';
import styles from './dashboard.module.css';

const series = [
  { code: 'FC1', name: '城市通勤系列', tone: 'city' },
  { code: 'CT1', name: '全地形系列', tone: 'trail' },
  { code: 'FT1', name: '旅行探索系列', tone: 'tour' },
  { code: 'GT1', name: '高性能系列', tone: 'sport' },
];
const periods = ['本月', '本季度', '本年'] as const;
const demo = [
  { total: 248, dealer: 36, customer: 1248, service: 16, orders: [58, 78, 67, 102, 68, 111, 126, 118, 153, 129, 167, 148], shipments: [32, 54, 49, 68, 100, 82, 97, 91, 110, 159, 173, 192] },
  { total: 682, dealer: 36, customer: 1364, service: 24, orders: [95, 130, 116, 167, 146, 194, 181, 211, 239, 215, 264, 282], shipments: [78, 101, 95, 139, 150, 164, 178, 185, 210, 226, 231, 260] },
  { total: 2846, dealer: 36, customer: 1820, service: 42, orders: [110, 126, 154, 189, 173, 221, 239, 208, 269, 301, 278, 326], shipments: [84, 103, 134, 147, 160, 192, 220, 201, 241, 272, 259, 298] },
];
const activities = [
  { icon: 'bike', tone: 'blue', title: '新订单 #SO-20261011-001', detail: 'FC1 Pro · 德国经销商', time: '2 小时前', href: '/commerce' },
  { icon: 'truck', tone: 'green', title: '出货 #SH-20261010-003', detail: 'CT1 · 已发货', time: '4 小时前', href: '/logistics' },
  { icon: 'tool', tone: 'orange', title: '售后工单 #SR-20261009-002', detail: '刹车异响 · 等待处理（规划中）', time: '6 小时前' },
  { icon: 'user', tone: 'purple', title: '新经销商申请', detail: 'Berlin Bikes · 德国', time: '1 天前', href: '/dealers' },
];

function Trend({ orders, shipments }: { orders: number[]; shipments: number[] }) {
  const max = Math.ceil(Math.max(...orders, ...shipments) / 50) * 50;
  const points = (values: number[]) => values.map((value, index) => `${48 + index * 43},${164 - value / max * 140}`).join(' ');
  return <svg className={styles.trend} viewBox="0 0 550 202" role="img" aria-label="演示订单与出货趋势，非真实业务记录">
    <defs><linearGradient id="orders-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#087cff" stopOpacity=".19" /><stop offset="100%" stopColor="#087cff" stopOpacity="0" /></linearGradient></defs>
    {[0, 1, 2, 3, 4].map((row) => <g key={row}><line x1="48" y1={24 + row * 35} x2="521" y2={24 + row * 35} stroke="#eff3f8" /><text x="10" y={28 + row * 35}>{Math.round(max * (1 - row / 4))}</text></g>)}
    <polygon points={`48,164 ${points(orders)} 521,164`} fill="url(#orders-fill)" />
    <polyline points={points(orders)} fill="none" stroke="#087cff" strokeWidth="2" /><polyline points={points(shipments)} fill="none" stroke="#0ac39e" strokeWidth="2" />
    {orders.map((value, index) => <circle key={index} cx={48 + index * 43} cy={164 - value / max * 140} r="2.5" fill="#087cff" />)}
    {shipments.map((value, index) => <circle key={index} cx={48 + index * 43} cy={164 - value / max * 140} r="2.5" fill="#0ac39e" />)}
    {orders.map((_, index) => <text key={index} x={48 + index * 43} y="190" textAnchor="middle">{index + 1}月</text>)}
  </svg>;
}

export function Dashboard({ accountName }: { accountName?: string }) {
  const [period, setPeriod] = useState(0);
  const data = demo[period]!;
  const metrics = [
    { label: '产品系列', value: 12, icon: 'box', tone: 'blue', change: '+ 0%', href: '/product' },
    { label: '产品型号 (SKU)', value: 28, icon: 'bike', tone: 'green', change: '+ 12%', href: '/product#catalog' },
    { label: '经销商数量', value: data.dealer, icon: 'store', tone: 'purple', change: '+ 9%', href: '/dealers' },
    { label: '订单总数', value: data.total, icon: 'order', tone: 'orange', change: '+ 18%', href: '/commerce' },
    { label: '待处理售后', value: data.service, icon: 'tool', tone: 'red', change: '+ 23%' },
    { label: '客户数量', value: data.customer, icon: 'user', tone: 'cyan', change: '+ 11%', href: '/partners' },
  ];
  return <AppShell navigation={navigationFor('/')} footer="ALSVID · 内部管理" workspaceId="overview" accountName={accountName}>
    <div className={styles.dashboard}>
      <section className={styles.hero} aria-label="ALSVID 品牌概览">
        <div className={styles.heroCopy}><h1>ALSVID</h1><h2>Explore Further</h2><p>为更远的探索而生</p><span>折叠 · 城市 · 越野 · 长途</span><div className={styles.heroActions}><a href="/product">了解产品系列 <Icon name="arrow" size={19} /></a><a href="/product#engineering">查看工程资料</a></div></div>
        <span className={styles.motto}>LIGHTER<br />SMARTER<br />FURTHER<span /></span>
      </section>
      <section aria-labelledby="series-title"><div className={styles.sectionHeading}><h2 id="series-title">产品系列</h2><a href="/product">查看全部产品 <Icon name="arrow" size={16} /></a></div><div className={styles.seriesGrid}>{series.map((item) => <a href="/product#catalog" className={`${styles.seriesCard} ${styles[item.tone]}`} key={item.code}><h3>{item.code}</h3><p>{item.name}</p><span className={styles.seriesArrow}><Icon name="arrow" size={18} /></span><small>设计展示</small></a>)}</div></section>
      <section className={styles.metricsSection} aria-labelledby="metrics-title"><div className={styles.sectionHeading}><h2 id="metrics-title">关键数据 <span className={styles.demoBadge}>演示数据</span></h2><div className={styles.periods} role="group" aria-label="数据时间范围">{periods.map((label, index) => <button key={label} aria-pressed={period === index} onClick={() => setPeriod(index)}>{label}</button>)}</div></div><div className={styles.metricsGrid} aria-live="polite">{metrics.map((item) => {
        const content = <><div className={styles.metricMain}><span className={`${styles.iconBubble} ${styles[item.tone]}`}><Icon name={item.icon} size={25} /></span><div><strong>{item.value.toLocaleString('en-US')}</strong><p>{item.label}</p></div></div><div className={styles.metricChange}><span className={styles[item.tone]} /><small>{item.change} <b>↗</b></small></div></>;
        return item.href ? <a href={item.href} className={styles.metric} key={item.label}>{content}</a> : <div className={styles.metric} key={item.label}>{content}</div>;
      })}</div></section>
      <div className={styles.analyticsGrid}>
        <section className={`${styles.panel} ${styles.trendPanel}`}><div className={styles.panelHeading}><h2>订单趋势</h2><div className={styles.legend}><span><i />订单数量</span><span><i />出货数量</span></div></div><p className={styles.chartNote}>{periods[period]}演示快照 · 月度趋势</p><Trend orders={data.orders} shipments={data.shipments} /></section>
        <section className={styles.panel}><div className={styles.panelHeading}><h2>销量分布（按系列）</h2></div><div className={styles.distribution}><div className={styles.donut} role="img" aria-label="演示销量分布：FC 42%、CT 26%、FT 18%、GT 14%"><div><strong>{data.total.toLocaleString('en-US')}</strong><span>演示订单总数</span></div></div><ul>{['FC', 'CT', 'FT', 'GT'].map((code, index) => <li key={code}><i style={{ background: ['#087cff', '#0ac39e', '#ffa500', '#9362ff'][index] }} />{code} Series <span>{[42, 26, 18, 14][index]}%</span></li>)}</ul></div></section>
        <section className={styles.panel}><div className={styles.panelHeading}><h2>最新动态</h2><a href="/commerce">查看更多 <Icon name="arrow" size={15} /></a></div><div className={styles.activities}>{activities.map((item) => {
          const content = <><span className={`${styles.iconBubble} ${styles[item.tone]}`}><Icon name={item.icon} size={19} /></span><div><strong>{item.title}</strong><p>{item.detail}</p></div><time>{item.time}</time></>;
          return item.href ? <a href={item.href} key={item.title}>{content}</a> : <div key={item.title}>{content}</div>;
        })}</div></section>
      </div>
      <p className={styles.demoNote}>当前首页为 UI 演示：产品图片、统计、图表和动态用于展示设计，不代表实际业务记录。进入各工作台查看已接入的数据。</p>
    </div>
  </AppShell>;
}
