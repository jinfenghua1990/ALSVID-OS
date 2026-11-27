'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { uuidv7 } from '@/lib/uuid';
import Link from 'next/link';
import type { Locale, PublicLocation } from '@/lib/alsvid-api';

interface DealersViewProps {
  locale: Locale;
  portalUrl?: string;
}

const I18N = {
  zh: {
    heroEyebrow: 'GLOBAL DEALERS',
    heroTitle: 'ALSVID 全球经销商网络',
    heroLede: '查找附近的 ALSVID 官方授权体验店与服务中心，或了解如何在您的区域成为官方合作伙伴。',
    btnBecomeDealer: '成为经销商 ↓',
    btnFindDealer: '查找经销商 ↓',

    advantagesHeading: '为什么与 ALSVID 携手',
    advantagesSub: '了解 ALSVID 的产品、合作方式与服务支持。',
    adv1Title: '产品与供应',
    adv1Desc: '了解整车、配件及供应合作。',
    adv2Title: '产品合作',
    adv2Desc: '了解产品系列和合作条件。',
    adv3Title: '区域合作',
    adv3Desc: '申请合作时可沟通所在地区和合作范围。',
    adv4Title: '技术与售后',
    adv4Desc: '了解产品技术资料及售后服务安排。',

    partnerHeading: '经销商合作中心',
    partnerSub: '无论是新伙伴申请入驻，还是已签约伙伴开展业务，均可由此开启',
    applyCardTitle: '申请合作',
    applyCardDesc: '欢迎拥有自行车、电动出行或高端户外生活方式经验的经营者加入 ALSVID 全球网络。',
    applyBtn: '申请合作 →',
    applyFormTitle: '提交商业合作申请',
    applySuccess: '申请已成功提交。',
    portalCardTitle: '经销商业务中心',
    portalCardDesc: '已签约合作伙伴专用系统。支持在线批量订货、物流跟踪、车辆 VIN 管理与对账。',
    portalBtn: '经销商登录 →',

    searchHeading: '全球经销商与服务中心查询',
    searchSub: '查找已授权公开的销售和服务网点。',
    filterAllCountries: '全部国家 / 地区',
    filterDE: '德国 🇩🇪 (Deutschland)',
    filterAT: '奥地利 🇦🇹 (Österreich)',
    filterCH: '瑞士 🇨🇭 (Schweiz)',
    filterFR: '法国 🇫🇷 (France)',
    searchPlaceholder: '输入城市、地区或邮编搜索…',
    noStoreNotice: '没有找到符合条件的网点。',
    bookTestRide: '预约到店试骑',
    directions: '地图导航',
    storeStatus: '官方认证体验店',
  },
  de: {
    heroEyebrow: 'GLOBAL DEALERS',
    heroTitle: 'ALSVID Händlernetzwerk',
    heroLede: 'Finden Sie einen autorisierten ALSVID Standort oder informieren Sie sich über eine Partnerschaft.',
    btnBecomeDealer: 'Händler werden ↓',
    btnFindDealer: 'Händler finden ↓',

    advantagesHeading: 'Ihre Vorteile als ALSVID Partner',
    advantagesSub: 'Informieren Sie sich über Produkte, Zusammenarbeit und Service.',
    adv1Title: 'Produkte und Versorgung',
    adv1Desc: 'Informieren Sie sich über Fahrräder, Zubehör und Liefermöglichkeiten.',
    adv2Title: 'Produktpartnerschaft',
    adv2Desc: 'Erfahren Sie mehr über das Sortiment und die Bedingungen einer Zusammenarbeit.',
    adv3Title: 'Regionale Zusammenarbeit',
    adv3Desc: 'Besprechen Sie Ihre Region und den möglichen Umfang der Zusammenarbeit.',
    adv4Title: 'Technik und Service',
    adv4Desc: 'Informieren Sie sich über technische Unterlagen und Serviceleistungen.',

    partnerHeading: 'Partner & Händler-Portal',
    partnerSub: 'Zugang für Bewerber und bestehende Vertriebspartner',
    applyCardTitle: 'Partnerschaft anfragen',
    applyCardDesc: 'Erweitern Sie Ihr Portfolio um leichte, smarte E-Bikes. Wir freuen uns auf Ihre Bewerbung.',
    applyBtn: 'Jetzt bewerben →',
    applyFormTitle: 'Händleranfrage einreichen',
    applySuccess: 'Vielen Dank! Ihre Anfrage wurde übermittelt.',
    portalCardTitle: 'B2B Händler-Portal',
    portalCardDesc: 'Für autorisierte Händler: Schnelle Sammelbestellungen, VIN-Zuweisung, Tracking und Rechnungen.',
    portalBtn: 'Händler-Login →',

    searchHeading: 'Händlersuche & Probefahrten',
    searchSub: 'Finden Sie zur Veröffentlichung freigegebene Verkaufs- und Servicestandorte.',
    filterAllCountries: 'Alle Länder / Regionen',
    filterDE: 'Deutschland 🇩🇪',
    filterAT: 'Österreich 🇦🇹',
    filterCH: 'Schweiz 🇨🇭',
    filterFR: 'Frankreich 🇫🇷',
    searchPlaceholder: 'Stadt oder Postleitzahl eingeben…',
    noStoreNotice: 'Keine passenden Standorte gefunden.',
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
    advantagesSub: 'Explore ALSVID products, partnership opportunities and service support.',
    adv1Title: 'Products and supply',
    adv1Desc: 'Learn about bicycles, accessories and supply arrangements.',
    adv2Title: 'Product partnership',
    adv2Desc: 'Explore the product range and partnership terms.',
    adv3Title: 'Regional partnership',
    adv3Desc: 'Discuss your region and the scope of a potential partnership.',
    adv4Title: 'Technical and service support',
    adv4Desc: 'Learn about technical materials and service arrangements.',

    partnerHeading: 'Dealer Collaboration Center',
    partnerSub: 'Dedicated access for prospective applicants and certified retail partners',
    applyCardTitle: 'Apply for Partnership',
    applyCardDesc: 'Join our expanding network of premium bicycle dealers and mobility specialists across Europe.',
    applyBtn: 'Apply now →',
    applyFormTitle: 'Submit Partnership Application',
    applySuccess: 'Your application has been submitted.',
    portalCardTitle: 'B2B Dealer Center',
    portalCardDesc: 'Direct portal for certified dealers: bulk orders, logistics tracking, VIN allocation, and billing.',
    portalBtn: 'Dealer sign in →',

    searchHeading: 'Find Authorized Dealers & Showrooms',
    searchSub: 'Find authorized sales and service locations.',
    filterAllCountries: 'All Countries / Regions',
    filterDE: 'Germany 🇩🇪',
    filterAT: 'Austria 🇦🇹',
    filterCH: 'Switzerland 🇨🇭',
    filterFR: 'France 🇫🇷',
    searchPlaceholder: 'Enter city or postal code…',
    noStoreNotice: 'No matching locations found.',
    bookTestRide: 'Book Test Ride',
    directions: 'Directions',
    storeStatus: 'Certified Store',
  },
};

