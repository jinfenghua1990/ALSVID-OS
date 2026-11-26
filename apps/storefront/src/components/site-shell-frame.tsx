import Link from 'next/link';
import {DesignPreviewFocus} from '@/components/design-preview-focus';
import {CartDrawer} from '@/components/cart-drawer';
import {SiteHeader} from '@/components/site-header';
import {getCmsProductTemplate,getSiteShell,type Locale,type SiteAnnouncementConfig,type SiteHeaderConfig,type SiteFooterConfig} from '@/lib/alsvid-api';

const LEGAL_TEXT:Record<Locale,{legalAria:string;legal:[string,string][]}>={de:{legalAria:'Rechtliche Informationen',legal:[['impressum','Impressum'],['datenschutz','Datenschutz'],['agb','AGB'],['widerrufsbelehrung','Widerruf']]},en:{legalAria:'Legal information',legal:[['impressum','Impressum'],['datenschutz','Privacy'],['agb','AGB'],['widerrufsbelehrung','Returns']]},zh:{legalAria:'法律信息',legal:[['impressum','法律声明'],['datenschutz','隐私政策'],['agb','销售条款'],['widerrufsbelehrung','撤销权与退货']]}};

export async function SiteShellFrame({children,lang,override}: {children:React.ReactNode;lang:Locale;override?:{kind:'announcement'|'header'|'footer';config:SiteAnnouncementConfig|SiteHeaderConfig|SiteFooterConfig|null}}) {
  const [template,live] = await Promise.all([getCmsProductTemplate(lang),getSiteShell(lang)]);
  const shell={...live};
  if(override?.kind==='announcement')shell.announcement=override.config?.kind==='announcement'?override.config:null;
  if(override?.kind==='header')shell.header=override.config?.kind==='header'?override.config:null;
  if(override?.kind==='footer')shell.footer=override.config?.kind==='footer'?override.config:null;
  const copy=LEGAL_TEXT[lang];
  return <div lang={lang}>
    {shell.announcement?.enabled && shell.announcement.text && <aside className="site-announcement" data-module-id="ALSVID-G01">{shell.announcement.href?<Link href={shell.announcement.href}>{shell.announcement.text} →</Link>:shell.announcement.text}</aside>}
    <SiteHeader locale={lang} catalogLayout={template?.catalogLayout||null} config={shell.header}/>
    <div data-module-id="ALSVID-G03">{children}</div>
    <CartDrawer locale={lang}/>
    <DesignPreviewFocus/>
    <footer className="site-footer site-footer--global" data-module-id="ALSVID-G04">
      {!!shell.footer?.groups?.length && <div className="site-footer-groups">{shell.footer.groups.map((group,i)=><nav key={i} aria-label={group.title}><strong>{group.title}</strong>{group.links.map((item,j)=><Link key={j} href={item.href}>{item.label}</Link>)}</nav>)}</div>}
      <div className="site-footer-bottom"><span>{shell.footer?.brand||'ALSVID · Electric mobility'}</span><nav aria-label={copy.legalAria}>{copy.legal.map(([slug,label])=><Link key={slug} href={`/${lang}/legal/${slug}`}>{label}</Link>)}</nav></div>
    </footer>
  </div>;
}
