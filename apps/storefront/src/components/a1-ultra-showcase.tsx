'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import type { Locale } from '@/lib/alsvid-api';
import { publicAssetUrl } from '@/lib/alsvid-api';

type ViewMode = 'tech-beam' | 'interactive' | 'studio' | 'europe-street';
type BikeState = 'unfolded' | 'folded';

interface Hotspot {
  id: string;
  x: number;
  y: number;
  title: Record<Locale, string>;
  spec: Record<Locale, string>;
}

const ASSET_IDS = {
  techBeam: '01a21af8-34db-72f5-80d9-7a09ecb8d894',
  studio: '01a21aed-911c-7a97-9eec-bcd82159c54e',
  europeStreet: '01a21af8-2599-7b96-9dc8-1e5a7487f201',
  sideTransparent: '01a21af8-3f7f-7a98-b795-107f4d8ee25a',
  foldedTransparent: '01a21af8-4bfe-7404-9dbd-4ebd108d1b6e',
};

const UI_TEXT: Record<Locale, {
  modes: Record<ViewMode, string>;
  unfolded: string;
  folded: string;
  unfoldedSize: string;
  foldedSize: string;
  hint: string;
}> = {
  zh: {
    modes: {
      'tech-beam': '科技光束',
      'interactive': '展开 / 折叠拆解',
      'studio': '工业影棚',
      'europe-street': '欧洲街景',
    },
    unfolded: '展开骑行态',
    folded: '3 步折叠态',
    unfoldedSize: '150 × 65 × 110 cm',
    foldedSize: '85 × 69 × 48 cm',
    hint: '点击车身光点查看工程参数',
  },
  de: {
    modes: {
      'tech-beam': 'Lichtstrahl',
      'interactive': 'Falt-Interaktiv',
      'studio': 'Industrie-Studio',
      'europe-street': 'Europa-Straße',
    },
    unfolded: 'Fahrbereit',
    folded: '3-Sek. Gefaltet',
    unfoldedSize: '150 × 65 × 110 cm',
    foldedSize: '85 × 69 × 48 cm',
    hint: 'Punkte für Technik-Details antippen',
  },
  en: {
    modes: {
      'tech-beam': 'Tech Beam',
      'interactive': 'Fold & Hotspots',
      'studio': 'Studio Dark',
      'europe-street': 'Europe Street',
    },
    unfolded: 'Riding Mode',
    folded: 'Folded Mode',
    unfoldedSize: '150 × 65 × 110 cm',
    foldedSize: '85 × 69 × 48 cm',
    hint: 'Select hotspots to inspect engineering',
  },
};

const UNFOLDED_HOTSPOTS: Hotspot[] = [
  {
    id: 'front-suspension',
    x: 74,
    y: 53,
    title: { zh: '隐藏式碳纤维前避震', de: 'Versteckte Carbon-Federgabel', en: 'Hidden Carbon Front Suspension' },
    spec: { zh: '一体碳纤维前叉内置避震，过滤城市颠簸', de: 'Integrierte Frontfederung für ruhigen Lauf', en: 'Integrated fork damping for smooth urban rides' },
  },
  {
    id: 'carbon-frame',
    x: 55,
    y: 56,
    title: { zh: '碳纤维低跨点车架', de: 'Carbon-Tiefeinstiegsrahmen', en: 'Low-Step Carbon Frame' },
    spec: { zh: '整车净重 14.5 kg（皮带版）/ 15.5 kg（链条版）', de: '14,5 kg (Riemen) / 15,5 kg (Kette) Gesamtgewicht', en: '14.5 kg (Belt) / 15.5 kg (Chain) ultralight build' },
  },
  {
    id: 'seatpost-battery',
    x: 34,
    y: 38,
    title: { zh: '36V 10Ah 隐藏式座管电池', de: '36V 10Ah Sattelstützen-Akku', en: '36V 10Ah Seatpost Battery' },
    spec: { zh: '360Wh 高密度电芯 · 最大助力续航 80 km', de: '360 Wh · Bis zu 80 km Unterstützungsreichweite', en: '360Wh cells · Up to 80 km pedal-assist range' },
  },
  {
    id: 'dnm-shock',
    x: 35,
    y: 68,
    title: { zh: 'DNM AO 气压后避震器', de: 'DNM AO Luft-Hinterbaudämpfer', en: 'DNM AO Rear Air Shock' },
    spec: { zh: '可调气压阻尼 · 兼容鹅卵石与非铺装路面', de: 'Einstellbare Luftdämpfung für Kopfsteinpflaster', en: 'Tunable air damping for European cobblestones' },
  },
  {
    id: 'rear-motor',
    x: 17,
    y: 75,
    title: { zh: '250W 后轮毂电机 · Shimano 7 速', de: '250W Heckmotor · Shimano 7-Gang', en: '250W Hub Motor · Shimano 7-Speed' },
    spec: { zh: '40 N·m 扭矩传感输出 · 精准响应每次踩踏', de: '40 Nm mit Drehmomentsensor für natürliches Fahren', en: '40 N·m torque sensor output · Responsive power' },
  },
];

