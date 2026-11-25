import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import ProductPriceDialog from './ProductPriceDialog.jsx';
import { productThumbUrl } from './ShopOverview.jsx';
import { seoProductIdOf } from '../product-identity.js';

// 商城运营 · 价格设置：预售价格测算、优惠券、新人有礼等与价格相关的营销配置集中在这里。
// 币种口径：录入与展示统一用 EUR（欧洲市场），利润核算按汇率折算成 RMB。
// 当前为本地配置（浏览器暂存），后续接入后端多账号共享时只需替换读写实现。
const STORAGE_KEY = 'alsvid.shop.pricing.config';
const LEGACY_KEY = 'alsvid.shop.pricing';
const DEFAULT_CONFIG = {
  fx: '7.80',
  calculator: { retail: '', wholesale: '', cost: '', discount: '90' },
  coupons: [],
  newcomer: { enabled: true, discountAmount: '', couponId: '', validDays: '30' },
};

const toHalfWidth = value => String(value ?? '')
  .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
const cleanAmount = value => toHalfWidth(value)
  .replace(/[^\d.]/g, '')
  .replace(/^(\d*\.?\d{0,2}).*$/, '$1');
const cleanRate = value => toHalfWidth(value)
  .replace(/[^\d.]/g, '')
  .replace(/^(\d*\.?\d{0,4}).*$/, '$1');
const amountOf = value => {
  const raw = String(value ?? '').trim();
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
};
// 欧洲展现习惯：千分位用点、小数用逗号
const eur = n => `€${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const rmb = n => `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const COUPON_TYPES = { amount: '满减券', percent: '折扣券' };

function loadConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_CONFIG, ...parsed,
        calculator: { ...DEFAULT_CONFIG.calculator, ...(parsed.calculator || {}) },
        newcomer: { ...DEFAULT_CONFIG.newcomer, ...(parsed.newcomer || {}) },
        coupons: Array.isArray(parsed.coupons) ? parsed.coupons : [],
      };
    }
    // 兼容早期只保存测算数字的版本
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    if (legacy) return { ...DEFAULT_CONFIG, calculator: { ...DEFAULT_CONFIG.calculator, ...legacy } };
  } catch { /* 配置损坏时回到默认值 */ }
  return DEFAULT_CONFIG;
}

function couponContent(coupon) {
  if (coupon.type === 'percent') return `打 ${coupon.value || '—'} 折`;
  const value = amountOf(coupon.value);
  return `减 ${value == null ? '—' : eur(value)}`;
}
function couponScope(coupon) {
  const threshold = amountOf(coupon.threshold);
  return threshold ? `满 ${eur(threshold)} 可用` : '无门槛';
}
function couponValidity(coupon) {
  if (!coupon.start && !coupon.end) return '长期有效';
  return `${coupon.start || '不限'} ~ ${coupon.end || '不限'}`;
}

