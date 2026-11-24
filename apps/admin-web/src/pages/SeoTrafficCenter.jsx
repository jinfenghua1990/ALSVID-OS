import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

// 术语解释组件：中文名 + 英文原词 + 悬停中文解释（需求文档第七章规范）
export function Term({ zh, en, explain }) {
  return <span className="term" title={`${en}：${explain}`}>{zh}<small>（{en}）</small><span className="term__mark" tabIndex={0} aria-label={`${en}：${explain}`}>?</span></span>;
}

function Explain({ lines }) {
  return <ul className="term-list">{lines.map(([zh, en, explain]) => <li key={en}><Term zh={zh} en={en} explain={explain} /></li>)}</ul>;
}

// 数据源状态条：每个 TAB 顶部，标明来源、更新时间、未配置提示
function SourceBanner({ source, sources, onConfigure }) {
  const status = sources.find(item => item.source === source);
  if (!status) return <div className="src-banner src-banner--warn">数据源状态未知</div>;
  const updated = status.updatedAt ? new Date(status.updatedAt).toLocaleString('zh-CN') : '';
  return (
    <div className={'src-banner ' + (status.configured && status.enabled ? '' : 'src-banner--warn')}>
      <div className="src-banner__main">
        <strong>{status.displayName}</strong>
        {status.configured && status.enabled
          ? <span className="ok-tag">已连接</span>
          : status.configured && !status.enabled
            ? <span className="warn-tag">已配置未启用</span>
            : <span className="warn-tag">未接入（缺少 {status.missing.join('、')}）</span>}
        {status.credentialHint && <span className="src-banner__hint">{status.credentialHint}</span>}
        {status.syncReady === false && <span className="warn-tag">拉取适配器未接入</span>}
        {updated && <span className="src-banner__hint">配置更新于 {updated}</span>}
      </div>
      <div className="src-banner__docs">{status.docs}</div>
      <button className="btn small" type="button" onClick={() => onConfigure(status)}>连接设置</button>
    </div>
  );
}

// 未接入空态：绝不显示虚构的 0
function NotConfigured({ name, steps }) {
  return <div className="padmin-empty"><strong>{name}尚未接入</strong>
    <p>这里显示的将是最新的真实数据，接入前不会显示任何占位数字。</p>
    {steps && <ol className="term-list">{steps.map(step => <li key={step}>{step}</li>)}</ol>}
  </div>;
}

function AdapterPending({ name }) {
  return <div className="padmin-empty"><strong>{name}已连接，数据适配器开发中</strong>
    <p>连接与凭据已保存，数据同步适配器将在下一步接入；接入前本页不显示数据。</p>
  </div>;
}

// ---- 数据源连接设置对话框 ----
function SourceDialog({ status, onClose, onSaved }) {
  const [config, setConfig] = useState(() => Object.fromEntries(status.required.map(key => [key, typeof status.config?.[key] === 'string' ? status.config[key] : ''])));
  const [enabled, setEnabled] = useState(Boolean(status.enabled));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState(null);
  const save = async () => {
    setBusy(true); setError('');
    try {
      await api.saveSeoSource(status.source, { config, enabled });
      setTestResult(null);
      onSaved();
    } catch (reason) { setError(reason.message || '保存失败'); }
    finally { setBusy(false); }
  };
  const test = async () => {
    setBusy(true); setError(''); setTestResult(null);
    try {
      await api.saveSeoSource(status.source, { config, enabled });
      const result = await api.testSeoSource(status.source);
      setTestResult(result.data || result);
      onSaved();
    } catch (reason) { setError(reason.message || '测试失败'); }
    finally { setBusy(false); }
  };
  const labels = { baseUrl: '服务地址', siteId: '站点 ID', apiToken: 'API Token（只读）', apiKey: 'API Key（只读）', serviceAccountEmail: '服务账号邮箱', propertyUrl: 'GSC 资源地址', reportUrl: '报告地址', zoneId: 'Zone ID' };
  return (
    <div className="dialog-mask" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" onClick={event => event.stopPropagation()}>
        <div className="dialog__head"><strong>连接设置 · {status.displayName}</strong><button className="btn small" type="button" onClick={onClose}>关闭</button></div>
        {status.docs && <p className="hint">{status.docs}</p>}
        {status.required.length === 0 && <p className="hint">该数据源无需凭据。</p>}
        {status.required.map(key => (
          <label key={key} className="field">
            <span>{labels[key] || key}</span>
            <input value={config[key] || ''} onChange={event => setConfig(current => ({ ...current, [key]: event.target.value }))} autoComplete="off" spellCheck={false} />
          </label>
        ))}
        <label className="field field--inline"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /><span>启用该数据源</span></label>
        {error && <p className="error-text" role="alert">{error}</p>}
        {testResult && <p className={testResult.ok ? 'hint' : 'error-text'} role="status">连通性测试：{testResult.ok ? '通过' : '失败'}{testResult.status ? `（HTTP ${testResult.status}）` : ''}{testResult.reason ? ` · ${testResult.reason}` : ''}{testResult.ms ? ` · ${testResult.ms}ms` : ''}</p>}
        <div className="dialog__actions">
          <button className="btn" type="button" onClick={save} disabled={busy || !status.required.length}>保存</button>
          <button className="btn" type="button" onClick={test} disabled={busy || !status.required.length}>保存并测试连通性</button>
        </div>
        <p className="hint">凭据只保存在服务端配置表，浏览器不会回显密钥内容。</p>
      </div>
    </div>
  );
}

