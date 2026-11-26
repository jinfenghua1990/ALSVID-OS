import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { modulesFor, DESIGN_LOCALES, DESIGN_DEVICES, shellState } from './design-module-registry.js';
import FooterModuleEditor from './FooterModuleEditor.jsx';
import ShellReleaseReview from './ShellReleaseReview.jsx';
import './unified-design.css';

const pages = [['home', '首页'], ['list', '商品列表'], ['detail', '商品详情'], ['transaction', '统一交易页']];

const MODULE_ICONS = {
  'ALSVID-G01': '📢',
  'ALSVID-G02': '🧭',
  'ALSVID-G03': '🚲',
  'ALSVID-G03-01': '⭐',
  'ALSVID-G03-02': '🏙️',
  'ALSVID-G03-03': '⚡',
  'ALSVID-G03-04': '📊',
  'ALSVID-G03-05': '📖',
  'ALSVID-G04': '⚓',
  'ALSVID-L01': '🗂️',
  'ALSVID-L02': '🚲',
  'ALSVID-L03': '🎒',
  'ALSVID-L04': '🛠️',
  'ALSVID-L05': '⚖️',
};

// 动态解析前台访问 Origin（避免 127.0.0.1 在局域网 IP 下被浏览器拦截）

export const MODULE_SPECS = {
  "ALSVID-G03-01": {
    code: "G03-01",
    title: "车型宣传单元 · 主推款 KV",
    role: "首屏巨幕视觉冲击 / 核心主推款（A1 Ultra 旗舰款）",
    dimensions: [
      { device: "PC 桌面端 (2K 视网膜超清·推荐)", size: "2560 × 1440 px", ratio: "16:9" },
      { device: "PC 桌面端 (全高清基准)", size: "1920 × 1080 px", ratio: "16:9" },
      { device: "移动端 (高屏占比竖屏)", size: "1080 × 1440 px", ratio: "3:4" }
    ],
    safeDistance: {
      top: "≥ 120 px",
      bottom: "≥ 80 px",
      left: "40% 留白",
      right: "≥ 80 px",
      bleed: "10% 出血",
      summary: "顶部避让导航栏 120px；左侧预留 40% 纯净背景给文字与选配按钮，车身置于右侧 60% 且车尾距右边缘 ≥ 80px。"
    },
    format: "WebP (首选无损/高质) / PNG-24 (透明底车身) / JPG",
    filesize: "建议 ≤ 800 KB (确保 LCP 秒开)",
    safetyZone: "PC 端车身主体建议居中偏右（占右侧 60% 画面）；左侧 40% 为标语文案与「立即选配」按钮留出纯色/深色安全区。顶部预留 120px 避开导航栏。",
    visualStyle: "45° 动态侧面破风姿态，高光勾勒车架线条，科技纯净光影。"
  },
  "ALSVID-G03-02": {
    code: "G03-02",
    title: "车型宣传单元 · 第二款 / 场景款 KV",
    role: "生活化真实骑行 / 秒级折叠场景宣传",
    dimensions: [
      { device: "分屏图文 (双列沉浸·推荐)", size: "1200 × 900 px", ratio: "4:3" },
      { device: "宽屏全景", size: "1920 × 1080 px", ratio: "16:9" },
      { device: "移动端场景图", size: "1080 × 810 px", ratio: "4:3" }
    ],
    safeDistance: {
      top: "≥ 48 px",
      bottom: "≥ 48 px",
      left: "≥ 48 px",
      right: "≥ 48 px",
      bleed: "5% 出血",
      summary: "图文分屏时左右留出 ≥ 40px 间隙；动作主体（折叠入后备箱、地铁进站）置于画面中央 70% 黄金安全圈内，四周留出安全呼吸空间。"
    },
    format: "WebP / JPG",
    filesize: "建议 ≤ 450 KB",
    safetyZone: "折叠放入汽车后备箱、地铁进出站、城市绿道通勤等人物与动作主体置于画面视觉中心，四周留有呼吸间距。",
    visualStyle: "自然采光与城市生活实拍，体现“为城市生活减负”的便携与亲和感。"
  },
  "ALSVID-G03-03": {
    code: "G03-03",
    title: "车型宣传单元 · 第三款 / 性能款 KV",
    role: "硬核中置电机 / 强扭矩动力总成 / 核心技术拆解",
    dimensions: [
      { device: "宽幅主图 (深色工程风)", size: "1920 × 1080 px", ratio: "16:9" },
      { device: "零部件微距特写 (3~4联排)", size: "800 × 800 px", ratio: "1:1" }
    ],
    safeDistance: {
      top: "≥ 64 px",
      bottom: "≥ 64 px",
      left: "≥ 60 px",
      right: "≥ 60 px",
      bleed: "8% 出血",
      summary: "零部件微距特写四周保留 ≥ 60px 边距；主体不贴边，底部留出 25% 空间用于排布扭矩/功率等核心参数标签。"
    },
    format: "WebP / 透明底 PNG-24 (带机械轮廓光)",
    filesize: "建议 ≤ 500 KB",
    safetyZone: "中置电机、高密度电池组、碳纤维车架特写居中呈现，文字在其下方或侧边排布，四周留有安全距离。",
    visualStyle: "深炭黑冷调背景（#121513），突出强劲动力与工业精密机械质感。"
  },
  "ALSVID-G03-04": {
    code: "G03-04",
    title: "矩阵式车型陈列 / 对比选车",
    role: "多车型横向平铺展示卡片，供访客挑车对比",
    dimensions: [
      { device: "单车型卡片 (统一规格)", size: "1000 × 750 px", ratio: "4:3" }
    ],
    safeDistance: {
      top: "≥ 40 px",
      bottom: "≥ 40 px (着地线)",
      left: "≥ 40 px",
      right: "≥ 40 px",
      bleed: "无 (纯透)",
      summary: "透明底画布四周必须内缩留出 ≥ 40px 透明内边距（Padding），严禁车把/轮胎贴碰画布边缘！车轮统一距离画布底边 40px 着地。"
    },
    format: "必须纯透明底 PNG-24 或 透明 WebP (严禁白底或脏色杂边)",
    filesize: "建议 ≤ 350 KB / 单车型",
    safetyZone: "车身正侧 90° 或 45° 视角；所有车型必须统一车轮水平着地基准线，四周留足透明边距，确保横向对比时比例 1:1 精确对齐。",
    visualStyle: "无阴影或带微弱自然着地投影的极简摄影，准确还原车漆原色。"
  },
  "ALSVID-G03-05": {
    code: "G03-05",
    title: "品牌故事与生态背书 KV",
    role: "欧洲仓储直发 / 2年整车质保 / 品牌骑行故事",
    dimensions: [
      { device: "全景宽幅画卷", size: "1920 × 960 px", ratio: "2:1" },
      { device: "移动端画卷", size: "1080 × 720 px", ratio: "3:2" }
    ],
    safeDistance: {
      top: "≥ 64 px",
      bottom: "≥ 64 px",
      left: "30% 留白",
      right: "≥ 64 px",
      bleed: "10% 出血",
      summary: "上下各预留 64px 边距；左侧预留 30% 纯净空间放置品牌故事标题与正文，骑行人物或工厂实景置于右侧 70%。"
    },
    format: "WebP / JPG",
    filesize: "建议 ≤ 600 KB",
    safetyZone: "主体置于右侧或居中，左侧保留 30% 放置品牌宣言与背书文案。",
    visualStyle: "纪实风格人文摄影、整装车间与欧洲骑行公路风光，传递长期主义信赖感。"
  },
  "ALSVID-G01": {
    code: "G01",
    title: "全站营销公告栏",
    role: "全站顶部促销政策速览与重要通知",
    dimensions: [
      { device: "通栏高度", size: "高度 36 ~ 44 px，宽度 100% 自适应", ratio: "横幅条" },
      { device: "可选小图标", size: "24 × 24 px (SVG / PNG)", ratio: "1:1" }
    ],
    safeDistance: {
      top: "8 px",
      bottom: "8 px",
      left: "16 px",
      right: "24 px",
      bleed: "无",
      summary: "文字上下内边距 8px，左右留出 16px~24px 安全边距，右侧预留关闭/箭头按钮空间。"
    },
    format: "纯色背景 + SVG 矢量图标",
    filesize: "图标 ≤ 20 KB",
    safetyZone: "单行文案建议 ≤ 35 个汉字，保证移动端不换行溢出。",
    visualStyle: "沉稳深绿或官方促销强调色，文字具有高对比易读性。"
  },
  "ALSVID-G02": {
    code: "G02",
    title: "全站顶部导航栏",
    role: "品牌识别、车型分类与全球语言/账户入口",
    dimensions: [
      { device: "品牌 Logo 尺寸", size: "160 × 40 px (或 200 × 50 px 高清)", ratio: "水平长标" },
      { device: "导航条高度", size: "PC 桌面端 72 ~ 80 px；移动端 60 px", ratio: "吸顶" }
    ],
    safeDistance: {
      top: "16 px",
      bottom: "16 px",
      left: "24 px",
      right: "24 px",
      bleed: "无",
      summary: "Logo 周围留出 8px 透明安全 Padding，导航整体左右边距 24px~32px。"
    },
    format: "SVG 矢量格式 (强烈推荐) 或 透明 PNG-24",
    filesize: "Logo ≤ 30 KB",
    safetyZone: "左侧 24px 留白，三功能区水平分布，移动端支持汉堡折叠。",
    visualStyle: "半透明毛玻璃底或纯白底，悬浮时不遮挡正文核心要素。"
  },
  "ALSVID-G04": {
    code: "G04",
    title: "全站公共页脚",
    role: "全站底部通用导航、政策合规与品牌版权",
    dimensions: [
      { device: "页脚 Logo", size: "140 × 36 px (SVG / 透明 PNG)", ratio: "长条" },
      { device: "认证徽章 / 支付图标", size: "统一高度 40 ~ 50 px (SVG / PNG)", ratio: "图标" }
    ],
    safeDistance: {
      top: "40 px",
      bottom: "32 px",
      left: "24 px",
      right: "24 px",
      bleed: "无",
      summary: "页脚上下留出 32px~48px 留白空间，列与列之间保持 32px 间隙。"
    },
    format: "SVG / 透明 PNG",
    filesize: "≤ 30 KB",
    safetyZone: "多列网格弹性自适应，符合欧洲 GDPR 与合规信息披露标准。",
    visualStyle: "经典深暗色系，与正文内容形成明显界限。"
  }
};