export function DealersView({ locale, portalUrl = '' }: DealersViewProps) {
  const t = I18N[locale] || I18N.de;

  // D02 筛选交互状态
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [locations, setLocations] = useState<PublicLocation[]>([]);
  const [locationsState, setLocationsState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all(['sales', 'service'].map(async capability => {
      const response = await fetch(`/api/public/dealer-locations?capability=${capability}`, { signal: controller.signal });
      if (!response.ok) throw new Error('Locations unavailable');
      const result = await response.json();
      if (!Array.isArray(result.data)) throw new Error('Invalid locations');
      return result.data as PublicLocation[];
    })).then(groups => {
      setLocations([...new Map(groups.flat().map(location => [location.id, location])).values()]);
      setLocationsState('ready');
    }).catch(() => { if (!controller.signal.aborted) setLocationsState('error'); });
    return () => controller.abort();
  }, []);

  // D04 申请合作表单展开与提交状态
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const applyRequest = useRef<{ id: string; payload: string } | null>(null);
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
    return locations.filter((store) => {
      const matchCountry = selectedCountry === 'ALL' || store.country === selectedCountry;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        store.city.toLowerCase().includes(q) ||
        store.name.toLowerCase().includes(q) ||
        store.address.toLowerCase().includes(q);
      return matchCountry && matchQuery;
    });
  }, [locations, selectedCountry, searchQuery]);

  const handleApplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (applyBusy || applySuccess) return;
    setApplyBusy(true);
    setApplyError('');
    try {
      const payload = JSON.stringify(applyForm);
      if (!applyRequest.current || applyRequest.current.payload !== payload) {
        applyRequest.current = { id: uuidv7(), payload };
      }
      const res = await fetch('/api/dealer-applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...applyForm,
          id: applyRequest.current.id,
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
              {portalUrl ? <a
                href={portalUrl}
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
              </a> : <p role="status">{locale === 'zh' ? '经销商登录入口暂不可用' : locale === 'de' ? 'Händler-Login derzeit nicht verfügbar' : 'Dealer sign-in is temporarily unavailable'}</p>}
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
                      {locale === 'zh' ? '联系电话 *' : locale === 'de' ? 'Telefonnummer *' : 'Contact phone *'}
                      <input required type="tel" minLength={3} maxLength={80} value={applyForm.contactPhone}
                        onChange={(e) => setApplyForm({ ...applyForm, contactPhone: e.target.value })}
                        style={{ display: 'block', width: '100%', marginTop: 6, padding: '12px 14px', borderRadius: 8, background: 'rgba(0, 0, 0, 0.4)', border: '1px solid rgba(255, 255, 255, 0.25)', color: '#fff', boxSizing: 'border-box' }} />
                    </label>
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
          {locationsState !== 'ready' ? <p role="status">{locationsState === 'loading' ? (locale === 'zh' ? '正在加载网点…' : locale === 'de' ? 'Standorte werden geladen…' : 'Loading locations…') : (locale === 'zh' ? '暂时无法获取网点，请稍后重试。' : locale === 'de' ? 'Standorte sind vorübergehend nicht verfügbar.' : 'Locations are temporarily unavailable.')}</p> : filteredStores.length > 0 ? (
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
                        ✓ {store.sales && store.service ? (locale === 'zh' ? '销售与服务' : locale === 'de' ? 'Verkauf & Service' : 'Sales & service') : store.sales ? (locale === 'zh' ? '销售' : locale === 'de' ? 'Verkauf' : 'Sales') : (locale === 'zh' ? '服务' : 'Service')}
                      </span>
                      <span style={{ fontSize: 13, color: 'var(--color-text-muted, #6b7280)' }}>
                        {store.country === 'DE' ? t.filterDE : store.country === 'AT' ? t.filterAT : store.country}
                      </span>
                    </div>

                    <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>{store.name}</h3>
                    <p style={{ fontSize: 14, color: 'var(--color-text-muted, #4b5563)', lineHeight: 1.5, margin: '0 0 8px' }}>
                      📍 {store.address}
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: 10, paddingTop: 16, borderTop: '1px solid var(--color-border, #f3f4f6)' }}>
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
