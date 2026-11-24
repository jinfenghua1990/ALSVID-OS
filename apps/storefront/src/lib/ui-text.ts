import type { Locale } from './alsvid-api';

// 站点界面文案的唯一来源（DE / EN / ZH）。
// 规则：新增文案必须三语齐备，不允许「非德语就用英语」的二选一回退，
// 否则中文站会出现整页英文。每条都写成 Record<Locale, string>，缺语言直接编译报错。
type Text = Record<Locale, string>;

export const UI = {
  // 通用
  home: { de: 'Startseite', en: 'Home', zh: '首页' } as Text,
  cart: { de: 'Warenkorb', en: 'Cart', zh: '购物车' } as Text,

  // 整车列表 /e-bikes
  catalogTitle: { de: 'Unsere E-Bikes', en: 'Our E-Bikes', zh: '整车系列' } as Text,

  // 商品详情 /e-bikes/[slug]
  availableConfigurations: { de: 'Verfügbare Konfigurationen', en: 'Available configurations', zh: '可选配置' } as Text,
  priceOnRequest: { de: 'Preis auf Anfrage', en: 'Price on request', zh: '价格面议' } as Text,
  availabilityUnknown: { de: 'Verfügbarkeit derzeit nicht verfügbar', en: 'Availability currently unavailable', zh: '暂时无法获取库存状态' } as Text,
  inStockGermany: { de: 'In Deutschland verfügbar', en: 'Available in Germany', zh: '德国地区有货' } as Text,
  outOfStock: { de: 'Derzeit nicht verfügbar', en: 'Currently unavailable', zh: '暂时缺货' } as Text,
  specifications: { de: 'Technische Daten', en: 'Specifications', zh: '技术参数' } as Text,
  showSpecifications: { de: 'Technische Daten anzeigen', en: 'View specifications', zh: '查看技术参数' } as Text,
  delivery: { de: 'Lieferung', en: 'Delivery', zh: '配送' } as Text,
  warranty: { de: 'Garantie', en: 'Warranty', zh: '质保' } as Text,
  relatedAccessories: { de: 'Passendes Zubehör', en: 'Compatible accessories', zh: '适配配件' } as Text,
  fitsThisModel: { de: 'Für dieses Modell geeignet', en: 'Fits this model', zh: '适用于本车型' } as Text,
  detailDescription: { de: 'Produktdetails', en: 'Product details', zh: '图文详情' } as Text,
  returns: { de: 'Rückgabe & Umtausch', en: 'Returns & exchanges', zh: '退换货政策' } as Text,
  other: { de: 'Weitere Informationen', en: 'Other information', zh: '其他说明' } as Text,
  reviews: { de: 'Kundenbewertungen', en: 'Customer reviews', zh: '用户评价' } as Text,
  noReviews: { de: 'Noch keine Bewertungen', en: 'No reviews yet', zh: '暂无评价' } as Text,
  brandReply: { de: 'Antwort von ALSVID:', en: 'ALSVID reply:', zh: 'ALSVID 回复：' } as Text,

  // 试骑预约 /test-ride
  testRide: { de: 'Probefahrt', en: 'Test ride', zh: '试骑预约' } as Text,
  testRideEyebrow: { de: 'PROBEFAHRT', en: 'TEST RIDE', zh: '试骑预约' } as Text,
  findLocation: { de: 'Finde einen ALSVID Standort', en: 'Find an ALSVID location', zh: '寻找 ALSVID 门店' } as Text,
  testRideLede: {
    de: 'Wende dich an einen veröffentlichten Vertriebspartner in deiner Nähe, um eine Probefahrt zu vereinbaren.',
    en: 'Contact a published ALSVID sales partner near you to arrange a test ride.',
    zh: '联系附近已上线的 ALSVID 授权门店，预约试骑。',
  } as Text,
  openMap: { de: 'Karte öffnen', en: 'Open map', zh: '打开地图' } as Text,
  noLocations: {
    de: 'Derzeit sind keine Standorte veröffentlicht.',
    en: 'No locations are currently published.',
    zh: '暂无已发布的门店。',
  } as Text,
};

export type { Text };
