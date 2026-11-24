import type { Metadata } from 'next';
import { headers } from 'next/headers';

export const metadata: Metadata = {
  title: { default: 'ALSVID', template: '%s · ALSVID' },
  description: 'ALSVID electric mobility',
};

const LOCALES = new Set(['de', 'en', 'zh']);

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requested = (await headers()).get('x-alsvid-locale') || 'de';
  const locale = LOCALES.has(requested) ? requested : 'de';
  return <html lang={locale}><body>{children}</body></html>;
}
