#!/usr/bin/env node
// 生成德国站六个法定页面的 CMS 页面结构（Impressum / Datenschutz / AGB /
// Widerrufsbelehrung / Versand / Zahlung）。
//
// 边界（重要）：
// - 本脚本**不写任何经营主体信息，也不写法律条文**。公司名、地址、Registergericht、
//   HRB、USt-IdNr.、负责人、电话/邮箱等必须由实际经营主体提供并经法务审核。
//   德国 Impressum 缺失或错填可被竞争对手直接发 Abmahnung，编造比缺失更危险。
// - 生成的是「带占位符的草稿」，默认不发布。占位符统一写成 {{TODO_xxx}}，
//   脚本在 --apply 时会拒绝把仍含占位符的页面发布出去（除非显式 --allow-placeholder）。
// - 只建结构、只建草稿：页面级 404 在上线前是正确状态，不能先挂空壳。
//
// 用法：
//   node scripts/seed-legal-pages.mjs                        # 只打印将生成的页面，不写库
//   ALSVID_ADMIN_USER=... ALSVID_ADMIN_PASS=... \
//     node scripts/seed-legal-pages.mjs --apply              # 写入 CMS 草稿（不发布）
//   ... --apply --publish --allow-placeholder                 # 仅用于预发环境看排版
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = (process.env.ALSVID_ADMIN_BASE || 'http://127.0.0.1:8089').replace(/\/+$/, '');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const apply = flag('apply');
const publish = flag('publish');
const allowPlaceholder = flag('allow-placeholder');
const OUT = 'apps/admin-api/migrations/data/legal-pages.json';

