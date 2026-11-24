import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AccountShell } from '@/components/account/account-shell';
import type { Locale } from '@/lib/alsvid-api';

// 账户中心全部为私有内容：禁止搜索引擎收录。
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default async function AccountLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!['de', 'en', 'zh'].includes(locale)) notFound();
  return <AccountShell locale={locale as Locale}>{children}</AccountShell>;
}
