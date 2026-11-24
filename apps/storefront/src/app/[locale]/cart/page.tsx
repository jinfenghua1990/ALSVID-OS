import { notFound } from 'next/navigation';
import { CartPage } from '@/components/cart-actions';
import type { Locale } from '@/lib/alsvid-api';

export default async function CartRoute({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) notFound();
  return <CartPage locale={locale as Locale} />;
}