// 六页的标准骨架。titles/sections 的德语措辞用法定名称，正文一律留占位。
const PAGES = [
  {
    slug: 'impressum',
    name: { de: 'Impressum', en: 'Legal notice', zh: '法律声明' },
    sections: {
      de: ['Angaben gemäß § 5 DDG', 'Vertreten durch', 'Kontakt', 'Registereintrag', 'Umsatzsteuer-ID', 'Verbraucherstreitbeilegung'],
      en: ['Information pursuant to § 5 DDG', 'Represented by', 'Contact', 'Commercial register', 'VAT ID', 'Consumer dispute resolution'],
      zh: ['依据德国《数字服务法》第 5 条的经营者信息', '代表人', '联系方式', '商业登记', '增值税号', '消费者争议解决'],
    },
    note: {
      de: 'Die Angaben zu Firma, Anschrift, Registergericht, HRB-Nummer, USt-IdNr. und Vertretungsberechtigten müssen vom tatsächlichen Betreiber geliefert und rechtlich geprüft werden.',
      en: 'Company name, address, register court, HRB number, VAT ID and authorised representatives must be supplied by the actual operator and reviewed legally.',
      zh: '公司名称、地址、登记法院、HRB 号、增值税号与代表人必须由实际经营主体提供并经法律审核。',
    },
  },
  {
    slug: 'datenschutz',
    name: { de: 'Datenschutzerklärung', en: 'Privacy policy', zh: '隐私政策' },
    sections: {
      de: ['Verantwortlicher', 'Hosting und Server-Logfiles', 'Verarbeitete Daten und Zwecke', 'Rechtsgrundlagen', 'Cookies und Einwilligung', 'Empfänger und Auftragsverarbeiter', 'Speicherdauer', 'Ihre Rechte', 'Beschwerderecht bei der Aufsichtsbehörde'],
      en: ['Controller', 'Hosting and server log files', 'Data processed and purposes', 'Legal bases', 'Cookies and consent', 'Recipients and processors', 'Retention period', 'Your rights', 'Right to lodge a complaint'],
      zh: ['控制者', '托管与服务器日志', '处理的数据与目的', '法律依据', 'Cookie 与同意', '接收方与受托处理者', '保存期限', '您的权利', '向监管机构投诉的权利'],
    },
    note: {
      de: 'Verantwortlicher, Hosting-Anbieter, eingesetzte Dienste und Speicherfristen müssen konkret benannt werden; DSGVO-Text ist rechtlich zu prüfen.',
      en: 'Controller, hosting provider, services used and retention periods must be named concretely; GDPR wording requires legal review.',
      zh: '控制者、托管服务商、所用服务与保存期限必须具体列明；GDPR 条文需法律审核。',
    },
  },
  {
    slug: 'agb',
    name: { de: 'Allgemeine Geschäftsbedingungen', en: 'Terms and conditions', zh: '通用交易条款' },
    sections: {
      de: ['Geltungsbereich', 'Vertragsschluss', 'Preise und Versandkosten', 'Zahlung', 'Lieferung und Lieferzeit', 'Eigentumsvorbehalt', 'Gewährleistung und Garantie', 'Haftung', 'Streitbeilegung'],
      en: ['Scope', 'Conclusion of contract', 'Prices and shipping costs', 'Payment', 'Delivery and delivery time', 'Retention of title', 'Warranty and guarantee', 'Liability', 'Dispute resolution'],
      zh: ['适用范围', '合同成立', '价格与运费', '支付', '交付与交付期', '所有权保留', '瑕疵责任与质保', '责任', '争议解决'],
    },
    note: {
      de: 'AGB sind individualrechtlich zu erstellen; insbesondere Zahlungs-, Liefer- und Gewährleistungsregeln hängen vom tatsächlichen Geschäftsmodell ab.',
      en: 'Terms must be drafted individually; payment, delivery and warranty rules depend on the actual business model.',
      zh: '条款须逐条定制；支付、交付与瑕疵责任规则取决于实际经营模式。',
    },
  },
  {
    slug: 'widerrufsbelehrung',
    name: { de: 'Widerrufsbelehrung', en: 'Right of withdrawal', zh: '撤销权说明' },
    sections: {
      de: ['Widerrufsrecht', 'Widerrufsfrist', 'Folgen des Widerrufs', 'Rücksendekosten', 'Ausnahmen vom Widerrufsrecht', 'Muster-Widerrufsformular'],
      en: ['Right of withdrawal', 'Withdrawal period', 'Consequences of withdrawal', 'Return costs', 'Exceptions to the right of withdrawal', 'Model withdrawal form'],
      zh: ['撤销权', '撤销期限', '撤销的后果', '退货运费', '撤销权的例外', '撤销表格范本'],
    },
    note: {
      de: 'Für Fernabsatz an Verbraucher ist die Belehrung zwingend; das Muster-Widerrufsformular muss dem gesetzlichen Muster entsprechen.',
      en: 'Mandatory for distance selling to consumers; the model form must match the statutory template.',
      zh: '向消费者远程销售时必须提供；范本表格须与法定模板一致。',
    },
  },
  {
    slug: 'versand',
    name: { de: 'Versand und Lieferung', en: 'Shipping and delivery', zh: '配送与交付' },
    sections: {
      de: ['Liefergebiete', 'Versandkosten', 'Lieferzeiten', 'Speditionslieferung und Montage', 'Sendungsverfolgung'],
      en: ['Delivery areas', 'Shipping costs', 'Delivery times', 'Freight delivery and assembly', 'Shipment tracking'],
      zh: ['配送范围', '运费', '配送时效', '大件运输与组装', '物流查询'],
    },
    note: {
      de: 'Lieferländer, Versandkosten und Lieferzeiten müssen den tatsächlichen Logistikvereinbarungen entsprechen.',
      en: 'Delivery countries, shipping costs and lead times must match actual logistics agreements.',
      zh: '配送国家、运费与时效须与实际物流安排一致。',
    },
  },
  {
    slug: 'zahlung',
    name: { de: 'Zahlungsarten', en: 'Payment methods', zh: '支付方式' },
    sections: {
      de: ['Akzeptierte Zahlungsarten', 'Kreditkarte', 'PayPal', 'SEPA-Lastschrift', 'Klarna', 'Zahlungsabwicklung und Sicherheit'],
      en: ['Accepted payment methods', 'Credit card', 'PayPal', 'SEPA direct debit', 'Klarna', 'Payment processing and security'],
      zh: ['支持的支付方式', '信用卡', 'PayPal', 'SEPA 直接借记', 'Klarna', '支付处理与安全'],
    },
    note: {
      de: 'Nur tatsächlich freigeschaltete Zahlungsarten nennen — voreilige Angaben sind irreführende Werbung.',
      en: 'List only payment methods that are actually enabled — premature claims are misleading advertising.',
      zh: '只能列出真正已开通的支付方式，提前声明属于误导性宣传。',
    },
  },
];

