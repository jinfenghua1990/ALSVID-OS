'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import type { Locale } from '@/lib/alsvid-api';

interface DealersViewProps {
  locale: Locale;
}

const I18N = {
  zh: {
    heroEyebrow: 'GLOBAL DEALERS',
    heroTitle: 'ALSVID 全球经销商网络',
    heroLede: '查找附近的 ALSVID 官方授权体验店与服务中心，或了解如何在您的区域成为官方合作伙伴。',
    btnBecomeDealer: '成为经销商 ↓',
    btnFindDealer: '查找经销商 ↓',

    advantagesHeading: '为什么与 ALSVID 携手',
    advantagesSub: '依托卓越工程技术与欧洲本地化交付体系，赋能每一位商业合作伙伴',
    adv1Title: '欧洲本地仓直发',
    adv1Desc: '德国法兰克福核心仓现货直发，整车及配件 48-72 小时快速交付，极大降低资金与库存周转压力。',
    adv2Title: '整车高品质与高毛利',
    adv2Desc: '航空碳纤维车架与专利折叠结构，结合严格的德国研发标准与统一零售控价，保障充裕盈利空间。',
    adv3Title: '严格区域保护机制',
    adv3Desc: '遵循规范的商圈及区域独家授权规则，杜绝恶性价格内卷，保障长期稳定经营效益。',
    adv4Title: '官方技术与售后赋能',
    adv4Desc: '专业原厂工程团队提供维修培训支持，核心零部件 2 年质保，质保期内零配件极速索赔调拨。',

    partnerHeading: '经销商合作中心',
    partnerSub: '无论是新伙伴申请入驻，还是已签约伙伴开展业务，均可由此开启',
    applyCardTitle: '申请合作',
    applyCardDesc: '欢迎拥有自行车、电动出行或高端户外生活方式经验的经营者加入 ALSVID 全球网络。',
    applyBtn: '申请合作 →',
    applyFormTitle: '提交商业合作申请',
    applySuccess: '申请已成功提交！我们的商务团队将在 2 个工作日内通过邮件或电话与您联系。',
    portalCardTitle: '经销商业务中心',
    portalCardDesc: '已签约合作伙伴专用系统。支持在线批量订货、物流跟踪、车辆 VIN 管理与对账。',
    portalBtn: '经销商登录 →',

    searchHeading: '全球经销商与服务中心查询',
    searchSub: '体验 ALSVID 纯粹电助力骑行质感，感受秒级折叠与轻量化工程美学',
    filterAllCountries: '全部国家 / 地区',
    filterDE: '德国 🇩🇪 (Deutschland)',
    filterAT: '奥地利 🇦🇹 (Österreich)',
    filterCH: '瑞士 🇨🇭 (Schweiz)',
    filterFR: '法国 🇫🇷 (France)',
    searchPlaceholder: '输入城市、地区或邮编搜索…',
    noStoreNotice: '当前城市暂无展示门店，欢迎在线预约流动试骑，或申请成为当地授权服务商。',
    bookTestRide: '预约到店试骑',
    directions: '地图导航',
    storeStatus: '官方认证体验店',
  },
  de: {
    heroEyebrow: 'GLOBAL DEALERS',
    heroTitle: 'ALSVID Händlernetzwerk',
    heroLede: 'Finden Sie einen autorisierten ALSVID Showroom in Ihrer Nähe oder werden Sie exklusiver Partner in Ihrer Region.',
    btnBecomeDealer: 'Händler werden ↓',
    btnFindDealer: 'Händler finden ↓',

    advantagesHeading: 'Ihre Vorteile als ALSVID Partner',
    advantagesSub: 'Erstklassige Ingenieurskunst kombiniert mit europäischer Logistik und verlässlicher Partnerschaft',
    adv1Title: 'Europäisches Zentrallager',
    adv1Desc: 'Direktlieferung aus Frankfurt am Main innerhalb von 48 bis 72 Stunden. Minimieren Sie Ihr Lagerrisiko.',
    adv2Title: 'Hohe Margen & Preisstabilität',
    adv2Desc: 'Premium Carbon-Falträder mit geschützter Preispolitik für nachhaltig planbare Rentabilität.',
    adv3Title: 'Exklusiver Gebietsschutz',
    adv3Desc: 'Faire Standortplanung und verlässlicher Gebietsschutz für eine langfristige partnerschaftliche Entwicklung.',
    adv4Title: 'Technischer Support & Garantie',
    adv4Desc: 'Werksschulungen, schnelle Ersatzteilversorgung und 2 Jahre Garantie direkt durch unser deutsches Fachteam.',

    partnerHeading: 'Partner & Händler-Portal',
    partnerSub: 'Zugang für Bewerber und bestehende Vertriebspartner',
    applyCardTitle: 'Partnerschaft anfragen',
    applyCardDesc: 'Erweitern Sie Ihr Portfolio um leichte, smarte E-Bikes. Wir freuen uns auf Ihre Bewerbung.',
    applyBtn: 'Jetzt bewerben →',
    applyFormTitle: 'Händleranfrage einreichen',
    applySuccess: 'Vielen Dank! Ihre Anfrage wurde übermittelt. Unser B2B-Team meldet sich innerhalb von 48 Stunden.',
    portalCardTitle: 'B2B Händler-Portal',
    portalCardDesc: 'Für autorisierte Händler: Schnelle Sammelbestellungen, VIN-Zuweisung, Tracking und Rechnungen.',
    portalBtn: 'Händler-Login →',

    searchHeading: 'Händlersuche & Probefahrten',
    searchSub: 'Erleben Sie ALSVID E-Bikes live vor Ort bei unseren zertifizierten Fachhändlern',
    filterAllCountries: 'Alle Länder / Regionen',
    filterDE: 'Deutschland 🇩🇪',
    filterAT: 'Österreich 🇦🇹',
    filterCH: 'Schweiz 🇨🇭',
    filterFR: 'Frankreich 🇫🇷',
    searchPlaceholder: 'Stadt oder Postleitzahl eingeben…',
    noStoreNotice: 'Noch kein Händler in Ihrer Stadt? Buchen Sie eine mobile Probefahrt oder empfehlen Sie uns einen Partner.',
    bookTestRide: 'Probefahrt anfragen',
    directions: 'Route planen',
    storeStatus: 'Zertifizierter Store',
  },
  en: {
    heroEyebrow: 'GLOBAL DEALERS',
    heroTitle: 'ALSVID Global Dealer Network',
    heroLede: 'Find an authorized ALSVID showroom and service partner near you, or explore opportunities to partner with us.',
    btnBecomeDealer: 'Become a dealer ↓',
    btnFindDealer: 'Find a dealer ↓',

    advantagesHeading: 'Why Partner with ALSVID',
    advantagesSub: 'Engineered for distinction, backed by robust European fulfillment and mutual growth',
    adv1Title: 'European Central Hub',
    adv1Desc: 'Fast 48-72 hour delivery directly from our Frankfurt warehouse, minimizing your local inventory holding.',
    adv2Title: 'Healthy Margen & MAP Protection',
    adv2Desc: 'Cutting-edge carbon folding e-bikes with strict price policies designed to protect partner profitability.',
    adv3Title: 'Territory Protection',
    adv3Desc: 'Structured distribution with geographic exclusivity to safeguard your long-term investment.',
    adv4Title: 'Factory Support & Warranty',
    adv4Desc: 'Dedicated technician training, fast-track warranty claims, and continuous spare parts fulfillment.',

    partnerHeading: 'Dealer Collaboration Center',
    partnerSub: 'Dedicated access for prospective applicants and certified retail partners',
    applyCardTitle: 'Apply for Partnership',
    applyCardDesc: 'Join our expanding network of premium bicycle dealers and mobility specialists across Europe.',
    applyBtn: 'Apply now →',
    applyFormTitle: 'Submit Partnership Application',
    applySuccess: 'Application submitted! Our commercial team will follow up within 2 business days.',
    portalCardTitle: 'B2B Dealer Center',
    portalCardDesc: 'Direct portal for certified dealers: bulk orders, logistics tracking, VIN allocation, and billing.',
    portalBtn: 'Dealer sign in →',

    searchHeading: 'Find Authorized Dealers & Showrooms',
    searchSub: 'Test ride ALSVID electric bikes and consult with certified technicians in person',
    filterAllCountries: 'All Countries / Regions',
    filterDE: 'Germany 🇩🇪',
    filterAT: 'Austria 🇦🇹',
    filterCH: 'Switzerland 🇨🇭',
    filterFR: 'France 🇫🇷',
    searchPlaceholder: 'Enter city or postal code…',
    noStoreNotice: 'No store found in your area yet. You can request a mobile test ride or apply to become a local partner.',
    bookTestRide: 'Book Test Ride',
    directions: 'Directions',
    storeStatus: 'Certified Store',
  },
};