function getInitialStorefrontOrigin() {
  if (typeof window !== 'undefined' && window.location.hostname) {
    const host = window.location.hostname;
    const proto = window.location.protocol;
    return `${proto}//${host}:8091`;
  }
  return 'http://127.0.0.1:8091';
}

function resolveStorefrontOrigin(url) {
  try {
    const parsed = new URL(url);
    if (typeof window !== 'undefined' && window.location.hostname && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
      if (['localhost', '127.0.0.1'].includes(parsed.hostname)) {
        parsed.hostname = window.location.hostname;
      }
    }
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password ? parsed.origin : getInitialStorefrontOrigin();
  } catch {
    return getInitialStorefrontOrigin();
  }
}

function formatStatus(row, module) {
  if (module.kind) {
    const s = shellState(row);
    if (s.enabled === '启用' || s.enabled === '已发布') {
      return { label: `线上生效 (${s.published})`, dot: 'active' };
    }
    return { label: s.draft !== '—' ? '草稿待发' : '未开启', dot: s.draft !== '—' ? 'draft' : 'idle' };
  }
  if (!row) {
    return { label: '线上生效 (默认)', dot: 'default' };
  }
  const hasDraft = Boolean(row.hasDraft) && (!row.publishedVersion || row.revision !== row.publishedRevision);
  if (hasDraft) {
    return { label: '草稿待发布', dot: 'draft' };
  }
  if (row.publishedVersion) {
    return { label: `已发布 v${row.publishedVersion}`, dot: 'active' };
  }
  return { label: '线上生效 (默认)', dot: 'default' };
}

