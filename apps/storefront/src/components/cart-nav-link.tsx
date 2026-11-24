'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/alsvid-api';
import { UI } from '@/lib/ui-text';
import { cartChangedEvent, guestCartKey, guestCartQuantity } from './cart-storage';

export function CartNavLink({ locale }: { locale: Locale }) {
  const [quantity, setQuantity] = useState(0);
  const label = UI.cart[locale];

  useEffect(() => {
    let revision = 0;
    const refresh = async () => {
      const current = ++revision;
      setQuantity(guestCartQuantity());
      try {
        const auth = await fetch('/api/auth/status', { cache: 'no-store' }).then(response => response.ok ? response.json() : null);
        if (auth?.user?.role !== 'owner') return;
        const cart = await fetch('/api/portal/storefront/cart', { cache: 'no-store' }).then(response => response.ok ? response.json() : null);
        if (current === revision && Array.isArray(cart?.items)) setQuantity(cart.items.reduce((total: number, item: { quantity?: number }) => total + (Number(item.quantity) || 0), 0));
      } catch { /* Keep the locally stored guest count when account services are unavailable. */ }
    };
    const onStorage = (event: StorageEvent) => { if (event.key === guestCartKey) void refresh(); };
    void refresh();
    window.addEventListener(cartChangedEvent, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(cartChangedEvent, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return <Link className="cart-nav-link" href={`/${locale}/cart`} aria-label={quantity ? `${label}, ${quantity}` : label}>
    {label}{quantity > 0 && <span className="cart-nav-count" aria-hidden="true">{quantity > 99 ? '99+' : quantity}</span>}
  </Link>;
}
