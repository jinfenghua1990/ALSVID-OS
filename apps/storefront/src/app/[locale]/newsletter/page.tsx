import type { Metadata } from 'next';
import Link from 'next/link';
import { type Locale } from '@/lib/alsvid-api';
import { pageTitle } from '@/lib/seo';

const I18N = {
  de: {
    title: 'Newsletter & Updates',
    headline: 'Bleiben Sie auf dem Laufenden',
    subline: 'Erhalten Sie Produktneuheiten, Software-Updates und exklusive Angebote von ALSVID direkt in Ihr Postfach.',
    successHeading: 'Vielen Dank für Ihre Anmeldung!',
    successSub: 'Wir haben Ihre E-Mail erhalten und halten Sie über alle Meilensteine von ALSVID auf dem Laufenden.',
    placeholder: 'Ihre E-Mail-Adresse eingeben',
    subscribeBtn: 'Jetzt abonnieren',
    privacyNote: 'Mit der Anmeldung stimmen Sie unserer Datenschutzerklärung zu. Sie können sich jederzeit wieder abmelden.',
    backHome: 'Zur Startseite zurückkehren',
    exploreBikes: 'Modelle entdecken',
  },
  en: {
    title: 'Newsletter & Updates',
    headline: 'Stay in the Loop',
    subline: 'Be the first to hear about new mobility releases, smart firmware updates, and exclusive invitations from ALSVID.',
    successHeading: 'Thank you for subscribing!',
    successSub: 'We have received your email and look forward to sharing ALSVID milestones with you.',
    placeholder: 'Enter your email address',
    subscribeBtn: 'Subscribe now',
    privacyNote: 'By subscribing you agree to our Privacy Policy. You can unsubscribe at any time.',
    backHome: 'Back to Homepage',
    exploreBikes: 'Explore E-Bikes',
  },
  zh: {
    title: '动态资讯与邮件订阅',
    headline: '随时掌握 ALSVID 前沿动态',
    subline: '抢先获取 ALSVID 智能电助力出行新品发布、固件系统升级与品牌专属特惠礼遇。',
    successHeading: '感谢您的订阅！',
    successSub: '我们已记录您的邮箱，将第一时间为您奉上 ALSVID 品牌最新资讯与前沿动态。',
    placeholder: '输入您的电子邮箱地址',
    subscribeBtn: '立即订阅',
    privacyNote: '提交订阅即代表您同意我们的隐私政策。您可以随时退订。',
    backHome: '返回官网首页',
    exploreBikes: '浏览在售车型',
  },
};

type Props = {
  params: Promise<{ locale: Locale }>;
  searchParams?: Promise<{ email?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = I18N[locale] || I18N.de;
  return {
    title: pageTitle(t.title),
    description: t.subline,
    robots: { index: false, follow: false },
  };
}

export default async function NewsletterPage({ params, searchParams }: Props) {
  const { locale } = await params;
  const query = (await searchParams) || {};
  const t = I18N[locale] || I18N.de;
  const email = query.email?.trim() || '';

  return (
    <main className="container" style={{ minHeight: '65vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '64px 20px' }}>
      <div style={{ maxWidth: 640, width: '100%', textAlign: 'center', background: 'var(--color-surface, #ffffff)', padding: '48px 32px', borderRadius: 16, border: '1px solid var(--color-border, #e5e7eb)', boxShadow: '0 4px 24px rgba(0,0,0,0.04)' }}>
        {email ? (
          <div>
            <div style={{ fontSize: 44, marginBottom: 16 }}>✨</div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 12px', color: 'var(--color-text, #111827)' }}>{t.successHeading}</h1>
            <p style={{ fontSize: 15, color: 'var(--color-text-muted, #4b5563)', lineHeight: 1.6, margin: '0 0 8px' }}>{t.successSub}</p>
            <p style={{ display: 'inline-block', background: 'rgba(40,167,69,0.08)', color: '#2b8a3e', padding: '4px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500, margin: '16px 0 32px' }}>
              ✓ {email}
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href={`/${locale}`} className="button" style={{ textDecoration: 'none' }}>{t.backHome}</Link>
              <Link href={`/${locale}/e-bikes`} className="button secondary" style={{ textDecoration: 'none' }}>{t.exploreBikes}</Link>
            </div>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 44, marginBottom: 16 }}>📬</div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 12px', color: 'var(--color-text, #111827)' }}>{t.headline}</h1>
            <p style={{ fontSize: 15, color: 'var(--color-text-muted, #4b5563)', lineHeight: 1.6, margin: '0 0 28px' }}>{t.subline}</p>
            <form action={`/${locale}/newsletter`} method="get" style={{ display: 'flex', gap: 10, maxWidth: 460, margin: '0 auto 16px', flexWrap: 'wrap' }}>
              <input
                type="email"
                name="email"
                required
                placeholder={t.placeholder}
                style={{ flex: '1 1 240px', padding: '12px 16px', borderRadius: 8, border: '1px solid var(--color-border, #d1d5db)', fontSize: 14 }}
              />
              <button type="submit" className="button" style={{ flex: '0 0 auto', padding: '12px 24px', cursor: 'pointer' }}>
                {t.subscribeBtn}
              </button>
            </form>
            <p style={{ fontSize: 12, color: 'var(--color-text-subtle, #9ca3af)', margin: '0 0 24px' }}>{t.privacyNote}</p>
            <Link href={`/${locale}`} style={{ fontSize: 14, color: 'var(--color-text-muted, #4b5563)', textDecoration: 'none' }}>
              ← {t.backHome}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
