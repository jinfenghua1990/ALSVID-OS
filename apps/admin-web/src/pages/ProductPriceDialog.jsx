import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

// 商品价格维护（storefront_offers）：按 SKU + 币种逐条设置官网公开价。
// 后端约束：一个 SKU+币种唯一；已存在的报价不能改 SKU 或币种，只能改价与公开状态；
// 产品必须为「启用」才能新增报价。数量 1–100、金额最多两位小数、上限 100000000。
const CURRENCIES = ['EUR', 'CNY'];
const PRICE_RE = /^\d+(?:\.\d{1,2})?$/;

function rowsFrom(product, offers) {
  const skus = (product.skus || []).slice().sort((a, b) => Number(!!a.disabled) - Number(!!b.disabled) || String(a.sku).localeCompare(String(b.sku)));
  const codes = new Set(skus.map(sku => sku.sku));
  const mine = (offers || []).filter(offer => codes.has(offer.sku));
  const rows = [];
  for (const sku of skus) {
    const existing = mine.filter(offer => offer.sku === sku.sku);
    if (existing.length) {
      for (const offer of existing) {
        rows.push({
          key: `${sku.sku}|${offer.currency}`,
          sku: sku.sku,
          spec: sku.spec || '',
          color: sku.colorName || sku.color || '',
          disabled: !!sku.disabled,
          currency: offer.currency,
          unitPrice: offer.unitPrice,
          published: !!offer.published,
          id: offer.id,
          revision: offer.revision,
          baseline: `${offer.unitPrice}|${offer.published}`,
        });
      }
    } else {
      rows.push({
        key: `${sku.sku}|EUR`,
        sku: sku.sku,
        spec: sku.spec || '',
        color: sku.colorName || sku.color || '',
        disabled: !!sku.disabled,
        currency: 'EUR',
        unitPrice: '',
        published: true,
        id: null,
        revision: null,
        baseline: '|true',
      });
    }
  }
  return rows;
}

export default function ProductPriceDialog({ product, onClose, onChanged }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.storefrontOffers()
      .then(offers => { if (active) setRows(rowsFrom(product, offers)); })
      .catch(reason => { if (active) setError(reason.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [product.id]);

  const patch = (key, next) => setRows(current => current.map(row => (row.key === key ? { ...row, ...next } : row)));
  const changed = rows.filter(row => `${row.unitPrice}|${row.published}` !== row.baseline);

  const save = async () => {
    if (busy) return;
    const pending = changed;
    if (!pending.length) { setMessage('没有需要保存的改动。'); return; }
    for (const row of pending) {
      if (row.unitPrice === '' && !row.id) continue;
      if (!PRICE_RE.test(row.unitPrice) || Number(row.unitPrice) > 100000000) {
        setError(`${row.sku} 的价格格式不正确，最多两位小数且不超过 100000000。`);
        return;
      }
    }
    setBusy(true); setError(''); setMessage('');
    const done = [];
    try {
      for (const row of pending) {
        if (row.unitPrice === '' && !row.id) continue;
        const body = { sku: row.sku, currency: row.currency, unitPrice: row.unitPrice, published: row.published };
        if (row.id) {
          const saved = await api.updateStorefrontOffer(row.id, { ...body, revision: row.revision });
          done.push({ key: row.key, id: saved.id ?? row.id, revision: saved.revision, unitPrice: saved.unitPrice ?? row.unitPrice, published: saved.published ?? row.published });
        } else {
          const saved = await api.createStorefrontOffer(body);
          const reloaded = await api.storefrontOffers();
          const created = (reloaded || []).find(offer => offer.sku === row.sku && offer.currency === row.currency);
          if (!created) throw Error(`${row.sku} 价格已保存但未能读回，请刷新后确认。`);
          done.push({ key: row.key, id: created.id, revision: created.revision, unitPrice: created.unitPrice, published: created.published });
        }
      }
      setRows(current => current.map(row => {
        const hit = done.find(item => item.key === row.key);
        return hit ? { ...row, id: hit.id, revision: hit.revision, unitPrice: hit.unitPrice, published: hit.published, baseline: `${hit.unitPrice}|${hit.published}` } : row;
      }));
      setMessage(`已保存 ${done.length} 条价格。`);
      onChanged?.();
    } catch (reason) {
      setError(reason.message);
      if (done.length) onChanged?.();
    } finally {
      setBusy(false);
    }
  };

  const changedCount = changed.length;

  return <div className="mask mask--center" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="modal shop-modal" role="dialog" aria-modal="true" aria-label={`设置价格 · ${product.name}`}>
      <div className="modal-head">
        <h3>设置价格 · {product.name}</h3>
        <button type="button" className="btn small" onClick={onClose} disabled={busy} aria-label="关闭">×</button>
      </div>
      <div className="modal-body">
        {error && <p className="shop-modal__error" role="alert">{error}</p>}
        {message && <p className="hint pub-message" role="status">{message}</p>}
        <p className="hint">价格按 SKU + 币种维护。只有勾选「官网公开」的报价才会在官网列表、商品详情页和购物车生效。列表金额目前只汇总 EUR，CNY 报价会保存但不在列表价格列展示。</p>
        {loading ? <p className="hint">正在读取报价…</p> : rows.length ? (
          <table className="table price-table">
            <thead>
              <tr><th>SKU</th><th>规格 / 颜色</th><th>币种</th><th>公开单价</th><th>官网公开</th><th>状态</th></tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const dirty = `${row.unitPrice}|${row.published}` !== row.baseline;
                return <tr key={row.key} className={dirty ? 'is-dirty' : undefined}>
                  <td><b>{row.sku}</b>{row.disabled && <span className="shop-chip shop-chip--warn">SKU 停用</span>}</td>
                  <td>{[row.spec, row.color].filter(Boolean).join(' · ') || '—'}</td>
                  <td>
                    {row.id
                      ? <span>{row.currency}</span>
                      : <select value={row.currency} onChange={event => patch(row.key, { currency: event.target.value })}>
                          {CURRENCIES.map(code => <option key={code}>{code}</option>)}
                        </select>}
                  </td>
                  <td>
                    <input className="price-table__input" inputMode="decimal" placeholder="未定价"
                      value={row.unitPrice} onChange={event => patch(row.key, { unitPrice: event.target.value.trim() })} />
                  </td>
                  <td><input type="checkbox" checked={row.published} onChange={event => patch(row.key, { published: event.target.checked })} aria-label={`${row.sku} 官网公开`} /></td>
                  <td>{row.id ? <span className="shop-grid__muted">已有报价</span> : <span className="shop-grid__muted">新增</span>}</td>
                </tr>;
              })}
            </tbody>
          </table>
        ) : <p className="hint">这个商品还没有 SKU，先在产品资料里补 SKU 才能定价。</p>}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn small" onClick={onClose} disabled={busy}>关闭</button>
        <button type="button" className="btn small primary" disabled={busy || loading || !changedCount} onClick={save}>
          {busy ? '保存中…' : changedCount ? `保存 ${changedCount} 条价格` : '保存价格'}
        </button>
      </div>
    </div>
  </div>;
}