const STORES = [
  {
    id: 'muc-01',
    country: 'DE',
    countryName: { zh: '德国', de: 'Deutschland', en: 'Germany' },
    city: 'München',
    zip: '80333',
    name: 'ALSVID Flagship Experience Center München',
    address: 'Brienner Straße 14, 80333 München, Germany',
    phone: '+49 89 2154 8890',
    hours: 'Mo - Sa: 10:00 - 19:00',
    models: 'A1 Ultra, L1 Pro, A1, L1',
  },
  {
    id: 'ber-01',
    country: 'DE',
    countryName: { zh: '德国', de: 'Deutschland', en: 'Germany' },
    city: 'Berlin',
    zip: '10117',
    name: 'ALSVID Mobility Hub Berlin Mitte',
    address: 'Friedrichstraße 68, 10117 Berlin, Germany',
    phone: '+49 30 8922 1140',
    hours: 'Mo - Sa: 10:00 - 19:00',
    models: 'A1 Ultra, L1 Pro',
  },
  {
    id: 'ham-01',
    country: 'DE',
    countryName: { zh: '德国', de: 'Deutschland', en: 'Germany' },
    city: 'Hamburg',
    zip: '20354',
    name: 'Hanseatic E-Mobility Partner Hamburg',
    address: 'Große Bleichen 21, 20354 Hamburg, Germany',
    phone: '+49 40 3345 9912',
    hours: 'Di - Sa: 10:00 - 18:30',
    models: 'A1 Ultra, A1, L1',
  },
  {
    id: 'fra-01',
    country: 'DE',
    countryName: { zh: '德国', de: 'Deutschland', en: 'Germany' },
    city: 'Frankfurt',
    zip: '60313',
    name: 'ALSVID Service & Distribution Center Frankfurt',
    address: 'Kaiserstraße 28, 60313 Frankfurt am Main, Germany',
    phone: '+49 69 7788 4420',
    hours: 'Mo - Fr: 09:00 - 18:00',
    models: 'Full Lineup & Spares',
  },
  {
    id: 'vie-01',
    country: 'AT',
    countryName: { zh: '奥地利', de: 'Österreich', en: 'Austria' },
    city: 'Wien',
    zip: '1010',
    name: 'Velo Luxury Partner Wien',
    address: 'Kärntner Ring 12, 1010 Wien, Austria',
    phone: '+43 1 512 8840',
    hours: 'Mo - Sa: 10:00 - 18:00',
    models: 'A1 Ultra, L1 Pro',
  },
  {
    id: 'zur-01',
    country: 'CH',
    countryName: { zh: '瑞士', de: 'Schweiz', en: 'Switzerland' },
    city: 'Zürich',
    zip: '8001',
    name: 'Swiss E-Commuter Hub Zürich',
    address: 'Bahnhofstrasse 45, 8001 Zürich, Switzerland',
    phone: '+41 44 211 5560',
    hours: 'Mo - Fr: 09:30 - 18:30, Sa: 09:30 - 17:00',
    models: 'A1 Ultra, L1 Pro, A1',
  },
];

