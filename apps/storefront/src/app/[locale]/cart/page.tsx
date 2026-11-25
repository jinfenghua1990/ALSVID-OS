import { notFound } from 'next/navigation';
import { CartPage } from '@/components/cart-actions';
import type { Locale } from '@/lib/alsvid-api';

export default async function CartRoute({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ step?: string; order?: string }> }) {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) notFound();
  const { step, order } = await searchParams;
  const orderId=typeof order==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(order)?order.toLowerCase():undefined;
  return <CartPage key={orderId||'cart'} locale={locale as Locale} initialStep={step==='checkout'?2:1} initialOrderId={orderId} />;
}
