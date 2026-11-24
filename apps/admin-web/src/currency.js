import { useEffect, useState } from 'react';

// 欧元兑人民币参考汇率：优先取实时汇率并缓存 12 小时，取不到时使用兜底值。
export const FALLBACK_EUR_CNY = 7.8;
const CACHE_KEY = 'alsvid.fx.eurCny';
const TTL = 12 * 60 * 60 * 1000;

export async function loadEurCnyRate() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (cached && cached.rate > 0 && Date.now() - cached.at < TTL) return cached.rate;
    }
  } catch (_) {}
  try {
    const res = await fetch('/api/fx', { headers: { accept: 'application/json' } });
    if (res.ok) {
      const data = await res.json();
      const rate = Number(data?.rate);
      if (rate > 0) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify({ rate, at: Date.now() })); } catch (_) {}
        return rate;
      }
    }
  } catch (_) {}
  return FALLBACK_EUR_CNY;
}

export function useEurCnyRate() {
  const [rate, setRate] = useState(FALLBACK_EUR_CNY);
  useEffect(() => {
    let active = true;
    loadEurCnyRate().then(value => { if (active) setRate(value); });
    return () => { active = false; };
  }, []);
  return rate;
}

export function toCny(value, rate) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * rate * 100) / 100 : null;
}

export function fmtCny(value) {
  if (value === null || value === undefined) return '—';
  return `≈ ¥ ${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtEur(value) {
  if (value === null || value === undefined || String(value).trim() === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `€ ${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
