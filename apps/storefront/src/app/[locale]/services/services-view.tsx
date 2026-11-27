'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { Locale } from '@/lib/alsvid-api';

interface ServicesViewProps {
  locale: Locale;
}

const I18N = {
  zh: {
    s01Eyebrow: 'SERVICE & SUPPORT',
    s01Title: '服务与支持',
    s01Sub: '从整车配置、使用指南到售后保障，ALSVID 官方团队时刻为您保驾护航',

    s02Heading: '产品支持',
    s02Sub: '选择您的车型，快速获取专属用户手册、安装教学与认证文档',
    manual: '产品说明书 (PDF)',
    video: '快速上手与折叠指引视频',
    techDoc: '欧盟 CE 认证与技术规格书',
    download: '下载资料 ↓',
    watch: '观看教程 →',

    s03Heading: '服务政策',
    s03Sub: '公开透明的保障承诺，保障欧洲本地车主的每一公里安心骑行',
    p1Title: '官方质保政策',
    p1Desc: '全碳纤维车架提供 5 年原厂质保；中置电机、高密度电池与智能电控系统提供 2 年欧洲本地联保服务。',
    p2Title: '欧洲本地配送政策',
    p2Desc: '德国法兰克福核心仓直发，德国境内及欧盟核心区支持免费送货上门，专业防震包装，出库后 48-72 小时送达。',
    p3Title: '退换货与零配件保障',
    p3Desc: '自签收之日起享受 14 天无理由退换货权益；原厂易损耗件与核心零配件常备现货，报修极速直发。',

    s04Heading: '常见问题 FAQ',
    tabs: ['全部', '产品使用', '电池与充电', '配送与售后'],
    faqs: [
      { cat: 1, q: 'ALSVID 电助力自行车单次充满电可以骑行多远？', a: '在标准助力模式下，A1 与 L1 系列综合续航为 80-100 公里，L1 PRO 旗舰款在中置电机与高效动能回收辅助下，最长可达 120 公里。' },
      { cat: 1, q: '整车折叠需要工具吗？需要多长时间？', a: '完全无需任何工具。采用专利双重磁吸自锁机构，只需“下压把立、折叠横梁、收缩座管”三步，仅需 10 秒即可轻松收纳。' },
      { cat: 2, q: '电池可以拆卸下来在室内单独充电吗？', a: '可以。座管/隐藏式电池支持钥匙快速解锁抽取，既可在车身直充，也可轻松带回室内或办公室独立充电，充满约需 3-4 小时。' },
      { cat: 2, q: '冬天低温会对电池寿命和续航有影响吗？', a: '锂电池在 0℃ 以下活性会略微降低，续航约下降 10-15%。ALSVID 配备智能 BMS 低温保护系统，建议在室内常温环境下进行充电。' },
      { cat: 3, q: '如果车辆在欧洲其他国家出现故障，该如何维修？', a: '您可以前往当地任意 ALSVID 官方授权服务中心享受联保。若所在城市暂无网点，可联系官方线上客服，我们将为您寄送原厂配件或安排就近合作车行检修。' },
      { cat: 3, q: '退换货流程是怎样的？', a: '请在签收 14 天内联系客服申请退换货，原包装保留完整即可安排物流上门取件。' }
    ],

    s05Heading: '联系与服务',
    s05Sub: '多样化的支持渠道，满足您的不同服务需求',
    c1Title: '联系客户服务',
    c1Desc: '工作日 09:00 - 18:00 (CET) 在线，解答选购、技术与订单咨询。',
    c1Btn: '发送邮件咨询 →',
    c2Title: '查找服务网点',
    c2Desc: '遍布德国、奥地利、瑞士的官方授权网点，提供面对面专业保养。',
    c2Btn: '查看网点地图 →',
    c3Title: '申请售后服务',
    c3Desc: '车辆出现异常？在线提交 VIN 码与故障说明，专属工程师快速响应。',
    c3Btn: '在线报修申请 →'
  },
  de: {
    s01Eyebrow: 'SERVICE & SUPPORT',
    s01Title: 'Service & Support',
    s01Sub: 'Von Betriebsanleitungen bis zur europäischen Herstellergarantie: Wir sind für Sie da.',

    s02Heading: 'Produktsupport',
    s02Sub: 'Wählen Sie Ihr Modell für Handbücher, Faltanleitungen und Zertifikate',
    manual: 'Bedienungsanleitung (PDF)',
    video: 'Videoanleitung zum schnellen Falten',
    techDoc: 'CE-Konformitätserklärung & Datenblatt',
    download: 'Herunterladen ↓',
    watch: 'Video ansehen →',

    s03Heading: 'Service-Richtlinien',
    s03Sub: 'Transparente Garantieleistungen für Ihre sorgenfreie Fahrt in ganz Europa',
    p1Title: 'Offizielle Herstellergarantie',
    p1Desc: '5 Jahre Garantie auf den Carbon-Rahmen; 2 Jahre europäische Garantie auf Motor, Akku und Steuerungselektronik.',
    p2Title: 'Versand & Lieferung',
    p2Desc: 'Direkt aus unserem Logistikzentrum in Frankfurt. Kostenlose Lieferung innerhalb Deutschlands in 48-72 Stunden.',
    p3Title: 'Rückgabe & Ersatzteilgarantie',
    p3Desc: '14 Tage gesetzliches Widerrufsrecht. Schnelle Verfügbarkeit aller Original-Ersatzteile direkt ab Zentrallager.',

    s04Heading: 'Häufig gestellte Fragen (FAQ)',
    tabs: ['Alle', 'Produktnutzung', 'Akku & Laden', 'Lieferung & Service'],
    faqs: [
      { cat: 1, q: 'Wie weit kann ich mit einer Akkuladung fahren?', a: 'Je nach Unterstützungsstufe liegt die Reichweite zwischen 80 und 100 km, beim L1 PRO mit Mittelmotor bis zu 120 km.' },
      { cat: 1, q: 'Benötige ich Werkzeug zum Zusammenklappen?', a: 'Nein, überhaupt kein Werkzeug. Der patentierte Faltmechanismus lässt sich in nur 3 Schritten und 10 Sekunden bedienen.' },
      { cat: 2, q: 'Kann der Akku zum Laden entnommen werden?', a: 'Ja, der Akku kann per Schlüssel entriegelt und bequem in der Wohnung oder im Büro geladen werden. Ladezeit ca. 3–4 Stunden.' },
      { cat: 2, q: 'Funktioniert der Akku auch im Winter zuverlässig?', a: 'Ja, das integrierte BMS schützt vor Unterkühlung. Bei Minusgraden empfehlen wir, den Akku bei Raumtemperatur zu laden.' },
      { cat: 3, q: 'Was mache ich bei einem Defekt im europäischen Ausland?', a: 'Sie können jeden autorisierten ALSVID Service-Partner aufsuchen oder sich an unseren Support für schnellen Ersatzteilversand wenden.' },
      { cat: 3, q: 'Wie läuft eine Rücksendung ab?', a: 'Innerhalb von 14 Tagen nach Erhalt können Sie sich an unseren Support wenden. Wir veranlassen eine bequeme Abholung.' }
    ],

    s05Heading: 'Kontakt & Hilfe',
    s05Sub: 'Schnelle und persönliche Hilfe durch unser Fachteam',
    c1Title: 'Kundenservice kontaktieren',
    c1Desc: 'Mo.–Fr. 09:00 – 18:00 Uhr (MEZ) per E-Mail und Telefon erreichbar.',
    c1Btn: 'E-Mail schreiben →',
    c2Title: 'Service-Partner finden',
    c2Desc: 'Finden Sie zertifizierte Partnerwerkstätten in Ihrer Umgebung.',
    c2Btn: 'Händlersuche öffnen →',
    c3Title: 'Reparaturanfrage stellen',
    c3Desc: 'Erfassen Sie Ihren Servicefall online mit Rahmennummer für schnellste Bearbeitung.',
    c3Btn: 'Reparatur anmelden →'
  },
  en: {
    s01Eyebrow: 'SERVICE & SUPPORT',
    s01Title: 'Service & Support',
    s01Sub: 'From user guides to warranty claims: our dedicated team is here to help you ride with confidence.',

    s02Heading: 'Product Support',
    s02Sub: 'Select your model to access official manuals, folding guides, and certificates',
    manual: 'User Manual (PDF)',
    video: 'Quick Start & Folding Tutorial',
    techDoc: 'CE Declaration of Conformity & Specs',
    download: 'Download PDF ↓',
    watch: 'Watch Video →',

    s03Heading: 'Service Policies',
    s03Sub: 'Transparent commitments ensuring peace of mind across Europe',
    p1Title: 'Warranty Policy',
    p1Desc: '5-year frame warranty. 2-year comprehensive coverage on motor, battery, and controller components across Europe.',
    p2Title: 'Shipping & Delivery',
    p2Desc: 'Dispatched directly from Frankfurt. Free delivery across Germany and EU main regions within 48 to 72 hours.',
    p3Title: 'Returns & Spare Parts',
    p3Desc: '14-day hassle-free return guarantee. Full warehouse stock of genuine replacement parts for immediate dispatch.',

    s04Heading: 'Frequently Asked Questions (FAQ)',
    tabs: ['All', 'Product Usage', 'Battery & Charging', 'Shipping & Service'],
    faqs: [
      { cat: 1, q: 'What is the riding range on a single charge?', a: 'Depending on assist levels and terrain, the range is 80-100 km, with up to 120 km on the flagship L1 PRO.' },
      { cat: 1, q: 'Are tools required to fold the bike?', a: 'No tools needed. The patented magnetic latch allows intuitive folding in 3 steps and under 10 seconds.' },
      { cat: 2, q: 'Can the battery be removed for indoor charging?', a: 'Yes, the battery unlocks with a key and can be charged on or off the bike in approximately 3 to 4 hours.' },
      { cat: 2, q: 'Does cold winter weather affect battery life?', a: 'Cold weather slightly reduces range. Our smart BMS protects cells; we recommend charging indoors at room temperature.' },
      { cat: 3, q: 'How do I get service if travelling abroad in Europe?', a: 'Visit any authorized ALSVID partner or contact our support team for expedited parts dispatch to your address.' },
      { cat: 3, q: 'How do returns work?', a: 'Contact support within 14 days of delivery. We will arrange prepaid pickup of the bike in its original packaging.' }
    ],

    s05Heading: 'Contact & Service Channels',
    s05Sub: 'Choose the most convenient way to connect with us',
    c1Title: 'Contact Customer Support',
    c1Desc: 'Monday to Friday 09:00 - 18:00 (CET) via email and hotline.',
    c1Btn: 'Send Message →',
    c2Title: 'Find Service Locations',
    c2Desc: 'Locate authorized service partners and certified dealers.',
    c2Btn: 'View Locations Map →',
    c3Title: 'Submit Warranty Request',
    c3Desc: 'Submit an online repair request with your bike VIN for priority assistance.',
    c3Btn: 'Request Service →'
  }
};

