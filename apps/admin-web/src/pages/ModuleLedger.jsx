import React from 'react';

// 集成验收 · 模块台账
// 用途：所有「已做/骨架就绪/待外部凭据/待决策」的模块集中列在一页，后续逐项更新状态。
// 状态口径：
//   done         已完成并验证
//   skeleton     代码骨架就绪（UI + 接口 + 数据结构），只差填内容或接外部服务
//   blocked       卡在外部凭据/授权/决策，需要人工提供
//   pending      尚未开始（按验收顺序排队）
// 这一页本身不调用外部接口，纯静态清单，避免把台账状态误当成实时数据。

const GROUPS = [
  {
    title: '01–03 · 数据与环境（验收前置）',
    rows: [
      { id: '01', name: 'Neon 测试分支与迁移验证', status: 'blocked', note: '护栏要求 *.neon.tech 隔离分支；本机无 Neon API 凭据', touch: '需 Neon API key → 建分支 → 跑 scripts/acceptance-178.mjs' },
      { id: '02', name: '装修发布 / 预览 / 回滚真实操作验收', status: 'skeleton', note: '验收脚本与各接口已就绪，随 01 在测试库执行', touch: 'scripts/acceptance-178.mjs；ALSVID_LAYOUT_VERSION_STRICT 上线前开启' },
      { id: '03', name: 'Explore 正文与素材迁移（57 条）', status: 'skeleton', note: '迁移定义 JSON 已生成，未入库；逐页重定向已实现', touch: 'scripts/migrate-explore-pages.mjs --apply（需管理员会话）' },
    ],
  },
  {
    title: '04–05 · 法定页面与支付',
    rows: [
      { id: '04', name: '德国法定页面（6 页 ×3 语言）', status: 'skeleton', note: '页面结构与前台展示已做；真实公司主体与法律文本待录入审核，不编造', touch: 'scripts/seed-legal-pages.mjs；{{TODO_INHALT}} 占位符待替换' },
      { id: '05', name: '线上支付统一适配层', status: 'skeleton', note: '适配层/配置表/回调幂等/订单联动骨架完成，迁移 180 已应用（3 表就绪）；6 家适配器均未接入', touch: 'server/payments.js + migrations/180；商城运营 › 线上支付' },
    ],
  },
  {
    title: '06–09 · 消费者、SEO、部署、切域',
    rows: [
      { id: '06', name: '消费者注册 / 购买 / 支付 / 发货 / 退款全流程', status: 'pending', note: '依赖 01 测试库与 05 支付接入；账户中心前后端代码已存在待联调', touch: 'storefront/src/app/[locale]/account；server/portal.js' },
      { id: '07', name: 'SEO 与 Google Merchant Center 验收', status: 'skeleton', note: 'SEO 中心 6 TAB 已建；GSC 服务账号已生成，待域名验证后授权', touch: 'client/src/pages/SeoTrafficCenter.jsx；~/.config/alsvid/gsc-reader-key.json' },
      { id: '08', name: '正式服务器（Hetzner）部署', status: 'skeleton', note: '配置项清单已出；端口不硬编码，仅改部署配置与环境变量', touch: 'docs/deployment-config.md' },
      { id: '09', name: '正式域名切换与 V1.0 回退保障', status: 'pending', note: '不提前切域；切换前需 01–08 验收通过', touch: '待执行；保留 V1.0 回退路径' },
    ],
  },
  {
    title: '市场部 · 站外推广八模块',
    rows: [
      { id: 'M1', name: '市场概览 / 站外推广 / 营销素材 / AI 内容生成', status: 'skeleton', note: '模块结构与职责清单已占位，接入随渠道授权展开', touch: 'client/src/pages/MarketingModules.jsx' },
      { id: 'M2', name: '推广渠道管理 / 社交媒体 / 内容发布 / 品牌推广', status: 'skeleton', note: '同上；UTM 参数为用户部与商城运营的数据关联点', touch: 'client/src/pages/MarketingModules.jsx' },
    ],
  },
  {
    title: 'SEO 与流量中心 · 六个 TAB',
    rows: [
      { id: 'S1', name: '技术 SEO 巡检', status: 'done', note: '自爬 10 页检查 Title/Description/Canonical/Hreflang/结构化数据 + robots/sitemap', touch: 'server/traffic.js techAudit；走 ALSVID_STOREFRONT_PUBLIC_ORIGIN 配置' },
      { id: 'S2', name: '电商转化分析', status: 'done', note: '真实订单库口径：四事件漏斗、AOV、退款率、商品/国家排行', touch: 'server/traffic.js conversion*；Purchase 仅支付回调后写入' },
      { id: 'S3', name: '流量总览 / Google 搜索表现 / 关键词排名 / CDN 监控', status: 'blocked', note: '数据源未接入：Plausible / GSC / SerpBear / Cloudflare；明确显示「未接入」，不用 0 填充；拉取适配器统一骨架已就位（未接入返回 501）', touch: 'server/traffic.js SOURCES + registerSyncAdapter/syncSource；POST /api/seo/sources/:source/sync；管理端「SEO 与流量中心」连接设置' },
      { id: 'S4', name: 'GSC Service Account', status: 'skeleton', note: '服务账号与 JSON key 已生成；待域名验证后在 GSC 资源里授权该邮箱', touch: 'alsvid-gsc-reader@alsvid-production.iam.gserviceaccount.com' },
    ],
  },
];

const STATUS_META = {
  done: { label: '已完成', cls: 'ok-tag' },
  skeleton: { label: '骨架就绪', cls: 'ok-tag' },
  blocked: { label: '待外部凭据/授权', cls: 'warn-tag' },
  pending: { label: '待启动', cls: 'warn-tag' },
};

export default function ModuleLedger() {
  const counts = GROUPS.flatMap(g => g.rows).reduce((acc, row) => { acc[row.status] = (acc[row.status] || 0) + 1; return acc; }, {});
  return <div className="shop-work">
    <section className="card">
      <div className="card-title">集成验收 · 模块台账
        <span className="card-sub">所有坑位集中登记 · 状态后续逐项更新 · 避免「少了没做都不知道」</span>
      </div>
      <div className="stat-row">
        <div className="stat"><strong>{counts.done || 0}</strong><span>已完成</span></div>
        <div className="stat"><strong>{counts.skeleton || 0}</strong><span>骨架就绪</span></div>
        <div className="stat"><strong>{counts.blocked || 0}</strong><span>待外部凭据</span></div>
        <div className="stat"><strong>{counts.pending || 0}</strong><span>待启动</span></div>
      </div>
      {GROUPS.map(group => <div key={group.title} className="ledger-group">
        <h3 className="ledger-group__title">{group.title}</h3>
        <div className="ledger-table">
          {group.rows.map(row => <div key={row.id} className="ledger-row">
            <div className="ledger-row__id mono">{row.id}</div>
            <div className="ledger-row__main">
              <div className="ledger-row__name">{row.name} <span className={STATUS_META[row.status].cls}>{STATUS_META[row.status].label}</span></div>
              <div className="hint">{row.note}</div>
              <div className="hint mono">接入点：{row.touch}</div>
            </div>
          </div>)}
        </div>
      </div>)}
      <p className="hint">
        台账维护原则：状态变化只更新本文件的 GROUPS 常量（或在对应模块完成后同步更新）；
        外部数据源异常时前端明确提示，不显示虚构 0；正式库、正式域名与 GitHub 均不在此阶段改动。
      </p>
    </section>
  </div>;
}
