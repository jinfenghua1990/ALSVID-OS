import Link from 'next/link';
import {DesignPreviewFocus} from '@/components/design-preview-focus';
import {CartDrawer} from '@/components/cart-drawer';
import {SiteHeader} from '@/components/site-header';
import {getCmsProductTemplate,getSiteShell,type Locale,type SiteAnnouncementConfig,type SiteHeaderConfig,type SiteFooterConfig} from '@/lib/alsvid-api';

const LEGAL_TEXT:Record<Locale,{legalAria:string;legal:[string,string][]}>={de:{legalAria:'Rechtliche Informationen',legal:[['impressum','Impressum'],['datenschutz','Datenschutz'],['agb','AGB'],['widerrufsbelehrung','Widerruf']]},en:{legalAria:'Legal information',legal:[['impressum','Impressum'],['datenschutz','Privacy'],['agb','AGB'],['widerrufsbelehrung','Returns']]},zh:{legalAria:'法律信息',legal:[['impressum','法律声明'],['datenschutz','隐私政策'],['agb','销售条款'],['widerrufsbelehrung','撤销权与退货']]}};

const NEWSLETTER_TEXT: Record<Locale, { title: string; desc: string; placeholder: string; button: string; followUs: string }> = {
  de: {
    title: 'Bleiben Sie informiert',
    desc: 'Erhalten Sie Produktneuheiten, Software-Updates und exklusive Angebote direkt per E-Mail.',
    placeholder: 'Ihre E-Mail-Adresse',
    button: 'Abonnieren',
    followUs: 'Folgen Sie uns',
  },
  en: {
    title: 'Stay in the loop',
    desc: 'Subscribe for the latest mobility releases, smart tech updates, and exclusive invitations.',
    placeholder: 'Enter your email',
    button: 'Subscribe',
    followUs: 'Follow us',
  },
  zh: {
    title: '订阅最新动态',
    desc: '抢先获取 ALSVID 电助力出行新品、固件更新与品牌专属礼遇。',
    placeholder: '输入您的电子邮箱',
    button: '立即订阅',
    followUs: '关注我们',
  },
};