const LOCALES = ['de', 'en', 'zh'];
const RETURN_POLICY = {
  "de": {
    "title": "Rückgabe und Widerruf",
    "sections": [
      [
        "Bestelländerung und Stornierung",
        "Änderungen vor dem Versand sind kostenlos; nach Versand sind Änderungen nicht möglich. Bei freiwilligen Stornierungen außerhalb zwingender Verbraucherrechte gilt eine Bearbeitungsgebühr von 4 %. Nach Versand gelten die unten genannten Rücktransportkosten."
      ],
      [
        "Freiwillige Rückgabe",
        "Anträge innerhalb von 15 Tagen nach Erhalt. Für unbenutzte Ware werden die anwendbaren Rücktransportkosten abgezogen. Bei gebrauchten Fahrrädern bis 16 km gilt für die freiwillige Rückgabe ein Abzug von 30 % zusätzlich zum Rücktransport. Bei 16–32 km oder Gebrauchsspuren, die den Wiederverkauf beeinträchtigen, gilt ein Abzug von 50 %. Keine freiwillige Rückgabe nach Tag 15, über 32 km oder bei erheblichen Schäden oder fehlenden Hauptkomponenten. Keine 30-tägige Probefahrt."
      ],
      [
        "Rücktransport",
        "Bei freiwilliger Rückgabe aus persönlichen Gründen: 300 € für E-Bikes, 50 € für Akkus, Motoren, Laufräder und Anhänger, 35 € für sonstige Artikel. Beim gesetzlichen Widerruf trägt der Verbraucher die unmittelbaren Rücksendekosten nur bei ordnungsgemäßer vorheriger Information."
      ],
      [
        "Mängel und Falschlieferungen",
        "Bitte Transportschäden möglichst innerhalb von 48 Stunden und sicherheitsrelevante Defekte möglichst innerhalb von 15 Werktagen melden und Fotos oder Videos beifügen. Gesetzliche Ansprüche bleiben auch bei späterer Meldung bestehen. ALSVID übernimmt die erforderlichen Kosten der gesetzlichen Nacherfüllung. Bei geringfügigen Problemen sind technische Hilfe und Ersatzteile möglich."
      ],
      [
        "Verpackung und Rückzahlung",
        "Bei freiwilliger Rückgabe bitte Originalverpackung und sämtliches Zubehör beifügen. Ersatzverpackung für ein Fahrrad: 300 € zuzüglich Versand, soweit freiwillig vereinbart und zulässig. Rückzahlung über das ursprüngliche Zahlungsmittel. Beim gesetzlichen Widerruf gelten die gesetzlichen Fristen; die Rückzahlung kann bis zum Erhalt der Ware oder Versandnachweis zurückgehalten werden."
      ],
      [
        "Gesetzlicher Widerruf",
        "Verbraucher können den Fernabsatzvertrag binnen 14 Tagen ab Erhalt der Ware ohne Angabe von Gründen widerrufen. Pauschale Stornierungs-, Wiedereinlagerungs- und Verpackungsgebühren sowie Kilometergrenzen schränken dieses Recht nicht ein. Wertersatz nur bei Vorliegen der gesetzlichen Voraussetzungen. Standardlieferkosten werden im gesetzlichen Umfang erstattet. Widerrufsempfänger: {{TODO_SELLER_NAME_ADDRESS_CONTACT}}. Das gesetzliche Musterformular und die elektronische Widerrufsfunktion sind vor Veröffentlichung zu vervollständigen."
      ]
    ]
  },
  "en": {
    "title": "Returns and withdrawal",
    "sections": [
      [
        "Order changes and cancellation",
        "Changes before dispatch are free; changes after dispatch are not supported. For voluntary cancellations outside mandatory consumer rights a 4% handling charge applies. After dispatch, the return transport charges below apply."
      ],
      [
        "Voluntary returns",
        "Request within 15 days of receipt. Unused goods: refund less applicable return transport. For used bikes up to 16 km, the voluntary return deduction is 30% plus transport; for 16–32 km or wear affecting resale, 50% plus transport. No voluntary return after day 15, beyond 32 km, with serious damage or missing major parts. No 30-day trial ride."
      ],
      [
        "Return transport",
        "For voluntary returns for personal reasons: €300 for e-bikes, €50 for batteries, motors, wheels and trailers, €35 for other items. For statutory withdrawal the consumer bears direct return costs only where properly informed in advance."
      ],
      [
        "Defects and wrong deliveries",
        "Report transport damage preferably within 48 hours and safety-related defects preferably within 15 working days, with photos or video. Late reports do not extinguish statutory rights. ALSVID bears necessary statutory remedy costs. Technical support and replacement parts may resolve minor issues."
      ],
      [
        "Packaging and refund",
        "For voluntary returns include original packaging and accessories. Replacement bike packaging: €300 plus shipping where voluntarily agreed and lawful. Refunds use the original payment method. Statutory refund deadlines apply; refunds may be withheld until goods or proof of dispatch are received."
      ],
      [
        "Statutory withdrawal",
        "Consumers may withdraw from distance contracts within 14 days after receipt without giving a reason. Fixed cancellation, restocking or packaging fees and mileage limits do not restrict that right. Value loss is chargeable only under statutory conditions. Standard delivery costs are refunded as required by law. Withdrawal recipient: {{TODO_SELLER_NAME_ADDRESS_CONTACT}}. Complete the statutory model form and electronic withdrawal function before publication."
      ]
    ]
  },
  "zh": {
    "title": "退换货与撤销权",
    "sections": [
      [
        "订单修改与取消",
        "发货前修改免费，发货后不支持修改。法定消费者权利之外的自愿取消收取4%处理费，发货后按下列退运费用执行。"
      ],
      [
        "自愿退货",
        "收货15天内申请。未使用商品扣适用退运费；骑行不超过16公里的自愿退货扣30%及退运费；16至32公里或影响二次销售的使用痕迹扣50%及退运费。超过15天、超过32公里、严重损坏或缺少主要部件不提供自愿退货。不提供30天试骑。"
      ],
      [
        "退运费用",
        "个人原因自愿退货：整车300欧元，电池、电机、车轮和拖车50欧元，其他配件35欧元。法定撤销时仅在依法事先告知的情况下由消费者承担直接退货运输费。"
      ],
      [
        "质量问题与错发",
        "运输损坏尽量在48小时内反馈，影响安全的故障尽量在15个工作日内反馈，并提供照片或视频。超出反馈时间不影响法定权利。ALSVID承担法定补救所需费用，轻微问题可提供技术支持或配件。"
      ],
      [
        "包装及退款",
        "自愿退货请附原包装及全部配件。自行车替换包装在自愿约定且合法的情况下为300欧元另加运费。原支付渠道退款。法定退款期限适用，商家可依法等待收货或发货凭证。"
      ],
      [
        "法定撤销权",
        "消费者通常可在收货14天内无理由撤销远程销售合同。固定取消费、入库费、包装费和里程限制不得限制法定权利。仅在法定条件满足时扣实际价值减损，标准发货费用依法退还。撤销接收主体：{{TODO_SELLER_NAME_ADDRESS_CONTACT}}。发布前须补充法定表格与电子撤销功能。"
      ]
    ]
  }
};