const MODELS = [
  { key: 'a1-ultra', name: 'A1 Ultra', badge: 'Flagship Carbon', slug: 'carbon-e-bike-klapprad-a1-ultra' },
  { key: 'l1-pro', name: 'L1 Pro', badge: 'Mid-Drive Motor', slug: 'carbon-e-bike-klapprad-mittelmotor-l1-pro' },
  { key: 'a1', name: 'A1', badge: 'Urban Classic', slug: 'carbon-e-bike-klapprad-a1' },
  { key: 'l1', name: 'L1', badge: 'Low Step-Through', slug: 'carbon-e-bike-klapprad-l1' },
];

export function ServicesView({ locale }: ServicesViewProps) {
  const t = I18N[locale] || I18N.zh;
  const [selectedModel, setSelectedModel] = useState('a1-ultra');
  const [activeTab, setActiveTab] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const filteredFaqs = activeTab === 0 ? t.faqs : t.faqs.filter(f => f.cat === activeTab);
  const activeModelObj = MODELS.find(m => m.key === selectedModel) || MODELS[0];

  return (
    <div className="services-page" style={{ color: '#111827', background: '#ffffff' }}>
      {/* ─── S01 · 服务与支持形象主视觉 ─── */}
      <section
        data-module-id="ALSVID-S01"
        style={{
          position: 'relative',
          padding: '88px 24px',
          textAlign: 'center',
          background: 'linear-gradient(180deg, #f4f7f5 0%, #ffffff 100%)',
          borderBottom: '1px solid #e5ebe7'
        }}
      >
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            {t.s01Eyebrow}
          </span>
          <h1 style={{ fontSize: 'clamp(34px, 5vw, 54px)', fontWeight: 800, margin: '14px 0 16px', letterSpacing: '-0.02em', color: '#111827' }}>
            {t.s01Title}
          </h1>
          <p style={{ fontSize: 17, color: '#526058', lineHeight: 1.6, margin: 0 }}>
            {t.s01Sub}
          </p>
        </div>
      </section>

      {/* ─── S02 · 产品支持（四款车型联动说明书/视频/技术资料） ─── */}
      <section data-module-id="ALSVID-S02" style={{ padding: '88px 24px', maxWidth: 1120, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 44 }}>
          <h2 style={{ fontSize: 'clamp(26px, 3.6vw, 36px)', fontWeight: 700, margin: '0 0 10px' }}>{t.s02Heading}</h2>
          <p style={{ fontSize: 15, color: '#667d70', margin: 0 }}>{t.s02Sub}</p>
        </div>

        {/* 车型切换 Tab */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 40 }}>
          {MODELS.map(m => (
            <button
              key={m.key}
              type="button"
              onClick={() => setSelectedModel(m.key)}
              style={{
                padding: '12px 28px',
                borderRadius: 24,
                border: selectedModel === m.key ? '2px solid #163826' : '1px solid #dce4de',
                background: selectedModel === m.key ? '#163826' : '#ffffff',
                color: selectedModel === m.key ? '#ffffff' : '#22382c',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {m.name}
            </button>
          ))}
        </div>

        {/* 车型支持资料三卡片 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
          <div style={{ padding: 28, background: '#f8faf9', border: '1px solid #e2e8e4', borderRadius: 12 }}>
            <span style={{ fontSize: 24, display: 'block', marginBottom: 12 }}>📄</span>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>{activeModelObj.name} · {t.manual}</h3>
            <p style={{ fontSize: 13, color: '#627269', lineHeight: 1.6, margin: '0 0 20px' }}>包含完整的安全须知、仪表设置说明、日常维护及质保细则（德文/英文双语版）。</p>
            <a href={`/${locale}/e-bikes/${activeModelObj.slug}`} style={{ color: '#163826', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>{t.download}</a>
          </div>

          <div style={{ padding: 28, background: '#f8faf9', border: '1px solid #e2e8e4', borderRadius: 12 }}>
            <span style={{ fontSize: 24, display: 'block', marginBottom: 12 }}>🎬</span>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>{activeModelObj.name} · {t.video}</h3>
            <p style={{ fontSize: 13, color: '#627269', lineHeight: 1.6, margin: '0 0 20px' }}>官方工程团队实拍演示，清晰讲解 3 步快速折叠、展开自检与踏频传感器灵敏度调校。</p>
            <a href={`/${locale}/e-bikes/${activeModelObj.slug}#overview`} style={{ color: '#163826', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>{t.watch}</a>
          </div>

          <div style={{ padding: 28, background: '#f8faf9', border: '1px solid #e2e8e4', borderRadius: 12 }}>
            <span style={{ fontSize: 24, display: 'block', marginBottom: 12 }}>🛡️</span>
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: '0 0 8px' }}>{activeModelObj.name} · {t.techDoc}</h3>
            <p style={{ fontSize: 13, color: '#627269', lineHeight: 1.6, margin: '0 0 20px' }}>通过欧洲 EN 15194 电助力自行车安全认证，含防电磁干扰测试报告与欧盟出海合格证。</p>
            <a href={`/${locale}/e-bikes/${activeModelObj.slug}#specs`} style={{ color: '#163826', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>{t.download}</a>
          </div>
        </div>
      </section>

      {/* ─── S03 · 服务政策（质保 / 配送 / 退换货 三栏网格） ─── */}
      <section data-module-id="ALSVID-S03" style={{ padding: '88px 24px', background: '#fafbfa', borderTop: '1px solid #edf2ee', borderBottom: '1px solid #edf2ee' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: 'clamp(26px, 3.6vw, 36px)', fontWeight: 700, margin: '0 0 10px' }}>{t.s03Heading}</h2>
            <p style={{ fontSize: 15, color: '#667d70', margin: 0 }}>{t.s03Sub}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 32 }}>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8e4', borderRadius: 12, padding: 32, boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: '#eaf4ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 16 }}>🛡️</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>{t.p1Title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#56665c', margin: 0 }}>{t.p1Desc}</p>
            </div>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8e4', borderRadius: 12, padding: 32, boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: '#eaf4ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 16 }}>📦</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>{t.p2Title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#56665c', margin: 0 }}>{t.p2Desc}</p>
            </div>
            <div style={{ background: '#ffffff', border: '1px solid #e2e8e4', borderRadius: 12, padding: 32, boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: '#eaf4ee', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 16 }}>🔄</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>{t.p3Title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.7, color: '#56665c', margin: 0 }}>{t.p3Desc}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── S04 · 常见问题 FAQ（分类 Tabs 与手风琴） ─── */}
      <section data-module-id="ALSVID-S04" style={{ padding: '88px 24px', maxWidth: 840, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 style={{ fontSize: 'clamp(26px, 3.6vw, 36px)', fontWeight: 700, margin: '0 0 10px' }}>{t.s04Heading}</h2>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
          {t.tabs.map((tab, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveTab(idx)}
              style={{
                padding: '8px 20px',
                borderRadius: 20,
                border: activeTab === idx ? '1px solid #163826' : '1px solid transparent',
                background: activeTab === idx ? '#edf5f0' : 'transparent',
                color: activeTab === idx ? '#163826' : '#5f6f66',
                fontWeight: activeTab === idx ? 700 : 500,
                fontSize: 14,
                cursor: 'pointer'
              }}
            >
              {tab}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {filteredFaqs.map((faq, idx) => {
            const isOpen = openFaq === idx;
            return (
              <div key={idx} style={{ border: '1px solid #e2e8e4', borderRadius: 8, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setOpenFaq(isOpen ? null : idx)}
                  style={{
                    width: '100%',
                    padding: '18px 20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: isOpen ? '#f9fbf9' : '#ffffff',
                    border: 'none',
                    textAlign: 'left',
                    cursor: 'pointer'
                  }}
                >
                  <strong style={{ fontSize: 15, color: '#16281e' }}>{faq.q}</strong>
                  <span style={{ fontSize: 18, color: '#7a8c82', marginLeft: 16 }}>{isOpen ? '−' : '+'}</span>
                </button>
                {isOpen && (
                  <div style={{ padding: '16px 20px 20px', background: '#ffffff', fontSize: 14, lineHeight: 1.7, color: '#56665c', borderTop: '1px solid #f0f4f1' }}>
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── S05 · 联系与服务通道 ─── */}
      <section data-module-id="ALSVID-S05" style={{ padding: '88px 24px', background: '#0e1812', color: '#ffffff' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: 'clamp(26px, 3.6vw, 36px)', fontWeight: 700, margin: '0 0 10px' }}>{t.s05Heading}</h2>
            <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.7)', margin: 0 }}>{t.s05Sub}</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 32 }}>
              <span style={{ fontSize: 24, display: 'block', marginBottom: 12 }}>💬</span>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{t.c1Title}</h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, margin: '0 0 20px' }}>{t.c1Desc}</p>
              <a href="mailto:service@alsvidbike.com" style={{ color: '#34d399', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>{t.c1Btn}</a>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 32 }}>
              <span style={{ fontSize: 24, display: 'block', marginBottom: 12 }}>📍</span>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{t.c2Title}</h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, margin: '0 0 20px' }}>{t.c2Desc}</p>
              <Link href={`/${locale}/dealers`} style={{ color: '#34d399', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>{t.c2Btn}</Link>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 32 }}>
              <span style={{ fontSize: 24, display: 'block', marginBottom: 12 }}>🔧</span>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>{t.c3Title}</h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, margin: '0 0 20px' }}>{t.c3Desc}</p>
              <Link href={`/${locale}/account`} style={{ color: '#34d399', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>{t.c3Btn}</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