// ---- TAB 1：流量总览（Plausible） ----
const OVERVIEW_TERMS = [
  ['独立访客', 'UV', '不同访客数量'],
  ['页面浏览量', 'PV', '页面被浏览次数'],
  ['访问次数', 'Sessions', '访问会话数量'],
  ['跳出率', 'Bounce Rate', '未进一步浏览或互动的访问比例'],
  ['访问来源', 'Referrer', '用户从哪个网站进入'],
];

// ---- TAB 4：技术 SEO 巡检 ----
function TechAudit() {
  const [origin, setOrigin] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async () => {
    setBusy(true); setError('');
    try { const result = await api.seoTechAudit(origin); setData(result.data); }
    catch (reason) { setError(reason.message || '巡检失败'); }
    finally { setBusy(false); }
  };
  return <div className="shop-work">
    <section className="card">
      <div className="card-title">技术 SEO 巡检<span className="card-sub">站点爬行 · 页面规范 · Sitemap</span></div>
      <p className="hint">本巡检由系统直接爬行商城页面完成（Title / Meta Description / Canonical / Hreflang / 结构化数据 / Sitemap），不依赖外部凭据。
        爬虫访问与状态码分布（<Term zh="服务器日志分析" en="GoAccess" explain="读取服务器访问日志的统计工具" />）与真实性能数据（<Term zh="核心网页指标" en="Core Web Vitals" explain="衡量网页用户体验的指标" />）另行接入。</p>
      <div className="filter-row">
        <input placeholder="商城地址（默认当前前台）" value={origin} onChange={event => setOrigin(event.target.value)} spellCheck={false} />
        <button className="btn" type="button" onClick={run} disabled={busy}>{busy ? '巡检中…' : '开始巡检'}</button>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {data && <>
        <div className="stat-row">
          <div className="stat"><span>检查页面</span><strong>{data.summary.checked}</strong></div>
          <div className="stat"><span>通过</span><strong>{data.summary.passed}</strong></div>
          <div className="stat"><span>有问题</span><strong>{data.summary.failed}</strong></div>
          <div className="stat"><span>Sitemap 网址数</span><strong>{data.sitemapUrls}</strong></div>
        </div>
        <table className="grid">
          <thead><tr><th>页面</th><th>状态码</th><th>问题</th></tr></thead>
          <tbody>
            {data.findings.map(item => (
              <tr key={item.url} className={item.ok ? '' : 'is-warn'}>
                <td className="mono">{item.url}</td>
                <td>{item.status ?? '—'}</td>
                <td>{item.ok ? '✓ 全部符合' : (item.problems || []).join('；')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!!data.errors.length && <div className="padmin-empty"><strong>抓取异常 {data.errors.length} 条</strong>{data.errors.slice(0, 8).map(item => <p key={item.url} className="mono">{item.url} {item.status || item.reason}</p>)}</div>}
        <p className="hint">数据生成时间 {new Date(data.generatedAt).toLocaleString('zh-CN')} · 来源：ALSVID 自爬巡检</p>
      </>}
    </section>
  </div>;
}

// ---- TAB 6：电商转化分析 ----
const euro = value => value === null || value === undefined ? '—' : '€' + Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Conversion({ days }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    api.seoConversion(days).then(result => { if (!cancelled) setData(result.data); })
      .catch(reason => { if (!cancelled) setError(reason.message || '读取失败'); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [days]);
  if (busy) return <p className="hint">正在读取转化数据…</p>;
  if (error) return <p className="error-text" role="alert">{error}</p>;
  const { overview } = data;
  const funnelSteps = [
    ['商品详情访问', overview.funnel.views, 'ViewProduct'],
    ['加入购物车', overview.funnel.carts, 'AddToCart'],
    ['开始结账', overview.funnel.checkouts, 'BeginCheckout'],
    ['支付成功', overview.funnel.purchases, 'Purchase'],
  ];
  return <div className="shop-work">
    <section className="card">
      <div className="card-title">购买漏斗<span className="card-sub">最近 {days} 天</span></div>
      <div className="funnel">
        {funnelSteps.map(([label, value, event], index) => (
          <div className="funnel__step" key={event}>
            <span className="funnel__label">{label}<small className="mono"> {event}</small></span>
            <strong>{value.toLocaleString('zh-CN')}</strong>
            {index > 0 && funnelSteps[index - 1][1] > 0 && value > 0
              ? <small>较上一步 {Number((value / funnelSteps[index - 1][1] * 100).toFixed(1))}%</small>
              : index > 0 ? <small>上一步为 0</small> : null}
          </div>
        ))}
      </div>
      <p className="hint">支付成功以 ALSVID 订单实际付清状态为准（paid / shipped / delivered），与浏览器访问成功页无关。</p>
    </section>
    <section className="card">
      <div className="card-title">核心指标</div>
      <div className="stat-row">
        <div className="stat"><span><Term zh="加购率" en="Cart Rate" explain="加购次数占商品访问量的比例" /></span><strong>{overview.rates.cartRate === null ? '—' : overview.rates.cartRate + '%'}</strong></div>
        <div className="stat"><span><Term zh="结账转化率" en="Checkout Rate" explain="开始结账次数占加购次数的比例" /></span><strong>{overview.rates.checkoutRate === null ? '—' : overview.rates.checkoutRate + '%'}</strong></div>
        <div className="stat"><span><Term zh="订单支付转化率" en="Payment Rate" explain="付款成功订单占开始结账次数的比例" /></span><strong>{overview.rates.paymentRate === null ? '—' : overview.rates.paymentRate + '%'}</strong></div>
        <div className="stat"><span>实际销售额</span><strong>{euro(overview.money.received)}</strong></div>
        <div className="stat"><span><Term zh="客单价" en="AOV" explain="平均每笔成交订单的金额" /></span><strong>{overview.money.aov === null ? '—' : euro(overview.money.aov)}</strong></div>
        <div className="stat"><span>退款金额</span><strong>{euro(overview.money.refunded)}</strong></div>
        <div className="stat"><span><Term zh="退款率" en="Refund Rate" explain="退款订单占成交订单的比例" /></span><strong>{overview.money.refundRate === null ? '—' : overview.money.refundRate + '%'}</strong></div>
        <div className="stat"><span>已付款订单</span><strong>{overview.orders.paid}</strong></div>
        <div className="stat"><span>待付款订单</span><strong>{overview.orders.pending}</strong></div>
      </div>
      <p className="hint">{overview.note}</p>
    </section>
    <section className="card">
      <div className="card-title">商品转化排行（按商品访问量）</div>
      {data.products.length === 0
        ? <div className="padmin-empty"><strong>暂无商品事件数据</strong><p>商城前端尚未接入事件采集（ViewProduct / AddToCart / BeginCheckout），接入后这里展示真实数据。</p></div>
        : <table className="grid">
          <thead><tr><th>商品</th><th>SKU</th><th>访问量</th><th>加购</th><th>结账</th><th>转化率</th></tr></thead>
          <tbody>{data.products.map(item => (
            <tr key={item.productId + (item.sku || '')}>
              <td>{item.name}</td><td className="mono">{item.sku || '—'}</td>
              <td>{item.views}</td><td>{item.carts}</td><td>{item.checkouts}</td>
              <td>{item.views ? Number((item.carts / item.views * 100).toFixed(1)) + '%' : '—'}</td>
            </tr>
          ))}</tbody>
        </table>}
    </section>
    <section className="card">
      <div className="card-title">国家转化分析</div>
      {data.countries.length === 0
        ? <p className="hint">暂无国家维度数据。</p>
        : <table className="grid">
          <thead><tr><th>国家</th><th>商品访问</th><th>加购</th><th>结账</th><th>已付款订单</th></tr></thead>
          <tbody>{data.countries.map(item => (
            <tr key={item.country}><td>{item.label} <small className="mono">{item.country}</small></td>
              <td>{item.events.ViewProduct || 0}</td><td>{item.events.AddToCart || 0}</td>
              <td>{item.events.BeginCheckout || 0}</td><td>{item.paidOrders}</td></tr>
          ))}</tbody>
        </table>}
    </section>
    <Explain lines={[['商品访问量', 'Product Views', '商品详情页被浏览的次数'], ['加购次数', 'Add to Cart', '成功加入购物车的次数'], ['退款率', 'Refund Rate', '退款订单占成交订单的比例']]} />
  </div>;
}

// ---- 数据源未接入的四个 TAB 的说明内容 ----
const PENDING_TABS = {
  plausible: { title: '流量总览', terms: OVERVIEW_TERMS, source: 'plausible', steps: ['自托管部署 Plausible CE（独立容器，与商城资源隔离）', '在「连接设置」里填写服务地址、站点 ID 与只读 API Token', '商城前台接入无 Cookie 统计脚本'], metrics: ['独立访客（UV）：不同访客数量', '页面浏览量（PV）：页面被浏览次数', '访问次数（Sessions）：访问会话数量', '跳出率（Bounce Rate）：未进一步浏览或互动的访问比例', '新访客与回访访客', '国家及地区访问排行（德国优先）', '访问设备：电脑 / 手机 / 平板', '流量来源：Google、Bing、Facebook、Instagram、直接访问', '热门落地页与热门商品详情页'] },
  gsc: { title: 'Google 搜索表现', source: 'gsc', steps: ['在 Google Cloud 项目里创建只读 Service Account（服务账号）', '把服务账号邮箱加为 GSC 资源的授权用户', '在「连接设置」里填写服务账号邮箱与资源地址', '每日同步并回补近期数据'], metrics: ['搜索点击量（Clicks）：用户点击搜索结果次数', '搜索展现量（Impressions）：网站出现在搜索结果中的次数', '点击率（CTR）：展现后产生点击的比例', '平均排名（Average Position）：搜索结果平均展示位置', '搜索关键词排行 / 商品页与首页表现 / 各国家与设备表现', '搜索词升降与机会分析'], warn: '平均排名不是某个关键词的实时固定排名，关键词级排名监控见「关键词排名」TAB。' },
  serpbear: { title: '关键词排名', source: 'serpbear', steps: ['独立部署 SerpBear', '配置排名查询 API（第三方费用单独核算）', '在「连接设置」里填写服务地址与 API Key'], metrics: ['德国 Google 搜索排名（移动端 / 桌面端）', '关键词分组与历史趋势', '排名升降提醒', '初期重点词：E-Bike / Folding Electric Bike / Carbon Folding Bike / Elektro Klapprad / E-Klapprad / Faltbares E-Bike / Carbon E-Bike'], warn: '原始德语、英语关键词保留原文，不翻译搜索词本身。' },
  cloudflare: { title: 'CDN 流量监控', source: 'cloudflare', steps: ['在 Cloudflare 创建只读 API Token（不授予 DNS、缓存清理权限）', '在「连接设置」里填写 Token 与 Zone ID'], metrics: ['网站总请求量与总下载流量', 'CDN 缓存命中率（Cache Hit Ratio）与未命中', '国家及地区请求分布', 'HTTP 状态码分布', '安全拦截 / 恶意请求 / 机器人请求', '带宽趋势与源站回源请求'], warn: '具体指标以当前 Cloudflare 套餐 API 可提供的数据为准。' },
};

function PendingTab({ meta, sources, onConfigure }) {
  return <div className="shop-work">
    <SourceBanner source={meta.source} sources={sources} onConfigure={onConfigure} />
    <section className="card">
      <div className="card-title">{meta.title}<span className="card-sub">规划指标清单</span></div>
      {meta.warn && <p className="hint">{meta.warn}</p>}
      <ul className="term-list">{meta.metrics.map(item => <li key={item}>{item}</li>)}</ul>
    </section>
    <Explain lines={meta.terms || [['数据来源', 'Data Source', '本页数据来自外部系统，接入后自动展示']]} />
  </div>;
}

const TABS = [
  { key: 'overview', label: '流量总览' },
  { key: 'gsc', label: 'Google 搜索表现' },
  { key: 'keywords', label: '关键词排名' },
  { key: 'tech', label: '技术 SEO 巡检' },
  { key: 'cdn', label: 'CDN 流量监控' },
  { key: 'conversion', label: '电商转化分析' },
];
const RANGES = [[1, '今日'], [7, '最近 7 天'], [30, '最近 30 天'], [90, '最近 90 天']];

export default function SeoTrafficCenter({ active }) {
  const [tab, setTab] = useState('overview');
  const [days, setDays] = useState(30);
  const [sources, setSources] = useState([]);
  const [dialog, setDialog] = useState(null);
  const loadSources = useCallback(() => { api.seoSources().then(result => setSources(result.data || result)).catch(() => setSources([])); }, []);
  useEffect(() => { if (active) loadSources(); }, [active, loadSources]);
  const pendingMeta = { gsc: PENDING_TABS.gsc, keywords: PENDING_TABS.serpbear, cdn: PENDING_TABS.cloudflare };
  const plausible = sources.find(item => item.source === 'plausible');
  return <div className="shop-work">
    <ShopHead sources={sources} onSaved={loadSources} />
    <div className="tabs" role="tablist">
      {TABS.map(item => (
        <button key={item.key} role="tab" aria-selected={tab === item.key} type="button"
          className={'tabs__item' + (tab === item.key ? ' is-active' : '')}
          onClick={() => setTab(item.key)}>{item.label}</button>
      ))}
    </div>
    {(tab === 'overview' || tab === 'gsc' || tab === 'keywords' || tab === 'cdn') && (
      <div className="filter-row">
        {RANGES.map(([value, label]) => (
          <button key={value} type="button" className={'btn small' + (days === value ? ' is-active' : '')} onClick={() => setDays(value)}>{label}</button>
        ))}
      </div>
    )}
    {tab === 'overview' && (plausible?.configured && plausible?.enabled
      ? <AdapterPending name="Plausible Analytics" />
      : <PendingTab meta={PENDING_TABS.plausible} sources={sources} onConfigure={setDialog} />)}
    {tab === 'gsc' && <PendingTab meta={pendingMeta.gsc} sources={sources} onConfigure={setDialog} />}
    {tab === 'keywords' && <PendingTab meta={pendingMeta.keywords} sources={sources} onConfigure={setDialog} />}
    {tab === 'cdn' && <PendingTab meta={pendingMeta.cdn} sources={sources} onConfigure={setDialog} />}
    {tab === 'tech' && <TechAudit />}
    {tab === 'conversion' && <Conversion days={days} />}
    {dialog && <SourceDialog status={dialog} onClose={() => setDialog(null)} onSaved={loadSources} />}
  </div>;
}

function ShopHead({ sources, onSaved }) {
  const configured = sources.filter(item => item.configured && item.enabled).length;
  return <section className="card">
    <div className="card-title">SEO 与流量中心<span className="card-sub">搜索引擎优化与网站访问分析</span></div>
    <p className="hint">商城运营负责独立站内部的访问与成交分析；站外推广数据在「市场部」。全部数据源统一在这里连接和查看，运营人员无需分别登录外部后台。</p>
    <div className="stat-row">
      <div className="stat"><span>已连接数据源</span><strong>{configured} / {sources.length || 7}</strong></div>
      <div className="stat"><span>数据来源</span><strong className="mono">Plausible · GSC · SerpBear · GoAccess · Cloudflare · Lighthouse · CrUX</strong></div>
    </div>
    <p className="hint">未接入的数据源会显示「未接入」并给出接入步骤；不会用 0 填充，避免把「没接上」误读成「没流量」。</p>
    <button className="btn small" type="button" onClick={onSaved}>刷新数据源状态</button>
  </section>;
}
