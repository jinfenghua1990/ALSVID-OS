import zh from './i18n/zh.json';
import en from './i18n/en.json';
import de from './i18n/de.json';
import l7Zh from './i18n/l7/zh.json';
import l7En from './i18n/l7/en.json';
import l7De from './i18n/l7/de.json';
import l8Zh from './i18n/l8/zh.json';
import l8En from './i18n/l8/en.json';
import l8De from './i18n/l8/de.json';
import fc2Zh from './i18n/fc2/zh.json';
import fc2En from './i18n/fc2/en.json';
import fc2De from './i18n/fc2/de.json';
import fc1Zh from './i18n/fc1/zh.json';
import fc1En from './i18n/fc1/en.json';
import fc1De from './i18n/fc1/de.json';
import cupZh from './i18n/cup-holder/zh.json';
import cupEn from './i18n/cup-holder/en.json';
import cupDe from './i18n/cup-holder/de.json';

export type Locale = 'zh' | 'en' | 'de';
export type TranslationKey = string;
const catalogs: Record<Locale, Record<string, string>> = {
  zh: { ...zh, ...l7Zh, ...l8Zh, ...fc2Zh, ...fc1Zh, 'fc1.catalogLink': '浏览商品目录', 'fc1.catalogNote': '请在目录中查看已发布的配置；颜色预览不代表可售配置。', 'fc2.catalogLink': '浏览商品目录', 'fc2.catalogNote': '请在商品目录查看已发布的配置、价格与购买方式。' },
  en: { ...en, ...l7En, ...l8En, ...fc2En, ...fc1En, 'fc1.catalogLink': 'Browse the product catalogue', 'fc1.catalogNote': 'See published configurations in the catalogue; colour previews do not indicate availability.', 'fc2.catalogLink': 'Browse the product catalogue', 'fc2.catalogNote': 'See published configurations, prices and purchase options in the catalogue.' },
  de: { ...de, ...l7De, ...l8De, ...fc2De, ...fc1De, 'fc1.catalogLink': 'Produktkatalog ansehen', 'fc1.catalogNote': 'Veröffentlichte Ausstattungen finden Sie im Katalog; die Farbvorschau zeigt keine Verfügbarkeit an.', 'fc2.catalogLink': 'Produktkatalog ansehen', 'fc2.catalogNote': 'Veröffentlichte Ausstattungen, Preise und Kaufmöglichkeiten finden Sie im Katalog.' },
};

Object.assign(catalogs.zh, cupZh);
Object.assign(catalogs.en, cupEn);
Object.assign(catalogs.de, cupDe);

export function translator(locale: Locale) {
  return (key: string, values: Record<string, string | number> = {}) =>
    (catalogs[locale][key] ?? key).replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder));
}
