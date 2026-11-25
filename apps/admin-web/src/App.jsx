import React, { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ErrorBoundary from './ErrorBoundary.jsx';
import { api } from './api.js';
import { StorageBadge } from './cloud.jsx';

const CustomersPage = lazy(() => import('./pages/CustomersPage.jsx'));
const B2BCustomersPage = lazy(() => import('./pages/B2BCustomersPage.jsx'));
const ListPage = lazy(() => import('./pages/ListPage.jsx').then(module => ({ default: module.ListPage })));
const CreateProductPage = lazy(() => import('./pages/CreateProductPage.jsx'));
const CreateVehicleWizard = lazy(() => import('./pages/CreateVehicleWizard.jsx'));
const EditorPage = lazy(() => import('./pages/EditorPage.jsx').then(module => ({ default: module.EditorPage })));
const WorkbenchPage = lazy(() => import('./pages/WorkbenchPage.jsx').then(module => ({ default: module.WorkbenchPage })));
const ServicePage = lazy(() => import('./pages/ServicePage.jsx').then(module => ({ default: module.ServicePage })));
const AccountPage = lazy(() => import('./pages/AccountPage.jsx'));
const AuditPage = lazy(() => import('./pages/AuditPage.jsx'));
const RulesApiPage = lazy(() => import('./pages/RulesApiPage.jsx'));
const SystemConnectionsPage = lazy(() => import('./pages/SystemConnectionsPage.jsx'));
const ProductionPage = lazy(() => import('./pages/ProductionPage.jsx'));
const ShippingRateTemplates = lazy(() => import('./pages/ShippingRateTemplates.jsx'));
const WarehouseLogisticsPage = lazy(() => import('./pages/WarehouseLogisticsPage.jsx'));
const InventoryLedgerWorkspace = lazy(() => import('./pages/InventoryLedgerWorkspace.jsx'));
const FactoriesPage = lazy(() => import('./pages/FactoriesPage.jsx'));
const ProductionAttachmentsPage = lazy(() => import('./pages/ProductionAttachmentsPage.jsx'));
const FinancePage = lazy(() => import('./pages/FinancePage.jsx'));
const DealerChannelPage = lazy(() => import('./pages/DealerChannelPage.jsx'));
const ServiceRequestsAdmin = lazy(() => import('./pages/ServiceRequestsAdmin.jsx'));
const CatalogAdminPage = lazy(() => import('./pages/CatalogAdminPage.jsx'));
const PortalAdminPage = lazy(() => import('./pages/PortalAdminPage.jsx'));
const TestRidesAdmin = lazy(() => import('./pages/TestRidesAdmin.jsx'));
const ColourInterestAdmin = lazy(() => import('./pages/ColourInterestAdmin.jsx'));
const PublicLocationsAdmin = lazy(() => import('./pages/PublicLocationsAdmin.jsx'));
const ProcurementPage = lazy(() => import('./pages/ProcurementPage.jsx'));
const SalesOrderPage = lazy(() => import('./pages/SalesOrderPage.jsx'));
const LogisticsTrackingPage = lazy(() => import('./pages/LogisticsTrackingPage.jsx'));
const VehicleAssetPage = lazy(() => import('./pages/VehicleAssetPage.jsx'));
const OwnerLeadsPage = lazy(() => import('./pages/OwnerLeadsPage.jsx'));
const MarketingCenterPage = lazy(() => import('./pages/MarketingCenterPage.jsx'));

/* 一级导航：按业务链条排列——渠道销售 → 生产交付 → 库存管理 → 财务对账。
   每项都落到真实视图，不新增空页面。旧 key 通过 LEGACY_DOMAIN 映射兼容已保存的工作区。 */
const navIcon = (d) => <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const DOMAINS = [
  { key: 'operations', label: '运营管理', icon: navIcon(<><path d="M2.2 7 8 2.4 13.8 7" /><path d="M3.6 7v6.4h8.8V7" /><path d="M6.6 13.4V9.6h2.8v3.8" /></>) },
  { key: 'product', label: '产品研发', icon: navIcon(<><path d="M8 2.2 13.4 5v6L8 13.8 2.6 11V5z" /><path d="M8 8 2.6 5M8 8l5.4-3M8 8v5.8" /></>) },
  { key: 'mall', label: '商城运营', icon: navIcon(<><path d="M2 5.2h12l-1 8.2H3z" /><path d="M5.6 5.2a2.4 2.4 0 0 1 4.8 0" /></>) },
  { key: 'marketing', label: '市场部', icon: navIcon(<><path d="M2 7.5 14 3v10L2 8.5z" /><path d="m5 9 1.7 4.3a1.8 1.8 0 0 0 2.3 1l1.1-.4" /><path d="M14 6.2h1.2a2.8 2.8 0 0 1 0 5.6H14" /></>) },
  { key: 'b2b-channels', label: 'B2B渠道', icon: navIcon(<><circle cx="5" cy="5" r="2" /><circle cx="11" cy="5" r="2" /><path d="M1.5 12c0-2 1.4-3.2 3.5-3.2S8.5 10 8.5 12M8 12c0-2 1.2-3.2 3-3.2s3.5 1.2 3.5 3.2" /></>) },
  { key: 'delivery', label: '工厂生产', icon: navIcon(<><path d="M2 11.4V4.6h7.2v6.8z" /><path d="M9.2 7h2.8l2 2.4v2H9.2z" /><circle cx="4.6" cy="12.6" r="1.3" /><circle cx="11.6" cy="12.6" r="1.3" /></>) },
  { key: 'warehouse', label: '库存中心', icon: navIcon(<><path d="M2 6.6 8 3l6 3.6V13H2z" /><path d="M6 13V9h4v4" /></>) },
  { key: 'finance', label: '财务对账', icon: navIcon(<><path d="M3 13.4 6.2 9l2.6 2.2L13 5.4" /><path d="M9.8 5.4H13v3.2" /><path d="M2.4 14.6h11.2" /></>) },
  { key: 'customers', label: '车主与车辆', icon: navIcon(<><circle cx="6" cy="6" r="2.4" /><path d="M2 13.4c0-2.2 1.8-3.6 4-3.6s4 1.4 4 3.6" /><path d="M11 4.2a2.2 2.2 0 0 1 0 4.2M12.2 13.4c0-1.6-.5-2.6-1.4-3.2" /></>) },
  { key: 'service', label: '售后服务', icon: navIcon(<><path d="M10.4 2.6a3.2 3.2 0 0 0-3.9 4L2.4 10.7l2.9 2.9 4.1-4.1a3.2 3.2 0 0 0 4-3.9l-2 2-2.1-2.1z" /></>) },
  { key: 'settings', label: '系统设置', icon: navIcon(<><circle cx="8" cy="8" r="2.2" /><path d="M8 1.8v1.6M8 12.6v1.6M2.4 8h1.6M12 8h1.6M4 4l1.1 1.1M10.9 10.9 12 12M12 4l-1.1 1.1M5.1 10.9 4 12" /></>) },
];
// 旧工作区里的 domain key → 新 key（避免历史会话恢复失败）。
const LEGACY_DOMAIN = { workbench: 'operations', supply: 'delivery', shop: 'mall', orders: 'b2b-channels' };
const normalizeDomain = key => LEGACY_DOMAIN[key] || key;

// 商城后台按淘宝卖家中心的信息架构分组：概览 → 商品 → 装修 → 交易。
const SHOP_NAV = [
  { title: '概览', items: [{ key: 'overview', label: '商城概览' }, { key: 'module-ledger', label: '模块台账' }] },
  { title: '流量运营', items: [{ key: 'seo-traffic', label: 'SEO 与流量中心' }] },
  { title: '商品管理', items: [{ key: 'products', label: '商品列表' }, { key: 'pricing', label: '价格设置' }, { key: 'media', label: '素材库' }] },
  { title: '店铺装修', items: [{ key: 'design', label: '店铺装修' }, { key: 'product-design', label: '商品装修' }, { key: 'pages', label: '页面管理' }] },
  { title: '交易管理', items: [{ key: 'orders', label: '订单管理' }, { key: 'payments', label: '线上支付' }, { key: 'reviews', label: '评价管理' }] },
];

const SHOP_SECTION_TITLES = { overview: '商城概览', 'module-ledger': '模块台账', 'seo-traffic': 'SEO 与流量中心', traffic: '流量', payments: '线上支付', products: '商品列表', 'product-design': '商品装修', pricing: '价格设置', design: '店铺装修', 'home-design': '首页装修', homepage: '首页装修', pages: '页面管理', media: '素材库', orders: '订单管理', reviews: '评价管理' };
const MARKETING_SECTIONS = [['overview', '市场概览'], ['ads', '站外推广'], ['materials', '营销素材'], ['ai', 'AI 内容生成'], ['channels', '推广渠道管理'], ['social', '社交媒体管理'], ['publishing', '内容发布管理'], ['brand', '品牌推广'], ['coupons', '优惠券管理'], ['referrals', '推荐返利'], ['messaging', '消息与触达']];

// 侧栏二级导航图标：与顶栏同一线性语言（24 网格 / 1.5 描边）
const sIcon = (d) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>;
const SIDE_ICONS = {
  '整车产品': sIcon(<><circle cx="5.5" cy="17.5" r="3.5" /><circle cx="18.5" cy="17.5" r="3.5" /><circle cx="15" cy="5" r="1" /><path d="M12 17.5V14l-3-3 4-3 2 3h2" /></>),
  '零配件': sIcon(<><path d="m5.5 8.5 3-3 3 3-3 3z" /><path d="m12.5 8.5 3-3 3 3-3 3z" /><path d="m5.5 15.5 3-3 3 3-3 3z" /><path d="m12.5 15.5 3-3 3 3-3 3z" /></>),
  '商城概览': sIcon(<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>),
  '流量': sIcon(<><path d="M4 20V10M10 20V4M16 20v-7M22 20v-4" /></>),
  '商品列表': sIcon(<><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" /><path d="M12 22V12" /><path d="m3.3 7 8.7 5 8.7-5" /></>),
  '素材库': sIcon(<><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21" /></>),
  '价格设置': sIcon(<><path d="M20.6 13.4 11 3.8H4v7l9.6 9.6a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8z" /><circle cx="7.5" cy="7.5" r="1.2" /></>),
  '页面管理': sIcon(<><rect x="3" y="3" width="18" height="7" rx="1" /><rect x="3" y="14" width="9" height="7" rx="1" /><rect x="16" y="14" width="5" height="7" rx="1" /></>),
  '首页装修': sIcon(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.8V21h14V9.8" /><path d="M9.5 21v-6h5v6" /></>),
  '首页内容': sIcon(<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.8V21h14V9.8" /><path d="M10 21v-6h4v6" /></>),
  '订单管理': sIcon(<><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" /><path d="M8 7h8" /><path d="M8 11h8" /><path d="M8 15h5" /></>),
  '评价管理': sIcon(<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></>),
  '生产订单': sIcon(<><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M8 11h8" /><path d="M8 16h5" /></>),
  '工厂订单': sIcon(<><rect x="9" y="2" width="6" height="3.6" rx="1" /><path d="M15 3.6h2.4A1.6 1.6 0 0 1 19 5.2V20a1.6 1.6 0 0 1-1.6 1.6H6.6A1.6 1.6 0 0 1 5 20V5.2a1.6 1.6 0 0 1 1.6-1.6H9" /><path d="M8.4 10.4h7.2M8.4 14.4h7.2M8.4 18h4.4" /></>),
  '物流跟踪': sIcon(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18" /><path d="M12 3a15 15 0 0 0 0 18" /></>),
  'B2B 销售订单': sIcon(<><path d="M5 3.6h11.2v16.8H5z" /><path d="M8.2 8h4.8M8.2 11.6h4.8M8.2 15.2h2.8" /></>),
  '订单总览': sIcon(<><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></>),
  '车主档案': sIcon(<><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2z" /></>),
  '车辆绑定与归属': sIcon(<><path d="M3 14h18l-1.4-5a2 2 0 0 0-1.9-1.5H6.3A2 2 0 0 0 4.4 9z" /><circle cx="7" cy="17" r="1.5" /><circle cx="17" cy="17" r="1.5" /><path d="M12 3v3M10 4.5h4" /></>),
  '试骑与线索': sIcon(<><path d="M3 12h4l2-6 4 12 2-6h6" /></>),
  '优惠券管理': sIcon(<><path d="M4 5h16v4a3 3 0 0 0 0 6v4H4v-4a3 3 0 0 0 0-6z" /><path d="M12 8v2m0 4v2" /></>),
  '推荐返利': sIcon(<><circle cx="7" cy="8" r="3" /><circle cx="17" cy="16" r="3" /><path d="M10 8h3a4 4 0 0 1 4 4v1" /><path d="m14 11 3 3 3-3" /></>),
  '消息与触达': sIcon(<><path d="M4 5h16v12H8l-4 4z" /><path d="M8 9h8M8 13h5" /></>),
  '财务对账': sIcon(<><path d="M4 20 7.6 13l3 2.6L18.6 5" /><path d="M13.6 5h5v5" /><path d="M3 20h18" /></>),
  '库存中心': sIcon(<><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z" /><path d="M6 18h12" /><path d="M6 14h12" /><path d="M6 10h12" /></>),
  '财务工作台': sIcon(<><path d="M3 6.4h18v13.2H3z" /><path d="M3 10.6h18" /><path d="M7.4 15.4h4.2" /><path d="M8 6.4V3.4h8v3" /></>),
  '发货入库': sIcon(<><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" /><path d="M15 18H9" /><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>),
  '生产物料': sIcon(<><path d="m12 2 8.5 4.5-8.5 4.5L3.5 6.5z" /><path d="m3.5 12 8.5 4.5 8.5-4.5" /><path d="m3.5 17 8.5 4.5 8.5-4.5" /></>),
  '生产附件': sIcon(<><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></>),
  '仓库与库存': sIcon(<><path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z" /><path d="M6 18h12" /><path d="M6 14h12" /><path d="M6 10h12" /></>),
  '合作工厂': sIcon(<><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" /><path d="M7 18h1" /><path d="M12 18h1" /><path d="M17 18h1" /></>),
  'VIN 车辆档案': sIcon(<><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" /><circle cx="7" cy="17" r="2" /><path d="M9 17h6" /><circle cx="17" cy="17" r="2" /></>),
  '维修工单': sIcon(<><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></>),
  '配件适配': sIcon(<><path d="M10 3.5a1.5 1.5 0 0 1 3 0V5h4a2 2 0 0 1 2 2v4h1.5a1.5 1.5 0 0 1 0 3H19v4a2 2 0 0 1-2 2h-4v-1.5a1.5 1.5 0 0 0-3 0V20H6a2 2 0 0 1-2-2v-4H2.5a1.5 1.5 0 0 1 0-3H4V7a2 2 0 0 1 2-2h4z" /></>),
  '配件替代': sIcon(<><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></>),
  '客户与车辆归属': sIcon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  '客户档案': sIcon(<><path d="M4 3h16v18H4z" /><path d="M8 8h8M8 12h8M8 16h5" /></>),
  '渠道与经销': sIcon(<><path d="M3.5 9.5 5.5 4h13l2 5.5" /><path d="M4.5 9.5V20h15V9.5" /><path d="M9.5 20v-5.5h5V20" /></>),
  '服务申请': sIcon(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2.8h6V4" /><path d="M9 11h6" /><path d="M9 15.5h4" /></>),
  '经营概览': sIcon(<><path d="m12 14 4-4" /><path d="M3.34 19a10 10 0 1 1 17.32 0" /></>),
  '生产成本台账': sIcon(<><path d="M2 6h4" /><path d="M2 10h4" /><path d="M2 14h4" /><path d="M2 18h4" /><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M9 6h6" /><path d="M9 10h6" /></>),
  '账号与权限': sIcon(<><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /></>),
  '门户账号审核': sIcon(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="m16 11 2 2 4-4" /></>),
  '操作审计': sIcon(<><path d="M15 12h-5" /><path d="M15 8h-5" /><path d="M19 17V5a2 2 0 0 0-2-2H4" /><path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3" /></>),
  __default: sIcon(<circle cx="12" cy="12" r="9" strokeDasharray="3 3" />),
};
const sideIcon = (label) => <span className="side__icon">{SIDE_ICONS[label] || SIDE_ICONS.__default}</span>;

function viewKey(domain, view) {
  return `${domain}:${view.type}:${view.kind || view.id || view.orderId || view.section || view.domain || ''}`;
}

function viewTitle(view) {
  if (view.type === 'list') return view.kind === 'part' ? '零配件' : '整车产品';
  if (view.type === 'create') return view.kind === 'part' ? '新建配件' : '新建整车';
  if (view.type === 'editor') return '产品详情';
  if (view.type === 'editor-advanced') return '产品资料与 BOM';
  if (view.type === 'service') return ({customers:'车主档案',vin:'车辆绑定与归属',repair:'维修工单',fit:'配件适配',substitute:'配件替代',centers:'服务网点'})[view.section] || '售后服务';
  if (view.type === 'owner-leads') return '试骑与线索';
  if (view.type === 'marketing-center') return (Object.fromEntries(MARKETING_SECTIONS)[view.section || 'overview']) || '市场部';
  if (view.type === 'catalog') return SHOP_SECTION_TITLES[view.section || 'overview'] || '商城';
  if (view.type === 'test-rides') return '试骑意向';
  if (view.type === 'colour-interest') return '颜色偏好';
  if (view.type === 'public-locations') return '公开网点';
  if (view.type === 'dealer') return 'B2B 分销运营';
  if (view.type === 'service-requests') return '门户服务申请';
  if (view.type === 'sales-orders') return 'B2B 销售订单';
  if (view.type === 'sales-orders-overview') return '订单总览';
  if (view.type === 'production-overview') return '生产总览';
  if (view.type === 'logistics') return '物流跟踪';
  if (view.type === 'assets') return '整车台账';
  return ({workbench:'经营概览',production:'工厂订单',procurement:'采购管理',inventory:'库存总览','inventory-ledger':'出入库流水','warehouse-settings':'仓库设置','shipping-rate-templates':'运费模板',factories:'合作工厂',deliveries:'工厂订单',materials:'工厂订单',attachments:'生产附件',finance:'财务对账',catalog:'官网商城',accounts:'内部账号','portal-admin':'门户权限',audit:'操作审计',rules:'规则与接口','system-connections':'连接状态','b2b-customers':'客户档案'})[view.type] || '业务页面';
}

function restoreWorkspaces(storageKey) {
  for (const read of [() => localStorage.getItem(storageKey), () => sessionStorage.getItem(storageKey)]) {
    try {
      const saved=JSON.parse(read()||'null');
      if(!Array.isArray(saved?.workspaces))continue;
      const workspaces=saved.workspaces.filter(item=>item&&DOMAINS.some(domain=>domain.key===normalizeDomain(item.domain))&&item.view&&typeof item.view.type==='string').map(item=>({key:viewKey(normalizeDomain(item.domain),item.view),domain:normalizeDomain(item.domain),view:item.view,title:viewTitle(item.view)}));
      const unique=[...new Map(workspaces.map(item=>[item.key,item])).values()];
      if(!unique.length)continue;
      const active=unique.find(item=>item.key===saved.activeKey)||unique[0];
      return {workspaces:unique,domain:active.domain,view:active.view};
    } catch {}
  }
  return null;
}

export default function App({ user, onLogout }) {
  const standaloneParams = new URLSearchParams(window.location.search);
  const standaloneStorefront = standaloneParams.get('adminWindow') === 'storefront-design';
  // 独立编辑窗口：edit=home 直达首页可视化编辑器；edit=page 带 pageId 直达该页面的 CMS 编辑器。
  // 不带 edit 时保持原行为（版本列表 + 预览），供需要时单独打开独立预览窗口。
  const standaloneEdit = standaloneParams.get('edit');
  const standalonePageId = standaloneParams.get('pageId') || '';
  const standaloneInitialView = standaloneStorefront
    ? (standaloneEdit === 'home' ? {type:'catalog',section:'home-design'}
      : standaloneEdit === 'page' && standalonePageId ? {type:'catalog',section:'pages',pageId:standalonePageId}
      : {type:'catalog',section:'design'})
    : null;
  const workspaceStorageKey=`alsvid-v2-workspaces:${user?.username||user?.role||'user'}`;
  const searchStorageKey=`alsvid-v2-global-search:${user?.username||user?.role||'user'}`;
  const [restoredWorkspaces] = useState(()=>standaloneStorefront ? null : restoreWorkspaces(workspaceStorageKey));
  const [meta, setMeta] = useState(null);
  const [metaError, setMetaError] = useState('');
  const [metaAttempt, setMetaAttempt] = useState(0);
  const [view, setView] = useState(()=>standaloneInitialView || restoredWorkspaces?.view||{type:'list',kind:'vehicle'});
  const [workspaces, setWorkspaces] = useState(()=>standaloneInitialView ? [{key:viewKey('mall',standaloneInitialView),domain:'mall',view:standaloneInitialView,title:viewTitle(standaloneInitialView)}] : restoredWorkspaces?.workspaces||[{key:'product:list:vehicle',domain:'product',view:{type:'list',kind:'vehicle'},title:'整车产品'}]);
  const [dirtyWorkspaces, setDirtyWorkspaces] = useState({});
  // 全局操作反馈：顶部居中浮层，保存/新建等关键操作后明确告知成功或失败。
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const notify = useCallback((msg, isErr) => {
    if (!msg) return;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg: String(msg), err: Boolean(isErr) });
    toastTimer.current = setTimeout(() => setToast(null), isErr ? 5000 : 3000);
  }, []);
  const dismissToast = useCallback(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
  }, []);
  const [q, setQ] = useState(()=>{try{const saved=localStorage.getItem(searchStorageKey);if(saved!==null)return saved}catch{}try{return sessionStorage.getItem(searchStorageKey)||''}catch{return ''}});
  const [results, setResults] = useState(null);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('alsvid-v2-theme') === 'dark' ? 'dark' : 'light'; } catch { return 'light'; } });
  // 主题色：green（科技绿，默认）/ blue（科技蓝）。写到 <html data-accent> 上驱动 CSS 变量。
  const [accent, setAccent] = useState(() => { try { return localStorage.getItem('alsvid-v2-accent') === 'blue' ? 'blue' : 'green'; } catch { return 'green'; } });
  useLayoutEffect(() => {
    document.documentElement.dataset.accent = accent;
    try { localStorage.setItem('alsvid-v2-accent', accent); } catch {}
  }, [accent]);
  useEffect(() => () => { delete document.documentElement.dataset.accent; }, []);
  const [domain, setDomain] = useState(()=>standaloneStorefront ? 'mall' : restoredWorkspaces?.domain||'product');
  const [serviceSection, setServiceSection] = useState(()=>restoredWorkspaces?.view?.section||'vin');
  const navRef = useRef(null);
  const pillRef = useRef(null);
  const timer = useRef(null);
  const searchVersion = useRef(0);
  const activeViewKey = viewKey(domain, view);
  const updateWorkspaceDirty = useCallback((key, dirty) => setDirtyWorkspaces(current => {
    if (Boolean(current[key]) === dirty) return current;
    const next = { ...current };
    if (dirty) next[key] = true;
    else delete next[key];
    return next;
  }), []);

  useEffect(() => {
    let active = true;
    api.meta().then(data => { if (active) { setMeta(data); setMetaError(''); } })
      .catch(error => { if (active) setMetaError(error.message || '无法连接服务，请重试'); });
    return () => { active = false; };
  }, [metaAttempt]);
  useEffect(() => {
    setWorkspaces(current => current.some(item => item.key === activeViewKey) ? current : [...current, {key:activeViewKey,domain,view,title:viewTitle(view)}]);
  }, [activeViewKey, domain, view]);
  useEffect(()=>{
    if (standaloneStorefront) return;
    const saved=JSON.stringify({workspaces,activeKey:activeViewKey});
    try { localStorage.setItem(workspaceStorageKey,saved); } catch {}
    try { sessionStorage.setItem(workspaceStorageKey,saved); } catch {}
  },[standaloneStorefront,workspaceStorageKey,workspaces,activeViewKey]);
  useEffect(()=>{try{localStorage.setItem(searchStorageKey,q)}catch{}try{sessionStorage.setItem(searchStorageKey,q)}catch{}},[searchStorageKey,q]);
  useEffect(()=>{
    const version=++searchVersion.current;
    clearTimeout(timer.current);
    setResults(null);
    if(!q.trim())return;
    timer.current=setTimeout(async()=>{
      try { const rows=await api.search(q); if(version===searchVersion.current)setResults(rows); }
      catch { if(version===searchVersion.current)setResults([]); }
    },250);
    return()=>clearTimeout(timer.current);
  },[q]);
  useEffect(()=>{
    if(!Object.values(dirtyWorkspaces).some(Boolean))return;
    const warn=e=>{e.preventDefault();e.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[dirtyWorkspaces]);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const pill = pillRef.current;
    if (!nav || !pill) return;
    const update = () => {
      const active = nav.querySelector('.alsvid-topbar__item.is-active');
      if (!active) return;
      pill.style.width = `${active.offsetWidth}px`;
      pill.style.height = `${active.offsetHeight}px`;
      pill.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
      pill.style.opacity = '1';
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [domain, meta]);

  const onSearch = (v) => {
    setQ(v);
  };

  const gotoResult = (r) => {
    setResults(null); setQ(''); setDomain('product');
    setView({ type: 'editor', id: r.id, fromKind: r.kind });
  };

  const chooseDomain = (key) => {
    setDomain(key);
    if (key === 'operations') setView({ type: 'workbench' });
    else if (key === 'service') { const section = ['repair', 'fit', 'substitute'].includes(serviceSection) ? serviceSection : 'repair'; setServiceSection(section); setView({ type: 'service', section }); }
    else if (key === 'customers') { setServiceSection('customers'); setView({ type: 'service', section: 'customers' }); }
    else if (key === 'marketing') setView({ type: 'marketing-center', section: 'overview' });
    else if (key === 'b2b-channels') setView({ type: 'sales-orders-overview' });
    else if (key === 'b2b') setView({ type: 'dealer', section: 'companies' });
    else if (key === 'settings') setView({ type: 'accounts' });
    else if (key === 'delivery') setView({ type: 'production' });
    else if (key === 'warehouse') setView({ type: 'inventory' });
    else if (key === 'finance') setView({ type: 'finance' });
    else if (key === 'mall') setView({ type: 'catalog', section: 'overview' });
    else if (key === 'product') setView({ type: 'list', kind: view.fromKind || 'vehicle' });
    else setView({ type: 'placeholder', domain: key });
  };

  const activateWorkspace = item => {
    setDomain(item.domain);
    if(item.view.type==='service')setServiceSection(item.view.section);
    setView(item.view);
  };

  const navigateBusinessView = (next, params = {}) => {
    if (next === 'sales-orders') setDomain('b2b-channels');
    else if (next === 'production') setDomain('delivery');
    else if (next === 'finance') setDomain('finance');
    setView({ type: next, ...params });
  };

  // 经营概览待办卡片的跳转：统一把跨域跳转收在这里，避免 JSX 里嵌套太多分支。
  const openWorkbenchItem = (nextDomain, key) => {
    const nd = normalizeDomain(nextDomain);
    setDomain(nd);
    if (nd === 'product') setView({ type: 'list', kind: key === 'parts' ? 'part' : 'vehicle' });
    else if (nd === 'service') {
      if (key === 'serviceRequests') { setView({ type: 'service-requests' }); return; }
      const next = key === 'customerFollowups' ? 'customers' : key === 'repairsOpen' ? 'repair' : key === 'fitments' ? 'fit' : key === 'substitutes' ? 'substitute' : 'vin';
      setServiceSection(next); setView({ type: 'service', section: next });
    }
    else if (nd === 'customers') {
      if (key === 'dealerOrders') { setDomain('b2b'); setView({ type: 'dealer', section: 'orders' }); return; }
      if (key === 'dealerReturns') { setDomain('b2b'); setView({ type: 'dealer', section: 'returns' }); return; }
      setServiceSection('customers'); setView({ type: 'service', section: 'customers' });
    }
    else if (key === 'dealerOrders') { setDomain('b2b'); setView({ type: 'dealer', section: 'orders' }); }
    else if (key === 'dealerReturns') { setDomain('b2b'); setView({ type: 'dealer', section: 'returns' }); }
    else if (nd === 'settings') setView({ type: 'portal-admin' });
    else if (nd === 'delivery') setView({ type: 'production' });
    else if (nd === 'warehouse') setView({ type: 'inventory' });
    else if (nd === 'mall') setView({ type: 'catalog', section: 'overview' });
  };

  const closeWorkspace = key => {
    if (workspaces.length < 2) return;
    if (dirtyWorkspaces[key] && !window.confirm('当前工作页有未保存修改，关闭后会丢失这些内容。确定关闭吗？')) return;
    const index = workspaces.findIndex(item => item.key === key);
    const remaining = workspaces.filter(item => item.key !== key);
    if (activeViewKey === key) {
      const next = remaining[Math.min(index, remaining.length - 1)];
      activateWorkspace(next);
    }
    setWorkspaces(remaining);
    setDirtyWorkspaces(current => { if (!current[key]) return current; const next = { ...current }; delete next[key]; return next; });
  };

  if (!meta) return <div className="hint" style={{ padding: 24 }}>{metaError ? <><p className="error-text" role="alert">{metaError}</p><button className="btn" onClick={() => { setMetaError(''); setMetaAttempt(value => value + 1); }}>重新连接</button></> : '加载中…'}</div>;
  const tplName = (code) => (meta.templates.find(t => t.code === code) || {}).name || code;
  const domainLabel = DOMAINS.find(d => d.key === domain)?.label;

  return (
    <div className={'app' + (standaloneStorefront ? ' app--standalone-storefront' : '')} data-mode={theme}>
      {!standaloneStorefront && <header className="alsvid-topbar" id="topbar" data-theme={theme}>
        <div className="alsvid-topbar__brand">
          <img className="alsvid-brand-logo alsvid-topbar__logo" src="/alsvid-logo.png" alt="ALSVID" />
        </div>
        <nav className="alsvid-topbar__nav" ref={navRef} aria-label="一级业务导航">
          <span className="alsvid-topbar__pill" ref={pillRef} aria-hidden="true" />
          {DOMAINS.map(d => (
            <button key={d.key} type="button" className={'alsvid-topbar__item' + (domain === d.key ? ' is-active' : '')} onClick={() => chooseDomain(d.key)}>
              <span className="alsvid-topbar__icon" aria-hidden="true">{d.icon}</span><span>{d.label}</span>
            </button>
          ))}
        </nav>
        <div className="alsvid-topbar__tools">
          <div className="alsvid-topbar__search">
            <svg className="alsvid-topbar__searchicon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" /><path d="M10.6 10.6 14 14" /></svg>
            <input type="search" autoComplete="off" placeholder="全局搜索 SKU / 产品 / 颜色 / 字段" aria-label="全局搜索" value={q} onChange={e => onSearch(e.target.value)} />
            {results !== null && q.trim() && <div className="search-results">{results.length ? results.map(r => <div key={r.id} className="sr-item" onClick={() => gotoResult(r)}><span className="tag">{r.kind === 'vehicle' ? '整车' : '配件'}</span><span className="link">{r.name}</span><span className="hint" /><span className="hint" style={{ marginLeft: 'auto' }} /></div>) : <div className="sr-empty">未找到匹配的产品、配件或字段值</div>}</div>}
          </div>
          <StorageBadge />
          <details className="alsvid-topbar__more">
            <summary title="主题与工具" aria-label="主题与工具"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="8.5" cy="10" r=".8" fill="currentColor"/><circle cx="12" cy="7.5" r=".8" fill="currentColor"/><circle cx="15.5" cy="10" r=".8" fill="currentColor"/><path d="M12 20c-1.4 0-2.2-1-2.2-2.1 0-1.2.9-1.9 2.2-1.9h1.5c1.4 0 2.2-.8 2.2-2"/></svg></summary>
            <div className="alsvid-topbar__menu">
              <div className="alsvid-topbar__menu-label">主题色</div>
              <div className="alsvid-topbar__accents" role="group" aria-label="主题色">
                <button type="button" className={accent === 'green' ? 'is-on' : ''} onClick={() => setAccent('green')}><i style={{ background: 'linear-gradient(135deg,#8adb3a,#6fbf26)' }} />科技绿</button>
                <button type="button" className={accent === 'blue' ? 'is-on' : ''} onClick={() => setAccent('blue')}><i style={{ background: 'linear-gradient(135deg,#60a5fa,#2563eb)' }} />科技蓝</button>
              </div>
              <div className="alsvid-topbar__menu-label">界面明暗</div>
              <div className="alsvid-topbar__menu-row" role="group" aria-label="顶栏配色">{['light', 'dark'].map(t => <button key={t} type="button" className={theme === t ? 'is-on' : ''} onClick={() => { setTheme(t); try { localStorage.setItem('alsvid-v2-theme', t); } catch {} }}>{t === 'light' ? '浅色' : '深色'}</button>)}</div>
              <button type="button" className="alsvid-topbar__menu-item" onClick={() => window.location.reload()}>刷新页面</button>
              <button type="button" className="alsvid-topbar__menu-item" onClick={() => document.documentElement.requestFullscreen?.()}>全屏显示</button>
            </div>
          </details>
          <details className="alsvid-topbar__user">
            <summary>
              <span className="alsvid-topbar__avatar" aria-hidden="true">{(user?.role === 'admin' ? 'A' : (user?.username || 'U').slice(0, 1).toUpperCase())}</span>
              <span className="alsvid-topbar__uname">{user?.role === 'admin' ? 'Admin' : (user?.username || '').split('@')[0]}</span>
              <svg className="alsvid-topbar__caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </summary>
            <div className="alsvid-topbar__menu">
              <div className="alsvid-topbar__menu-note">{user?.username}</div>
              <button type="button" className="alsvid-topbar__menu-item" onClick={() => { if (onLogout) onLogout(); else setView({ type: 'accounts' }); }}>退出登录</button>
            </div>
          </details>
        </div>
      </header>}

      {!standaloneStorefront && <aside className="side">
        <div className="side__title">{domainLabel}</div>
        {domain === 'mall' ? SHOP_NAV.map(group => <React.Fragment key={group.title}><div className="side__group">{group.title}</div>{group.items.map(item => <button key={item.key} type="button" className={'side__item' + (view.type === 'catalog' && (view.section || 'overview') === item.key ? ' is-active' : '')} onClick={() => setView({ type: 'catalog', section: item.key })}>{sideIcon(item.label)}{item.label}</button>)}</React.Fragment>)
        : domain === 'product' ? <>
            <button className={'side__item' + (view.type === 'list' && view.kind === 'vehicle' ? ' is-active' : '')} onClick={() => setView({ type: 'list', kind: 'vehicle' })}>{sideIcon('整车产品')}整车产品</button>
            <button className={'side__item' + (view.type === 'list' && view.kind === 'part' ? ' is-active' : '')} onClick={() => setView({ type: 'list', kind: 'part' })}>{sideIcon('零配件')}零配件</button>
          </>
        : domain === 'delivery' ? <>
            {[['production-overview','生产总览'],['production','工厂订单'],['factories','合作工厂'],['logistics','物流跟踪']].map(([k, label]) => <button key={k} className={'side__item' + (view.type === k ? ' is-active' : '')} onClick={() => setView({ type: k })}>{sideIcon(label)}{label}</button>)}
          </>
        : domain === 'finance' ? <>
            <button className={'side__item' + (view.type === 'finance' ? ' is-active' : '')} onClick={() => setView({ type: 'finance' })}>{sideIcon('财务工作台')}财务工作台</button>
          </>
        : domain === 'warehouse' ? <>
            {[['assets','整车台账'],['inventory','库存总览'],['inventory-ledger','出入库流水'],['warehouse-settings','仓库设置'],['shipping-rate-templates','运费模板']].map(([k, label]) => <button key={k} className={'side__item' + (view.type === k ? ' is-active' : '')} onClick={() => setView({ type: k })}>{sideIcon(label === '整车台账' ? 'VIN 车辆档案' : label)}{label}</button>)}
          </>
        : domain === 'service' ? <>
            {user.role === 'admin' && <button className={'side__item' + (view.type === 'service-requests' ? ' is-active' : '')} onClick={() => setView({ type: 'service-requests' })}>{sideIcon('服务申请')}门户服务申请</button>}
            {[['repair','维修工单'],['fit','配件适配'],['substitute','配件替代']].map(([k, label]) => <button key={k} className={'side__item' + (view.type === 'service' && serviceSection === k ? ' is-active' : '')} onClick={() => { setServiceSection(k); setView({ type: 'service', section: k }); }}>{sideIcon(label)}{label}</button>)}
          </>
        : domain === 'customers' ? <>
            <button className={'side__item' + (view.type === 'service' && serviceSection === 'customers' ? ' is-active' : '')} onClick={() => { setServiceSection('customers'); setView({ type: 'service', section: 'customers' }); }}>{sideIcon('车主档案')}车主档案</button>
            <button className={'side__item' + (view.type === 'service' && serviceSection === 'vin' ? ' is-active' : '')} onClick={() => { setServiceSection('vin'); setView({ type: 'service', section: 'vin' }); }}>{sideIcon('车辆绑定与归属')}车辆绑定与归属</button>
            {user.role === 'admin' && <button className={'side__item' + (view.type === 'owner-leads' ? ' is-active' : '')} onClick={() => setView({ type: 'owner-leads' })}>{sideIcon('试骑与线索')}试骑与线索</button>}
            {user.role === 'admin' && <button className={'side__item' + (view.type === 'public-locations' ? ' is-active' : '')} onClick={() => setView({ type: 'public-locations' })}>{sideIcon('公开网点')}公开网点</button>}
          </>
        : domain === 'marketing' ? <>
            {MARKETING_SECTIONS.map(([section, label]) => <button key={section} className={'side__item' + (view.type === 'marketing-center' && view.section === section ? ' is-active' : '')} onClick={() => setView({ type: 'marketing-center', section })}>{sideIcon(label)}{label}</button>)}
          </>
        : domain === 'b2b-channels' ? <>
            <button className={'side__item' + (view.type === 'b2b-customers' ? ' is-active' : '')} onClick={() => setView({ type: 'b2b-customers' })}>{sideIcon('客户档案')}客户档案</button>
            <button className={'side__item' + (view.type === 'sales-orders-overview' ? ' is-active' : '')} onClick={() => setView({ type: 'sales-orders-overview' })}>{sideIcon('订单总览')}订单总览</button>
            <button className={'side__item' + (view.type === 'sales-orders' ? ' is-active' : '')} onClick={() => setView({ type: 'sales-orders' })}>{sideIcon('B2B 销售订单')}B2B 销售订单</button>
          </>
        : domain === 'b2b' ? <>
            {user.role === 'admin' && <button className={'side__item' + (view.type === 'dealer' ? ' is-active' : '')} onClick={() => setView({ type: 'dealer', section: 'companies' })}>{sideIcon('渠道与经销')}B2B 分销运营</button>}
          </>
        : domain === 'operations' ? <div className="side__item is-active">{sideIcon('经营概览')}经营概览</div>
        : domain === 'settings' ? <>
            {[['accounts','账号与权限'],['portal-admin','门户账号与车辆授权'],['audit','操作审计'],['system-connections','连接状态'],['rules','规则与接口']].map(([k, label]) => <button key={k} className={'side__item' + (view.type === k ? ' is-active' : '')} onClick={() => setView({ type: k })}>{sideIcon(label === '门户账号与车辆授权' ? '门户账号审核' : label)}{label}</button>)}
          </>
        : <div className="side__item is-active">{sideIcon('当前阶段预留')}当前阶段预留</div>}
      </aside>}

      <main className="work">
        {!standaloneStorefront && <div className="tabs workspace-tabs" role="tablist" aria-label="打开的工作页">
          {workspaces.map(item=><span key={item.key} role="presentation" className="workspace-tab"><button type="button" role="tab" aria-selected={item.key===activeViewKey} className={'tab'+(item.key===activeViewKey?' active':'')} onClick={()=>activateWorkspace(item)}>{item.title}</button>{workspaces.length>1&&<button type="button" className="workspace-tab__close" aria-label={`关闭${item.title}`} onClick={()=>closeWorkspace(item.key)}>×</button>}</span>)}
        </div>}
        <div className="view">
          {workspaces.map(item=>{const page=item.view,pageDomain=item.domain;return <section className="workspace-panel" key={item.key} hidden={item.key!==activeViewKey} aria-hidden={item.key!==activeViewKey}>
            <ErrorBoundary key={'eb-'+item.key} title={viewTitle(page)}>
            <Suspense fallback={<div className="card" role="status">正在载入业务模块…</div>}>
            {page.type==='list'&&<ListPage active={item.key===activeViewKey} kind={page.kind} meta={meta} user={user} onEdit={id=>setView({type:'editor',id,fromKind:page.kind})} onCreate={kind=>setView({type:'create',kind})} onOpenBom={id=>setView({type:'editor-advanced',id,fromKind:'vehicle',tab:'关联 BOM'})}/>}
            {page.type==='create'&&user.role==='admin'&&<CreateProductPage kind={page.kind} meta={meta} onNotify={notify} onWorkspaceDirtyChange={updateWorkspaceDirty} workspaceKey={item.key} onBack={()=>setView({type:'list',kind:page.kind})} onCreated={product=>{notify('产品已创建成功');setView({type:'editor',id:product.id,fromKind:page.kind})}}/>}
            {page.type==='editor'&&((page.fromKind||'vehicle')==='vehicle'&&user.role==='admin'
              ?<CreateVehicleWizard productId={page.id} meta={meta} onNotify={notify} workspaceKey={item.key} onWorkspaceDirtyChange={updateWorkspaceDirty} onBack={()=>setView({type:'list',kind:'vehicle'})}/>
              :<EditorPage id={page.id} meta={meta} canEdit={user.role==='admin'} workspaceKey={item.key} onWorkspaceDirtyChange={updateWorkspaceDirty} onBack={()=>setView({type:'list',kind:page.fromKind||'vehicle'})}/>)}
            {page.type==='editor-advanced'&&<EditorPage id={page.id} meta={meta} initialTab={page.tab} canEdit={user.role==='admin'} workspaceKey={item.key} onWorkspaceDirtyChange={updateWorkspaceDirty} onBack={()=>setView({type:'editor',id:page.id,fromKind:'vehicle'})}/>}
            {page.type==='create'&&user.role!=='admin'&&<div className="card">只读账号无法新建产品。</div>}
            {page.type==='workbench'&&<WorkbenchPage active={item.key===activeViewKey} user={user} onOpen={openWorkbenchItem}/>}
            {page.type==='service'&&page.section==='customers'&&<CustomersPage active={item.key===activeViewKey} user={user} workspaceKey={item.key} onWorkspaceDirtyChange={updateWorkspaceDirty}/>}
            {page.type==='b2b-customers'&&<B2BCustomersPage active={item.key===activeViewKey} user={user}/>}
            {page.type==='dealer'&&<DealerChannelPage active={item.key===activeViewKey} user={user} section={page.section||'companies'}/>}
            {page.type==='service-requests'&&<ServiceRequestsAdmin active={item.key===activeViewKey} user={user}/>}
            {page.type==='test-rides'&&<TestRidesAdmin active={item.key===activeViewKey} user={user}/>}
            {page.type==='colour-interest'&&<ColourInterestAdmin active={item.key===activeViewKey} user={user}/>}
            {page.type==='owner-leads'&&<OwnerLeadsPage active={item.key===activeViewKey} user={user}/>}
            {page.type==='marketing-center'&&<MarketingCenterPage section={page.section||'coupons'}/>}
            {page.type==='public-locations'&&<PublicLocationsAdmin active={item.key===activeViewKey} user={user}/>}
            {page.type==='service'&&page.section!=='customers'&&<ServicePage active={item.key===activeViewKey} user={user} section={page.section||serviceSection} onSectionChange={next=>{setServiceSection(next);setView({type:'service',section:next})}}/>}
            {pageDomain==='settings'&&<div className="tabs"><button className={'tab'+(page.type==='accounts'?' active':'')} onClick={()=>setView({type:'accounts'})}>内部账号</button><button className={'tab'+(page.type==='portal-admin'?' active':'')} onClick={()=>setView({type:'portal-admin'})}>门户账号与车辆授权</button>{user.role==='admin'&&<button className={'tab'+(page.type==='audit'?' active':'')} onClick={()=>setView({type:'audit'})}>操作审计</button>}<button className={'tab'+(page.type==='system-connections'?' active':'')} onClick={()=>setView({type:'system-connections'})}>连接状态</button><button className={'tab'+(page.type==='rules'?' active':'')} onClick={()=>setView({type:'rules'})}>规则与接口</button></div>}
            {page.type==='portal-admin'&&<PortalAdminPage active={item.key===activeViewKey} user={user}/>}{page.type==='accounts'&&<AccountPage active={item.key===activeViewKey} user={user} onLogout={onLogout}/>}
            {page.type==='audit'&&user.role==='admin'&&<AuditPage active={item.key===activeViewKey}/>}
            {page.type==='rules'&&<RulesApiPage/>}
            {page.type==='system-connections'&&user.role==='admin'&&<SystemConnectionsPage/>}
            {(page.type==='production'||page.type==='production-overview')&&<ProductionPage section={page.type==='production-overview'?'overview':'orders'} active={item.key===activeViewKey} user={user} onNavigate={navigateBusinessView} onOpenDelivery={orderId=>setView({type:'deliveries',orderId})}/>}{page.type==='logistics'&&<LogisticsTrackingPage active={item.key===activeViewKey}/>}{(page.type==='sales-orders'||page.type==='sales-orders-overview')&&<SalesOrderPage active={item.key===activeViewKey} user={user} section={page.type==='sales-orders-overview'?'overview':'orders'} orderId={page.orderId} onNavigate={navigateBusinessView}/>}{page.type==='finance'&&<FinancePage active={item.key===activeViewKey}/>}{page.type==='catalog'&&<CatalogAdminPage active={item.key===activeViewKey} section={page.section||'overview'} pageQuery={page.pageQuery||''} pageId={page.pageId||''} productId={page.productId||''} user={user} workspaceKey={item.key} onWorkspaceDirtyChange={updateWorkspaceDirty} onSectionChange={(next,extra)=>setView({type:'catalog',section:next,...(extra||{})})} onOpenProduct={id=>setView({type:'editor',id,fromKind:'vehicle'})} onCreateProduct={kind=>{setDomain('product');setView({type:'create',kind:kind||'vehicle'})}}/>}
            {page.type==='procurement'&&<ProcurementPage active={item.key===activeViewKey} user={user}/>}
            {page.type==='inventory'&&<WarehouseLogisticsPage section="stock" active={item.key===activeViewKey} user={user}/>}{page.type==='assets'&&<VehicleAssetPage active={item.key===activeViewKey}/>}{page.type==='inventory-outbound'&&<InventoryLedgerWorkspace active={item.key===activeViewKey} user={user}/>}{page.type==='inventory-ledger'&&<InventoryLedgerWorkspace active={item.key===activeViewKey} user={user}/>}{page.type==='shipping-rate-templates'&&<ShippingRateTemplates active={item.key===activeViewKey} user={user}/>}{page.type==='warehouse-settings'&&<WarehouseLogisticsPage section="warehouses" active={item.key===activeViewKey} user={user}/>}{page.type==='factories'&&<FactoriesPage active={item.key===activeViewKey} user={user}/>}{(page.type==='deliveries'||page.type==='materials')&&<ProductionPage active={item.key===activeViewKey} user={user}/>}{page.type==='attachments'&&<ProductionAttachmentsPage active={item.key===activeViewKey} user={user}/>}
            {page.type==='placeholder'&&<div className="card placeholder"><div className="placeholder-mark">{DOMAINS.find(d=>d.key===page.domain)?.icon}</div><h2 /><p>该业务域已纳入 ALSVID V2.0 一级架构，当前阶段先建设内部产品管理。</p><span className="hint" /></div>}
            </Suspense>
            </ErrorBoundary>
          </section>})}
        </div>
      </main>

      {toast && <div className={'toast' + (toast.err ? ' err' : '')} role={toast.err ? 'alert' : 'status'} aria-live="assertive">
        <span className="toast__mark" aria-hidden="true">{toast.err ? '!' : '✓'}</span>
        <span className="toast__msg">{toast.msg}</span>
        <button type="button" className="toast__close" aria-label="关闭提示" onClick={dismissToast}>×</button>
      </div>}
    </div>
  );
}
