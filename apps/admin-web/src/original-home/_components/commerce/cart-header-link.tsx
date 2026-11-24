import type { Locale } from "../../_lib/i18n";
import styles from "./cart-header-link.module.css";

export function CartHeaderLink({locale,mobile=false}:{locale:Locale;mobile?:boolean}) {
 const label=locale==="zh"?"购物车":locale==="de"?"Warenkorb":"Cart";
 return <a href={`/www/${locale}/products?cart=1`} className={mobile?styles.mobileLink:styles.link} aria-label={label} data-site-cart>
   {!mobile?<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 8h14l1 12H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>:null}<span>{label}</span>
 </a>;
}
