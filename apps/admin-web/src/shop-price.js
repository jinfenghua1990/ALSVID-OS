// 商品价格展示态推导（纯函数，供后台商品列表使用）。
//
// 为什么需要这一层：后台 `/api/products` 返回的 sku.price 是
// `COALESCE(该 SKU 的 EUR 报价, skus.price)`，**不判断报价是否已公开**；
// 而前台 `/api/catalog/products` 只统计 `o.published` 的报价。
// 于是「录了价但没勾官网公开」时，后台显示已定价、前台却没有价格。
// 这里改用 storefront_offers 的真实公开状态推导，让前后台口径一致。
//
// 状态：
//   'none'         没有任何价格
//   'unpublished'  有价格但全部未公开（前台看不到）
//   'live'         至少一条已公开的价格
//   'unverified'   offers 尚未加载/读取失败，退回后端 sku.price（无法判断公开状态）

export function indexOffers(offers) {
  const map = new Map();
  for (const offer of Array.isArray(offers) ? offers : []) {
    if (!offer || typeof offer.sku !== 'string' || !offer.sku) continue;
    if (!map.has(offer.sku)) map.set(offer.sku, []);
    map.get(offer.sku).push(offer);
  }
  return map;
}

function emptyState(totalSkus) {
  return { state: 'none', totalSkus, pricedSkus: 0, unpricedSkus: totalSkus, currency: null, min: null, max: null, otherCurrencies: [] };
}

export function priceState(product, offers) {
  const skus = (product && Array.isArray(product.skus) ? product.skus : []).filter(sku => !sku.disabled);
  const totalSkus = skus.length;

  if (offers == null) {
    const amounts = skus.map(sku => Number(sku.price)).filter(value => Number.isFinite(value) && value > 0);
    if (!amounts.length) return emptyState(totalSkus);
    return {
      state: 'unverified',
      totalSkus,
      pricedSkus: amounts.length,
      unpricedSkus: totalSkus - amounts.length,
      currency: 'EUR',
      min: Math.min(...amounts),
      max: Math.max(...amounts),
      otherCurrencies: [],
    };
  }

  const rows = [];
  for (const sku of skus) {
    for (const offer of offers.get(sku.sku) || []) {
      const amount = Number(offer.unitPrice);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      rows.push({ sku: sku.sku, currency: String(offer.currency || 'EUR'), amount, published: !!offer.published });
    }
  }
  if (!rows.length) return emptyState(totalSkus);

  const liveRows = rows.filter(row => row.published);
  const basis = liveRows.length ? liveRows : rows;

  const groups = new Map();
  for (const row of basis) {
    if (!groups.has(row.currency)) groups.set(row.currency, []);
    groups.get(row.currency).push(row.amount);
  }
  const currency = groups.has('EUR') ? 'EUR' : [...groups.keys()][0];
  const amounts = groups.get(currency);
  const pricedSkus = new Set(rows.map(row => row.sku)).size;

  return {
    state: liveRows.length ? 'live' : 'unpublished',
    totalSkus,
    pricedSkus,
    unpricedSkus: totalSkus - pricedSkus,
    currency,
    min: Math.min(...amounts),
    max: Math.max(...amounts),
    otherCurrencies: [...groups.keys()].filter(code => code !== currency),
  };
}

export function formatAmount(currency, amount) {
  if (amount == null || amount === '') return '—';
  const value = Number(amount);
  if (!Number.isFinite(value)) return '—';
  return `${currency || 'EUR'} ${value.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
