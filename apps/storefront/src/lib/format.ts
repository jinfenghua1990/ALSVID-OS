import type { Locale } from './alsvid-api';

const INTL_LOCALE: Record<Locale, string> = { de: 'de-DE', en: 'en-GB', zh: 'zh-CN' };

// 后端金额一律是「最小货币单位的字符串」（如 "129900" 表示 1299.00），
// 绝不直接用浮点做运算，避免分位误差。
export function money(minor: string | number | null | undefined, currency: string, locale: Locale): string {
  if (minor === null || minor === undefined || minor === '') return '—';
  const value = Number(minor);
  if (!Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat(INTL_LOCALE[locale], {
      style: 'currency',
      currency: currency || 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value / 100);
  } catch {
    return `${(value / 100).toFixed(2)} ${currency || 'EUR'}`;
  }
}

export function formatDate(value: string | null | undefined, locale: Locale): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function formatDateTime(value: string | null | undefined, locale: Locale): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
}