const FOLDED_HOTSPOTS: Hotspot[] = [
  {
    id: 'compact-fold',
    x: 48,
    y: 30,
    title: { zh: '3 步紧凑折叠架构', de: '3-Schritte-Kompaktfaltung', en: '3-Step Compact Folding' },
    spec: { zh: '折叠尺寸 85 × 69 × 48 cm · 轻松入梯与后备箱', de: 'Faltmaß 85 × 69 × 48 cm · Ideal für Kofferraum & Bahn', en: '85 × 69 × 48 cm folded · Fits trunks & transit' },
  },
  {
    id: 'dnm-folded',
    x: 55,
    y: 52,
    title: { zh: 'DNM 气压避震与折叠锁定', de: 'DNM Luftdämpfer & Klappmechanismus', en: 'DNM Air Shock & Lock' },
    spec: { zh: '双重安全锁扣机构，折叠稳固不松散', de: 'Doppelte Sicherheitsverriegelung im gefalteten Zustand', en: 'Dual safety latch keeps frame locked tightly' },
  },
  {
    id: 'caster-wheel',
    x: 80,
    y: 91,
    title: { zh: '折叠专用易行推行轮', de: 'Integrierte Transportrolle', en: 'Integrated Caster Wheel' },
    spec: { zh: '座管底部自带滑轮，折叠后可单手轻松推行', de: 'Müheloses Schieben im gefalteten Zustand', en: 'Roll effortlessly without lifting after folding' },
  },
];

