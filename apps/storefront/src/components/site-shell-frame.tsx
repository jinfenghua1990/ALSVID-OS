import Link from 'next/link';
import { DesignPreviewFocus } from '@/components/design-preview-focus';
import { CartDrawer } from '@/components/cart-drawer';
import { SiteHeader } from '@/components/site-header';
import {
  getCmsProductTemplate,
  getSiteShell,
  type Locale,
  type SiteAnnouncementConfig,
  type SiteHeaderConfig,
  type SiteFooterConfig,
} from '@/lib/alsvid-api';

const LEGAL_TEXT: Record<Locale, { legalAria: string; legal: [string, string][] }> = {
  de: {
    legalAria: 'Rechtliche Informationen',
    legal: [
      ['impressum', 'Impressum'],
      ['datenschutz', 'Datenschutz'],
      ['agb', 'AGB'],
      ['widerrufsbelehrung', 'Widerruf'],
    ],
  },
  en: {
    legalAria: 'Legal information',
    legal: [
      ['impressum', 'Impressum'],
      ['datenschutz', 'Privacy Policy'],
      ['agb', 'Terms & Conditions'],
      ['widerrufsbelehrung', 'Returns'],
    ],
  },
  zh: {
    legalAria: '法律信息',
    legal: [
      ['impressum', '法律声明'],
      ['datenschutz', '隐私政策'],
      ['agb', '销售条款'],
      ['widerrufsbelehrung', '撤销权与退货'],
    ],
  },
};

// 底部标准 5 列导航数据（多语言）
const FOOTER_COLUMNS: Record<
  Locale,
  {
    slogan: string;
    cols: { title: string; links: { label: string; href: string }[] }[];
  }
