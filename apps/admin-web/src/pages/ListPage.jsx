import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { isValidEan13 } from '../ean13.js';

/* 产品列表：物理产品与工程物料库
   整车 = 产品卡片视图（设计稿 1:1：左产品图 + 规格图标行 + 内嵌 SKU 子表），可切回紧凑表格
   零配件 = 紧凑表格（保持不变）
   数据、排序、内联编辑、启停、删除等交互全部沿用，动画走 vb- 体系 */
function SkuCell({ skus }) {
  if (!skus || !skus.length) return <span className="hint" />;
  return (
    <React.Fragment>
      <span className="tag sku">{skus[0].sku}</span>
      {skus.length > 1 && <span className="hint" />}
    </React.Fragment>
  );
}

/* 明细行内联编辑：失焦或回车时提交，值未变化则不请求。 */
function InlineField({ value, type = 'text', className = '', placeholder = '', onCommit }) {
  const [draftValue, setDraftValue] = useState(value ?? '');
  useEffect(() => { setDraftValue(value ?? ''); }, [value]);
  const commit = () => { if (String(draftValue) !== String(value ?? '')) onCommit(draftValue); };
  return <input className={className} type={type} value={draftValue} placeholder={placeholder}
    min={type === 'number' ? 0 : undefined} step={type === 'number' ? '0.01' : undefined}
    onChange={e => setDraftValue(e.target.value)}
    onBlur={commit}
    onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />;
}

/* 次级操作收纳：常驻只留主按钮，停用/删除等收进「···」菜单。 */
function ActionMenu({ items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current || !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!items.length) return null;
  return (
    <span className="action-menu" ref={ref}>
      <button type="button" className="action-menu__trigger" aria-haspopup="menu" aria-expanded={open} aria-label="更多操作" onClick={() => setOpen(v => !v)}>···</button>
      {open && <span className="action-menu__list" role="menu">
        {items.map(item => (
          <button key={item.label} type="button" role="menuitem" disabled={item.disabled}
            className={'action-menu__item' + (item.danger ? ' danger' : '')}
            onClick={() => { setOpen(false); item.onClick(); }}>{item.label}</button>
        ))}
      </span>}
    </span>
  );
}

const COLOR_DOTS = { BLK: '#1c1c1e', WHT: '#ffffff', GRY: '#9aa3ab', SLV: '#c7ccd1', BLU: '#2f5f9e', RED: '#b23b32', GRN: '#3c7d57', YLW: '#d8b23a', ORG: '#c8792a' };

/* 规格行线条图标（14×14，跟随文字色） */
const SpecIcon = {
  frame: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><circle cx="6.5" cy="9.5" r="4.6" /><circle cx="12.4" cy="4.4" r="1.6" /><path d="M6.5 9.5 12.4 4.4" /></svg>,
  power: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"><path d="M9 1.5 3.5 9h4l-1 5.5L12 7H8z" /></svg>,
  fold: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3.5h5.5l3 2.5H14" /><path d="M2 12.5h5.5" /><path d="M11 10.5l2 2-2 2" /><path d="M13 12.5H8.5" /></svg>,
  weight: <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4.5h4l1.5 8h-7z" /><path d="M6.5 4.5a1.5 1.5 0 0 1 3 0" /></svg>,
};

const TRIM_SHORT = { ULT: 'Ultra', PRO: 'Pro', STD: 'Standard' };

/* 商业摘要（对齐 8090 PRODUCT MASTER 卡片）：采购成本 / 销售价 / 单台毛利 / 在库 / 累计售出。
   成本来自库存估值（最新采购单价或主档成本，折 CNY）；
   销售价取该 SKU 最近一笔销售订单的成交单价；
   累计售出按已出运（IN_TRANSIT/DELIVERED/COMPLETED）且非样品的订单数量合计。 */
const FX_CNY = { EUR: 7.85, USD: 7.2 };
const toCnyPrice = (amount, currency, qty) => Math.round(Number(amount || 0) * (FX_CNY[currency] || 1) / qty * 100) / 100;
const bizMoney = v => v == null ? '—' : `¥${Math.round(v).toLocaleString('zh-CN')}`;
const bizOf = (p, biz) => {
  if (!biz) return null;
  let cost = null, qty = 0, soldU = 0, orders = 0, price = null;
  (p.skus || []).forEach(s => {
    const st = biz.stock[s.sku];
    if (st) { if (cost === null && st.cost != null) cost = st.cost; qty += st.qty; }
    soldU += biz.sold[s.sku] || 0;
    orders += biz.cnt[s.sku] || 0;
    if (price === null && biz.price[s.sku] != null) price = biz.price[s.sku];
  });
  const margin = price != null && cost != null ? Math.round((price - cost) * 100) / 100 : null;
  return { cost, qty, soldU, orders, price, margin };
};