export default function UnifiedDesignWorkspace({ active, user }) {
  const [page, setPage] = useState('home');
  const [locale, setLocale] = useState('zh');
  const [device, setDevice] = useState('desktop');
  const [selected, setSelected] = useState('ALSVID-G03-01');
  // G04 全站公共页脚用独立编辑器，不参与左侧其他模块的任何逻辑
  const [footerEditing, setFooterEditing] = useState(false);
  const [records, setRecords] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [origin, setOrigin] = useState(getInitialStorefrontOrigin());
  const [products, setProducts] = useState([]);
  const [slug, setSlug] = useState('');
  const [history, setHistory] = useState(null);
  const [focusResult, setFocusResult] = useState('');
  const [previewStatus, setPreviewStatus] = useState('loading');
  const [reloadSeq, setReloadSeq] = useState(0);
  const [showSpecs, setShowSpecs] = useState(true);
  const [copiedSpec, setCopiedSpec] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishNotice, setPublishNotice] = useState('');
  const [shellReviewPage, setShellReviewPage] = useState(null);

  const frame = useRef(null);
  const request = useRef(0);
  const historyRequest = useRef(0);
  const modules = modulesFor(page);

  const load = async () => {
    const seq = ++request.current;
    setLoading(true);
    setError('');
    setRecords({});
    setHistory(null);
    historyRequest.current++;
    try {
      const [rows, connection, listRows, homeRows] = await Promise.all([
        api.cmsPages({ type: 'shared_module', locale }),
        api.layoutStorefrontRevalidateStatus(),
        api.cmsPages({ type: 'product_template', locale, path: '/products' }),
        api.cmsPages({ type: 'home', locale, path: '/' })
      ]);
      const relevant = rows.filter(row => row.path.startsWith('/site-shell/'));
      const docs = await Promise.all(relevant.map(row => api.cmsPage(row.id)));
      if (seq !== request.current) return;
      setRecords(Object.fromEntries([...docs, ...listRows, ...homeRows].map(doc => [doc.path, doc])));
      const url = connection?.data?.storefrontPublicOrigin;
      setOrigin(resolveStorefrontOrigin(url));
    } catch (e) {
      if (seq === request.current) {
        setError(e.message || '读取数据失败');
      }
    } finally {
      if (seq === request.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (active && user?.role === 'admin') void load();
    return () => {
      request.current++;
      historyRequest.current++;
    };
  }, [active, locale, user?.role]);

  useEffect(() => {
    if (page !== 'detail') return;
    let alive = true;
    setProducts([]);
    (async () => {
      try {
        const list = [];
        let p = 1, result;
        do {
          result = await api.catalogProducts(locale, p++);
          list.push(...(result.items || []));
        } while (result.hasMore && alive && p <= 50);
        if (alive) {
          const vehicles = list.filter(x => x.kind === 'vehicle' && x.slug);
          setProducts(vehicles);
          setSlug(old => vehicles.some(v => v.slug === old) ? old : (vehicles[0]?.slug || ''));
        }
      } catch (e) {
        if (alive) setError(e.message || '读取车型失败');
      }
    })();
    return () => { alive = false; };
  }, [page, locale]);

  const route = page === 'home' ? '/' : page === 'list' ? '/e-bikes' : page === 'transaction' ? '/cart' : slug ? '/e-bikes/' + encodeURIComponent(slug) : '';
  const preview = origin && route ? `${origin}/${locale}${route === '/' ? '' : route}` : '';

  useEffect(() => {
    setPreviewStatus(preview ? 'loading' : 'unavailable');
    setFocusResult('');
    if (!preview) return;
    const timer = setTimeout(() => setPreviewStatus(current => current === 'ready' ? 'ready' : 'unresponsive'), 12000);
    return () => clearTimeout(timer);
  }, [preview, reloadSeq]);

  const focusAliases = {
    'ALSVID-G03-01': ['ALSVID-G03-01', 'ALSVID-H01'],
    'ALSVID-G03-02': ['ALSVID-G03-02', 'folding', 'ALSVID-H02'],
    'ALSVID-G03-03': ['ALSVID-G03-03', 'ALSVID-H03', 'tech'],
    'ALSVID-G03-04': ['ALSVID-G03-04', 'ALSVID-H02', 'platforms'],
    'ALSVID-G03-05': ['ALSVID-G03-05', 'ALSVID-H04', 'about', 'dealer']
  };

  const focus = id => {
    setFocusResult('');
    if (preview && frame.current?.contentWindow) {
      const targets = focusAliases[id] || [id];
      targets.forEach(targetId => {
        frame.current.contentWindow.postMessage({ type: 'alsvid:design-focus', id: targetId }, origin);
      });
    }
  };

  useEffect(() => {
    const handler = event => {
      if (event.source !== frame.current?.contentWindow || event.origin !== origin || event.data?.type !== 'alsvid:design-focus-result') return;
      const targets = focusAliases[selected] || [selected];
      if (!targets.includes(event.data.id)) return;
      setPreviewStatus('ready');
      setFocusResult(event.data.found ? '已定位当前模块' : '前台已连接，当前页面未找到此模块（可能隐藏或尚未接入）');
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [origin, selected]);

  useEffect(() => { focus(selected); }, [selected, preview, reloadSeq]);

  const showHistory = async module => {
    const row = records[module.path];
    if (!row) return;
    const seq = ++historyRequest.current;
    setHistory({ name: module.name, loading: true, rows: [] });
    try {
      const rows = await api.cmsVersions(row.id);
      if (seq === historyRequest.current) setHistory({ name: module.name, rows });
    } catch (e) {
      if (seq === historyRequest.current) setHistory({ name: module.name, error: e.message, rows: [] });
    }
  };

  // 核心：直接新建一个独立网页去进行图形化编辑！原页面不弹窗、不跳页
  const openExternalGraphicalEditor = (moduleId) => {
    setSelected(moduleId);
    focus(moduleId);
    const editUrl = `/?adminWindow=storefront-design&edit=home&module=${encodeURIComponent(moduleId)}&locale=${locale}`;
    const opened = window.open(editUrl, '_blank');
    if (!opened) {
      setError('浏览器拦截了新建标签页，请允许浏览器弹出窗口后重试。');
    } else {
      setError('');
    }
  };

  // 只给 G04 全站公共页脚单独接一个编辑器入口；其余模块（G01/G02/页面模块）行为保持 19:57 版不变。
  
  // 在编辑旁边提供直接发布功能：公共模块打开发布审查，页面模块直接发布草稿生效
  const handlePublishModule = async (module, row) => {
    if (!module) return;
    const targetRow = row || (module.path ? records[module.path] : null);
    if (!targetRow) {
      alert("【" + module.name + "】目前未读取到独立草稿，当前前台已是默认生效版本。");
      return;
    }

    if (module.kind) {
      setShellReviewPage(targetRow);
      return;
    }

    const hasDraft = Boolean(targetRow.draft || targetRow.hasDraft) &&
      (!targetRow.publishedVersion || targetRow.revision !== targetRow.publishedRevision);

    const msg = hasDraft
      ? "确认将【" + module.name + "】的最新草稿发布到线上官网？\n发布后前台将立即同步生效。"
      : "【" + module.name + "】当前已是线上最新版本（v" + (targetRow.publishedVersion || 1) + "）。\n是否重新强制同步刷新线上缓存？";

    if (!window.confirm(msg)) return;

    setPublishing(true);
    setError("");
    try {
      const updated = await api.publishCmsPage(targetRow.id, targetRow.revision);
      setPublishNotice("【" + module.name + "】已成功发布上线（v" + (updated.publishedVersion || targetRow.publishedVersion || 1) + "）！");
      setTimeout(() => setPublishNotice(""), 4000);
      await load();
      setReloadSeq(s => s + 1);
    } catch (e) {
      setError(e.message || "发布失败，请检查网络或权限。");
    } finally {
      setPublishing(false);
    }
  };

  const editModule = (module) => {
    if (!module) return;
    if (module.id === 'ALSVID-G04') { setSelected(module.id); setFooterEditing(true); return; }
    openExternalGraphicalEditor(module.id);
  };

  if (user?.role !== 'admin') return <p className="hint">仅管理员可管理装修。</p>;

  return (
    <div className="udw">
      {/* 顶部主控栏：页面切换 + 直接新建网页去图形化编辑按钮 + 语言与设备 */}
      <header className="udw-top">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <nav className="udw-tabs" aria-label="页面">
            {pages.map(([key, label]) => (
              <button
                key={key}
                className={'btn small' + (page === key ? ' primary' : '')}
                onClick={() => {
                  setPage(key);
                  setSelected(key === 'home' ? 'ALSVID-G03-01' : 'ALSVID-G01');
                  setHistory(null);
                  historyRequest.current++;
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* 新建网页去图形化编辑大按钮 */}
          <button
            type="button"
            className="btn small primary"
            style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => editModule(modules.find(m => m.id === selected))}
            title="公共模块打开内容表单；页面模块在新标签页打开图形化编辑器"
          >
            <span>新建网页编辑</span>
          </button>
          <button
            type="button"
            className="btn small"
            style={{ fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}
            disabled={loading || publishing}
            onClick={() => {
              const currentMod = modules.find(m => m.id === selected);
              const currentRow = currentMod?.path ? records[currentMod.path] : null;
              handlePublishModule(currentMod, currentRow);
            }}
            title="直接将当前选中的模块发布到线上官网"
          >
            <span>{publishing ? "正在发布…" : "发布当前模块"}</span>
          </button>
        </div>

        <div className="udw-top__side">
          <div className="udw-tabs" aria-label="语言与设备">
            {DESIGN_LOCALES.map(([key, label]) => (
              <button key={key} className={'btn small' + (locale === key ? ' primary' : '')} onClick={() => setLocale(key)}>{label}</button>
            ))}
            {DESIGN_DEVICES.map(([key, label]) => (
              <button key={key} className={'btn small' + (device === key ? ' primary' : '')} onClick={() => setDevice(key)}>{label}</button>
            ))}
          </div>
          {page === 'detail' && (
            <select aria-label="预览车型" value={slug} onChange={e => setSlug(e.target.value)}>
              <option value="">选择已发布车型</option>
              {products.map(p => <option key={p.slug} value={p.slug}>{p.title || p.slug}</option>)}
            </select>
          )}
          <button
            type="button"
            className={"btn small" + (showSpecs ? " primary" : "")}
            onClick={() => setShowSpecs(v => !v)}
            title="切换右侧设计尺寸与KV规格面板"
          >
            设计尺寸规范 {showSpecs ? "▾" : "▸"}
          </button>
          <button className="btn small" disabled={loading} onClick={load}>刷新数据</button>
        </div>
      </header>

      {error && <p className="error-text" role="alert">{error}</p>}
      {publishNotice && (
        <div className="udw-publish-banner">
          <span>{publishNotice}</span>
          <button type="button" className="btn small" onClick={() => setPublishNotice("")}>关闭</button>
        </div>
      )}

      {/* 工作台主体（左侧树状模块 + 右侧前台全景预览，0 弹窗！） */}
      <div className={"udw-body" + (showSpecs ? " has-specs" : "")}>
        
        {/* 左栏：高质感树状模块目录 */}
        <aside className="udw-directory">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>模块目录</h3>
            <small style={{ color: '#688070', fontSize: 11 }}>点击定位 · 新网页编辑</small>
          </div>

          <div className="udw-tree-nav">
            {modules.map(module => {
              const row = module.path ? records[module.path] : null;
              const isChild = module.id.startsWith('ALSVID-G03-');
              const isSelected = selected === module.id;
              const icon = MODULE_ICONS[module.id] || '📄';
              const status = formatStatus(row, module);
              const canEdit = module.kind || module.editor;

              return (
                <div
                  key={module.id}
                  className={`udw-tree-item ${isSelected ? 'selected' : ''} ${isChild ? 'is-child' : ''}`}
                  onClick={() => {
                    if (isSelected) focus(module.id);
                    setSelected(module.id);
                    setHistory(null);
                    historyRequest.current++;
                  }}
                  onDoubleClick={() => canEdit && editModule(module)}
                >
                  <div className="udw-tree-header">
                    <span className="udw-tree-title">
                      <span className="udw-tree-icon">{icon}</span>
                      <span>{module.name}</span>
                    </span>
                    <span className="udw-tree-id">{module.id.replace('ALSVID-', '')}</span>
                  </div>

                  <div className="udw-tree-meta">
                    <span className="udw-tree-status">
                      <span className={`udw-status-dot ${status.dot}`} />
                      <span>{status.label}</span>
                    </span>

                    {canEdit ? (
                      <div className="udw-tree-actions" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          className="udw-action-btn primary"
                          onClick={() => editModule(module)}
                          title={module.kind ? '编辑该公共模块的内容' : '直接在新网页中打开图形化编辑器'}
                        >
                          编辑
                        </button>
                        {module.editor !== 'product-listing' && (
                          <button
                            type="button"
                            className="udw-action-btn"
                            disabled={!row || loading}
                            onClick={() => void showHistory(module)}
                            title="查看历史版本"
                          >
                            历史
                          </button>
                        )}
                      </div>
                    ) : (
                      <span style={{ fontSize: 10, color: '#888' }}>
                        {module.scope === 'structural' ? '主结构容器' : '系统保留'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {history && (
            <section className="udw-history" style={{ marginTop: 14 }}>
              <h4>{history.name} · 历史版本</h4>
              {history.loading ? <p>读取中…</p> : history.error ? <p role="alert">{history.error}</p> : history.rows.length ? history.rows.map(v => (
                <div key={v.version} style={{ fontSize: 12, marginBottom: 4 }}>
                  v{v.version} · {v.label || '发布版本'} <small>{v.createdAt || ''}</small>
                </div>
              )) : <p>暂无发布记录</p>}
              <button className="btn small" onClick={() => { historyRequest.current++; setHistory(null); }}>关闭</button>
            </section>
          )}
        </aside>

        {/* 中栏：设计尺寸与KV规格规范面板 */}
        {showSpecs && (
          <aside className="udw-specs-panel">
            <div className="udw-specs-header">
              <h3>
                <span>📐 设计尺寸与KV规范</span>
              </h3>
              <button
                type="button"
                className="udw-action-btn"
                onClick={() => {
                  const spec = MODULE_SPECS[selected] || MODULE_SPECS["ALSVID-G03-01"];
                  const text = spec.title + " 设计规范：\n" +
                    spec.dimensions.map(d => "- " + d.device + ": " + d.size + " (" + d.ratio + ")").join("\n") +
                    "\n- 推荐格式: " + spec.format +
                    "\n- 体积限制: " + spec.filesize +
                    "\n- 安全视区: " + spec.safetyZone +
                    "\n- 视觉风格: " + spec.visualStyle;
                  navigator.clipboard.writeText(text);
                  setCopiedSpec(true);
                  setTimeout(() => setCopiedSpec(false), 2000);
                }}
                title="一键复制当前模块的设计尺寸要求给设计团队"
              >
                {copiedSpec ? "已复制规范" : "复制当前规范"}
              </button>
            </div>

            {/* 当前选中模块的精准规格卡片 */}
            {(() => {
              const currentSpec = MODULE_SPECS[selected] || MODULE_SPECS["ALSVID-G03-01"];
              return (
                <div className="udw-specs-card is-active">
                  <div className="udw-specs-title-row">
                    <strong style={{ fontSize: 13, color: "#163624" }}>{currentSpec.title}</strong>
                    <span className="udw-specs-badge">{currentSpec.code}</span>
                  </div>
                  <div className="udw-specs-role">{currentSpec.role}</div>

                  <div className="udw-specs-dim-list">
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#385244", marginBottom: 2 }}>建议尺寸与宽高比：</div>
                    {currentSpec.dimensions.map((dim, i) => (
                      <div key={i} className="udw-specs-dim-item">
                        <span className="udw-specs-dim-device">{dim.device}</span>
                        <span className="udw-specs-dim-val">{dim.size} <small style={{ fontWeight: "normal", color: "#688070" }}>({dim.ratio})</small></span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gap: 4, marginTop: 4 }}>
                    <div className="udw-specs-meta-row">
                      <span className="udw-specs-meta-label">推荐格式</span>
                      <span>{currentSpec.format}</span>
                    </div>
                    <div className="udw-specs-meta-row">
                      <span className="udw-specs-meta-label">文件体积</span>
                      <span>{currentSpec.filesize}</span>
                    </div>
                  </div>

                  <div className="udw-safe-box">
                    <div className="udw-safe-header">
                      <span>📐 图像安全距离与留白规范</span>
                      <span style={{ fontSize: 10, color: "#2e6141", fontWeight: "normal" }}>严禁主体贴边/压字</span>
                    </div>
                    {currentSpec.safeDistance && (
                      <>
                        <div className="udw-safe-grid">
                          <div className="udw-safe-item">
                            <span className="udw-safe-label">顶部避让</span>
                            <span className="udw-safe-val">{currentSpec.safeDistance.top}</span>
                          </div>
                          <div className="udw-safe-item">
                            <span className="udw-safe-label">底部留白</span>
                            <span className="udw-safe-val">{currentSpec.safeDistance.bottom}</span>
                          </div>
                          <div className="udw-safe-item">
                            <span className="udw-safe-label">左侧文案</span>
                            <span className="udw-safe-val">{currentSpec.safeDistance.left}</span>
                          </div>
                          <div className="udw-safe-item">
                            <span className="udw-safe-label">右侧呼吸</span>
                            <span className="udw-safe-val">{currentSpec.safeDistance.right}</span>
                          </div>
                        </div>
                        <div className="udw-safe-note">
                          <strong>安全距离要求：</strong>{currentSpec.safeDistance.summary}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="udw-specs-tip">
                    <strong>安全视区要求：</strong>
                    <div>{currentSpec.safetyZone}</div>
                  </div>

                  <div style={{ fontSize: 11, color: "#4b6155", background: "#ffffff", padding: "6px 8px", borderRadius: 4, border: "1px solid #e1e9e4" }}>
                    <strong style={{ color: "#274435" }}>视觉与构图建议：</strong>
                    <div>{currentSpec.visualStyle}</div>
                  </div>
                </div>
              );
            })()}

            {/* 首页全套 KV 交付速查 */}
            <div style={{ marginTop: 4 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <strong style={{ fontSize: 12, color: "#243b2f" }}>首页全套 KV 交付速查</strong>
                <small style={{ color: "#688070", fontSize: 10 }}>点击行快速聚焦</small>
              </div>

              <table className="udw-specs-summary-table">
                <thead>
                  <tr>
                    <th>模块</th>
                    <th>推荐尺寸 (PC)</th>
                    <th>安全距离留白</th>
                    <th>格式</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { id: "ALSVID-G03-01", code: "G03-01 主推款", size: "2560 × 1440", safe: "顶120px / 左留40%", format: "WebP ≤800KB" },
                    { id: "ALSVID-G03-02", code: "G03-02 场景款", size: "1200 × 900", safe: "四周边距 ≥48px", format: "WebP ≤450KB" },
                    { id: "ALSVID-G03-03", code: "G03-03 性能款", size: "1920 × 1080", safe: "特写留白 ≥60px", format: "WebP ≤500KB" },
                    { id: "ALSVID-G03-04", code: "G03-04 矩阵陈列", size: "1000 × 750", safe: "透明内缩 ≥40px", format: "纯透明底 PNG" },
                    { id: "ALSVID-G03-05", code: "G03-05 品牌故事", size: "1920 × 960", safe: "上下64px / 左30%", format: "WebP ≤600KB" }
                  ].map(row => (
                    <tr
                      key={row.id}
                      style={{ background: selected === row.id ? "#e7f0ea" : undefined, fontWeight: selected === row.id ? "bold" : "normal" }}
                      onClick={() => {
                        setSelected(row.id);
                        focus(row.id);
                      }}
                    >
                      <td>{row.code}</td>
                      <td style={{ fontFamily: "monospace" }}>{row.size}</td>
                      <td style={{ color: "#1e5234", fontWeight: 600 }}>{row.safe}</td>
                      <td style={{ fontSize: 10 }}>{row.format}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </aside>
        )}

        {/* 右栏：正式前台真实预览 */}
        <section className="udw-preview">
          <div className="udw-top">
            <strong>正式前台预览</strong>
            <small>{focusResult || '点击左侧模块平滑定位；点击「编辑」在新标签页图形化装修'}</small>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn small" onClick={() => setReloadSeq(s => s + 1)} title="刷新前台预览">↻ 刷新预览</button>
              {preview && <a href={preview} target="_blank" rel="noreferrer">独立打开</a>}
            </div>
          </div>
          {!preview ? (
            <p className="hint">{origin ? '请选择已发布车型' : '未获取到前台访问地址，请检查连接配置。'}</p>
          ) : (
            <>
              {previewStatus === 'loading' && <p className="hint" role="status">正在连接真实前台（{origin}）…</p>}
              {previewStatus === 'unresponsive' && (
                <p className="error-text" role="alert">预览页面未返回模块定位确认。请检查前台是否启动及端口配置。</p>
              )}
              <div className={'udw-viewport ' + device}>
                <iframe
                  key={preview + ':' + reloadSeq}
                  ref={frame}
                  title="正式前台预览"
                  src={preview}
                  onLoad={() => {
                    setPreviewStatus('ready');
                    focus(selected);
                  }}
                />
              </div>
            </>
          )}
        </section>

      </div>

      {/* G04 独立编辑器：覆盖在工作台之上，保存后回到工作台并刷新模块状态 */}
      {shellReviewPage && (
        <ShellReleaseReview
          key={shellReviewPage.id + ":" + shellReviewPage.revision}
          page={shellReviewPage}
          onClose={() => setShellReviewPage(null)}
          onPublished={async (updated) => {
            setShellReviewPage(null);
            setPublishNotice("公共模块已成功发布上线！前台缓存已刷新。");
            setTimeout(() => setPublishNotice(""), 4000);
            await load();
            setReloadSeq(s => s + 1);
          }}
        />
      )}

      {footerEditing && (
        <FooterModuleEditor
          locale={locale}
          onClose={() => { setFooterEditing(false); void load(); }}
        />
      )}
    </div>
  );
}
