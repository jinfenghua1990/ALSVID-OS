import Link from 'next/link';

export default function LocaleNotFound() {
  return <main className="container content-page"><p className="eyebrow">404</p><h1>Page not found</h1><p className="lede">This page is unavailable or has not been published.</p><Link className="button" href="/de">ALSVID home</Link></main>;
}
