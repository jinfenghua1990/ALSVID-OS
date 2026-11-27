'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { Locale } from '@/lib/alsvid-api';

interface BrandViewProps {
  locale: Locale;
}

const I18N = {
  zh: {
    b01Eyebrow: 'ALSVID · BRAND MANIFESTO',
    b01Title: 'ALSVID®',
    b01Sub: '为自由而生 · 德国高端轻量化电助力自行车',
    b02Heading: '品牌创立初衷',
    b02Intro: '从热爱出发，走向更大的世界',
    b02Body: 'ALSVID 诞生于对未来清洁出行与现代工业美学的热爱。在拥堵日益加剧的欧洲现代都市中，传统自行车缺乏远行的动力，而笨重的传统电动车又剥夺了随身携带的自由。我们立志以德国严谨工程技术与先锋碳纤维材料，打破界限，创造一辆真正属于城市探索者的座驾。',
    b03Heading: '设计哲学',
    b03Tagline: '轻量 · 极简 · 人车共生',
    b03Desc: '克制的设计，去除一切冗余修饰。将复杂的折叠机构与大容量锂电池完全隐于纯粹的几何管型之中，呈现出如雕塑般纯净的视觉力量。',
    b04Heading: '技术与创新',
    b04Tagline: '碳纤维一体成型 · 专利自锁折叠 · 智能电驱中枢',
    b04Items: [
      { title: 'T800 航空级碳纤维', desc: '整车高应力部位多层定向编织，整车重量仅 14.5kg，刚韧兼具。' },
      { title: '秒级精密自锁结构', desc: '双重防误触磁吸快锁，3步10秒完成折叠，平滑顺畅，耐久测试超 10 万次。' },
      { title: '智能扭矩传感动力平台', desc: '高灵敏度动态踏频力矩感知算法，零延迟输出澎湃助力，随心所驭。' }
    ],
    b05Heading: '品牌生活方式',
    b05Tagline: '穿梭于晨光中的石砖小巷，远赴于周末的原野森林',
    b05Desc: '无惧坡道，不为续航所困，折叠后轻松入梯、置入汽车后备箱或搭乘高铁。ALSVID 不仅是一台交通工具，更是拓展生活半径与探索自由的伙伴。',
    b06Heading: '品牌愿景',
    b06Manifesto: '更轻盈，更自由，更远方。',
    b06Sub: 'Lighter. Freer. Further. | Leichter. Freier. Weiter.',
    b06Cta: '探索全部车型 →'
  },
  de: {
    b01Eyebrow: 'ALSVID · MARKENMANIFEST',
    b01Title: 'ALSVID®',
    b01Sub: 'Geboren für die Freiheit · Deutsche Premium-Leichtbau-Elektrofahrräder',
    b02Heading: 'Die Gründergeschichte',
    b02Intro: 'Aus Leidenschaft für puristische urbane Mobilität',
    b02Body: 'ALSVID entstand aus dem Wunsch, urbane Fortbewegung neu zu definieren. Im Spannungsfeld zwischen vollen Innenstädten und dem Verlangen nach individueller Freiheit haben wir ein E-Bike entwickelt, das Ingenieurskunst, Carbon-Leichtbau und kompromisslose Ästhetik harmonisch vereint.',
    b03Heading: 'Designphilosophie',
    b03Tagline: 'Leichtigkeit · Minimalismus · Einheit',
    b03Desc: 'Reduziert auf das Wesentliche. Batterie, Kabelführung und Klappmechanik sind nahtlos in den puristischen Rahmen integriert – kraftvoll, elegant und zeitlos.',
    b04Heading: 'Technologie & Innovation',
    b04Tagline: 'Monocoque-Carbon · Patentierte Falttechnik · Smarter Antrieb',
    b04Items: [
      { title: 'T800 Luftfahrt-Carbon', desc: 'Präzise Faserlagen an hochbelasteten Zonen garantieren 14,5 kg Gesamtgewicht und höchste Steifigkeit.' },
      { title: 'Sekundenschnelles Faltsystem', desc: 'Magnetische Selbstverriegelung in nur 3 Schritten und 10 Sekunden – geprüft auf über 100.000 Faltzyklen.' },
      { title: 'Intelligente Drehmomentsensorik', desc: 'Sensible Kraftmessung reagiert verzögerungsfrei auf jeden Tritt für ein natürliches, kraftvolles Fahrgefühl.' }
    ],
    b05Heading: 'Brand Lifestyle',
    b05Tagline: 'Vom Kopfsteinpflaster historischer Altstädte bis zu einsamen Waldwegen am Wochenende',
    b05Desc: 'Leicht die Treppe hinaufgetragen, im ICE verstaut oder im Kofferraum mitgenommen: ALSVID erweitert den persönlichen Radius.',
    b06Heading: 'Markenversion',
    b06Manifesto: 'Leichter. Freier. Weiter.',
    b06Sub: 'Lighter. Freer. Further. | 更轻盈，更自由，更远方。',
    b06Cta: 'Modelle entdecken →'
  },
  en: {
    b01Eyebrow: 'ALSVID · BRAND MANIFESTO',
    b01Title: 'ALSVID®',
    b01Sub: 'Born for Freedom · German Engineered Lightweight E-Bikes',
    b02Heading: 'Our Origins',
    b02Intro: 'Driven by passion for pure, unbounded mobility',
    b02Body: 'ALSVID was founded to liberate urban commuting. Combining rigorous German engineering with advanced composite craftsmanship, we create folding electric bikes that deliver exhilarating rides without compromising portability.',
    b03Heading: 'Design Philosophy',
    b03Tagline: 'Lightness · Minimalism · Harmony',
    b03Desc: 'Form follows function with poetic restraint. Hidden batteries, concealed cables, and clean contours result in a silhouette of timeless elegance.',
    b04Heading: 'Technology & Innovation',
    b04Tagline: 'Monocoque Carbon · Patented Quick-Fold · Responsive Power',
    b04Items: [
      { title: 'Aerospace-Grade T800 Carbon', desc: 'Precision multidirectional layups achieve an incredible 14.5kg weight with uncompromising fatigue resistance.' },
      { title: '10-Second Precision Folding', desc: 'Double magnetic interlocks enable folding in 3 effortless steps, tested over 100,000 stress cycles.' },
      { title: 'Dynamic Torque-Sensing Drive', desc: 'Millisecond sensor response mirrors your cadence for whisper-quiet, intuitive electric assistance.' }
    ],
    b05Heading: 'Lifestyle in Motion',
    b05Tagline: 'From morning historic city avenues to weekend country escapes',
    b05Desc: 'Effortlessly carried upstairs, tucked under a train seat, or stowed in the trunk. ALSVID expands the horizons of everyday journeys.',
    b06Heading: 'Our Vision',
    b06Manifesto: 'Lighter. Freer. Further.',
    b06Sub: 'Leichter. Freier. Weiter. | 更轻盈，更自由，更远方。',
    b06Cta: 'Explore all models →'
  }
};

