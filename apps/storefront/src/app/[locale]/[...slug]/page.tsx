import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CmsBlocks } from '@/components/cms-blocks';
import { getCmsPage, type Locale, siteUrl } from '@/lib/alsvid-api';
import { pageTitle } from '@/lib/seo';

type Props = { params: Promise<{ locale: Locale; slug: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = await getCmsPage(locale, `/${slug.join('/')}`);
  if (!page) return { title: 'Page not found', robots: { index: false, follow: false } };
  const path = `/${locale}/${slug.map(encodeURIComponent).join('/')}`;
  return { title: pageTitle(page.seo.title, page.name), description: page.seo.description, alternates: { canonical: `${siteUrl}${path}` } };
}

export default async function CmsPage({ params }: Props) {
  const { locale, slug } = await params;
  const page = await getCmsPage(locale, `/${slug.join('/')}`);
  if (!page) notFound();
  return <main><CmsBlocks blocks={page.blocks} locale={locale}/></main>;
}
