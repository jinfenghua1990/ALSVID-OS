import type { CatalogProduct, Locale, Offer, ProductAvailability } from './alsvid-api';

export function getA1UltraStaticProduct(locale: Locale): {
  product: CatalogProduct;
  offers: Offer[];
  availability: ProductAvailability;
} {
  const isZh = locale === 'zh';
  const isDe = locale === 'de';

  const title = isZh
    ? 'ALSVID A1 Ultra 旗舰款碳纤维折叠电助力车'
    : isDe
      ? 'ALSVID A1 Ultra Flaggschiff Carbon-Klapprad E-Bike'
      : 'ALSVID A1 Ultra Flagship Carbon Folding E-Bike';

  const description = isZh
    ? '为自由而生。低跨点高模量一体碳纤维车架、DNM 气压中置避震、隐藏式 36V 10Ah 快拆座管电池，整车净重仅 14.5 kg，10 秒 3 步紧凑折叠。'
    : isDe
      ? 'Für Freiheit entwickelt. Low-Step Carbonrahmen, integrierter 36V 10Ah Sattelstützen-Akku, DNM Luftdämpfer. Nur 14,5 kg Gesamtgewicht, 10-Sekunden Kompaktfaltung.'
      : 'Engineered for freedom. Low-step carbon frame, hidden 36V 10Ah seatpost battery, DNM air shock. Just 14.5 kg total weight with 10-second ultra-compact fold.';

  const product: CatalogProduct = {
    id: 'prod-a1-ultra-flagship',
    productId: 'ALS-A1-ULTRA-01',
    slug: 'carbon-e-bike-klapprad-a1-ultra',
    kind: 'vehicle',
    model: 'A1 Ultra',
    title,
    description,
    delivery: isZh ? '德国本土及欧洲全境包邮，专业防震整车箱发货，预计 4–6 周交付。' : isDe ? 'Kostenloser Versand in Deutschland & EU, stoßfest verpackt, ca. 4–6 Wochen Lieferzeit.' : 'Free shipping within Germany & EU, shockproof boxed, estimated 4–6 weeks delivery.',
    warranty: isZh ? '碳纤维车架 5 年质保，电池与电机 2 年原厂联保，全德售后网络支持。' : isDe ? '5 Jahre Rahmengarantie, 2 Jahre Garantie auf Motor & Akku, bundesweiter Service.' : '5-year frame warranty, 2-year battery & motor warranty, European service network.',
    languages: ['zh', 'de', 'en'],
    images: [
      { id: 'img-a1u-side-trans', url: '/images/a1-ultra/a1-ultra-side-transparent-4k.png' },
      { id: 'img-a1u-studio-kv', url: '/images/a1-ultra/a1-ultra-studio-kv-4k.jpg' },
      { id: 'img-a1u-tech-beam', url: '/images/a1-ultra/a1-ultra-tech-beam-kv-4k.jpg' },
      { id: 'img-a1u-europe-kv', url: '/images/a1-ultra/a1-ultra-europe-street-kv-4k.jpg' },
      { id: 'img-a1u-raw-proto', url: '/images/a1-ultra/a1-ultra-prototype-raw.jpg' },
    ],
    prices: [
      { currency: 'EUR', unitPrice: '1899.00', referencePrice: '2299.00' },
    ],
    specifications: [
      { label: isZh ? '车架材质' : isDe ? 'Rahmenmaterial' : 'Frame Material', value: isZh ? '东丽 T800 高模量碳纤维 一体成型' : isDe ? 'Toray T800 Carbon Monocoque' : 'Toray T800 Monocoque Carbon' },
      { label: isZh ? '折叠尺寸' : isDe ? 'Faltmaß' : 'Folded Dimensions', value: '85 × 69 × 48 cm' },
      { label: isZh ? '折叠时间' : isDe ? 'Faltzeit' : 'Folding Time', value: '~10 秒' },
      { label: isZh ? '整车净重' : isDe ? 'Gesamtgewicht' : 'Total Weight', value: '14.5 kg (皮带版) / 15.5 kg (链条版)' },
      { label: isZh ? '动力电机' : isDe ? 'Motor' : 'Electric Motor', value: isZh ? '36V 250W 高扭矩无刷后轮毂电机 (合规 25 km/h)' : isDe ? '36V 250W Bürstenloser Heckmotor (25 km/h)' : '36V 250W Brushless Rear Hub Motor (25 km/h)' },
      { label: isZh ? '动力电池' : isDe ? 'Batterie' : 'Battery', value: isZh ? '36V 10Ah (360Wh) 隐藏式快拆座管电池' : isDe ? '36V 10Ah (360Wh) Integrierter Sattelstützen-Akku' : '36V 10Ah (360Wh) Hidden Seatpost Battery' },
      { label: isZh ? '纯电/助力续航' : isDe ? 'Reichweite' : 'Assisted Range', value: isZh ? '最大助力 80 km (受路况与体重影响)' : isDe ? 'Bis zu 80 km Reichweite' : 'Up to 80 km pedal-assist range' },
      { label: isZh ? '减震系统' : isDe ? 'Federung' : 'Suspension', value: isZh ? '隐藏式前叉内置减震 + DNM 气压中置后避震' : isDe ? 'Interne Carbon-Gabeldämpfung + DNM Luftdämpfer hinten' : 'Integrated Fork Damping + DNM Rear Air Shock' },
      { label: isZh ? '传动系统' : isDe ? 'Antrieb' : 'Drivetrain', value: isZh ? '碳纤维静音皮带 或 Shimano 7速变速系统' : isDe ? 'Carbon-Riemenantrieb oder Shimano 7-Gang' : 'Gates Carbon Belt or Shimano 7-Speed' },
      { label: isZh ? '制动刹车' : isDe ? 'Bremsen' : 'Brakes', value: isZh ? '前后双液压矿物油碟刹 (带断电保护)' : isDe ? 'Hydraulische Scheibenbremsen vorne & hinten' : 'Front & Rear Hydraulic Disc Brakes' },
      { label: isZh ? '轮圈轮胎' : isDe ? 'Reifen' : 'Tyres', value: '20 × 2.125 城市低滚阻防刺胎' },
      { label: isZh ? '合规标准' : isDe ? 'Zertifizierung' : 'Compliance', value: '欧盟 EN15194 · 德国 StVZO · CE 认证 · IPX6 防水' },
      { label: isZh ? '最大承重' : isDe ? 'Max. Zuladung' : 'Max Payload', value: '120 kg' },
    ],
    specs: {
      folding_time: '~10s',
      folded_size: '85 × 69 × 48 cm',
      weight_belt: '14.5',
      weight_chain: '15.5',
      wheel_size: '20"',
      dimensions: '150 × 65 × 110 cm',
    },
    detailBlocks: [
      {
        type: 'image',
        url: '/images/a1-ultra/a1-ultra-studio-kv-4k.jpg',
        title: isZh ? '极简科技 · 40cm 低跨点碳纤维折叠架构' : isDe ? 'Tiefeinstieg & Monocoque Carbon-Architektur' : 'Minimalist Low-Step Carbon Folding Architecture',
        subtitle: isZh ? '工业暗调影棚 · 真实实车还原' : isDe ? 'Industrie-Studio · Reales Fahrzeug' : 'Studio Dark · Authentic Vehicle',
        caption: isZh ? '采用一体模压碳纤维车身，无外露焊接点。40cm 超低跨点无论是日常通勤还是休闲代步均能轻松上下车。' : isDe ? 'Nahtloser Carbonrahmen ohne Schweißnähte. 40 cm Tiefeinstieg für bequemes Auf- und Absteigen.' : 'Seamless monocoque carbon with zero weld marks. 40cm low-step allows graceful mounting in business or casual attire.',
        fit: 'cover',
        background: 'solid',
        backgroundColor: '#0d1217',
        textColor: '#ffffff',
      },
      {
        type: 'image',
        url: '/images/a1-ultra/a1-ultra-tech-beam-kv-4k.jpg',
        title: isZh ? '隐藏式电气矩阵 · 360Wh 高能座管电池' : isDe ? 'Versteckte Elektrik · 360Wh Hochleistungs-Akku' : 'Concealed Electrical Matrix · 360Wh High-Density Battery',
        subtitle: isZh ? '80 km 助力巡航里程' : isDe ? 'Bis zu 80 km Reichweite' : '80 km pedal assist range',
        caption: isZh ? '电池与座管浑然一体，支持整车直接充电或单独拔出座管充电；配备精密防盗电源锁，安全便捷。' : isDe ? 'Der Akku ist unsichtbar in der Sattelstütze integriert – direkt am Rad oder separat im Büro ladbar.' : 'Seamlessly integrated into the seatpost. Charge on the bike or detach easily to charge anywhere.',
        fit: 'cover',
        background: 'solid',
        backgroundColor: '#080d14',
        textColor: '#ffffff',
      },
      {
        type: 'image',
        url: '/images/a1-ultra/a1-ultra-europe-street-kv-4k.jpg',
        title: isZh ? '欧洲街景通勤 · 全地形双重气压减震' : isDe ? 'Urbaner Komfort · Doppelte Federung' : 'European Urban Riding · Dual Shock Absorption',
        subtitle: isZh ? '石板路与颠簸路面的从容之选' : isDe ? 'Souverän auf Kopfsteinpflaster' : 'Effortless on cobblestones and urban pavements',
        caption: isZh ? '全碳纤维前叉内置液压缓冲，配合后部 DNM 可调气压后避震，过滤路面高频振动，提供魔毯般的骑行质感。' : isDe ? 'Integrierte Federgabel vorne und DNM Luftdämpfer hinten für maximalen Fahrkomfort.' : 'Integrated hydraulic front fork damping paired with DNM adjustable rear air shock creates a magic-carpet ride.',
        fit: 'cover',
        background: 'solid',
        backgroundColor: '#0f1715',
        textColor: '#ffffff',
      },
    ],
    design: {
      purchaseVisible: true,
      coreVisible: true,
      background: '#0d1217',
      visibility: {
        P01: true,
        P02: true,
        P04: true,
        P05: true,
        P06: true,
        P08: true,
        P09: true,
        P10: true,
        P11: true,
      },
      faq: [
        {
          question: isZh ? 'A1 Ultra 是否符合欧洲及德国道路交通法规？' : isDe ? 'Ist das A1 Ultra für den deutschen Straßenverkehr (StVZO) zugelassen?' : 'Does the A1 Ultra comply with European e-bike regulations?',
          answer: isZh ? '完全合规。本车专为欧洲市场打造，限速 25 km/h，电机功率 250W，无油门把手，出厂符合欧盟 EN15194 与德国 StVZO 道路标准。' : isDe ? 'Ja. Das Rad entspricht voll der EN15194 und StVZO (250W Nenndauerleistung, Unterstützung bis 25 km/h, kein reiner Gasgriff).' : 'Yes. Fully compliant with EU EN15194 and German StVZO (250W motor, pedal-assist up to 25 km/h, no throttle).',
        },
        {
          question: isZh ? '座管电池如何防盗与充电？' : isDe ? 'Wie wird der Sattelstützen-Akku geladen und vor Diebstahl geschützt?' : 'How is the seatpost battery charged and secured against theft?',
          answer: isZh ? '座管内置机械防盗钥匙锁，锁闭后无法拔出座管。充电接口既位于座管底部便于在车上直充，也可解锁后将座管带回室内充电。' : isDe ? 'Der Akku verfügt über ein Sicherheitsschloss. Er kann direkt am Fahrrad oder separat in der Wohnung geladen werden.' : 'Features a dedicated physical key lock preventing unauthorized detachment. Can be charged on-bike or removed.',
        },
        {
          question: isZh ? '折叠后体积多大？能否放入汽车后备箱？' : isDe ? 'Passt das gefaltete Rad in den Kofferraum?' : 'What is the folded size? Does it fit into a car trunk?',
          answer: isZh ? '折叠尺寸仅 85 × 69 × 48 cm，可轻松放入各类轿车、SUV 后备箱，或带入电梯、办公室与欧洲公共交通。' : isDe ? 'Mit 85 × 69 × 48 cm Faltmaß passt es problemlos in gängige Kofferräume und den ÖPNV.' : 'Folded size is 85 × 69 × 48 cm, fitting easily into compact sedans, SUVs, elevators and public trains.',
        },
      ],
    },
  };

  const offers: Offer[] = [
    {
      sku: 'ALS-A1U-TITANIUM-BELT',
      spec: isZh ? '钛银款 · 碳纤维皮带单速版' : isDe ? 'Titan-Silber · Carbon-Riemen' : 'Titanium Silver · Belt Drive',
      color: isZh ? '钛银灰' : isDe ? 'Titan-Silber' : 'Titanium Silver',
      currency: 'EUR',
      unitPrice: '1899.00',
    },
    {
      sku: 'ALS-A1U-TITANIUM-CHAIN',
      spec: isZh ? '钛银款 · Shimano 7速变速链条版' : isDe ? 'Titan-Silber · Shimano 7-Gang' : 'Titanium Silver · Shimano 7-Speed',
      color: isZh ? '钛银灰' : isDe ? 'Titan-Silber' : 'Titanium Silver',
      currency: 'EUR',
      unitPrice: '1999.00',
    },
  ];

  const availability: ProductAvailability = {
    available: true,
    items: [
      { sku: 'ALS-A1U-TITANIUM-BELT', available: true },
      { sku: 'ALS-A1U-TITANIUM-CHAIN', available: true },
    ],
  };

  return { product, offers, availability };
}