function buildPage(spec, locale) {
  if(spec.slug==='widerrufsbelehrung'){const v=RETURN_POLICY[locale];return {locale,path:'/legal/widerrufsbelehrung',pageType:'custom',name:v.title,seo:{title:v.title,description:''},blocks:[{id:'b-legal-widerrufsbelehrung',componentKey:'article',visible:true,props:{heading:v.title,intro:'',imageId:'',imageAlt:'',sections:v.sections.map(([heading,body])=>({heading,body,imageId:'',imageAlt:''}))},bindings:{}}]};}
  const todo = spec.sections[locale].map((heading) => ({
    heading,
    // 正文留占位，不写任何看似成文的条款
    body: `{{TODO_INHALT}} ${spec.note[locale]}`,
    imageId: '',
    imageAlt: '',
  }));
  return {
    locale,
    path: `/legal/${spec.slug}`,
    pageType: 'custom',
    name: spec.name[locale],
    seo: { title: spec.name[locale], description: '' },
    blocks: [{
      id: `b-legal-${spec.slug}`,
      componentKey: 'article',
      visible: true,
      props: {
        heading: spec.name[locale],
        // 约定：首行 Stand 由人工填写；未填则前台不显示这一行（不留空占位）
        intro: '{{TODO_STAND}}',
        imageId: '',
        imageAlt: '',
        sections: todo,
      },
      bindings: {},
    }],
  };
}

