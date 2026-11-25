import { notFound } from 'next/navigation';
import { CartPage } from '@/components/cart-actions';
import type { Locale } from '@/lib/alsvid-api';

export default async function CartRoute({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ step?: string }> }) {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) notFound();
  const { step } = await searchParams;
  return <CartPage locale={locale as Locale} initialStep={step==='checkout'?2:1} />;
}