/* ---- 以下全部为模块级纯函数 / 组件：不依赖 ListPage 渲染作用域，
   避免每次 render 生成新组件类型导致卡片卸载重挂、入场动画重复播放 ---- */
const trimNames = { ULT: 'Ultra 旗舰配置', PRO: 'Pro 性能配置', STD: 'Standard 标准配置' };
const specDisplay = s => /^[A-Z0-9]{3}$/.test(s.spec || '') ? (trimNames[s.spec] || `配置 ${s.spec}`) : null;
const marketOf = s => { const parts = String(s.sku || '').split('-'); return parts.length >= 4 ? parts[3] : ''; };

// 核心技术架构直接由真实技术参数组合，不额外存冗余字段。
const architectureOf = p => {
  const wheel = String(p.specs?.wheel_size || '').trim();
  const material = String(p.specs?.frame_material || '').trim();
  return wheel || material ? `${wheel}${material}车架` : '';
};
// 动力系统基准：额定功率 + 驱动形式，第二行给助力切断时速与油门模式。
const powerOf = p => {
  const power = String(p.specs?.rated_power_w || p.specs?.motor_power || '').trim();
  const drive = String(p.specs?.drive_type || '').trim();
  return [power && `${power}W`, drive].filter(Boolean).join(' ');
};
const cutoffOf = p => String(p.specs?.max_assist_speed_kmh || p.specs?.max_speed || '').trim();
const throttleOf = p => {
  const mode = String(p.specs?.throttle_mode || '').trim();
  if (!mode) return '';
  if (mode.includes('无油门')) return '无油门';
  if (mode.includes('Walk')) return '仅助推 6km/h';
  return mode;
};
// 物理几何与重量：跨高、折叠尺寸、整备重量、适配身高与承重。
// 拆成 main / weights / extra 三段返回，避免调用方把 weights 再拼一次导致「链条 14.5kg · 链条 14.5kg」重复。
const geometryOf = p => {
  const standover = String(p.specs?.standover_height || '').trim();
  const folded = String(p.specs?.folded_size || '').trim();
  const belt = String(p.specs?.weight_belt || '').trim();
  const chain = String(p.specs?.weight_chain || '').trim();
  const rider = String(p.specs?.rider_height || '').trim();
  const load = String(p.specs?.max_rider_load || '').trim();
  const weights = [belt && `皮带 ${belt}kg`, chain && `链条 ${chain}kg`].filter(Boolean).join(' / ') || (belt || chain ? `${belt || chain}kg` : '');
  const extra = [rider, load && `承重 ≤${load}kg`].filter(Boolean).join(' · ');
  return {
    main: [standover && `跨高 ${standover}cm`, folded && `折叠 ${folded}`].filter(Boolean).join(' · '),
    weights,
    extra,
    sub: [weights, extra].filter(Boolean).join(' · '),
  };
};
// 标题里已经写了型号（如 ALSVID L1 / A1）时，副标题不再重复一次「车型 L1」。
const modelRedundant = p => {
  const model = String(p.model || '').trim();
  if (!model) return true;
  const esc = model.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^0-9A-Za-z])${esc}([^0-9A-Za-z]|$)`, 'i').test(String(p.name || ''));
};
const complianceOf = p => String(p.specs?.compliance_standard || p.specs?.certification || '').trim();

/* 产品封面：优先历史 product_media 上传图；为空时回落到统一素材库关联的主图（文件实时取自 R2）。 */
const coverSrc = p => {
  const img = (p.images || [])[0];
  return img ? `/api/products/${encodeURIComponent(p.id)}/media/${encodeURIComponent(img.id)}` : (p.coverImage?.url || '');
};

/* 卡片视图：单张产品卡（设计稿 1:1：左图｜中信息｜右常驻 SKU 表）。
   模块级组件，所有动态依赖走 props，保证 React 引用稳定、动画只播一次。 */
function VehicleCard({ p, typeName, user, biz, removing, patching, sort, onToggleSort, onEdit, onOpenBom, onToggleStatus, onRemove, onToggleSku, onSaveEan }) {
  const imageSrc = coverSrc(p);
  const bomVersion = p.bomVersion || p.bom?.version || '';
  const folded = String(p.specs?.folded_size || '').trim();
  const geo = geometryOf(p);
  const specs = [
    { icon: SpecIcon.frame, label: '轮径 / 车架', main: architectureOf(p), sub: String(p.specs?.folding_structure || '').trim() },
    { icon: SpecIcon.power, label: '动力系统', main: powerOf(p), sub: cutoffOf(p) ? `≤${cutoffOf(p)} km/h${throttleOf(p) ? ` · ${throttleOf(p)}` : ''}` : '' },
    { icon: SpecIcon.fold, label: '折叠尺寸', main: folded || geo.main, sub: '' },
    { icon: SpecIcon.weight, label: '整备质量', main: geo.weights, sub: geo.extra },
  ];
  const skus = [...(p.skus || [])].sort((a, b) => String(a.sku || '').localeCompare(String(b.sku || '')) * sort.dir);
  return (
    <article className={'pc-card' + (removing === p.id ? ' is-removed' : '')}>
      <div className="pc-main">
        <div className="pc-media">{imageSrc
          ? <img src={imageSrc} alt={p.name} loading="lazy" />
          : <span className="pc-media__ph">
              <em>{(p.model || p.name || '·').slice(0, 3).toUpperCase()}</em>
              <small>暂无图片</small>
            </span>}</div>
        <div className="pc-info">
          <div className="pc-title-row">
            <button type="button" className="pc-title" onClick={() => onEdit(p.id)}>{p.name}</button>
          </div>
          <div className="pc-sub">{typeName}{!modelRedundant(p) ? ` · 车型 ${p.model}` : ''}</div>
          <div className="pc-tags">
            {p.platform && <span className="pc-fc">{p.platform} 平台</span>}
            {complianceOf(p) && <span className="pc-cert">{complianceOf(p)}</span>}
          </div>
          {(() => { const b = bizOf(p, biz); return b ? <div className="pc-biz">
            <span>采购成本 <b className="mono">{bizMoney(b.cost)}</b></span>
            <span>销售价 <b className="mono">{bizMoney(b.price)}</b></span>
            <span>单台毛利 <b className="mono">{bizMoney(b.margin)}</b></span>
            <span>在库 <b className="mono">{b.qty}</b> 台</span>
            <span>累计售出 <b className="mono">{b.soldU}</b> 台 / {b.orders} 单</span>
          </div> : null; })()}
          <ul className="pc-specs">
            {specs.map((row, i) => <li key={i}>{row.icon}<span className="pc-spec-label">{row.label}</span><span className="pc-spec-value"><b>{row.main || '—'}</b>{row.sub ? <span className="pc-spec-sub"> · {row.sub}</span> : null}</span></li>)}
          </ul>
        </div>
        <div className="pc-sku-side">
          <div className="pc-sku-head">
            <span>物理 SKU（{(p.skus || []).length} 项）</span>
            <span className="spacer" />
            <div className="pc-card-toolbar">
              {p.status === '启用' && <span className="pc-badge-on"><i />已启用</span>}
              {p.status === '停用' && <span className="pc-badge-off">已停用</span>}
              {p.status !== '启用' && p.status !== '停用' && <span className="pc-badge-plan">{p.status}</span>}
              {user.role === 'admin' && <>
                <button type="button" className="pc-act" disabled={patching === 'status:' + p.id} onClick={() => onToggleStatus(p)}>{p.status === '停用' ? '启用车型' : '停用车型'}</button>
                <button type="button" className="pc-act is-danger" disabled={removing === p.id} onClick={() => onRemove(p)}>{removing === p.id ? '删除中…' : '删除车型'}</button>
              </>}
            </div>
            {user.role === 'admin' && <button type="button" className="pc-btn-addsku" onClick={() => onEdit(p.id)}>＋ 新增 SKU</button>}
          </div>
          {(p.skus || []).length ? <table className="pc-sku-table">
            <thead><tr>
              <th className="sortable" onClick={() => onToggleSort('sku')}>SKU（四段式）{sort.key === 'sku' ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}</th>
              <th>配置版本</th>
              <th>颜色</th>
              <th>法规/市场</th>
              <th>EAN-13</th>
              <th>BOM</th>
              <th>状态</th>
              <th className="col-actions">操作</th>
            </tr></thead>
            <tbody>{skus.map(s => <tr key={s.sku} className={s.disabled ? 'is-disabled' : ''}>
              <td><span className="pc-badge-sku">{s.sku}</span></td>
              <td>{s.spec && TRIM_SHORT[s.spec] ? TRIM_SHORT[s.spec] : (specDisplay(s) || s.spec || s.kitCode || '—')}</td>
              <td><span className="color-cell" title={s.color}><i className="color-dot" style={{ background: COLOR_DOTS[s.color] || '#e5e9ee' }} />{s.colorName || s.color || '—'}{s.colorName && s.color ? ` (${s.color})` : ''}</span></td>
              <td>{marketOf(s) || <span className="hint" />}</td>
              <td className="ean-cell">{user.role === 'admin'
                ? <InlineField value={s.ean13 || ''} className="cell-input mono" placeholder="—" onCommit={v => onSaveEan(p, s, v)} />
                : (s.ean13 ? <span className="mono-strong">{s.ean13}</span> : <span className="hint" />)}</td>
              <td>{bomVersion
                ? <button type="button" className="bom-link mono-strong" onClick={() => onOpenBom?.(p.id)}>✓ {bomVersion}</button>
                : <span className="pc-badge-plan">待关联</span>}</td>
              <td>{s.disabled ? <span className="pc-badge-off">停用</span> : <span className="pc-badge-on"><i />启用</span>}</td>
              <td className="col-actions">{user.role === 'admin' && <span className="pc-row-actions">
                <button type="button" className="pc-icon-btn" title="编辑物料" aria-label="编辑物料" onClick={() => onEdit(p.id)}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><path d="M11.3 2.3a1.6 1.6 0 0 1 2.3 2.3L5.4 12.8 2 13.8l1-3.4z" /></svg>
                </button>
                <button type="button" className="pc-link" disabled={patching === 'sku:' + s.sku} onClick={() => onToggleSku(p, s)}>{s.disabled ? '启用' : '停用'}</button>
              </span>}</td>
            </tr>)}</tbody>
          </table> : <span className="hint" />}
        </div>
      </div>
    </article>
  );
}

export function ListPage({ kind, meta, onEdit, onCreate, onOpenBom, user, active = true }) {
  const filterKey=`alsvid-v2-product-filter:${user.username||user.role}:${kind}`;
  const [list, setList] = useState([]);
  const [kw, setKw] = useState(()=>{try{const saved=localStorage.getItem(filterKey);if(saved!==null)return saved}catch{}try{return sessionStorage.getItem(filterKey)||''}catch{return ''}});
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [viewMode, setViewMode] = useState(() => { try { return sessionStorage.getItem('alsvid-v2-vehicle-view') || 'card'; } catch { return 'card'; } });
  const [filterPlatform, setFilterPlatform] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  useEffect(() => { try { sessionStorage.setItem('alsvid-v2-vehicle-view', viewMode); } catch {} }, [viewMode]);
  const toggleDetail = id => setCollapsed(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const [error,setError]=useState('');
  const [sort,setSort]=useState({key:'sku',dir:1});
  const toggleSort=key=>setSort(prev=>({key,dir:prev.key===key?-prev.dir:1}));
  const sortedSkus=p=>[...(p.skus||[])].sort((a,b)=>String(a.sku||'').localeCompare(String(b.sku||''))*sort.dir);
  const sortMark=key=>sort.key===key?(sort.dir>0?' ↑':' ↓'):'';
  const [removing,setRemoving]=useState('');
  const [patching,setPatching]=useState('');
  const [biz,setBiz]=useState(null);
  useEffect(() => {
    if (!active || kind !== 'vehicle') { setBiz(null); return; }
    let alive = true;
    (async () => {
      try {
        const [val, orders] = await Promise.all([api.stockValuation(), api.salesOrders()]);
        if (!alive) return;
        const stock = {}, sold = {}, price = {}, cnt = {};
        (val?.bySku || []).forEach(r => {
          stock[r.sku] = { cost: r.unitCost == null ? null : Number(r.unitCost) * (FX_CNY[r.currency] || 1), qty: Number(r.quantity || 0) };
        });
        (Array.isArray(orders) ? orders : orders?.orders || []).forEach(o => {
          const sku = o.sku_code; if (!sku) return;
          cnt[sku] = (cnt[sku] || 0) + 1;
          if (['IN_TRANSIT', 'DELIVERED', 'COMPLETED'].includes(o.status) && o.channel !== 'SAMPLE') {
            sold[sku] = (sold[sku] || 0) + Number(o.quantity || 0);
            const n = Number(o.quantity || 0);
            if (n > 0 && price[sku] == null) {
              const unit = toCnyPrice(o.sale_amount, o.currency, n);
              if (unit > 0) price[sku] = unit;
            }
          }
        });
        setBiz({ stock, sold, price, cnt });
      } catch { if (alive) setBiz(null); }
    })();
    return () => { alive = false; };
  }, [active, kind]);
  const toggleSku=async(p,s)=>{
    if(patching)return;
    const next=!s.disabled;
    setPatching('sku:'+s.sku);
    try{await api.setSkuDisabled(p.id,s.sku,next);setError('');await refresh()}catch(e){setError(`操作失败：${e.message}`)}finally{setPatching('')}
  };
  const toggleStatus=async p=>{
    if(patching)return;
    const next=p.status==='停用'?'启用':'停用';
    setPatching('status:'+p.id);
    try{await api.setProductStatus(p.id,next);setError('');await refresh()}catch(e){setError(`操作失败：${e.message}`)}finally{setPatching('')}
  };
  const saveEan=async(p,s,value)=>{
    const raw=String(value||'').trim();
    if(raw&&!isValidEan13(raw)){setError(`EAN-13 条码无效：${raw}（需 13 位数字且校验位正确）`);return}
    if(raw===(s.ean13||''))return;
    setPatching('ean:'+s.sku);
    try{await api.updateSkuDetail(p.id,s.sku,{ean13:raw});setError('');await refresh()}catch(e){setError(`保存失败：${e.message}`)}finally{setPatching('')}
  };
  const removeProduct=async p=>{
    if(removing)return;
    if(p.status!=='停用'){setError('请先下架商品，再删除。');return}
    if(!window.confirm(`永久删除已下架商品「${p.name}」？有关联业务单据或库存记录时系统会阻止删除并列出关联记录，此操作不可恢复。`))return;
    setRemoving(p.id);
    try{await api.deleteProduct(p.id);setError('');await refresh()}catch(e){
      if(e.code==='ENTITY_REFERENCED'){
        const details=(e.references||[]).map(ref=>`• ${ref.type}：${ref.documentNo}${ref.detail?`（${ref.detail}）`:''}`).join('\n');
        setError(details?`无法删除已下架商品「${p.name}」。关联记录：\n${details}`:e.message);
      }else setError(`删除失败：${e.message}`)
    }finally{setRemoving('')}
  };
  const [loading,setLoading]=useState(false);
  const loadVersion=useRef(0);
  const isVehicle = kind === 'vehicle';

  const platformName = code => (meta.platforms || []).find(item => item.code === code)?.name || '';

  const refresh = async () => { const version=++loadVersion.current;setLoading(true);try{const rows=await api.products(kind);if(version===loadVersion.current){setList(rows);setError('')}}catch(e){if(version===loadVersion.current)setError(e.message)}finally{if(version===loadVersion.current)setLoading(false)} };
  useEffect(() => { if(active)refresh();else {loadVersion.current++;setLoading(false)} }, [kind,active]);
  useEffect(()=>{try{localStorage.setItem(filterKey,kw)}catch{}try{sessionStorage.setItem(filterKey,kw)}catch{}},[filterKey,kw]);

  const filtered = useMemo(() => {
    const q = kw.trim().toLowerCase();
    return list.filter(p => {
      if (filterPlatform && p.platform !== filterPlatform) return false;
      if (filterStatus === 'on' && p.status !== '启用') return false;
      if (filterStatus === 'off' && p.status !== '停用') return false;
      if (!q) return true;
      return [p.name, p.model, p.productType, p.platform, p.ownership,
        ...(p.skus || []).flatMap(s => [s.sku, s.ean13])].filter(Boolean).some(v => String(v).toLowerCase().includes(q));
    });
  }, [list, kw, filterPlatform, filterStatus]);

  const emptyText = loading ? '正在加载产品资料…'
    : error ? '产品资料暂时不可用，请处理上方错误后重试。'
    : kw.trim() ? `没有找到符合“${kw.trim()}”的结果。`
    : user.role === 'admin' ? `暂无${isVehicle ? '整车产品' : '零配件'}，点击右上角「＋ 新建${isVehicle ? '车型' : '零配件'}」开始录入。`
    : `暂无${isVehicle ? '整车产品' : '零配件'}，请联系管理员录入。`;
  const canCreateEmpty = !loading && !error && !kw.trim() && user.role === 'admin';

  const tplName = (code) => (meta.templates.find(t => t.code === code) || {}).name || code;
  const statusTag = (s) => {
    if (s === '启用') return <span className="status-badge on"><i />启用</span>;
    if (s === '停用') return <span className="status-badge off"><i />已停用</span>;
    return <span className="tag plan">{s}</span>;
  };


  return (
    <div>
      <div className="page-title">
        <div>
          <h2 />
          {!isVehicle && <p className="hint" />}
        </div>
      </div>

      <div className="pc-toolbar">
        <input type="text" placeholder={isVehicle ? '搜索车型名称 / SKU / EAN…' : '搜索名称 / 品类 / SKU / 适配车型…'}
          value={kw} onChange={e => setKw(e.target.value)} />
        {isVehicle && <>
          <label className="pc-filter"><span>技术平台</span>
            <select value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}>
              <option value="">全部</option>
              {(meta.platforms || []).map(pl => <option key={pl.code} value={pl.code}>{pl.name}</option>)}
            </select></label>
          <label className="pc-filter"><span>状态</span>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">全部</option>
              <option value="on">启用</option>
              <option value="off">停用</option>
            </select></label>
        </>}
        <span className="hint" />
        <div className="spacer" />
        {isVehicle && <span className="pc-view-toggle" role="group" aria-label="视图切换">
          <button type="button" aria-label="卡片视图" className={viewMode === 'card' ? 'is-active' : ''} onClick={() => setViewMode('card')}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.2" /><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.2" /><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.2" /><rect x="9" y="9" width="5.5" height="5.5" rx="1.2" /></svg>
          </button>
          <button type="button" aria-label="列表视图" className={viewMode === 'table' ? 'is-active' : ''} onClick={() => setViewMode('table')}>
            <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><rect x="1.5" y="2.5" width="13" height="2.6" rx="1" /><rect x="1.5" y="6.7" width="13" height="2.6" rx="1" /><rect x="1.5" y="10.9" width="13" height="2.6" rx="1" /></svg>
          </button>
        </span>}
        {user.role === 'admin' && <button className="pc-btn-create" onClick={() => onCreate(kind)}>＋ 新建{isVehicle ? '车型' : '零配件'}</button>}
      </div>
      {error&&<p className="error-text" role="alert">{error} <button type="button" className="btn small" disabled={loading} onClick={refresh}>重新加载</button></p>}

      {isVehicle && viewMode === 'card' ? (
        <div className="pc-list">
          {filtered.map(p => <VehicleCard key={p.id} p={p} typeName={tplName(p.productType)} user={user} biz={biz}
            removing={removing} patching={patching} sort={sort} onToggleSort={toggleSort}
            onEdit={onEdit} onOpenBom={onOpenBom} onToggleStatus={toggleStatus} onRemove={removeProduct}
            onToggleSku={toggleSku} onSaveEan={saveEan} />)}
          {!filtered.length && <div className="pc-empty">
            <svg className="pc-empty__icon" width="44" height="44" viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="6" y="11" width="32" height="25" rx="3" />
              <path d="M6 19h32M13 27h7" />
              <path d="M17 11V8.5A2.5 2.5 0 0 1 19.5 6h5A2.5 2.5 0 0 1 27 8.5V11" />
            </svg>
            <p className="pc-empty__text">{emptyText}</p>
            {canCreateEmpty && <button className="pc-btn-create" type="button" onClick={() => onCreate(kind)}>＋ 新建{isVehicle ? '车型' : '零配件'}</button>}
          </div>}
        </div>
      ) : (
      <div className="table-scroll">
      <table className="master-table">
        <thead><tr>
          <th>{isVehicle ? '车型主档' : '配件名称'}</th>
          {isVehicle && <th>技术平台</th>}
          <th>{isVehicle ? '产品类型' : '品类'}</th>
          {!isVehicle && <th>归属</th>}
          {!isVehicle && <th>适配车型</th>}
          {!isVehicle && <th>SKU</th>}
          {isVehicle && <th>核心工程架构</th>}
          {isVehicle && <th>动力系统基准</th>}
          {isVehicle && <th>物理几何与重量</th>}
          {isVehicle && <th className="num">SKU 数</th>}
          {isVehicle && <th>合规标准</th>}
          <th>状态</th>
          <th className="col-actions">操作</th>
        </tr></thead>
        <tbody>
          {filtered.map(p => {
            const imageSrc = coverSrc(p);
            const tpl = tplName(p.productType);
            const sub = p.model ? `车型 ${p.model}` : '';
            const architecture = architectureOf(p);
            const bomVersion = p.bomVersion || p.bom?.version || '';
            return (
            <React.Fragment key={p.id}>
            <tr className="master-row">
              <td>
                <div className="cell-product">
                  {isVehicle && <button type="button" className={'detail-toggle' + (collapsed.has(p.id) ? '' : ' is-open')} aria-expanded={!collapsed.has(p.id)} aria-label={collapsed.has(p.id) ? '展开 SKU 明细' : '收起 SKU 明细'} onClick={() => toggleDetail(p.id)}>▸</button>}
                  <span className="product-media">{imageSrc
                    ? <img src={imageSrc} alt="" loading="lazy" />
                    : <span className="product-media__ph">{(p.model || p.name || '·').slice(0, 2).toUpperCase()}</span>}</span>
                  <span className="product-meta">
                    <button type="button" className="product-title" onClick={() => onEdit(p.id)}>{p.name}</button>
                    {sub && <span className="product-sub">{sub}</span>}
                  </span>
                </div>
              </td>
              {isVehicle && <td>{p.platform
                ? <span className="pill"><b className="mono-strong">{p.platform}</b><span className="pill__code">{platformName(p.platform)}</span></span>
                : <span className="pending">—</span>}</td>}
              <td><span className="pill">{tpl}<span className="pill__code">{p.productType}</span></span></td>
              {!isVehicle && <td>{p.ownership}</td>}
              {!isVehicle && <td>{(p.fitments || []).map(f => f.vehicleModel).join('、') || <span className="hint" />}</td>}
              {!isVehicle && <td><SkuCell skus={p.skus} /></td>}
              {isVehicle && <td className="cell-stack">
                <span className="stack-main">{architecture || <span className="pending">—</span>}</span>
                <span className="stack-sub">{String(p.specs?.folding_structure || '').trim() ? `折叠 · ${p.specs.folding_structure}` : '—'}</span>
              </td>}
              {isVehicle && <td className="cell-stack">
                <span className="stack-main">{powerOf(p) || <span className="pending">—</span>}</span>
                <span className="stack-sub">{cutoffOf(p) ? `${cutoffOf(p)} km/h 助力截止${throttleOf(p) ? ` · ${throttleOf(p)}` : ''}` : '—'}</span>
              </td>}
              {isVehicle && <td className="cell-stack">
                <span className="stack-main">{geometryOf(p).main || <span className="pending">—</span>}</span>
                <span className="stack-sub">{geometryOf(p).sub || '—'}</span>
              </td>}
              {isVehicle && <td className="num"><span className="count-strong">{p.skuCount}</span>{p.disabledSkuCount ? <span className="pending"> · {p.disabledSkuCount} 停用</span> : null}</td>}
              {isVehicle && <td>{complianceOf(p) ? <span className="pill">{complianceOf(p)}</span> : <span className="pending">—</span>}</td>}
              <td>{statusTag(p.status)}</td>
              <td className="col-actions">
                <button className="btn small" onClick={() => onEdit(p.id)}>{user.role === 'admin' ? '管理详情' : '查看'}</button>
                {user.role === 'admin' && <ActionMenu items={[
                  { label: p.status === '停用' ? '启用车型' : '停用车型', disabled: patching === 'status:' + p.id, onClick: () => toggleStatus(p) },
                  { label: removing === p.id ? '删除中…' : '删除车型', danger: true, disabled: removing === p.id || p.status !== '停用', onClick: () => removeProduct(p) },
                ]} />}
              </td>
            </tr>
            {isVehicle && <tr className={'detail-row' + (collapsed.has(p.id) ? ' is-collapsed' : '')}>
              <td colSpan={10}>
                <div className={'sku-drawer' + (collapsed.has(p.id) ? '' : ' is-open')} aria-hidden={collapsed.has(p.id)}>
                <div className="sku-drawer__inner">
                <div className="sku-slot">
                  <div className="sku-slot__head">
                    <span>物理物料明细 (Physical SKUs)<span className="sku-slot__note">4 段定长 · 15 位</span></span>
                    <span className="hint" />
                  </div>
                  {(p.skus || []).length
                    ? <table className="sku-table">
                        <thead><tr>
                          <th className="sortable" onClick={()=>toggleSort('sku')}>物理物料编码 (15位){sortMark('sku')}</th>
                          <th>机动规格</th>
                          <th>规格摘要</th>
                          <th>外观涂装</th>
                          <th>国际条码 (EAN-13)</th>
                          <th>关联 BOM</th>
                          <th className="col-actions">{user.role === 'admin' ? '操作' : ''}</th>
                        </tr></thead>
                        <tbody>{sortedSkus(p).map(s => <tr key={s.sku} className={s.disabled ? 'is-disabled' : ''}>
                          <td><span className="sku-pill">{s.sku}</span></td>
                          <td>{specDisplay(s)
                            ? <span className="mono-strong" title={s.sku}>{specDisplay(s)}</span>
                            : <span className="cell-stack"><span className="mono-strong">{s.spec || s.kitCode || '—'}</span>{s.kitName ? <span className="stack-sub">{s.kitName}</span> : null}</span>}</td>
                          <td>{s.kitSummary || <span className="pending">—</span>}</td>
                          <td><span className="color-cell" title={s.color}><i className="color-dot" style={{ background: COLOR_DOTS[s.color] || '#e5e9ee' }} />{s.colorName || s.color}{s.colorRal ? <span className="color-ral">{s.colorRal}</span> : null}</span></td>
                          <td className="ean-cell">{user.role === 'admin'
                            ? <InlineField value={s.ean13 || ''} className="cell-input mono" placeholder="—" onCommit={v => saveEan(p, s, v)} />
                            : (s.ean13 ? <span className="mono-strong">{s.ean13}</span> : <span className="pending">—</span>)}</td>
                          <td>{bomVersion
                            ? <button type="button" className="bom-link mono-strong" onClick={() => onOpenBom?.(p.id)}>✓ {bomVersion}</button>
                            : <span className="pending">—</span>}</td>
                          <td className="col-actions">{user.role === 'admin' && <>
                            <button className="link-action" onClick={() => onEdit(p.id)}>编辑物料</button>
                            <button className="link-action" disabled={patching === 'sku:' + s.sku} onClick={() => toggleSku(p, s)}>{s.disabled ? '启用' : '停用'}</button>
                          </>}</td>
                        </tr>)}</tbody>
                      </table>
                    : <span className="hint" />}
                </div>
                </div>
                </div>
              </td>
            </tr>}
            </React.Fragment>
            );
          })}
          {!filtered.length && <tr><td colSpan={isVehicle ? 10 : 7} className="pc-empty-cell">{emptyText}</td></tr>}
        </tbody>
      </table>
      </div>
      )}
    </div>
  );
}

/* 新建产品：简洁抽屉式表单（规范 15.3）。按产品类型自动匹配模板字段在编辑器内加载。 */
export function CreateDrawer({ kind, meta, onClose, onCreated }) {
  const isVehicle = kind === 'vehicle';
  const tpls = meta.templates.filter(t => t.kind === kind);
  const [form, setForm] = useState({
    name: '', model: '', productType: tpls[0]?.code || '', status: '启用',
    ownership: isVehicle ? '' : 'UN', uses: isVehicle ? [] : ['生产使用'],
  });
  const [err, setErr] = useState('');

  const toggleUse = (u) => setForm(f => ({
    ...f, uses: f.uses.includes(u) ? f.uses.filter(x => x !== u) : [...f, u],
  }));

  const submit = async () => {
    setErr('');
    if (!form.name.trim()) { setErr('名称必填'); return; }
    if (isVehicle && !form.model.trim()) { setErr('整车型号必填（同时作为 SKU 第一段编码）'); return; }
    if (isVehicle && !/^[A-Z0-9]{3}$/.test(form.model)) { setErr('整车型号必须为 3 位大写字母或数字（车系 2 位 + 版本 1 位）'); return; }
    try {
      const p = await api.createProduct({ ...form, kind });
      onCreated(p);
    } catch (e) { setErr(e.message); }
  };

  return (
    <div className="mask" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ width: 560 }}>
        <div className="modal-head"><h3>新建{isVehicle ? '整车产品' : '零配件'}</h3>
          <button className="btn small" onClick={onClose}>关闭</button></div>
        <div className="modal-body">
          <div className="form-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="field fg-span"><label>名称 <span className="req">*</span></label>
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoFocus /></div>
            {isVehicle && <div className="field"><label>型号（SKU 第一段 3 位，如 A1S / A1P）<span className="req">*</span></label>
              <input maxLength={3} value={form.model} onChange={e => setForm({ ...form, model: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) })} /></div>}
            {!isVehicle && <div className="field"><label>归属</label>
              <select value={form.ownership} onChange={e => setForm({ ...form, ownership: e.target.value })}>
                {meta.ownership.map(o => <option key={o.code} value={o.code}>{o.code} - {o.label}</option>)}
              </select></div>}
            <div className="field"><label>{isVehicle ? '产品类型' : '品类'}（决定加载哪套模板字段）</label>
              <select value={form.productType} onChange={e => setForm({ ...form, productType: e.target.value })}>
                {tpls.map(t => <option key={t.code} value={t.code}>{t.name}（{t.code}）</option>)}
              </select></div>
            <div className="field"><label>状态</label>
              <select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option>启用</option><option>停用</option><option>规划</option>
              </select></div>
            {!isVehicle && <div className="field fg-span"><label>用途（可多选，非互斥）</label>
              <div className="checkbox-row">
                {['生产使用', '售后维修', '单独销售'].map(u => (
                  <label key={u}><input type="checkbox" checked={form.uses.includes(u)} onChange={() => toggleUse(u)} />{u}</label>
                ))}
              </div></div>}
          </div>
          {err && <div className="error-text mt8">{err}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={submit}>创建并进入编辑器</button>
        </div>
      </div>
    </div>
  );
}
