import Link from 'next/link';
import type { Locale, CatalogLayout, SiteHeaderConfig } from '@/lib/alsvid-api';
import { CartNavLink } from './cart-nav-link';

const copy = {
  de: {
    home: 'Startseite',
    catalog: 'E-Bikes',
    all: 'Alle E-Bikes',
    ride: 'Probefahrt',
    owner: 'Kundenbereich',
    search: 'Produkte suchen',
    searchPlaceholder: 'Modell oder Stichwort',
    menu: 'Menü',
    categories: 'Kategorien',
    slogan: 'Für die Freiheit geschaffen · Erkunde deine nächste Reise',
    cart: 'Warenkorb',
    presale: 'Vorverkauf',
    newBadge: 'Neu',
    products: 'Produkte',
    dealers: 'Händler weltweit',
    service: 'Besitzer-Service',
    story: 'Markengeschichte',
  },
  en: {
    home: 'Home',
    catalog: 'E-Bikes',
    all: 'All E-Bikes',
    ride: 'Test ride',
    owner: 'Owner area',
    search: 'Search products',
    searchPlaceholder: 'Model or keyword',
    menu: 'Menu',
    categories: 'Categories',
    slogan: 'Born for freedom · Explore your next journey',
    cart: 'Cart',
    presale: 'Pre-order',
    newBadge: 'New',
    products: 'Products',
    dealers: 'Global Dealers',
    service: 'Owner Service',
    story: 'Brand Story',
  },
  zh: {
    home: '首页',
    catalog: '整车',
    all: '全部整车',
    ride: '试骑预约',
    owner: '车主中心',
    search: '搜索商品',
    searchPlaceholder: '车型或关键词',
    menu: '菜单',
    categories: '商品分类',
    slogan: '为自由而生 · 探索你的下一段旅程',
    cart: '购物车',
    presale: '预售',
    newBadge: '新品',
    products: '产品',
    dealers: '全球经销商',
    service: '车主服务',
    story: '品牌故事',
  },
} satisfies Record<Locale, Record<string, string>>;

const languageNames: Record<Locale, string> = { de: 'Deutsch', en: 'English', zh: '中文' };

function LanguageFlag({ locale }: { locale: Locale }) {
  return locale === 'de' ? (
    <svg width="22" height="14" viewBox="0 0 5 3" aria-hidden="true" focusable="false">
      <path fill="#000" d="M0 0h5v1H0z" />
      <path fill="#D00" d="M0 1h5v1H0z" />
      <path fill="#FFCE00" d="M0 2h5v1H0z" />
    </svg>
  ) : locale === 'en' ? (
    <svg width="22" height="14" viewBox="0 0 60 30" aria-hidden="true" focusable="false">
      <path fill="#012169" d="M0 0h60v30H0z" />
      <path stroke="#FFF" strokeWidth="6" d="m0 0 60 30m0-30L0 30" />
      <path stroke="#C8102E" strokeWidth="2" d="M0 0l30 15m30 15L30 15m30-15L30 15M0 30l30-15" />
      <path stroke="#FFF" strokeWidth="10" d="M30 0v30M0 15h60" />
      <path stroke="#C8102E" strokeWidth="6" d="M30 0v30M0 15h60" />
    </svg>
  ) : (
    <svg width="22" height="14" viewBox="0 0 30 20" aria-hidden="true" focusable="false">
      <path fill="#DE2910" d="M0 0h30v20H0z" />
      {[
        [5, 5, 3, 0],
        [10, 2, 1, -20],
        [12, 4, 1, -40],
        [12, 7, 1, -65],
        [10, 9, 1, -85],
      ].map(([x, y, r, angle], i) => (
        <polygon
          key={i}
          fill="#FFDE00"
          points={Array.from({ length: 10 }, (_, j) => {
            const a = ((j * 36 - 90 + angle) * Math.PI) / 180;
            const d = j % 2 ? r * 0.382 : r;
            return x + d * Math.cos(a) + ',' + (y + d * Math.sin(a));
          }).join(' ')}
        />
      ))}
    </svg>
  );
}

// 顶部折叠自行车极简白色线稿 Logo
function BikeLogoIcon() {
  return (
    <svg width="32" height="22" viewBox="0 0 32 22" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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

export function SiteHeader({
  locale,
  catalogLayout,
  config = null,
}: {
  locale: Locale;
  catalogLayout: CatalogLayout;
  config?: SiteHeaderConfig | null;
}) {
  const t = copy[locale];
  const brand = config?.brand?.trim() || 'ALSVID';

  // 严格对齐用户设计稿的精简主导航结构
  const navItems = [
    {
      label: 'A1 Ultra',
      href: `/${locale}/e-bikes/carbon-e-bike-klapprad-a1-ultra`,
      badge: t.presale,
      badgeType: 'presale',
    },
    {
      label: 'L1 Pro',
      href: `/${locale}/e-bikes/l1-pro`,
      badge: t.newBadge,
      badgeType: 'new',
    },
    { label: 'A1', href: `/${locale}/e-bikes/a1` },
    { label: 'L1', href: `/${locale}/e-bikes/l1` },
    { label: t.products, href: `/${locale}/e-bikes` },
    { label: t.dealers, href: `/${locale}/dealers` },
    { label: t.service, href: `/${locale}/service` },
    { label: t.story, href: `/${locale}/brand-story` },
  ];

  return (
    <header className="site-header site-header--dark-theme" data-module-id="ALSVID-G02">
      {/* 品牌 Logo 与品牌 Slogan */}
      <div className="site-header__brand-block">
        <Link className="site-header__brand-link" href={'/' + locale} aria-label="ALSVID">
          <BikeLogoIcon />
          <span className="site-header__brand-name">{brand}</span>
        </Link>
        <span className="site-header__slogan">{t.slogan}</span>
      </div>

      {/* 桌面端居中高亮主导航 */}
      <nav className="site-header__nav" aria-label={t.menu}>
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className="site-header__nav-item">
            <span>{item.label}</span>
            {item.badge && (
              <span className={`site-header__nav-badge site-header__nav-badge--${item.badgeType}`}>
                {item.badge}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {/* 移动端菜单折叠 */}
      <details className="mobile-menu">
        <summary aria-label={t.menu}>
          <svg width="22" height="22" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" fill="none" aria-hidden="true">
            <path d="M3 6h18M3 12h18M3 18h18" />
          </svg>
        </summary>
        <nav className="site-nav site-nav--dark" aria-label={t.menu}>
          <Link href={'/' + locale}>{t.home}</Link>
          {navItems.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label} {item.badge ? `(${item.badge})` : ''}
            </Link>
          ))}
          <Link href={'/' + locale + '/test-ride'}>{t.ride}</Link>
          <Link href={'/' + locale + '/account'}>{t.owner}</Link>
        </nav>
      </details>

      {/* 右侧动作区：购物车与多语言 */}
      <div className="site-header-actions">
        {/* 购物车入口 */}
        <CartNavLink locale={locale} />

        {/* 语言切换国家图标 */}
        <details className="locale-switch locale-switch--flags">
          <summary aria-label={locale === 'zh' ? '切换语言' : locale === 'de' ? 'Sprache wählen' : 'Choose language'}>
            <LanguageFlag locale={locale} />
            <span className="sr-only">{languageNames[locale]}</span>
          </summary>
          <nav aria-label="Language">
            {(['de', 'en', 'zh'] as Locale[]).map((lang) => (
              <Link key={lang} href={'/' + lang} lang={lang} aria-current={lang === locale ? 'page' : undefined}>
                <LanguageFlag locale={lang} />
                <span>{languageNames[lang]}</span>
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