> = {
  zh: {
    slogan: '为自由而生',
    cols: [
      {
        title: '自行车',
        links: [
          { label: 'A1', href: '/zh/e-bikes/a1' },
          { label: 'L1', href: '/zh/e-bikes/l1' },
          { label: 'L1 Pro', href: '/zh/e-bikes/l1-pro' },
          { label: 'A1 Ultra', href: '/zh/e-bikes/carbon-e-bike-klapprad-a1-ultra' },
          { label: 'FC 平台', href: '/zh/platform/fc' },
          { label: 'CT 平台', href: '/zh/platform/ct' },
          { label: 'FT 平台', href: '/zh/platform/ft' },
          { label: 'GT 平台', href: '/zh/platform/gt' },
        ],
      },
      {
        title: '配件',
        links: [
          { label: '配件总览', href: '/zh/accessories' },
          { label: '前置车篮', href: '/zh/accessories/front-basket' },
          { label: '后货架', href: '/zh/accessories/rear-rack' },
          { label: '车灯', href: '/zh/accessories/lighting' },
        ],
      },
      {
        title: '服务',
        links: [
          { label: 'My ALSVID', href: '/zh/account' },
          { label: '车辆注册', href: '/zh/account/register-bike' },
          { label: '保修服务', href: '/zh/service/warranty' },
          { label: '用户手册', href: '/zh/service/manuals' },
          { label: '服务网点', href: '/zh/service/locations' },
        ],
      },
      {
        title: '关于我们',
        links: [
          { label: '品牌故事', href: '/zh/brand-story' },
          { label: '设计理念', href: '/zh/brand-story#design' },
          { label: '工程技术', href: '/zh/brand-story#tech' },
          { label: '制造工艺', href: '/zh/brand-story#craft' },
        ],
      },
      {
        title: '合作与联系',
        links: [
          { label: '经销商合作', href: '/zh/dealers' },
          { label: '合作入口', href: '/zh/dealers/portal' },
          { label: '联系与支持', href: '/zh/service/contact' },
        ],
      },
    ],
  },
  de: {
    slogan: 'Für die Freiheit geschaffen',
    cols: [
      {
        title: 'Fahrräder',
        links: [
          { label: 'A1', href: '/de/e-bikes/a1' },
          { label: 'L1', href: '/de/e-bikes/l1' },
          { label: 'L1 Pro', href: '/de/e-bikes/l1-pro' },
          { label: 'A1 Ultra', href: '/de/e-bikes/carbon-e-bike-klapprad-a1-ultra' },
          { label: 'FC Plattform', href: '/de/platform/fc' },
          { label: 'CT Plattform', href: '/de/platform/ct' },
          { label: 'FT Plattform', href: '/de/platform/ft' },
          { label: 'GT Plattform', href: '/de/platform/gt' },
        ],
      },
      {
        title: 'Zubehör',
        links: [
          { label: 'Zubehör-Übersicht', href: '/de/accessories' },
          { label: 'Vorderkorb', href: '/de/accessories/front-basket' },
          { label: 'Gepäckträger', href: '/de/accessories/rear-rack' },
          { label: 'Beleuchtung', href: '/de/accessories/lighting' },
        ],
      },
      {
        title: 'Service',
        links: [
          { label: 'My ALSVID', href: '/de/account' },
          { label: 'Fahrzeugregistrierung', href: '/de/account/register-bike' },
          { label: 'Garantieservice', href: '/de/service/warranty' },
          { label: 'Benutzerhandbuch', href: '/de/service/manuals' },
          { label: 'Servicestellen', href: '/de/service/locations' },
        ],
      },
      {
        title: 'Über uns',
        links: [
          { label: 'Markengeschichte', href: '/de/brand-story' },
          { label: 'Designphilosophie', href: '/de/brand-story#design' },
          { label: 'Ingenieurwesen', href: '/de/brand-story#tech' },
          { label: 'Fertigungskunst', href: '/de/brand-story#craft' },
        ],
      },
      {
        title: 'Kontakt & Partner',
        links: [
          { label: 'Händlerkooperation', href: '/de/dealers' },
          { label: 'Partnerportal', href: '/de/dealers/portal' },
          { label: 'Kontakt & Support', href: '/de/service/contact' },
        ],
      },
    ],
  },
  en: {
    slogan: 'Born for freedom',
    cols: [
      {
        title: 'Bikes',
        links: [
          { label: 'A1', href: '/en/e-bikes/a1' },
          { label: 'L1', href: '/en/e-bikes/l1' },
          { label: 'L1 Pro', href: '/en/e-bikes/l1-pro' },
          { label: 'A1 Ultra', href: '/en/e-bikes/carbon-e-bike-klapprad-a1-ultra' },
          { label: 'FC Platform', href: '/en/platform/fc' },
          { label: 'CT Platform', href: '/en/platform/ct' },
          { label: 'FT Platform', href: '/en/platform/ft' },
          { label: 'GT Platform', href: '/en/platform/gt' },
        ],
      },
      {
        title: 'Accessories',
        links: [
          { label: 'All Accessories', href: '/en/accessories' },
          { label: 'Front Basket', href: '/en/accessories/front-basket' },
          { label: 'Rear Rack', href: '/en/accessories/rear-rack' },
          { label: 'Bike Lighting', href: '/en/accessories/lighting' },
        ],
      },
      {
        title: 'Service',
        links: [
          { label: 'My ALSVID', href: '/en/account' },
          { label: 'Bike Registration', href: '/en/account/register-bike' },
          { label: 'Warranty & Care', href: '/en/service/warranty' },
          { label: 'User Manuals', href: '/en/service/manuals' },
          { label: 'Service Centers', href: '/en/service/locations' },
        ],
      },
      {
        title: 'About Us',
        links: [
          { label: 'Brand Story', href: '/en/brand-story' },
          { label: 'Design Philosophy', href: '/en/brand-story#design' },
          { label: 'Engineering', href: '/en/brand-story#tech' },
          { label: 'Manufacturing', href: '/en/brand-story#craft' },
        ],
      },
      {
        title: 'Partners & Support',
        links: [
          { label: 'Dealer Partnership', href: '/en/dealers' },
          { label: 'Partner Portal', href: '/en/dealers/portal' },
          { label: 'Contact Support', href: '/en/service/contact' },
        ],
      },
    ],
  },
};

