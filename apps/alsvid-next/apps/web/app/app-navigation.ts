import type { AppNavItem } from '@alsvid/ui';

export const appNavigation: readonly AppNavItem[] = [
  { label: '首页', href: '/', icon: 'home', topLevel: true },
  { label: '产品中心', href: '/product', section: '产品管理', icon: 'box', topLevel: true },
  { label: '配件 BOM', href: '/product#engineering', section: '产品管理', icon: 'settings', topLevel: true },
  { label: '图片 / 视频素材', href: '#', section: '产品管理', icon: 'file', status: '规划中', disabled: true },
  { label: '技术资料', href: '#', section: '产品管理', icon: 'file', status: '规划中', disabled: true },
  { label: '采购 / 供应商', href: '/supply', section: '产品管理', icon: 'store' },
  { label: '订单 / 外部渠道', href: '/commerce', section: '销售与渠道', icon: 'order', topLevel: true },
  { label: '经销商', href: '/dealers', section: '销售与渠道', icon: 'store', topLevel: true },
  { label: '合作伙伴 / 客户', href: '/partners', section: '销售与渠道', icon: 'users', topLevel: true },
  { label: '财务', href: '/finance', section: '销售与渠道', icon: 'file' },
  { label: '生产 / 质检', href: '/production', section: '运营与交付', icon: 'bike' },
  { label: '库存 / 仓库', href: '/inventory', section: '运营与交付', icon: 'box' },
  { label: '出口物流', href: '/logistics', section: '运营与交付', icon: 'truck' },
  { label: 'Vehicle 360', href: '#', section: '车辆与售后', icon: 'bike', status: '规划中', disabled: true, topLevel: true },
  { label: '售后服务', href: '#', section: '车辆与售后', icon: 'tool', status: '规划中', disabled: true, topLevel: true },
  { label: '员工中心', href: '/people/employees', section: '系统设置', icon: 'user', status: '骨架' },
  { label: '角色 / 权限', href: '#', section: '系统设置', icon: 'shield', status: '待完善', disabled: true },
  { label: '系统设置', href: '/settings/environment', section: '系统设置', icon: 'settings', topLevel: true },
] as const;

export function navigationFor(activeHref: string): readonly AppNavItem[] {
  return appNavigation.map((item) => ({ ...item, active: !item.disabled && item.href === activeHref }));
}
