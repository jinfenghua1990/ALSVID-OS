import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '../globals.css';
import { type Locale, siteUrl } from '@/lib/alsvid-api';
import {SiteShellFrame} from '@/components/site-shell-frame';

export const metadata: Metadata = {metadataBase:new URL(siteUrl),robots:{index:true,follow:true}};

export default async function LocaleLayout({ children, params }: Readonly<{ children: React.ReactNode; params: Promise<{ locale: string }> }>) {
  const {locale}=await params;
  if(!['de','en','zh'].includes(locale))notFound();
  return <SiteShellFrame lang={locale as Locale}>{children}</SiteShellFrame>;
}