export async function SiteShellFrame({children,lang,override}: {children:React.ReactNode;lang:Locale;override?:{kind:'announcement'|'header'|'footer';config:SiteAnnouncementConfig|SiteHeaderConfig|SiteFooterConfig|null}}) {
  const [template,live] = await Promise.all([getCmsProductTemplate(lang),getSiteShell(lang)]);
  const shell={...live};
  if(override?.kind==='announcement')shell.announcement=override.config?.kind==='announcement'?override.config:null;
  if(override?.kind==='header')shell.header=override.config?.kind==='header'?override.config:null;
  if(override?.kind==='footer')shell.footer=override.config?.kind==='footer'?override.config:null;
  const copy=LEGAL_TEXT[lang];
  const nlCopy=NEWSLETTER_TEXT[lang];

  // 分离左侧导航列与右侧 Newsletter/品牌互动区
  const allGroups = shell.footer?.groups || [];
  const isNewsletterLike = (title: string = '') => /newsletter|订阅|资讯|in the loop|aktuell/i.test(title);
  
  let navGroups = allGroups;
  let newsletterGroup: (typeof allGroups)[0] | null = null;
  
  if (allGroups.length > 1) {
    const lastIdx = allGroups.length - 1;
    if (isNewsletterLike(allGroups[lastIdx]?.title)) {
      newsletterGroup = allGroups[lastIdx];
      navGroups = allGroups.slice(0, lastIdx);
    } else if (allGroups.length >= 4) {
      newsletterGroup = allGroups[lastIdx];
      navGroups = allGroups.slice(0, lastIdx);
    }
  }

  return <div lang={lang}>
    {shell.announcement?.enabled && shell.announcement.text && <aside className="site-announcement" data-module-id="ALSVID-G01">{shell.announcement.href?<Link href={shell.announcement.href}>{shell.announcement.text} →</Link>:shell.announcement.text}</aside>}
    <SiteHeader locale={lang} catalogLayout={template?.catalogLayout||null} config={shell.header}/>
    <div data-module-id="ALSVID-G03">{children}</div>
    <CartDrawer locale={lang}/>
    <DesignPreviewFocus/>
    <footer className="site-footer site-footer--global" data-module-id="ALSVID-G04">
      <div className="site-footer-inner">
        <div className="site-footer-main">
          {/* 左侧业务与法律导航列（紧凑成团排布） */}
          <div className="site-footer-navs">
            {navGroups.map((group, i) => (
              <nav key={i} className="site-footer-nav-col" aria-label={group.title}>
                <strong className="site-footer-col-title">{group.title}</strong>
                <div className="site-footer-col-links">
                  {group.links.map((item, j) => (
                    <Link key={j} href={item.href}>{item.label}</Link>
                  ))}
                </div>
              </nav>
            ))}
          </div>

          {/* 右侧：品牌订阅专区与社交媒体，杜绝大屏右侧空旷 */}
          <div className="site-footer-newsletter-section">
            <strong className="site-footer-col-title">{newsletterGroup?.title || nlCopy.title}</strong>
            <p className="site-footer-newsletter-desc">{nlCopy.desc}</p>
            <form className="site-footer-newsletter-form" action={`/${lang}/newsletter`} method="get">
              <input type="email" name="email" placeholder={nlCopy.placeholder} required aria-label={nlCopy.placeholder}/>
              <button type="submit">{nlCopy.button}</button>
            </form>
            {newsletterGroup && newsletterGroup.links.length > 0 && (
              <div className="site-footer-newsletter-links">
                {newsletterGroup.links.map((item, idx) => (
                  <Link key={idx} href={item.href}>{item.label}</Link>
                ))}
              </div>
            )}
            
            {/* 社交媒体预留图标 */}
            <div className="site-footer-social-wrap">
              <span className="site-footer-social-label">{nlCopy.followUs}</span>
              <div className="site-footer-social" aria-label="Social Media">
                <a
                  href={(shell.footer as any)?.social?.instagram || 'javascript:void(0)'}
                  target={(shell.footer as any)?.social?.instagram ? '_blank' : undefined}
                  rel="noreferrer"
                  title="Instagram (ALSVID 官方渠道预留)"
                  aria-label="Instagram"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
                </a>
                <a
                  href={(shell.footer as any)?.social?.youtube || 'javascript:void(0)'}
                  target={(shell.footer as any)?.social?.youtube ? '_blank' : undefined}
                  rel="noreferrer"
                  title="YouTube (ALSVID 官方频道预留)"
                  aria-label="YouTube"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"></path><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor"></polygon></svg>
                </a>
                <a
                  href={(shell.footer as any)?.social?.facebook || 'javascript:void(0)'}
                  target={(shell.footer as any)?.social?.facebook ? '_blank' : undefined}
                  rel="noreferrer"
                  title="Facebook (ALSVID 官方主页预留)"
                  aria-label="Facebook"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* 底部功能区：版权、法定条款、支付安全徽章 */}
        <div className="site-footer-bottom">
          <div className="site-footer-brand-row">
            <span>{shell.footer?.brand || '© 2026 ALSVID Electric Mobility GmbH. Alle Rechte vorbehalten.'}</span>
          </div>

          {/* 欧洲本土法定条款 */}
          <nav className="site-footer-legal" aria-label={copy.legalAria}>
            {copy.legal.map(([slug, label]) => (
              <Link key={slug} href={`/${lang}/legal/${slug}`}>{label}</Link>
            ))}
          </nav>

          {/* 德国本土信任支付图标徽章 (PayPal, Klarna, VISA, Mastercard) */}
          <div className="site-footer-payments" aria-label="Zahlungsarten">
            <span className="payment-badge">PayPal</span>
            <span className="payment-badge">Klarna</span>
            <span className="payment-badge">VISA</span>
            <span className="payment-badge">Mastercard</span>
            <span className="payment-badge">Apple Pay</span>
          </div>
        </div>
      </div>
    </footer>
  </div>;
}