export function DealersView({ locale }: DealersViewProps) {
  const t = I18N[locale] || I18N.de;

  // D02 筛选交互状态
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // D04 申请合作表单展开与提交状态
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const [applySuccess, setApplySuccess] = useState(false);
  const [applyError, setApplyError] = useState('');
  const [applyForm, setApplyForm] = useState({
    companyName: '',
    country: '',
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    city: '',
    note: '',
  });

  const filteredStores = useMemo(() => {
    return STORES.filter((store) => {
      const matchCountry = selectedCountry === 'ALL' || store.country === selectedCountry;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        store.city.toLowerCase().includes(q) ||
        store.zip.toLowerCase().includes(q) ||
        store.name.toLowerCase().includes(q) ||
        store.address.toLowerCase().includes(q);
      return matchCountry && matchQuery;
    });
  }, [selectedCountry, searchQuery]);

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (applyBusy || applySuccess) return;
    setApplyBusy(true);
    setApplyError('');
    try {
      const res = await fetch('/api/dealer-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...applyForm,
          locale,
          partnershipType: 'retail_and_service',
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Submission failed');
      }
      setApplySuccess(true);
    } catch (err: any) {
      setApplyError(err.message || 'Error occurred');
    } finally {
      setApplyBusy(false);
    }
  };

  return (
    <div className="dealers-page" style={{ color: 'var(--color-text, #111827)' }}>
      {/* ─── D01 · 首屏主视觉 ─── */}
      <section
        data-module-id="ALSVID-D01"
        className="dealer-hero"
        style={{
          position: 'relative',
          minHeight: '78vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          background: 'radial-gradient(ellipse at center, #1f2824 0%, #0d1210 100%)',
          color: '#ffffff',
          padding: '80px 24px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'url(/alsvid-icon.png) no-repeat center 30%',
            backgroundSize: 'contain',
            opacity: 0.03,
            pointerEvents: 'none',
          }}
        />

        <div style={{ maxWidth: 840, position: 'relative', zIndex: 2 }}>
          <p
            style={{
              letterSpacing: '0.24em',
              fontSize: 13,
              fontWeight: 600,
              color: '#34d399',
              marginBottom: 16,
              textTransform: 'uppercase',
            }}
          >
            {t.heroEyebrow}
          </p>
          <h1
            style={{
              fontSize: 'clamp(32px, 5vw, 56px)',
              fontWeight: 800,
              lineHeight: 1.15,
              margin: '0 0 20px',
              letterSpacing: '-0.02em',
            }}
          >
            {t.heroTitle}
          </h1>
          <p
            style={{
              fontSize: 'clamp(16px, 2vw, 19px)',
              color: 'rgba(255, 255, 255, 0.78)',
              lineHeight: 1.6,
              margin: '0 auto',
              maxWidth: 680,
            }}
          >
            {t.heroLede}
          </p>
        </div>
      </section>

      {/* ─── D03 · 经销商合作优势（保持不变） ─── */}
      <section data-module-id="ALSVID-D03" style={{ padding: '88px 24px', background: 'var(--color-surface, #ffffff)' }}>
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ letterSpacing: '0.16em', fontSize: 13, fontWeight: 600, color: '#059669', marginBottom: 8 }}>
              COOPERATION ADVANTAGES
            </p>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 700, margin: '0 0 12px' }}>
              {t.advantagesHeading}
            </h2>
            <p style={{ fontSize: 16, color: 'var(--color-text-muted, #6b7280)', margin: 0 }}>
              {t.advantagesSub}
            </p>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 28,
            }}
          >
            {[
              { title: t.adv1Title, desc: t.adv1Desc, icon: '⚡' },
              { title: t.adv2Title, desc: t.adv2Desc, icon: '💎' },
              { title: t.adv3Title, desc: t.adv3Desc, icon: '🛡️' },
              { title: t.adv4Title, desc: t.adv4Desc, icon: '🔧' },
            ].map((adv, i) => (
              <div
                key={i}
                style={{
                  padding: '36px 28px',
                  borderRadius: 16,
                  background: 'var(--color-background, #f9fafb)',
                  border: '1px solid var(--color-border, #e5e7eb)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 14,
                }}
              >
                <span style={{ fontSize: 32 }}>{adv.icon}</span>
                <h3 style={{ fontSize: 19, fontWeight: 700, margin: 0 }}>{adv.title}</h3>
                <p style={{ fontSize: 14, color: 'var(--color-text-muted, #4b5563)', lineHeight: 1.65, margin: 0 }}>
                  {adv.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── D04 · 经销商合作中心（承接「成为经销商 ↓」） ─── */}
      <section
        id="dealer-partner"
        data-module-id="ALSVID-D04"
        style={{
          padding: '88px 24px',
          background: 'radial-gradient(ellipse at bottom, #111827 0%, #030712 100%)',
          color: '#ffffff',
          scrollMarginTop: '80px',
        }}
      >
        <div style={{ maxWidth: 1080, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <p style={{ letterSpacing: '0.16em', fontSize: 13, fontWeight: 600, color: '#34d399', marginBottom: 8 }}>
              DEALER COLLABORATION CENTER
            </p>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 40px)', fontWeight: 800, margin: '0 0 12px' }}>
              {t.partnerHeading}
            </h2>
            <p style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.72)', margin: 0 }}>
              {t.partnerSub}
            </p>
          </div>

          {/* 两个核心业务入口卡片 */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 28,
              marginBottom: showApplyForm ? 40 : 0,
            }}
          >
            {/* 入口 ①：申请合作 */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 20,
                padding: '40px 32px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <span style={{ fontSize: 36, display: 'block', marginBottom: 16 }}>🤝</span>
                <h3 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>{t.applyCardTitle}</h3>
                <p style={{ fontSize: 15, color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.6, margin: '0 0 24px' }}>
                  {t.applyCardDesc}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowApplyForm((prev) => !prev)}
                style={{
                  background: '#10b981',
                  color: '#ffffff',
                  border: 0,
                  borderRadius: 10,
                  padding: '14px 24px',
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: 'pointer',
                  textAlign: 'center',
                  transition: 'background 0.2s',
                }}
              >
                {t.applyBtn}
              </button>
            </div>

            {/* 入口 ②：经销商登录 */}
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 20,
                padding: '40px 32px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <span style={{ fontSize: 36, display: 'block', marginBottom: 16 }}>🔐</span>
                <h3 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>{t.portalCardTitle}</h3>
                <p style={{ fontSize: 15, color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.6, margin: '0 0 24px' }}>
                  {t.portalCardDesc}
                </p>
              </div>
              <a
                href="/dealer"
                style={{
                  display: 'block',
                  background: 'rgba(255, 255, 255, 0.12)',
                  color: '#ffffff',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: 10,
                  padding: '14px 24px',
                  fontSize: 15,
                  fontWeight: 600,
                  textAlign: 'center',
                  textDecoration: 'none',
                  transition: 'background 0.2s',
                }}
              >
                {t.portalBtn}
              </a>
            </div>
          </div>

          {/* 在线申请合作表单展开区 */}
          {showApplyForm && (
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.07)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: 20,
                padding: '44px 36px',
                animation: 'fadeIn 0.3s ease-in-out',
              }}
            >
              <h3 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 24px', textAlign: 'center' }}>
                {t.applyFormTitle}
              </h3>

              {applySuccess ? (
                <div
                  style={{
                    padding: '32px 20px',
                    textAlign: 'center',
                    background: 'rgba(16, 185, 129, 0.15)',
                    borderRadius: 12,
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    color: '#34d399',
                  }}
                >
                  <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>✓ {t.applySuccess}</p>
                </div>
              ) : (
                <form onSubmit={handleApplySubmit} style={{ display: 'grid', gap: 18 }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                      gap: 16,
                    }}
                  >
                    <div>
                      <label style={{ display: 'block', fontSize: 13, marginBottom: 6, opacity: 0.85 }}>
                        {locale === 'zh' ? '企业名称 *' : locale === 'de' ? 'Unternehmen *' : 'Company Name *'}
                      </label>
                      <input
                        required
                        type="text"
                        value={applyForm.companyName}
                        onChange={(e) => setApplyForm({ ...applyForm, companyName: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 8,
                          background: 'rgba(0, 0, 0, 0.4)',
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          color: '#fff',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, marginBottom: 6, opacity: 0.85 }}>
                        {locale === 'zh' ? '所在国家 / 地区 *' : locale === 'de' ? 'Land / Region *' : 'Country / Region *'}
                      </label>
                      <input
                        required
                        type="text"
                        value={applyForm.country}
                        onChange={(e) => setApplyForm({ ...applyForm, country: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 8,
                          background: 'rgba(0, 0, 0, 0.4)',
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          color: '#fff',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                      gap: 16,
                    }}
                  >
                    <div>
                      <label style={{ display: 'block', fontSize: 13, marginBottom: 6, opacity: 0.85 }}>
                        {locale === 'zh' ? '联系人姓名 *' : locale === 'de' ? 'Ansprechpartner *' : 'Contact Person *'}
                      </label>
                      <input
                        required
                        type="text"
                        value={applyForm.contactName}
                        onChange={(e) => setApplyForm({ ...applyForm, contactName: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 8,
                          background: 'rgba(0, 0, 0, 0.4)',
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          color: '#fff',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 13, marginBottom: 6, opacity: 0.85 }}>
                        {locale === 'zh' ? '商务邮箱 *' : locale === 'de' ? 'Geschäftliche E-Mail *' : 'Business Email *'}
                      </label>
                      <input
                        required
                        type="email"
                        value={applyForm.contactEmail}
                        onChange={(e) => setApplyForm({ ...applyForm, contactEmail: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '12px 14px',
                          borderRadius: 8,
                          background: 'rgba(0, 0, 0, 0.4)',
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          color: '#fff',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 13, marginBottom: 6, opacity: 0.85 }}>
                      {locale === 'zh' ? '合作诉求与门店现状（可选）' : locale === 'de' ? 'Nachricht / Portfolio (optional)' : 'Message / Current Business (optional)'}
                    </label>
                    <textarea
                      rows={3}
                      value={applyForm.note}
                      onChange={(e) => setApplyForm({ ...applyForm, note: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '12px 14px',
                        borderRadius: 8,
                        background: 'rgba(0, 0, 0, 0.4)',
                        border: '1px solid rgba(255, 255, 255, 0.25)',
                        color: '#fff',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  {applyError && (
                    <p style={{ color: '#ef4444', fontSize: 14, margin: 0 }}>⚠️ {applyError}</p>
                  )}

                  <button
                    type="submit"
                    disabled={applyBusy}
                    style={{
                      background: '#10b981',
                      color: '#ffffff',
                      border: 0,
                      borderRadius: 8,
                      padding: '14px',
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: 'pointer',
                      marginTop: 8,
                    }}
                  >
                    {applyBusy ? '...' : (locale === 'zh' ? '立即提交申请' : locale === 'de' ? 'Bewerbung absenden' : 'Submit Application')}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ─── D02 · 全球经销商查询（承接「查找经销商 ↓」） ─── */}
      <section
        id="dealer-search"
        data-module-id="ALSVID-D02"
        style={{
          padding: '88px 24px',
          background: 'var(--color-surface, #ffffff)',
          scrollMarginTop: '80px',
        }}
      >
        <div style={{ maxWidth: 1180, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ letterSpacing: '0.16em', fontSize: 13, fontWeight: 600, color: '#059669', marginBottom: 8 }}>
              GLOBAL SHOWROOMS & CENTERS
            </p>
            <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 38px)', fontWeight: 800, margin: '0 0 12px' }}>
              {t.searchHeading}
            </h2>
            <p style={{ fontSize: 16, color: 'var(--color-text-muted, #6b7280)', margin: 0 }}>
              {t.searchSub}
            </p>
          </div>

          {/* 筛选与搜索工具条 */}
          <div
            style={{
              display: 'flex',
              gap: 16,
              maxWidth: 720,
              margin: '0 auto 48px',
              flexWrap: 'wrap',
            }}
          >
            <select
              value={selectedCountry}
              onChange={(e) => setSelectedCountry(e.target.value)}
              style={{
                padding: '12px 18px',
                borderRadius: 10,
                border: '1px solid var(--color-border, #d1d5db)',
                background: 'var(--color-surface, #ffffff)',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
                flex: '0 0 220px',
              }}
            >
              <option value="ALL">{t.filterAllCountries}</option>
              <option value="DE">{t.filterDE}</option>
              <option value="AT">{t.filterAT}</option>
              <option value="CH">{t.filterCH}</option>
              <option value="FR">{t.filterFR}</option>
            </select>

            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: '1 1 280px',
                padding: '12px 18px',
                borderRadius: 10,
                border: '1px solid var(--color-border, #d1d5db)',
                fontSize: 14,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* 门店网点平铺列表 */}
          {filteredStores.length > 0 ? (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                gap: 24,
              }}
            >
              {filteredStores.map((store) => (
                <article
                  key={store.id}
                  style={{
                    padding: '30px',
                    borderRadius: 16,
                    border: '1px solid var(--color-border, #e5e7eb)',
                    background: 'var(--color-surface, #ffffff)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          background: 'rgba(5, 150, 105, 0.1)',
                          color: '#059669',
                          padding: '4px 10px',
                          borderRadius: 20,
                        }}
                      >
                        ✓ {t.storeStatus}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--color-text-muted, #6b7280)' }}>
                        {(store.countryName as any)[locale] || store.country}
                      </span>
                    </div>

                    <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>{store.name}</h3>
                    <p style={{ fontSize: 14, color: 'var(--color-text-muted, #4b5563)', lineHeight: 1.5, margin: '0 0 8px' }}>
                      📍 {store.address}
                    </p>
                    <p style={{ fontSize: 13, color: 'var(--color-text-subtle, #9ca3af)', margin: '0 0 8px' }}>
                      🕒 {store.hours}
                    </p>
                    <p style={{ fontSize: 13, color: '#059669', fontWeight: 500, margin: '0 0 16px' }}>
                      🚲 {store.models}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: 10, paddingTop: 16, borderTop: '1px solid var(--color-border, #f3f4f6)' }}>
                    <Link
                      href={`/${locale}/test-ride`}
                      style={{
                        flex: 1,
                        textAlign: 'center',
                        background: '#111827',
                        color: '#ffffff',
                        padding: '10px 14px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      {t.bookTestRide}
                    </Link>
                    <a
                      href={`https://maps.google.com/?q=${encodeURIComponent(store.address)}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        padding: '10px 14px',
                        borderRadius: 8,
                        fontSize: 13,
                        fontWeight: 600,
                        border: '1px solid var(--color-border, #d1d5db)',
                        color: 'var(--color-text, #111827)',
                        textDecoration: 'none',
                      }}
                    >
                      {t.directions} ↗
                    </a>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '64px 20px',
                background: 'var(--color-background, #f9fafb)',
                borderRadius: 16,
                border: '1px dashed var(--color-border, #d1d5db)',
              }}
            >
              <p style={{ fontSize: 16, color: 'var(--color-text-muted, #6b7280)', margin: '0 0 20px' }}>
                {t.noStoreNotice}
              </p>
              <Link
                href={`/${locale}/test-ride`}
                style={{
                  display: 'inline-block',
                  background: '#111827',
                  color: '#ffffff',
                  padding: '12px 24px',
                  borderRadius: 24,
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                {t.bookTestRide}
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