export default function ShopPricingPage() {
  const [tab, setTab] = useState('price');
  const [config, setConfig] = useState(loadConfig);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState('');
  const [priceTarget, setPriceTarget] = useState(null);
  const [couponDraft, setCouponDraft] = useState({ name: '', type: 'amount', value: '', threshold: '', start: '', end: '' });
  const [couponError, setCouponError] = useState('');

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(config)); } catch { /* 本地存储不可用时忽略 */ } }, [config]);
  useEffect(() => {
    let alive = true;
    api.products().then(rows => { if (alive) { setProducts(Array.isArray(rows) ? rows : []); setProductsLoading(false); } })
      .catch(error => { if (alive) { setProductsError(error.message || '商品读取失败'); setProductsLoading(false); } });
    return () => { alive = false; };
  }, []);

  const fx = amountOf(config.fx);
  const rate = fx != null && fx > 0 ? fx : null;
  const toRmb = value => rate == null || value == null ? null : Math.round(value * rate * 100) / 100;

  const calc = config.calculator;
  const retail = amountOf(calc.retail);
  const wholesale = amountOf(calc.wholesale);
  const cost = amountOf(calc.cost);
  const discountRaw = String(calc.discount ?? '').trim();
  const discount = discountRaw === '' || !Number.isFinite(Number(discountRaw)) ? 90 : Number(discountRaw);
  // 预售价格（EUR）= 零售价格（EUR）× 预售折扣率，保留两位小数。
  const presale = retail == null ? null : Math.round(retail * discount) / 100;
  const presaleProfitEur = presale != null && cost != null ? Math.round((presale - cost) * 100) / 100 : null;
  const presaleMargin = presaleProfitEur != null && presale > 0 ? presaleProfitEur / presale * 100 : null;
  const wholesaleMargin = wholesale != null && cost != null && wholesale > 0 ? (wholesale - cost) / wholesale * 100 : null;
  const gap = retail != null && wholesale != null ? Math.round((retail - wholesale) * 100) / 100 : null;

  const warnings = [];
  if (rate == null) warnings.push('请填写有效汇率（1 EUR 兑换多少 CNY），否则无法折算人民币利润');
  if (retail != null && wholesale != null && wholesale > retail) warnings.push('批发价高于零售价，请确认渠道价格');
  if (presaleProfitEur != null && presaleProfitEur < 0) warnings.push(`预售价格低于商品成本价，每台亏损 ${eur(Math.abs(presaleProfitEur))}`);
  if (discountRaw !== '' && (!Number.isFinite(Number(discountRaw)) || Number(discountRaw) <= 0 || Number(discountRaw) > 100)) warnings.push('预售折扣率应在 0–100 之间');

  const resultRows = [
    ['预售价格', presale == null ? '—' : eur(presale)],
    ['预售价格（人民币参考）', toRmb(presale) == null ? '—' : rmb(toRmb(presale))],
    ['预售毛利额（人民币）', toRmb(presaleProfitEur) == null ? '—' : rmb(toRmb(presaleProfitEur))],
    ['预售毛利率', presaleMargin == null ? '—' : `${presaleMargin.toFixed(2)}%`],
    ['批发毛利率', wholesaleMargin == null ? '—' : `${wholesaleMargin.toFixed(2)}%`],
    ['零售与批发价差', gap == null ? '—' : eur(gap)],
  ];

  const setCalc = (key, value) => setConfig(c => ({ ...c, calculator: { ...c.calculator, [key]: cleanAmount(value) } }));
  const normalizeCalc = key => {
    const n = amountOf(config.calculator[key]);
    if (n != null) setConfig(c => ({ ...c, calculator: { ...c.calculator, [key]: n.toFixed(2) } }));
  };
  const calcField = (key, label, placeholder) => <div className="field" key={key}>
    <label>{label}</label>
    <input type="text" inputMode="decimal" value={calc[key]} placeholder={placeholder}
      onChange={e => setCalc(key, e.target.value)} onBlur={() => normalizeCalc(key)}/>
  </div>;

  const addCoupon = () => {
    const name = String(couponDraft.name || '').trim();
    const value = amountOf(couponDraft.value);
    if (!name) { setCouponError('请填写优惠券名称'); return; }
    if (value == null || value <= 0) { setCouponError('请填写有效的优惠额度'); return; }
    if (couponDraft.type === 'percent' && value >= 10) { setCouponError('折扣券请填写 0–9.9 之间的折扣（如 8.5 表示 8.5 折）'); return; }
    if (couponDraft.start && couponDraft.end && couponDraft.start > couponDraft.end) { setCouponError('开始日期不能晚于结束日期'); return; }
    setCouponError('');
    setConfig(c => ({
      ...c,
      coupons: [...c.coupons, {
        id: Date.now().toString(36),
        name, type: couponDraft.type,
        value: String(value),
        threshold: String(amountOf(couponDraft.threshold) ?? ''),
        start: couponDraft.start, end: couponDraft.end, enabled: true,
      }],
    }));
    setCouponDraft({ name: '', type: couponDraft.type, value: '', threshold: '', start: '', end: '' });
  };
  const toggleCoupon = id => setConfig(c => ({ ...c, coupons: c.coupons.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x) }));
  const removeCoupon = id => {
    if (!window.confirm('删除该优惠券？删除后不可恢复。')) return;
    setConfig(c => ({
      ...c,
      coupons: c.coupons.filter(x => x.id !== id),
      newcomer: c.newcomer.couponId === id ? { ...c.newcomer, couponId: '' } : c.newcomer,
    }));
  };

  const newcomer = config.newcomer;
  const setNewcomer = (key, value) => setConfig(c => ({ ...c, newcomer: { ...c.newcomer, [key]: value } }));
  const newcomerDiscount = amountOf(newcomer.discountAmount);

  return <>
    <section className="card">
      <div className="card-title with-tag">价格设置<span className="tag">EUR 报价 · RMB 核算</span></div>
      <p className="hint">价格录入与前台展示统一使用欧元（EUR），毛利与利润按汇率折算成人民币（RMB）核算。汇率由财务口径维护，仅用于测算，不改变商品档案。</p>
      <div className="tabs">
        {[['price', '价格与毛利'], ['coupons', '优惠券'], ['newcomer', '新人有礼']].map(([key, label]) =>
          <button type="button" key={key} className={'tab' + (tab === key ? ' active' : '')} onClick={() => setTab(key)}>{label}</button>)}
      </div>
    </section>

    {tab === 'price' && <>
      <section className="card shop-grid">
        <div className="shop-grid__head"><div><div className="card-title">商品价格</div><p className="hint">按商品查看官网价格；点击“设置价格”维护各 SKU 的 EUR / CNY 报价。</p></div><span className="tag">汇率 1 EUR = {rate == null ? '—' : rate} CNY</span></div>
        {productsError && <div className="notice warn" role="alert">{productsError}</div>}
        <div className="table-scroll"><table className="table shop-price-list"><thead><tr><th>商品</th><th>车型 / 类型</th><th>SKU 数</th><th>官网价格</th><th>人民币参考</th><th>状态</th><th>操作</th></tr></thead><tbody>
          {productsLoading ? <tr><td colSpan="7" className="shop-empty">正在加载价格清单…</td></tr> : products.length === 0 ? <tr><td colSpan="7" className="shop-empty">暂无产品，请先在产品模块建立产品。</td></tr> : products.map(product => {
            const skus = (product.skus || []).filter(sku => !sku.disabled);
            const values = skus.map(sku => Number(sku.price)).filter(value => Number.isFinite(value) && value > 0);
            const min = values.length ? Math.min(...values) : null;
            const max = values.length ? Math.max(...values) : null;
            const display = min == null ? '未设置' : `€${min.toLocaleString('de-DE', { minimumFractionDigits: 2 })}${max > min ? ` – €${max.toLocaleString('de-DE', { minimumFractionDigits: 2 })}` : ''}`;
            const ref = min == null || rate == null ? '—' : `¥${Math.round(min * rate).toLocaleString('zh-CN')}`;
            return <tr key={product.id}><td><div className="shop-price-product"><span className="shop-price-product__thumb">{productThumbUrl(product) ? <img src={productThumbUrl(product)} alt="" /> : '—'}</span><span>{product.name || product.officialModelName || '未命名商品'}<span className="hint" style={{ display: 'block' }}>SEO 商品 ID: {seoProductIdOf(product) || '未设置'}</span></span></div></td><td>{product.model || product.productType || '—'}</td><td>{skus.length}</td><td className={min == null ? 'muted' : 'mono'}>{display}</td><td className="mono">{ref}</td><td><span className={'tag' + (product.status === '启用' ? '' : ' muted')}>{product.status === '启用' ? '启用' : '停用'}</span></td><td><button type="button" className="btn small" onClick={() => setPriceTarget(product)}>设置价格</button></td></tr>;
          })}
        </tbody></table></div>
      </section>
      <details className="card shop-price-calculator"><summary>打开价格测算</summary>
        <div className="form-grid"><div className="field"><label>欧元汇率（1 EUR = ? CNY）</label><input type="text" inputMode="decimal" value={config.fx} placeholder="例如 7.80" onChange={e => setConfig(c => ({ ...c, fx: cleanRate(e.target.value) }))} onBlur={() => { const n = amountOf(config.fx); if (n != null && n > 0) setConfig(c => ({ ...c, fx: n.toFixed(2) })); }}/></div>{calcField('retail', '零售价格（EUR）', '例如 2499.00')}{calcField('wholesale', '批发价格（EUR）', '例如 1699.00')}{calcField('cost', '商品成本价（EUR）', '例如 1099.00')}{calcField('discount', '预售折扣率（%）', '默认 90')}</div>
        {warnings.map(text => <div className="notice warn" key={text}>⚠ {text}</div>)}
        <table className="table"><thead><tr><th>指标</th><th>数值</th></tr></thead><tbody>{resultRows.map(([label, value]) => <tr key={label}><td>{label}</td><td className="mono">{value}</td></tr>)}</tbody></table>
      </details>
      {priceTarget && <ProductPriceDialog product={priceTarget} onClose={() => setPriceTarget(null)} onChanged={() => api.products().then(rows => setProducts(Array.isArray(rows) ? rows : []))} />}
    </>}

    {tab === 'coupons' && <>
      <section className="card">
        <div className="card-title with-tag">优惠券<span className="tag">{config.coupons.length} 张 · 面额 EUR</span></div>
        <p className="hint">满减券按欧元金额直减；折扣券按折数计价（如 8.5 表示 8.5 折）。门槛留空表示无门槛。</p>
        <div className="form-grid">
          <div className="field"><label>优惠券名称</label><input value={couponDraft.name} placeholder="例如 预售早鸟券" onChange={e => setCouponDraft(d => ({ ...d, name: e.target.value }))}/></div>
          <div className="field"><label>券类型</label>
            <select value={couponDraft.type} onChange={e => setCouponDraft(d => ({ ...d, type: e.target.value }))}>
              <option value="amount">满减券</option>
              <option value="percent">折扣券</option>
            </select></div>
          <div className="field"><label>{couponDraft.type === 'percent' ? '折扣（折）' : '优惠金额（EUR）'}</label>
            <input type="text" inputMode="decimal" value={couponDraft.value} placeholder={couponDraft.type === 'percent' ? '例如 8.5' : '例如 100.00'}
              onChange={e => setCouponDraft(d => ({ ...d, value: cleanAmount(e.target.value) }))}/></div>
          <div className="field"><label>使用门槛（EUR，可空）</label>
            <input type="text" inputMode="decimal" value={couponDraft.threshold} placeholder="例如 1499.00"
              onChange={e => setCouponDraft(d => ({ ...d, threshold: cleanAmount(e.target.value) }))}/></div>
          <div className="field"><label>生效日期</label><input type="date" value={couponDraft.start} onChange={e => setCouponDraft(d => ({ ...d, start: e.target.value }))}/></div>
          <div className="field"><label>失效日期</label><input type="date" value={couponDraft.end} onChange={e => setCouponDraft(d => ({ ...d, end: e.target.value }))}/></div>
          <div className="field"><label>&nbsp;</label><button type="button" className="btn primary" onClick={addCoupon}>＋ 新增优惠券</button></div>
        </div>
        {couponError && <div className="notice warn" role="alert">⚠ {couponError}</div>}
        {config.coupons.length === 0
          ? <div className="notice">还没有优惠券，填写上方信息后点击「新增优惠券」。</div>
          : <table className="table">
              <thead><tr><th>名称</th><th>类型</th><th>优惠内容</th><th>人民币参考</th><th>使用门槛</th><th>有效期</th><th>状态</th><th>操作</th></tr></thead>
              <tbody>{config.coupons.map(coupon => {
                const value = amountOf(coupon.value);
                const equivalent = coupon.type === 'amount' && value != null && rate != null ? rmb(toRmb(value)) : '—';
                return <tr key={coupon.id}>
                  <td>{coupon.name}</td>
                  <td>{COUPON_TYPES[coupon.type] || '满减券'}</td>
                  <td>{couponContent(coupon)}</td>
                  <td className="mono">{equivalent}</td>
                  <td>{couponScope(coupon)}</td>
                  <td>{couponValidity(coupon)}</td>
                  <td><span className={'tag' + (coupon.enabled ? '' : ' muted')}>{coupon.enabled ? '启用' : '停用'}</span></td>
                  <td>
                    <button type="button" className="btn small" onClick={() => toggleCoupon(coupon.id)}>{coupon.enabled ? '停用' : '启用'}</button>
                    <button type="button" className="btn small" onClick={() => removeCoupon(coupon.id)}>删除</button>
                  </td>
                </tr>;
              })}</tbody>
            </table>}
      </section>
    </>}

    {tab === 'newcomer' && <>
      <section className="card">
        <div className="card-title with-tag">新人有礼<span className="tag">{newcomer.enabled ? '已开启' : '已关闭'}</span></div>
        <p className="hint">新用户注册后自动获得首单立减与赠券；金额按欧元录入，赠送时同步折算人民币展示。</p>
        <div className="form-grid">
          <div className="field"><label>新人礼开关</label>
            <select value={newcomer.enabled ? 'on' : 'off'} onChange={e => setNewcomer('enabled', e.target.value === 'on')}>
              <option value="on">开启</option>
              <option value="off">关闭</option>
            </select></div>
          <div className="field"><label>首单立减（EUR，可空）</label>
            <input type="text" inputMode="decimal" value={newcomer.discountAmount} placeholder="例如 50.00"
              onChange={e => setNewcomer('discountAmount', cleanAmount(e.target.value))}
              onBlur={() => { const n = amountOf(newcomer.discountAmount); if (n != null) setNewcomer('discountAmount', n.toFixed(2)); }}/></div>
          <div className="field"><label>新人赠券</label>
            <select value={newcomer.couponId} onChange={e => setNewcomer('couponId', e.target.value)}>
              <option value="">— 不赠送 —</option>
              {config.coupons.filter(c => c.enabled).map(c => <option key={c.id} value={c.id}>{c.name}（{couponContent(c)}）</option>)}
            </select></div>
          <div className="field"><label>赠券有效天数</label>
            <input type="text" inputMode="numeric" value={newcomer.validDays} placeholder="例如 30"
              onChange={e => setNewcomer('validDays', String(e.target.value).replace(/[^\d]/g, '').slice(0, 3))}/></div>
        </div>
        {newcomer.enabled && <div className="notice ok">
          新用户注册即得：{newcomerDiscount ? `首单立减 ${eur(newcomerDiscount)}${rate != null ? `（折合 ${rmb(toRmb(newcomerDiscount))}）` : ''}` : '首单立减未设置'}
          {newcomer.couponId ? ` + 赠券「${(config.coupons.find(c => c.id === newcomer.couponId) || {}).name || '已删除'}」` : ''}
          ，赠券有效期 {newcomer.validDays || '—'} 天。
        </div>}
      </section>
    </>}
  </>;
}