export function BrandView({ locale }: BrandViewProps) {
  const t = I18N[locale] || I18N.zh;

  return (
    <div className="brand-story-page" style={{ color: '#111827', background: '#ffffff' }}>
      {/* ─── B01 · 品牌形象主视觉 ─── */}
      <section
        data-module-id="ALSVID-B01"
        style={{
          position: 'relative',
          minHeight: '88vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          background: '#0d1210',
          color: '#ffffff',
          padding: '80px 24px',
          overflow: 'hidden'
        }}
      >
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, opacity: 0.45 }}>
          <Image
            src="/api/public/home-media/01a1dd2a-19f7-7e51-86c8-6cef96e056d2"
            alt="ALSVID Brand Vision"
            fill
            priority
            style={{ objectFit: 'cover', objectPosition: 'center' }}
            sizes="100vw"
          />
        </div>
        <div style={{ position: 'relative', zIndex: 2, maxWidth: 840 }}>
          <p style={{ letterSpacing: '0.24em', fontSize: 13, fontWeight: 600, color: '#34d399', marginBottom: 16, textTransform: 'uppercase' }}>
            {t.b01Eyebrow}
          </p>
          <h1 style={{ fontSize: 'clamp(44px, 7vw, 84px)', fontWeight: 800, letterSpacing: '-0.02em', margin: '0 0 20px', lineHeight: 1.05 }}>
            {t.b01Title}
          </h1>
          <p style={{ fontSize: 'clamp(17px, 2.2vw, 22px)', color: 'rgba(255, 255, 255, 0.85)', lineHeight: 1.5, margin: 0 }}>
            {t.b01Sub}
          </p>
        </div>
      </section>

      {/* ─── B02 · 品牌故事 ─── */}
      <section data-module-id="ALSVID-B02" style={{ padding: '96px 24px', background: '#fafbfa', borderBottom: '1px solid #edf2ee' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '48px 64px', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{t.b02Heading}</span>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 700, color: '#111827', margin: '12px 0 20px', lineHeight: 1.2 }}>{t.b02Intro}</h2>
            <p style={{ fontSize: 15, lineHeight: 1.8, color: '#4b5563', margin: 0 }}>{t.b02Body}</p>
          </div>
          <div style={{ position: 'relative', height: 380, borderRadius: 12, overflow: 'hidden', boxShadow: '0 12px 36px rgba(0,0,0,0.08)' }}>
            <Image
              src="/api/public/home-media/01a1dd2a-3189-788f-bf7f-6be73fc5042d"
              alt="ALSVID Design Sketch & Engineering"
              fill
              style={{ objectFit: 'cover' }}
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
        </div>
      </section>

      {/* ─── B03 · 设计哲学 ─── */}
      <section data-module-id="ALSVID-B03" style={{ padding: '88px 24px', textAlign: 'center', background: '#ffffff', borderBottom: '1px solid #edf2ee' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{t.b03Heading}</span>
          <h2 style={{ fontSize: 'clamp(32px, 4.5vw, 48px)', fontWeight: 800, color: '#111827', margin: '14px 0 20px', letterSpacing: '-0.01em' }}>{t.b03Tagline}</h2>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: '#526058', margin: 0 }}>{t.b03Desc}</p>
        </div>
      </section>

      {/* ─── B04 · 技术与创新 ─── */}
      <section data-module-id="ALSVID-B04" style={{ padding: '96px 24px', background: '#111827', color: '#ffffff' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#34d399', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{t.b04Heading}</span>
            <h2 style={{ fontSize: 'clamp(28px, 4vw, 40px)', fontWeight: 700, margin: '12px 0 0' }}>{t.b04Tagline}</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32 }}>
            {t.b04Items.map((item, idx) => (
              <div key={idx} style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: 12, padding: 32 }}>
                <span style={{ display: 'inline-block', color: '#34d399', fontSize: 24, fontWeight: 700, marginBottom: 12 }}>0{idx + 1}</span>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px', color: '#ffffff' }}>{item.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255, 255, 255, 0.75)', margin: 0 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── B05 · 品牌生活方式 ─── */}
      <section data-module-id="ALSVID-B05" style={{ padding: '96px 24px', background: '#fafbfa', borderBottom: '1px solid #edf2ee' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', textAlign: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#059669', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{t.b05Heading}</span>
          <h2 style={{ fontSize: 'clamp(26px, 3.8vw, 38px)', fontWeight: 700, color: '#111827', margin: '14px 0 20px' }}>{t.b05Tagline}</h2>
          <p style={{ fontSize: 16, lineHeight: 1.8, color: '#526058', maxWidth: 780, margin: '0 auto 48px' }}>{t.b05Desc}</p>
          <div style={{ position: 'relative', height: 460, borderRadius: 16, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.08)' }}>
            <Image
              src="/api/public/home-media/01a1dd2a-0370-7021-a8c3-24dd9028a8a4"
              alt="ALSVID Lifestyle in Motion"
              fill
              style={{ objectFit: 'cover' }}
              sizes="100vw"
            />
          </div>
        </div>
      </section>

      {/* ─── B06 · 品牌愿景 ─── */}
      <section
        data-module-id="ALSVID-B06"
        style={{
          padding: '110px 24px',
          textAlign: 'center',
          background: 'radial-gradient(ellipse at center, #1b2620 0%, #0d1210 100%)',
          color: '#ffffff'
        }}
      >
        <div style={{ maxWidth: 840, margin: '0 auto' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#34d399', letterSpacing: '0.16em', textTransform: 'uppercase' }}>{t.b06Heading}</span>
          <h2 style={{ fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 800, margin: '18px 0 16px', letterSpacing: '-0.01em', lineHeight: 1.15 }}>
            {t.b06Manifesto}
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255, 255, 255, 0.72)', letterSpacing: '0.04em', margin: '0 0 36px' }}>{t.b06Sub}</p>
          <div>
            <Link
              href={`/${locale}/e-bikes`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: '#ffffff',
                color: '#111827',
                padding: '16px 36px',
                borderRadius: 30,
                fontSize: 16,
                fontWeight: 600,
                textDecoration: 'none',
                boxShadow: '0 8px 24px rgba(0,0,0,0.2)'
              }}
            >
              {t.b06Cta}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
