import React from 'react';

// 市场部（原「营销中心」）：站外推广与品牌运营。
// 职责边界：市场部负责站外，商城运营 › SEO 与流量中心负责站内；
// 双方通过 UTM 参数（推广链接来源追踪参数）关联，不重复建设统计功能。
// 本页先落「模块结构与职责清单」，具体接入随各渠道授权逐步展开。

const MODULES = {
  overview: {
    title: '市场概览', sub: '推广总体情况 · 渠道表现 · 内容发布 · 品牌曝光',
    cards: [
      { title: '推广总体情况', items: ['各渠道投入与产出汇总（接入广告账户后自动汇总）', '站外引流到商城的访问量（通过 UTM 关联到 SEO 与流量中心）'] },
      { title: '内容发布情况', items: ['内容发布管理中的状态汇总：草稿 / 待审核 / 已审核 / 已发布 / 发布失败'] },
      { title: '品牌曝光情况', items: ['社交媒体粉丝与互动（接入平台授权后展示）', '品牌搜索热度（接入后展示）'] },
    ],
    note: '概览页只做汇总展示，不重复建设统计功能；所有数据标注来源与更新时间。',
  },
  ads: {
    title: '站外推广', sub: '广告渠道投放与效果',
    cards: [
      { title: 'Google Ads 推广', items: ['账户授权后接入：花费、展示、点击、转化', '与商城成交数据通过 UTM 关联'] },
      { title: 'Facebook / Instagram 推广', items: ['账户授权后接入：广告系列表现、受众、素材效果'] },
      { title: 'YouTube 推广', items: ['视频广告表现与观看数据'] },
      { title: '其他推广渠道', items: ['联盟 / 比较 / 本地平台，按实际合作逐步登记'] },
    ],
    note: '广告账户和投放接口按实际授权情况接入；未授权的渠道明确显示「未授权」，不填 0。',
  },
  materials: {
    title: '营销素材', sub: '图片 · 视频 · 广告 · 社交 · 品牌',
    cards: [
      { title: '素材类型', items: ['图片素材 / 视频素材 / 广告素材 / 社交媒体素材 / 品牌宣传素材'] },
      { title: '分类与版本管理', items: ['按渠道 + 用途分类', '同一素材多尺寸版本（1:1 / 4:5 / 16:9 / Story）', '审批状态与使用记录'] },
    ],
    note: '素材文件继续使用统一对象存储（R2），市场部只做素材的组织与审批，不另建文件系统。',
  },
  ai: {
    title: 'AI 内容生成', sub: '文案 · 图片 · 视频 · 多语言',
    cards: [
      { title: 'AI 营销文案', items: ['德语营销文案（面向德国市场优先）', '英语 / 中文文案', '社交媒体短文案'] },
      { title: 'AI 图片 / 视频生成', items: ['产品场景图、活动图', '短视频素材', '生成结果进入素材审核库，人工确认后才能使用'] },
      { title: '多语言内容生成', items: ['同一内容的三语版本对齐', '术语表约束（品牌词不翻译）'] },
    ],
    note: 'AI 生成内容必须经过人工审核才可发布；自动发布流水线（AI 生成 → 图片审核库 → 人工审核 → 自动发布）为后续阶段。',
  },
  channels: {
    title: '推广渠道管理', sub: '渠道资料 · 账号 · 授权 · UTM',
    cards: [
      { title: '渠道资料与账号', items: ['渠道名称 / 类型 / 负责人 / 状态', '账号与授权状态（授权过期提前提醒）'] },
      { title: '推广链接与 UTM 参数管理', items: ['统一 UTM 生成器：utm_source / utm_medium / utm_campaign', '命名规范约束，避免同一渠道多种写法', '链接与商城转化数据自动关联'] },
    ],
    note: 'UTM（推广链接来源追踪参数）是市场部与商城运营的数据关联点：市场部生成链接，商城运营侧看转化。',
  },
  social: {
    title: '社交媒体管理', sub: 'Facebook · Instagram · YouTube',
    cards: [
      { title: '账号矩阵', items: ['各平台账号、粉丝数、最近发布（授权后自动同步）'] },
      { title: '互动与评论', items: ['评论与私信汇总，指派跟进人'] },
    ],
    note: '平台接口按实际授权接入；未授权平台只登记账号资料，不显示平台数据。',
  },
  publishing: {
    title: '内容发布管理', sub: '草稿 → 待审核 → 已审核 → 定时发布 → 已发布',
    cards: [
      { title: '发布状态机', items: ['内容草稿 / 待审核 / 已审核 / 定时发布 / 已发布 / 发布失败 / 发布记录', '每次状态变化留操作人与时间'] },
      { title: '定时发布', items: ['按平台最佳时间排队发布', '失败自动重试并记录原因'] },
    ],
    note: '发布通道按平台逐个接入；审核是硬门槛——没有人工审核通过的内容不能进入发布队列。',
  },
  brand: {
    title: '品牌推广', sub: '品牌资料 · 故事 · 活动 · 媒体',
    cards: [
      { title: '品牌资料', items: ['品牌故事（德语 / 英语 / 中文）、视觉规范、FAQ'] },
      { title: '品牌活动与媒体合作', items: ['活动档案与效果回顾', '媒体报道与合作记录'] },
    ],
    note: '品牌资料同时供 AI 内容生成引用，保证对外口径一致。',
  },
};

export default function MarketingModule({ section }) {
  const meta = MODULES[section];
  if (!meta) return null;
  return <div className="shop-work">
    <section className="card">
      <div className="card-title">{meta.title}<span className="card-sub">{meta.sub}</span></div>
      {meta.cards.map(card => (
        <div key={card.title} className="mkt-card">
          <strong>{card.title}</strong>
          <ul className="term-list">{card.items.map(item => <li key={item}>{item}</li>)}</ul>
        </div>
      ))}
      <p className="hint">{meta.note}</p>
    </section>
  </div>;
}
