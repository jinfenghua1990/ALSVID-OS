'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/alsvid-api';
import { openCartDrawerEvent } from './cart-drawer';
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
        if (current === revision && Array.isArray(cart?.items)) setQuantity(cart.items.reduce((total: number, item: { quantity?: number }) => total + (Number(item.quantity) || 0), guestCartQuantity()));
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

  return <Link className="cart-nav-link" href={`/${locale}/cart`} aria-haspopup="dialog" onClick={event=>{if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();window.dispatchEvent(new Event(openCartDrawerEvent));}}} aria-label={quantity ? `${label}, ${quantity}` : label}>
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg><span className="sr-only">{label}</span>{quantity > 0 && <span className="cart-nav-count" aria-hidden="true">{quantity > 99 ? '99+' : quantity}</span>}
  </Link>;
}
