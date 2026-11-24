'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/alsvid-api';
import { apiJson, apiList } from './account-api';
import { COMMON, NAV, OVERVIEW, pick } from '@/lib/account-text';

type Vehicle = { id: string; vin: string; model: string };

export function OverviewPanel({ locale }: { locale: Locale }) {
  const [counts, setCounts] = useState<{ orders: number; vehicles: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        // 概览只要数量：订单取首页（后端每页 50 条），车辆一次取全。
        const [orders, vehicles] = await Promise.all([
          apiList<{ id: string }>('/api/portal/storefront/orders'),
          apiJson<Vehicle[]>('/api/portal/vehicles'),
        ]);
        if (cancelled) return;
        setCounts({ orders: orders.items.length, vehicles: Array.isArray(vehicles) ? vehicles.length : 0 });
      } catch {
        if (!cancelled) setFailed(true);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  const cards = [
    { key: 'orders', href: `/${locale}/account/orders`, value: counts ? String(counts.orders) : null },
    { key: 'vehicles', href: `/${locale}/account/vehicles`, value: counts ? String(counts.vehicles) : null },
  ] as const;

  const links = [
    { key: 'orders', href: `/${locale}/account/orders`, hint: OVERVIEW.ordersHint[locale] },
    { key: 'vehicles', href: `/${locale}/account/vehicles`, hint: OVERVIEW.vehiclesHint[locale] },
    { key: 'service', href: `/${locale}/account/service`, hint: OVERVIEW.serviceHint[locale] },
    { key: 'repairs', href: `/${locale}/account/repairs`, hint: OVERVIEW.repairsHint[locale] },
    { key: 'security', href: `/${locale}/account/security`, hint: OVERVIEW.securityHint[locale] },
  ] as const;

  return <>
    <section className="account-stats">
      {cards.map((card) => <Link className="account-stat" key={card.key} href={card.href}>
        <span>{pick(NAV[card.key], locale)}</span>
        <strong>{card.value ?? (failed ? '—' : '…')}</strong>
      </Link>)}
    </section>
    {failed && <p className="account-error" role="alert">{COMMON.requestFailed[locale]}</p>}
    <section className="account-links">
      {links.map((link) => <Link className="account-link" key={link.key} href={link.href}>
        <h2>{pick(NAV[link.key], locale)}</h2>
        <p>{link.hint}</p>
        <span aria-hidden="true">→</span>
      </Link>)}
    </section>
  </>;
}
