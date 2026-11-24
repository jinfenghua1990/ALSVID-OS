import React, { useState } from 'react';
import styles from './login.module.css';
import { PortalLoginScene } from './PortalLoginScene.jsx';

const copy = {
  zh: {
    admin: ['有序连接，', '从容掌控。', '品牌运营，从这里开始。'],
    owner: ['每一次出发，', '都有新的可能。', '你的 ALSVID 骑行生活。'],
    dealer: ['一起，', '让骑行走得更远。', '与 ALSVID 携手前行。'],
    supplier: ['稳定协作，', '准时交付。', '与 ALSVID 高效协同。'],
    eyebrow: { admin: 'ALSVID · 管理控制台', owner: 'ALSVID · 车主中心', dealer: 'ALSVID · 经销商中心', supplier: 'ALSVID · 供应商门户' },
    login: '登录', setup: '设置管理员账号', account: '账号', password: '密码', remember: '记住账号',
    show: '显示', hide: '隐藏', processing: '处理中…', submit: '登录', create: '创建并登录',
    setupHint: '首次使用请创建管理员账号，密码为 8–20 个字符。', setupAction: '创建管理员账号',
    back: '返回官网', footer: '© ALSVID · 电助力骑行', motion: '背景流转',
  },
  en: {
    admin: ['Connected with clarity,', 'managed with ease.', 'Brand operations start here.'],
    owner: ['Every journey', 'opens new possibilities.', 'Your ALSVID riding life.'],
    dealer: ['Together,', 'we take riding further.', 'Move forward with ALSVID.'],
    supplier: ['Working together,', 'delivering with confidence.', 'Collaborate with ALSVID.'],
    eyebrow: { admin: 'ALSVID · ADMIN CONSOLE', owner: 'ALSVID · RIDER PORTAL', dealer: 'ALSVID · DEALER PORTAL', supplier: 'ALSVID · SUPPLIER PORTAL' },
    login: 'Sign in', setup: 'Set up administrator', account: 'Account', password: 'Password', remember: 'Remember account',
    show: 'Show', hide: 'Hide', processing: 'Working…', submit: 'Sign in', create: 'Create and sign in',
    setupHint: 'Create the administrator account to get started. Use 8–20 characters.', setupAction: 'Create administrator account',
    back: 'Back to website', footer: '© ALSVID · Electric riding', motion: 'Background motion',
  },
  de: {
    admin: ['Klar verbunden,', 'souverän gesteuert.', 'Der Markenbetrieb beginnt hier.'],
    owner: ['Jede Fahrt', 'öffnet neue Möglichkeiten.', 'Dein ALSVID Fahrerlebnis.'],
    dealer: ['Gemeinsam', 'kommen wir weiter.', 'Mit ALSVID nach vorn.'],
    supplier: ['Gemeinsam planen,', 'zuverlässig liefern.', 'Zusammenarbeit mit ALSVID.'],
    eyebrow: { admin: 'ALSVID · ADMIN KONSOLE', owner: 'ALSVID · FAHRER PORTAL', dealer: 'ALSVID · HÄNDLER PORTAL', supplier: 'ALSVID · LIEFERANTENPORTAL' },
    login: 'Anmelden', setup: 'Administrator einrichten', account: 'Konto', password: 'Passwort', remember: 'Konto merken',
    show: 'Anzeigen', hide: 'Ausblenden', processing: 'Wird verarbeitet…', submit: 'Anmelden', create: 'Erstellen und anmelden',
    setupHint: 'Erstelle zum Start ein Administratorkonto. Das Passwort muss 8–20 Zeichen haben.', setupAction: 'Administrator erstellen',
    back: 'Zur Website', footer: '© ALSVID · Elektrisches Fahren', motion: 'Hintergrundanimation',
  },
};

export default function LoginPage({ status, error, busy, onSubmit, portalKind, children }) {
  const [lang, setLang] = useState(() => {
    if (!portalKind) return 'zh';
    const saved = localStorage.getItem('alsvid.login.lang');
    if (saved && copy[saved]) return saved;
    const browserLang = (navigator.language || '').toLowerCase();
    return browserLang.startsWith('zh') ? 'zh' : browserLang.startsWith('de') ? 'de' : 'en';
  });
  const [username, setUsername] = useState(() => localStorage.getItem('alsvid.login.username') || '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => Boolean(localStorage.getItem('alsvid.login.username')));
  const [showPassword, setShowPassword] = useState(false);
  const [opened, setOpened] = useState(false);
  const currentLang = portalKind ? lang : 'zh';
  const t = copy[currentLang];
  const kind = portalKind || 'admin';
  const sceneText = (key) => ({
    [`auth.${kind}.eyebrow`]: t.eyebrow[kind], [`auth.${kind}.line1`]: t[kind][0],
    [`auth.${kind}.line2`]: t[kind][1], [`auth.${kind}.lead`]: t[kind][2],
    [`auth.${kind}.entry`]: portalKind ? t.login : '管理员登录',
    'auth.form': t.login, 'auth.busy': t.processing, 'auth.close': { zh: '关闭', en: 'Close', de: 'Schließen' }[currentLang], 'auth.return': t.back,
    'auth.background': t.motion, 'auth.pause': { zh: '暂停', en: 'Pause', de: 'Pause' }[currentLang], 'auth.play': { zh: '播放', en: 'Play', de: 'Abspielen' }[currentLang], 'auth.rights': t.footer,
  }[key] || key);

  const submit = async (event) => {
    event.preventDefault();
    if (remember && username.trim()) localStorage.setItem('alsvid.login.username', username.trim());
    else localStorage.removeItem('alsvid.login.username');
    try {
      await onSubmit(event, username, password);
    } finally {
      setPassword('');
    }
  };

  return <>
  <PortalLoginScene portal={kind} locale={currentLang} open={opened} busy={busy} locked={!status.initialized}
    formId="alsvid-login-form" actionLabel={status.initialized ? t.submit : t.setupAction}
    onOpen={() => setOpened(true)} onClose={() => setOpened(false)} t={sceneText}
    languageSwitcher={portalKind ? <nav aria-label="语言">{['zh', 'en', 'de'].map(code => <button key={code} type="button" aria-pressed={lang === code} onClick={() => { setLang(code); localStorage.setItem('alsvid.login.lang', code); }}>{code.toUpperCase()}</button>)}</nav> : null}>
          {!status.initialized ? <>
            <p className={styles.setupLead}>{t.setupHint}</p>
            <form id="alsvid-login-form" className={styles.form} onSubmit={submit}>
              <label className={styles.field}>{t.account}<span className={styles.inputRow}><input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required /></span></label>
              <label className={styles.field}>{t.password}<span className={styles.inputRow}><input type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} maxLength={20} /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? t.hide : t.show}</button></span></label>
              {error && <p className={styles.error}>{error}</p>}
            </form>
          </> : <form id="alsvid-login-form" className={styles.form} onSubmit={submit}>
            <label className={styles.field}>{t.account}<span className={styles.inputRow}><input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} required /></span></label>
            <label className={styles.field}>{t.password}<span className={styles.inputRow}><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required minLength={1} maxLength={200} /><button type="button" onClick={() => setShowPassword(!showPassword)}>{showPassword ? t.hide : t.show}</button></span></label>
            <div className={styles.utilities}><label><input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} />{t.remember}</label></div>
            {error && <p className={styles.error}>{error}</p>}
          </form>}
  </PortalLoginScene>
  {children && <div style={{maxWidth: 860, margin: '0 auto 10vh', padding: '0 24px', position: 'relative', zIndex: 1}}>{children}</div>}
  </>;
}
