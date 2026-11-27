import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicLocations, type Locale, siteUrl } from '@/lib/alsvid-api';
import { UI } from '@/lib/ui-text';
import { StoreAppointmentForm } from '@/components/store-appointments';

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: UI.testRide[locale], alternates: { canonical: `${siteUrl}/${locale}/test-ride`, languages: { de: `${siteUrl}/de/test-ride`, en: `${siteUrl}/en/test-ride`, zh: `${siteUrl}/zh/test-ride`, 'x-default': `${siteUrl}/de/test-ride` } } };
}

export default async function TestRidePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!['de','en','zh'].includes(locale)) notFound();
  const lang = locale as Locale;
  const locations = await getPublicLocations('sales');
  return <main className="container content-page">
    <p className="eyebrow">ALSVID / {UI.testRideEyebrow[lang]}</p>
    <h1>{UI.findLocation[lang]}</h1>
    <p className="lede">{UI.testRideLede[lang]}</p>
    <StoreAppointmentForm locale={lang} />
    {locations.length ? <div className="location-grid">{locations.map(location => <article className="location-card" key={location.id}><h2>{location.name}</h2><p>{location.city}, {location.country}</p><address>{location.address}</address><a href={`https://maps.google.com/?q=${encodeURIComponent(`${location.name}, ${location.address}, ${location.city}`)}`} target="_blank" rel="noreferrer">{UI.openMap[lang]} ↗</a></article>)}</div> : <p className="empty-state">{UI.noLocations[lang]}</p>}
  </main>;
}