// 底部自行车折叠车白色线稿 Logo
function BikeLogoFooter() {
  return (
    <svg width="42" height="28" viewBox="0 0 32 22" fill="none" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="7" cy="15" r="4.5" />
      <circle cx="25" cy="15" r="4.5" />
      <path d="M7 15 L14.5 15 L12 7 L7 15" />
      <path d="M14.5 15 L21.5 8 L12 7" />
      <path d="M25 15 L21.5 5.5" />
      <path d="M20 4.5 L23 4.5" />
      <path d="M12 7 L11.5 4.5 M9.5 4.5 L13.5 4.5" />
    </svg>
  );
}

export async function SiteShellFrame({
  children,
  lang,
  override,
}: {
  children: React.ReactNode;
  lang: Locale;
  override?: {
    kind: 'announcement' | 'header' | 'footer';
    config: SiteAnnouncementConfig | SiteHeaderConfig | SiteFooterConfig | null;
  };
}) {
  const [template, live] = await Promise.all([getCmsProductTemplate(lang), getSiteShell(lang)]);
  const shell = { ...live };
  if (override?.kind === 'announcement') shell.announcement = override.config?.kind === 'announcement' ? override.config : null;
  if (override?.kind === 'header') shell.header = override.config?.kind === 'header' ? override.config : null;
  if (override?.kind === 'footer') shell.footer = override.config?.kind === 'footer' ? override.config : null;

  const copy = LEGAL_TEXT[lang];
  const footerData = FOOTER_COLUMNS[lang];

  return (
    <div lang={lang} className="site-shell-wrapper">
      {/* 顶部公告条（如果启用） */}
      {shell.announcement?.enabled && shell.announcement.text && (
        <aside className="site-announcement" data-module-id="ALSVID-G01">
          {shell.announcement.href ? (
            <Link href={shell.announcement.href}>{shell.announcement.text} →</Link>
          ) : (
            shell.announcement.text
          )}
        </aside>
      )}

      {/* 顶部深色高定导航栏 */}
      <SiteHeader locale={lang} catalogLayout={template?.catalogLayout || null} config={shell.header} />

      {/* 页面主内容 */}
      <div data-module-id="ALSVID-G03">{children}</div>

      {/* 购物车抽屉与设计预览焦点 */}
      <CartDrawer locale={lang} />
      <DesignPreviewFocus />

      {/* 底部深黑高定页脚 */}
      <footer className="site-footer site-footer--dark-theme" data-module-id="ALSVID-G04">
        <div className="site-footer-inner">
          <div className="site-footer-main">
            {/* 左侧品牌标示区 */}
            <div className="site-footer-brand-col">
              <div className="site-footer-brand-head">
                <BikeLogoFooter />
                <span className="site-footer-brand-title">ALSVID</span>
              </div>
              <span className="site-footer-slogan">{footerData.slogan}</span>
            </div>

            {/* 右侧 5 列导航结构 */}
            <div className="site-footer-navs">
              {footerData.cols.map((col, idx) => (
                <nav key={idx} className="site-footer-nav-col" aria-label={col.title}>
                  <strong className="site-footer-col-title">{col.title}</strong>
                  <div className="site-footer-col-links">
                    {col.links.map((link, j) => (
                      <Link key={j} href={link.href}>
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </nav>
              ))}
            </div>
          </div>

          {/* 底部版权与法定信息 */}
          <div className="site-footer-bottom">
            <div className="site-footer-brand-row">
              <span>{shell.footer?.brand || '© 2026 ALSVID Electric Mobility GmbH. Alle Rechte vorbehalten.'}</span>
            </div>

            {/* 法律条款链接 */}
            <nav className="site-footer-legal" aria-label={copy.legalAria}>
              {copy.legal.map(([slug, label]) => (
                <Link key={slug} href={`/${lang}/legal/${slug}`}>
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </footer>
    </div>
  );
}