export function A1UltraShowcase({
  locale,
  moduleId,
  eyebrow,
  title,
  intro,
  ctaLabel,
  ctaHref,
}: {
  locale: Locale;
  moduleId?: string;
  eyebrow?: string;
  title?: string;
  intro?: string;
  ctaLabel?: string;
  ctaHref?: string;
}) {
  const [mode, setMode] = useState<ViewMode>('tech-beam');
  const [bikeState, setBikeState] = useState<BikeState>('unfolded');
  const [activeSpot, setActiveSpot] = useState<string>('carbon-frame');

  const t = UI_TEXT[locale];
  const hotspots = bikeState === 'unfolded' ? UNFOLDED_HOTSPOTS : FOLDED_HOTSPOTS;
  const currentSpot = hotspots.find(h => h.id === activeSpot) || hotspots[0];

  const bgImageId =
    mode === 'tech-beam'
      ? ASSET_IDS.techBeam
      : mode === 'studio'
        ? ASSET_IDS.studio
        : mode === 'europe-street'
          ? ASSET_IDS.europeStreet
          : null;

  return (
    <section
      data-module-id={moduleId}
      style={{
        position: 'relative',
        minHeight: '88vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '88px clamp(24px, 6vw, 120px) 42px',
        overflow: 'hidden',
        color: '#ffffff',
        background:
          mode === 'interactive'
            ? 'radial-gradient(circle at 68% 52%, #1d2824 0%, #0d1210 62%, #070a09 100%)'
            : '#0d1210',
        boxSizing: 'border-box',
      }}
    >
      {/* 背景层 */}
      {bgImageId ? (
        <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
          <Image
            key={bgImageId}
            src={publicAssetUrl(bgImageId)}
            alt={title || 'A1 ULTRA'}
            fill
            priority
            style={{ objectFit: 'cover', objectPosition: 'center' }}
            sizes="100vw"
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                mode === 'europe-street'
                  ? 'linear-gradient(to right, rgba(10,14,12,0.82) 0%, rgba(10,14,12,0.35) 52%, transparent 100%)'
                  : 'linear-gradient(to right, rgba(8,10,9,0.84) 0%, rgba(8,10,9,0.32) 48%, transparent 100%)',
            }}
          />
        </div>
      ) : (
        /* 风格 2 交互拆解工程背景网格 */
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
            backgroundImage:
              'linear-gradient(rgba(52, 211, 153, 0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(52, 211, 153, 0.04) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(circle at 65% 50%, black 25%, transparent 78%)',
          }}
        />
      )}

      {/* 主内容区：左侧文案 + 右侧交互实车 */}
      <div
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'grid',
          gridTemplateColumns: mode === 'interactive' ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr',
          alignItems: 'center',
          gap: 36,
          flex: 1,
        }}
      >
        <div style={{ maxWidth: 560 }}>
          {eyebrow && (
            <p
              style={{
                color: '#34d399',
                fontSize: 13,
                fontWeight: 600,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                margin: '0 0 14px',
              }}
            >
              {eyebrow}
            </p>
          )}
          <h1
            style={{
              color: 'inherit',
              margin: '0 0 18px',
              fontWeight: 700,
              fontSize: 'clamp(36px, 5.5vw, 68px)',
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
            }}
          >
            {title || 'A1 ULTRA'}
          </h1>
          {intro && (
            <p
              style={{
                color: 'rgba(255,255,255,0.84)',
                fontSize: 'clamp(16px, 1.8vw, 20px)',
                lineHeight: 1.6,
                margin: '0 0 28px',
              }}
            >
              {intro}
            </p>
          )}

          {/* 交互模式下显示折叠切换与当前选中的热点参数卡片 */}
          {mode === 'interactive' && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'inline-flex', gap: 8, background: 'rgba(255,255,255,0.06)', padding: 4, borderRadius: 999, border: '1px solid rgba(255,255,255,0.12)', marginBottom: 16 }}>
                <button
                  type="button"
                  onClick={() => {
                    setBikeState('unfolded');
                    setActiveSpot(UNFOLDED_HOTSPOTS[1].id);
                  }}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 999,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    background: bikeState === 'unfolded' ? '#34d399' : 'transparent',
                    color: bikeState === 'unfolded' ? '#07100c' : 'rgba(255,255,255,0.8)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {t.unfolded} · {t.unfoldedSize}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBikeState('folded');
                    setActiveSpot(FOLDED_HOTSPOTS[0].id);
                  }}
                  style={{
                    padding: '8px 18px',
                    borderRadius: 999,
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 600,
                    background: bikeState === 'folded' ? '#34d399' : 'transparent',
                    color: bikeState === 'folded' ? '#07100c' : 'rgba(255,255,255,0.8)',
                    transition: 'all 0.2s ease',
                  }}
                >
                  {t.folded} · {t.foldedSize}
                </button>
              </div>

              {currentSpot && (
                <div
                  style={{
                    background: 'rgba(16, 24, 20, 0.78)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(52, 211, 153, 0.35)',
                    borderRadius: 16,
                    padding: '16px 20px',
                    maxWidth: 460,
                  }}
                >
                  <div style={{ fontSize: 12, color: '#34d399', fontWeight: 600, marginBottom: 4 }}>
                    {t.hint}
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: '#ffffff', marginBottom: 4 }}>
                    {currentSpot.title[locale]}
                  </div>
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.78)', lineHeight: 1.5 }}>
                    {currentSpot.spec[locale]}
                  </div>
                </div>
              )}
            </div>
          )}

          {ctaLabel && (
            <div>
              <Link href={ctaHref || `/${locale}/e-bikes/carbon-e-bike-klapprad-a1-ultra`}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    background: '#ffffff',
                    color: '#111827',
                    padding: '14px 28px',
                    borderRadius: 30,
                    fontSize: 15,
                    fontWeight: 600,
                    textDecoration: 'none',
                    boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                  }}
                >
                  {ctaLabel} →
                </span>
              </Link>
            </div>
          )}
        </div>

        {/* 右侧：透明去底真实车辆 + 热点标注 */}
        {mode === 'interactive' && (
          <div style={{ position: 'relative', width: '100%', maxWidth: 680, margin: '0 auto', aspectRatio: bikeState === 'unfolded' ? '980 / 768' : '925 / 862', maxHeight: '62vh' }}>
            <img
              src={publicAssetUrl(bikeState === 'unfolded' ? ASSET_IDS.sideTransparent : ASSET_IDS.foldedTransparent)}
              alt={`A1 Ultra ${bikeState}`}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                filter: 'drop-shadow(0 28px 34px rgba(0, 0, 0, 0.72))',
                transition: 'transform 0.35s ease',
              }}
            />
            {hotspots.map(spot => {
              const active = spot.id === currentSpot?.id;
              return (
                <button
                  key={spot.id}
                  type="button"
                  aria-label={spot.title[locale]}
                  onClick={() => setActiveSpot(spot.id)}
                  onMouseEnter={() => setActiveSpot(spot.id)}
                  style={{
                    position: 'absolute',
                    left: `${spot.x}%`,
                    top: `${spot.y}%`,
                    transform: 'translate(-50%, -50%)',
                    width: active ? 28 : 22,
                    height: active ? 28 : 22,
                    borderRadius: '50%',
                    border: active ? '2px solid #ffffff' : '2px solid rgba(52, 211, 153, 0.9)',
                    background: active ? '#10b981' : 'rgba(13, 18, 16, 0.75)',
                    boxShadow: active ? '0 0 0 8px rgba(52, 211, 153, 0.28)' : '0 0 0 4px rgba(52, 211, 153, 0.15)',
                    cursor: 'pointer',
                    padding: 0,
                    transition: 'all 0.2s ease',
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* 底部多风格视觉切换栏 */}
      <div
        style={{
          position: 'relative',
          zIndex: 3,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
          marginTop: 24,
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            flexWrap: 'wrap',
            gap: 6,
            background: 'rgba(10, 14, 12, 0.68)',
            backdropFilter: 'blur(12px)',
            padding: 6,
            borderRadius: 999,
            border: '1px solid rgba(255, 255, 255, 0.14)',
          }}
        >
          {(['tech-beam', 'interactive', 'studio', 'europe-street'] as ViewMode[]).map((m, idx) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  background: active ? '#ffffff' : 'transparent',
                  color: active ? '#111827' : 'rgba(255, 255, 255, 0.78)',
                  transition: 'all 0.2s ease',
                }}
              >
                0{idx + 1} · {t.modes[m]}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
