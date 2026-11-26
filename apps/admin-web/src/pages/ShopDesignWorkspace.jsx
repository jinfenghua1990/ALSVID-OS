import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { seoProductIdOf } from '../product-identity.js';
import SiteShellPanel from './SiteShellPanel.jsx';
import { CatalogLayoutPanel, StandardDetailPanel, GlobalModulesPanel, useCmsDocument } from './ProductDesignPanels.jsx';

// 店铺装修工作区：页面 TAB + 工具条 + 左侧按版本模块操作 + 右侧全铺开真实预览。
// 产品拆成 3 个同级页面：全部产品（列表页版式）、商品详情页（图文，按商品）、商品详情页（公共模块，全局）。
const LOCALES = [['zh', '中文'], ['de', 'Deutsch'], ['en', 'English']];
const PATH_ORDER = ['/', '/products', '/dealers', '/services', '/brand'];
// 首页历史版本走 layout-draft 快照，和普通 CMS 页面共用同一套展示，但来源标签不同。
const LAYOUT_VERSION_ORIGIN = { publish: '发布', rollback: '回滚', manual: '手动保存' };

function fmt(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 运营认的商品身份是产品主档里的 SEO 商品 ID（= 商城地址 slug = 各渠道 URL），
// 内部 UUID（p-bfaf74b1-…）只用于接口调用，不该出现在装修左列当身份展示。
// 取值规则统一收在 product-identity.js，商城运营各页共用同一套。

const REGIONS=[['announcement','ALSVID-G01','营销公告栏','按需启用'],['header','ALSVID-G02','顶部导航栏','全站共享'],['body','ALSVID-G03','页面主体内容','按页面独立装修'],['footer','ALSVID-G04','底部页脚','全站共享']];
export default function ShopDesignWorkspace(props){
 const [region,setRegion]=useState('body'),[shellDirty,setShellDirty]=useState(false);
 const choose=key=>{if(key===region)return;if(shellDirty&&!window.confirm('当前区域仍有未保存修改或操作正在处理，确定离开？'))return;setRegion(key);};
 return <div className="sdw">
 <div style={{display:'grid',gridTemplateColumns:'minmax(160px, 200px) minmax(0, 1fr)',gap:12,alignItems:'start'}}>
 <aside aria-label="官网四大装修区域" className="sdw__panel" style={{padding:12,display:'grid',gap:8}}>
 <h3 style={{margin:'4px 0'}}>官网装修区域</h3>
 {REGIONS.map(([key,id,label,desc])=><button key={key} type="button" aria-pressed={region===key} className={'gmp__item'+(region===key?' is-active':'')} style={{display:'grid',textAlign:'left',gap:4,padding:12,minHeight:key==='body'?100:64}} onClick={()=>choose(key)}><strong>{label}</strong><small>{id} · {desc}</small></button>)}
 <small>编号仅在后台显示，消费者不可见。</small>
 </aside>
 <div style={{minWidth:0}}>{region==='body'?<PageDesignWorkspace {...props}/>:<SiteShellPanel key={region} kind={region} onDirtyChange={setShellDirty}/>}</div>
 </div></div>;
}
function PageDesignWorkspace({ active = true, user, onSectionChange }) {
  const [pages, setPages] = useState([]);
  const [layout, setLayout] = useState(null);
  const [pageKey, setPageKey] = useState('/');
  // 产品下有三个装修页：list = 全部产品（列表页版式），graphic = 商品详情页（图文，按商品），global = 商品详情页（公共模块，全局）
  const [subPage, setSubPage] = useState('list');
  const [locale, setLocale] = useState('zh');
  const [selected, setSelected] = useState('live');
  const [device, setDevice] = useState('desktop');
  const [versions, setVersions] = useState([]);
  // 首页版本历史在 layout-draft 表里，不在 CMS 页面版本表里；编辑器里能看到但列表页一直空，原因就在这里。
  const [layoutVersions, setLayoutVersions] = useState({ available: true, items: [], reason: '' });
  // 商品详情页装修：需要真实商品清单与在售映射（productId → slug），预览与左列商品列表共用。
  const [products, setProducts] = useState([]);
  const [publishedMap, setPublishedMap] = useState(() => new Map());
  const [designProductId, setDesignProductId] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [layoutLoaded, setLayoutLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!active) return undefined;
    let alive = true;
    setLoading(true);
    setLayoutLoaded(false);
    const safe = (promise, fallback) => Promise.resolve(promise).catch(() => fallback);
    // 页面列表先到，layout 草稿体量大单独异步取，避免拖慢整个工作区
    safe(api.cmsPages({}), []).then(rows => {
      if (!alive) return;
      setPages(Array.isArray(rows) ? rows : []);
      setError('');
      setLoading(false);
    });
    // 只要版本号/时间做「内容版本」展示，不取 project 正文（导入页可能上百 KB）
    safe(api.storefrontLayoutDraft(true), null).then(draft => {
      if (!alive) return;
      setLayout(draft?.data || null);
      setLayoutLoaded(true);
    });
    return () => { alive = false; };
  }, [active]);

  // 页面 TAB：按 path 聚合多语言记录
  const pageTabs = useMemo(() => {
    const map = new Map();
    for (const p of pages) {
      const key = p.path || '/';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(p);
    }
    return [...map.entries()].map(([path, rows]) => ({
      path,
      rows,
      // 商品详情模板这一条对应官网顶部导航的「产品」：一级叫产品，详情模板是它下面的二级页
      label: rows[0].pageType === 'product_template' ? '产品' : ((rows.find(r => r.locale === 'zh') || rows[0]).name || path),
      type: rows[0].pageType,
    })).sort((a, b) => {
      const ia = PATH_ORDER.indexOf(a.path), ib = PATH_ORDER.indexOf(b.path);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.path.localeCompare(b.path);
    });
  }, [pages]);

  const current = pageTabs.find(t => t.path === pageKey) || pageTabs[0] || null;
  // 当前页面的当前语言记录（首页是 locale='*' 的单条记录）
  const row = useMemo(() => {
    if (!current) return null;
    if (current.path === '/') return current.rows.find(r => r.pageType === 'home') || current.rows[0] || null;
    return current.rows.find(r => r.locale === locale) || null;
  }, [current, locale]);

  // 公共模块的草稿状态提升到这里：保存 / 发布 / 发布记录要统一在顶部动作条上，
  // 状态留在编辑面板内部父级拿不到 dirty，按钮就没法点亮。
  // 只在公共模块页启用，别的页面不用白拉一次上百 KB 的 page 草稿。
  const globalCms = useCmsDocument(row, current?.type === 'product_template' && subPage === 'global');

  // 切页面/语言时拉该页面的历史版本快照列表。
  // 首页走 storefront layout 版本表；其它 CMS 页面走 site_page_versions。
  useEffect(() => {
    if (!current) { setVersions([]); setLayoutVersions({ available: true, items: [], reason: '' }); return undefined; }
    let alive = true;
    if (row) {
      api.cmsVersions(row.id)
        .then(list => { if (alive) setVersions(Array.isArray(list) ? list : []); })
        .catch(() => { if (alive) setVersions([]); });
    } else {
      setVersions([]);
    }
    if (current.path === '/') {
      api.layoutVersions(50)
        .then(result => {
          if (!alive) return;
          setLayoutVersions({
            available: result?.available !== false,
            items: Array.isArray(result?.items) ? result.items : [],
            reason: result?.reason || '',
          });
        })
        .catch(() => { if (alive) setLayoutVersions({ available: true, items: [], reason: '' }); });
    } else {
      setLayoutVersions({ available: true, items: [], reason: '' });
    }
    return () => { alive = false; };
  }, [row && row.id, current?.path]);

  // 内容状态分层：线上 / 未发布草稿 / 历史版本（各自带可重命名的别名）
  const liveItem = useMemo(() => {
    if (!current) return null;
    if (current.path === '/') return layout?.publishedVersion ? { time: layout.publishedAt, label: row?.publishedLabel || '' } : null;
    return row?.publishedVersion ? { time: row.publishedAt, version: row.publishedVersion, label: row.publishedLabel || '' } : null;
  }, [current, row, layout]);

  const draftItem = useMemo(() => {
    if (!current) return null;
    if (current.path === '/') return layout?.version ? { time: layout.updatedAt, label: row?.draftLabel || '' } : null;
    return row?.hasDraft ? { time: row.updatedAt, label: row.draftLabel || '' } : null;
  }, [current, row, layout]);

  const historyItems = useMemo(() => {
    if (!current) return [];
    if (current.path === '/') {
      const published = Number(layout?.publishedVersion);
      return (layoutVersions.items || [])
        .filter(v => Number(v.version) !== published)
        .map(v => ({
          key: `v:${v.version}`,
          version: v.version,
          time: v.publishedAt || v.createdAt,
          label: v.note || '',
          desc: `${LAYOUT_VERSION_ORIGIN[v.origin] || v.origin || '历史版本'}${v.publishedBy ? ' · ' + String(v.publishedBy).split('@')[0] : ''}${v.rolledBackFrom ? ' ← v' + v.rolledBackFrom : ''}`,
        }));
    }
    return versions.filter(v => Number(v.version) !== Number(row?.publishedVersion)).map(v => ({
      key: `v:${v.version}`, version: v.version, time: v.createdAt, label: v.label || '',
      desc: v.createdBy ? `历史发布记录 · ${v.createdBy}` : '历史发布记录',
    }));
  }, [current, row, versions, layout?.publishedVersion, layoutVersions]);

  // 产品 TAB：加载真实商品清单（主图/名称）与当前语言的在售映射（productId → slug）。
  useEffect(() => {
    if (!current || current.type !== 'product_template' || products.length) return undefined;
    api.products(undefined, true).then(rows => { if (Array.isArray(rows)) setProducts(rows); }).catch(() => {});
    return undefined;
  }, [current && current.type, products.length]);
  useEffect(() => {
    if (!current || current.type !== 'product_template') { return undefined; }
    let alive = true, page = 1;
    const step = async () => {
      const map = new Map();
      try {
        let result;
        do { result = await api.catalogProducts(locale, page++); (result?.items || []).forEach(item => { if (item.productId && item.slug) map.set(String(item.productId), item.slug); }); } while (result?.hasMore && alive && page <= 20);
      } catch (_) {}
      if (!alive) return;
      setPublishedMap(map);
      setDesignProductId(prev => (prev && map.has(prev)) ? prev : (map.keys().next().value || ''));
    };
    step();
    return () => { alive = false; };
  }, [current && current.type, locale]);

  // 预览地址：线上 / 草稿 / 历史版本分别走不同参数
  const previewUrl = useMemo(() => {
    if (!current) return '';
    const base = current.path === '/' ? `/www/${locale}` : `/www/${locale}${current.path}`;
    const previewParams = selected === 'draft' ? '?draft=1' : selected.startsWith('v:') ? `?version=${selected.slice(2)}` : '';
    // 产品：一级「全部产品」是列表页版式；二级「商品详情页」落到当前选中商品的详情页
    if (current.type === 'product_template') {
      if (subPage === 'list') return `${base}${previewParams}`;
      const slug = publishedMap.get(String(designProductId));
      return slug ? `${base}/${encodeURIComponent(slug)}${previewParams}` : `${base}${previewParams}`;
    }
    if (selected === 'draft') return `${base}?draft=1`;
    if (selected.startsWith('v:')) return `${base}?version=${selected.slice(2)}`;
    return base;
  }, [current, locale, selected, subPage, designProductId, publishedMap]);

  // 点击模块目录 → 通知预览 iframe 滚动到该模块并高亮。
  // iframe 可能正在加载（换语言/换商品会重载），所以点一下先记成「待定位」，
  // 等 onLoad 触发后再补发，否则消息会打在还没注册监听器的页面上直接丢掉。
  const frameRef = useRef(null);
  const [focusModule, setFocusModule] = useState(null);
  const pendingFocus = useRef(null);

  const postFocus = useCallback(key => {
    const win = frameRef.current?.contentWindow;
    if (!win || !key) return;
    win.postMessage({ type: 'alsvid:focus-module', key }, '*');
  }, []);

  useEffect(() => {
    if (!focusModule) return undefined;
    if (!focusModule.anchor) { pendingFocus.current = null; return undefined; }
    pendingFocus.current = focusModule.key;
    // 这里不清 pendingFocus：如果 iframe 正在重载，650ms 这次会打在旧页面上丢掉，
    // 留给 onLoad 补发才有意义。
    const timer = setTimeout(() => postFocus(focusModule.key), 650);
    return () => clearTimeout(timer);
  }, [focusModule, previewUrl, postFocus]);

  // 预览页的商品数据是异步拉的，锚点比 onLoad 晚出现，所以补发几次而不是只发一次
  const handleFrameLoad = () => {
    const key = pendingFocus.current;
    if (!key) return;
    pendingFocus.current = null;
    [350, 1200, 2400].forEach(ms => setTimeout(() => postFocus(key), ms));
  };

  const status = useMemo(() => {
    if (!current) return { text: '—', tone: 'none' };
    if (current.path === '/') return layout?.publishedVersion ? { text: '线上版本正常', tone: 'live' } : { text: '尚未发布', tone: 'draft' };
    if (current.type === 'product_template') {
      if (subPage === 'list') return row?.publishedVersion ? (row.hasDraft ? { text: '线上版式正常 · 有新草稿', tone: 'live' } : { text: '线上版式正常', tone: 'live' }) : { text: '版式未发布', tone: 'draft' };
      if (subPage === 'global') return row?.publishedVersion ? (row.hasDraft ? { text: '公共模块已发布 · 有新草稿', tone: 'live' } : { text: '公共模块已发布', tone: 'live' }) : { text: '公共模块未发布', tone: 'draft' };
      return { text: '按商品独立发布', tone: 'none' };
    }
    if (row?.publishedVersion) return row.hasDraft ? { text: '线上版本正常 · 有新草稿', tone: 'live' } : { text: '线上版本正常', tone: 'live' };
    if (row?.hasDraft) return { text: '草稿待发布', tone: 'draft' };
    return { text: '未发布', tone: 'none' };
  }, [current, row, layout, subPage]);

  const previewFlag = useMemo(() => {
    if (selected === 'draft') return '草稿预览';
    if (selected.startsWith('v:')) return `历史版本 ${selected.slice(2)}`;
    return '';
  }, [selected]);

  // 装修编辑在独立浏览器窗口打开，和主后台的版本列表/预览完全隔离；
  // 固定窗口名复用同一个窗口，避免连点开出多个。尺寸取大屏但非全屏，用户可自行最大化。
  const openEditor = () => {
    if (!current) return;
    let editUrl = '/?adminWindow=storefront-design';
    if (current.path === '/') {
      editUrl += '&edit=home';
    } else {
      const target = row || current.rows[0];
      if (!target) return;
      editUrl += `&edit=page&pageId=${encodeURIComponent(target.id)}`;
    }
    const opened = window.open(editUrl, 'alsvidStorefrontEditor', 'width=1440,height=900,menubar=no,toolbar=no,location=no,status=no');
    if (!opened) setError('浏览器拦截了编辑窗口，请允许本站弹窗后重试。');
    else setError('');
  };

  const refreshPages = async () => {
    const rows = await api.cmsPages({});
    setPages(Array.isArray(rows) ? rows : []);
  };

  const refreshVersions = async () => {
    if (!row) return;
    const list = await api.cmsVersions(row.id);
    setVersions(Array.isArray(list) ? list : []);
  };

  // 顶部动作条：公共模块的保存 / 发布（状态来自提升到本层的 useCmsDocument）
  const doGlobalSave = async () => { if (await globalCms.save()) setNotice('公共模块草稿已保存'); };
  const doGlobalPublish = async () => {
    if (await globalCms.publish()) { setNotice('公共模块已发布，请通过正式前台验收'); await refreshPages(); await refreshVersions(); }
  };
  // 发布记录里的「载入为草稿」：换草稿内容，不动线上，也不覆盖原始快照
  const loadVersionAsDraft = async version => {
    if (!row || busy) return;
    if (!window.confirm(`以 v${version.version}（${fmt(version.createdAt)}）为基础生成新草稿？\n线上版本与原始历史快照都不受影响。`)) return;
    setBusy(true);
    try {
      if (globalCms.dirty && !window.confirm('当前未保存的修改将丢失，仍要载入历史版本？')) return;
      await api.restoreCmsVersionDraft(row.id, version.version, globalCms.page?.revision ?? row.revision);
      await refreshPages();
      await globalCms.reload();
      setHistoryOpen(false);
      setNotice(`已载入 v${version.version} 为草稿，检查后重新发布`);
    } catch (e) { window.alert(`载入失败：${e.message}`); }
    finally { setBusy(false); }
  };

  // 基于历史版本重建草稿：不改线上、不覆盖原历史快照
  const editHistoryVersion = async item => {
    if (!row || busy) return;
    if (!window.confirm(`以 ${fmt(item.time)} 的历史版本为基础生成新草稿？\n当前草稿内容会被替换，线上版本与原始历史记录都不受影响。`)) return;
    setBusy(true);
    try {
      await api.restoreCmsVersionDraft(row.id, item.version, row.revision);
      await refreshPages();
      onSectionChange?.('pages', { pageId: row.id, pageQuery: '' });
    } catch (e) { window.alert(`装修失败：${e.message}`); }
    finally { setBusy(false); }
  };

  // 软删除历史版本：线上版本受保护，快照仍留在审计日志
  const deleteHistoryVersion = async item => {
    if (!row || busy) return;
    if (!window.confirm(`删除 ${fmt(item.time)} 这条历史版本？\n当前线上版本不会被删除，删除记录保留在审计日志中。`)) return;
    setBusy(true);
    try {
      await api.deleteCmsVersion(row.id, item.version);
      await refreshVersions();
      await refreshPages();
      if (selected === item.key) setSelected('live');
    } catch (e) { window.alert(`删除失败：${e.message}`); }
    finally { setBusy(false); }
  };

  // 每个版本模块各自的重命名（线上/草稿存页面行，历史版本存版本行）
  const renameLive = async () => {
    if (!row || busy) return;
    const next = window.prompt('给「当前线上」这个版本起个名字（留空恢复默认）', liveItem?.label || '');
    if (next === null) return;
    setBusy(true);
    try { await api.setCmsLabels(row.id, { publishedLabel: next.trim() }); await refreshPages(); }
    catch (e) { window.alert(`重命名失败：${e.message}`); }
    finally { setBusy(false); }
  };

  const renameDraft = async () => {
    if (!row || busy) return;
    const next = window.prompt('给这个草稿起个名字（留空恢复默认）', draftItem?.label || '');
    if (next === null) return;
    setBusy(true);
    try { await api.setCmsLabels(row.id, { draftLabel: next.trim() }); await refreshPages(); }
    catch (e) { window.alert(`重命名失败：${e.message}`); }
    finally { setBusy(false); }
  };

  const renameHistoryVersion = async item => {
    if (!row || busy) return;
    const next = window.prompt('给这个历史版本起个名字（留空恢复默认）', item.label || '');
    if (next === null) return;
    setBusy(true);
    try { await api.setCmsVersionLabel(row.id, item.version, next.trim()); await refreshVersions(); }
    catch (e) { window.alert(`重命名失败：${e.message}`); }
    finally { setBusy(false); }
  };

  const canPreview = Boolean(previewUrl);
  const homePending = current?.path === '/' && !layoutLoaded;
  // 产品 TAB 走专用装修面板；其余页面维持「版本列表 + 预览」两栏。
  const isProduct = current?.type === 'product_template';

  const moduleOps = (ops, extraClass = '') => <div className={'sdw__vmod-ops' + (extraClass ? ' ' + extraClass : '')}>
    {ops.map(op => <button key={op.label} type="button" className={'sdw__link' + (op.tone ? ' is-' + op.tone : '')} disabled={busy} onClick={op.onClick}>{op.label}</button>)}
  </div>;

  return <div className="sdw">
    {/* 顶部一行：标题 + 页面 TAB（产品的「全部产品 / 商品详情页」与其它页面同级同排） */}
    <div className="sdw__top">
      <h2 className="sdw__title">页面主体装修 · ALSVID-G03</h2>
      <nav className="sdw__pages" role="tablist" aria-label="官网页面">
        {pageTabs.flatMap(tab => tab.type === 'product_template'
          ? [
            <button key={tab.path + '#list'} type="button" role="tab" aria-selected={pageKey === tab.path && subPage === 'list'} title="分类导航 + 产品自动展示，默认按销量倒序"
              className={'sdw__ptab' + (pageKey === tab.path && subPage === 'list' ? ' is-active' : '')}
              onClick={() => { setPageKey(tab.path); setSubPage('list'); setSelected('live'); }}>全部产品</button>,
            <button key={tab.path + '#graphic'} type="button" role="tab" aria-selected={pageKey === tab.path && subPage === 'graphic'} title="按商品维护 ① 主图与 ⑤ 图文详情"
              className={'sdw__ptab' + (pageKey === tab.path && subPage === 'graphic' ? ' is-active' : '')}
              onClick={() => { setPageKey(tab.path); setSubPage('graphic'); setSelected('live'); }}>商品详情页（图文）</button>,
            <button key={tab.path + '#global'} type="button" role="tab" aria-selected={pageKey === tab.path && subPage === 'global'} title="② 营销 ③④ 预留 ⑥ 评价 ⑦ 退换货 ⑧ 其他，装修一次全部商品生效"
              className={'sdw__ptab' + (pageKey === tab.path && subPage === 'global' ? ' is-active' : '')}
              onClick={() => { setPageKey(tab.path); setSubPage('global'); setSelected('live'); }}>商品详情页（公共模块）</button>,
          ]
          : [<button key={tab.path} type="button" role="tab" aria-selected={tab.path === pageKey}
            className={'sdw__ptab' + (tab.path === pageKey ? ' is-active' : '')}
            onClick={() => { setPageKey(tab.path); setSelected('live'); setSubPage('list'); }}>
            {tab.label}
          </button>])}
      </nav>
    </div>

    {/* 第二层：工具条 —— 语言与设备切换同一行 */}
    <div className="sdw__toolbar">
      <div className="sdw__current">
        <strong>{current?.type === 'product_template' ? ({ list: '全部产品', graphic: '商品详情页（图文）', global: '商品详情页（公共模块）' }[subPage] || '全部产品') : (current?.label || '—')}</strong>
        <span className="mono">{current?.path}</span>
        <span className={'sdw__state is-' + status.tone}>{status.text}</span>
      </div>
      <div className="sdw__tools">
        <nav className="sdw__locales" role="tablist" aria-label="页面语言">
          {LOCALES.map(([code, label]) => <button key={code} type="button" role="tab" aria-selected={code === locale}
            className={'sdw__ltab' + (code === locale ? ' is-active' : '')}
            onClick={() => { setLocale(code); setSelected('live'); }}>
            {label}
          </button>)}
        </nav>
        <div className="sdw__devices" role="group" aria-label="预览设备">
          <button type="button" className={'sdw__device' + (device === 'desktop' ? ' is-active' : '')} onClick={() => setDevice('desktop')}>桌面端</button>
          <button type="button" className={'sdw__device' + (device === 'mobile' ? ' is-active' : '')} onClick={() => setDevice('mobile')}>移动端</button>
        </div>
      </div>
    </div>

    {/* 公共模块专用动作条：保存 / 发布记录 / 发布都在顶部，左栏只留模块目录 */}
    {isProduct && subPage === 'global' && <div className="sdw__actionbar">
      <span className={'sdw__ab-status' + (globalCms.dirty ? ' is-dirty' : '')}>
        {globalCms.dirty ? '有未保存修改' : (row?.publishedVersion ? `线上 v${row.publishedVersion}` : '尚未发布')}
      </span>
      {globalCms.error && <span className="error-text">{globalCms.error}</span>}
      <div className="sdw__ab-actions">
        <button type="button" className="btn small" disabled={!globalCms.dirty || globalCms.busy} onClick={doGlobalSave}>{globalCms.busy ? '处理中…' : '保存草稿'}</button>
        <div className="sdw__hist">
          <button type="button" className="btn small" aria-expanded={historyOpen} onClick={() => setHistoryOpen(open => !open)}>发布记录{versions.length ? ` (${versions.length})` : ''}</button>
          {historyOpen && <div className="sdw__hist-menu">
            <strong>历史发布版本</strong>
            {!versions.length && <p className="sdw__tip">暂无发布记录，每次发布会自动留档。</p>}
            {versions.map(version => <div className="sdw__hist-row" key={version.version}>
              <span className="sdw__hist-main">
                <b>v{version.version}</b>
                <small>{fmt(version.createdAt)}{version.createdBy ? ` · ${version.createdBy}` : ''}</small>
              </span>
              <button type="button" className="btn small" disabled={busy} onClick={() => loadVersionAsDraft(version)}>载入为草稿</button>
            </div>)}
          </div>}
        </div>
        <button type="button" className="btn small primary" disabled={globalCms.busy || globalCms.dirty || !globalCms.doc} onClick={doGlobalPublish}>{globalCms.busy ? '发布中…' : '发布'}</button>
      </div>
    </div>}

    {notice && <p className="sdw__notice" role="status">{notice}<button type="button" aria-label="关闭提示" onClick={() => setNotice('')}>×</button></p>}

    <div className={'sdw__body' + (isProduct ? (subPage === 'list' ? ' sdw__body--list' : ' sdw__body--detail') : '')}>
      {isProduct ? (subPage === 'list'
        ? <aside className="sdw__panel">
          <div className="sdw__side-head"><h3 className="sdw__side-title">列表页版式</h3></div>
          {row ? <CatalogLayoutPanel row={row} locale={locale} products={products} publishedMap={publishedMap} onPublished={refreshPages} notify={setNotice}/> : <p className="sdw__tip">该语言（{locale}）还没有产品页模板记录，请先在「页面管理」创建 product_template 页面。</p>}
        </aside>
        : subPage === 'graphic'
          ? <>
            <aside className="sdw__products">
              <div className="sdw__side-head"><h3 className="sdw__side-title">商品列表</h3></div>
              <input className="sdp__search" type="search" placeholder="搜索商品名称 / ID" value={productQuery} onChange={e => setProductQuery(e.target.value)}/>
              <div className="sdp__plist">
                {products.filter(p => {
                  const q = productQuery.trim().toLowerCase();
                  if (!q) return true;
                  return String(p.name || '').toLowerCase().includes(q) || String(p.id).toLowerCase().includes(q) || seoProductIdOf(p).includes(q);
                }).map(p => {
                  const seoId = seoProductIdOf(p);
                  // 已定 SEO 商品 ID 的商品，左列展示的就是那一条（和商城地址同串）；
                  // 还没定的（配件类）回落到内部 ID，悬停能看到完整内部 ID，不至于失去排查线索。
                  return <button type="button" key={p.id} className={'sdp__prow' + (p.id === designProductId ? ' is-active' : '')} onClick={() => { setDesignProductId(p.id); setSelected('live'); }}>
                    {p.images?.[0] ? <img src={`/api/products/${encodeURIComponent(p.id)}/media/${encodeURIComponent(p.images[0].id)}`} alt=""/> : <span className="sdp__prow-noimg">无图</span>}
                    <span className="sdp__prow-main"><b>{p.name}</b><small title={seoId ? `内部 ID：${p.id}` : `尚未设置 SEO 商品 ID，此处显示内部 ID：${p.id}`}>ID: {seoId || p.id}</small></span>
                    <i className={'sdp__pstate' + (publishedMap.has(String(p.id)) ? ' is-on' : '')}>{publishedMap.has(String(p.id)) ? '在售' : '未上架'}</i>
                  </button>;
                })}
                {!products.length && <p className="sdw__tip">正在读取商品清单…</p>}
              </div>
            </aside>
            <section className="sdw__panel sdw__panel--editor">
              <StandardDetailPanel locale={locale} products={products} publishedMap={publishedMap} productId={designProductId}/>
            </section>
          </>
          // 公共模块：左模块目录（01-08）+ 中当前模块编辑区 + 右预览
          : row
            ? <GlobalModulesPanel cms={globalCms} row={row} locale={locale} onEditGraphic={() => setSubPage('graphic')} onLocaleChange={code => { setLocale(code); setSelected('live'); }} onSelectModule={payload => setFocusModule({ ...payload, at: Date.now() })}/>
            : <aside className="sdw__panel"><p className="sdw__tip">该语言（{locale}）还没有产品页模板记录，无法装修公共模块。</p></aside>
        )
        // 其余页面：左侧版本列表 + 右侧预览
        : <aside className="sdw__versions">
        <div className="sdw__side-head">
          <h3 className="sdw__side-title">内容版本</h3>
        </div>
        <>
        {loading && <p className="sdw__tip">正在读取版本信息…</p>}

        {/* 当前线上 */}
        {homePending
          ? <p className="sdw__tip">正在读取首页版本信息…</p>
          : liveItem
            ? <div className={'sdw__vmod sdw__vmod--live' + (selected === 'live' ? ' is-active' : '')}>
              <button type="button" className="sdw__vmod-head" onClick={() => setSelected('live')}>
                <span className="sdw__vitem-top"><b>{liveItem.label || '当前线上'}</b><i className="sdw__badge is-live">线上</i></span>
                <span className="sdw__vitem-time">{fmt(liveItem.time)}</span>
              </button>
              {moduleOps([
                { label: '预览', onClick: () => setSelected('live') },
                { label: '进入装修编辑', tone: 'strong', onClick: openEditor },
                { label: '重命名', onClick: renameLive },
              ])}
            </div>
            : <p className="sdw__tip">该内容尚未发布，先在草稿模块进入编辑器并发布。</p>}

        {/* 未发布草稿 */}
        {!homePending && (draftItem
          ? <div className={'sdw__vmod sdw__vmod--draft' + (selected === 'draft' ? ' is-active' : '')}>
            <button type="button" className="sdw__vmod-head" onClick={() => setSelected('draft')}>
              <span className="sdw__vitem-top"><b>{draftItem.label || '未发布草稿'}</b><i className="sdw__badge is-draft">草稿</i></span>
              <span className="sdw__vitem-time">{fmt(draftItem.time)}</span>
            </button>
            {moduleOps([
              { label: '预览草稿', onClick: () => setSelected('draft') },
              { label: '继续编辑', tone: 'strong', onClick: openEditor },
              { label: '重命名', onClick: renameDraft },
            ])}
          </div>
          : <p className="sdw__tip">点上方「进入装修编辑」，保存后自动成为草稿，发布后才更新线上。</p>)}

        {/* 历史版本：平铺展开，每条可预览 / 装修 / 删除 */}
        <div className="sdw__history-head">历史版本{historyItems.length ? ` (${historyItems.length})` : ''}</div>
        {historyItems.length
          ? historyItems.map(item => <div key={item.key} className={'sdw__vmod sdw__vmod--history' + (selected === item.key ? ' is-active' : '')}>
            <button type="button" className="sdw__vmod-head" onClick={() => setSelected(item.key)}>
              <span className="sdw__vitem-top"><b>{item.label || fmt(item.time)}</b><i className="sdw__badge">历史</i></span>
              {item.label && <span className="sdw__vitem-time">{fmt(item.time)}</span>}
              <span className="sdw__vitem-desc">{item.desc}</span>
            </button>
            {current?.path === '/'
              ? moduleOps([
                { label: '预览', onClick: () => setSelected(item.key) },
                { label: '在编辑器中查看', tone: 'strong', onClick: openEditor },
              ])
              : moduleOps([
                { label: '预览', onClick: () => setSelected(item.key) },
                { label: '装修', tone: 'strong', onClick: () => editHistoryVersion(item) },
                { label: '重命名', onClick: () => renameHistoryVersion(item) },
                { label: '删除', tone: 'danger', onClick: () => deleteHistoryVersion(item) },
              ])}
          </div>)
          : current?.path === '/' && !layoutVersions.available
            ? <p className="error-text" role="alert">版本历史不可用：{layoutVersions.reason || '版本历史表尚未建立'}</p>
            : <p className="sdw__tip">暂无历史版本，每次发布会自动留档。</p>}

        {error && <p className="error-text" role="alert">{error}</p>}
        </>
      </aside>}

      {/* 右侧：官网实时预览（预览自己的工具条：看哪个商品、哪个版本） */}
      <section className="sdw__preview">
        <div className="sdw__preview-head">
          <span className="sdw__preview-title">官网实时预览</span>
          <div className="sdw__preview-tools">
            {isProduct && subPage !== 'list' && <select className="sdw__vselect" aria-label="预览商品" value={designProductId || ''} onChange={e => { setDesignProductId(e.target.value); setSelected('live'); }}>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>}
            {current?.type === 'product_template' && <select className="sdw__vselect" aria-label="预览版本" value={selected} onChange={e => setSelected(e.target.value)}>
              <option value="live">预览：线上版本</option>
              {row?.hasDraft && <option value="draft">预览：未发布草稿</option>}
              {historyItems.map(item => <option key={item.key} value={item.key}>预览：历史 {item.label || fmt(item.time)}</option>)}
            </select>}
          </div>
        </div>
        {focusModule && <p className={'sdw__focus' + (focusModule.anchor ? ' is-ok' : ' is-miss')}>
          {focusModule.anchor
            ? <>已定位到预览：<b>{focusModule.no} {focusModule.name}</b></>
            : <><b>{focusModule.no} {focusModule.name}</b> 当前未启用或没有内容，官网预览里没有这个区块</>}
        </p>}
        <div className={'sdw__frame' + (device === 'mobile' ? ' is-mobile' : '')}>
          {canPreview
            ? <iframe ref={frameRef} onLoad={handleFrameLoad} title={`${current?.label || '页面'}预览`} src={previewUrl} />
            : <div className="sdw__noview">{current?.path === '/' ? '可视化装修草稿需进入编辑器查看' : '该版本暂无可预览内容'}</div>}
          {canPreview && previewFlag && <span className="sdw__flag">{previewFlag}</span>}
        </div>
      </section>
    </div>
  </div>;
}