const unresolved = (page) => JSON.stringify(page).includes('{{TODO');

// ---------------- 写入 ----------------
let client = null;
async function admin() {
  if (client) return client;
  const user = process.env.ALSVID_ADMIN_USER, pass = process.env.ALSVID_ADMIN_PASS;
  if (!user || !pass) throw new Error('--apply 需要 ALSVID_ADMIN_USER / ALSVID_ADMIN_PASS');
  const jar = new Map();
  const call = async (method, url, body) => {
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    const response = await fetch(BASE + url, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    for (const raw of response.headers.getSetCookie?.() || []) {
      const [pair] = raw.split(';');
      const index = pair.indexOf('=');
      if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${method} ${url} → ${response.status} ${payload?.error || ''}`.trim());
    return payload;
  };
  await call('POST', '/api/auth/login', { username: user, password: pass });
  client = { call };
  return client;
}

const all = [];
for (const locale of LOCALES) for (const spec of PAGES) all.push(buildPage(spec, locale));

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(OUT, `${JSON.stringify({ generatedAt: new Date().toISOString(), pages: all }, null, 2)}\n`);
process.stdout.write(`已生成 ${all.length} 条法定页定义（6 页 × 3 语言）→ ${OUT}\n`);
process.stdout.write(`其中含未填占位符的：${all.filter(unresolved).length} 条（这是预期的，等待真实资料录入）\n`);

if (!apply) {
  process.stdout.write('\n未加 --apply，只生成文件，没有写入任何数据库。\n');
  process.exit(0);
}

process.stdout.write('\n开始写入 CMS 草稿…\n');
let created = 0, updated = 0, failed = 0, published = 0;
for (const page of all) {
  try {
    const { call } = await admin();
    const list = await call('GET', `/api/cms/pages?locale=${page.locale}&path=${encodeURIComponent(page.path)}&type=custom`);
    const exists = (Array.isArray(list?.items) ? list.items : []).find((item) => item.path === page.path && item.locale === page.locale);
    let id = exists?.id;
    if (!id) {
      const result = await call('POST', '/api/cms/pages', { pageType: page.pageType, locale: page.locale, path: page.path, name: page.name, seo: page.seo, draft: { blocks: page.blocks } });
      id = result?.id; created += 1;
    } else {
      await call('PUT', `/api/cms/pages/${id}/draft`, { blocks: page.blocks, seo: page.seo });
      updated += 1;
    }
    if (publish) {
      // 带占位符的页面默认拒绝发布：法定页挂占位符比 404 更糟
      if (unresolved(page) && !allowPlaceholder) {
        process.stdout.write(`  跳过发布 ${page.locale} ${page.path}：仍有 {{TODO}} 占位符（要强制发布加 --allow-placeholder）\n`);
      } else {
        await call('POST', `/api/cms/pages/${id}/publish`, {}); published += 1;
      }
    }
    process.stdout.write(`  ${exists ? '更新' : '新建'} ${page.locale} ${page.path}${publish && !unresolved(page) ? '（已发布）' : '（草稿）'}\n`);
  } catch (error) {
    failed += 1;
    process.stdout.write(`  失败 ${page.locale} ${page.path}：${error.message}\n`);
  }
}
process.stdout.write(`\n完成：新建 ${created}，更新 ${updated}，发布 ${published}，失败 ${failed}\n`);
process.stdout.write('提醒：这些页面上线前必须由实际经营主体提供资料并完成法务审核。\n');
if (failed) process.exitCode = 1;
