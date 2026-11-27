'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Locale } from '@/lib/alsvid-api';
import { ApiError, apiJson, postJson } from './account-api';
import { COMMON, LOGIN, NAV, ROLE, SECURITY } from '@/lib/account-text';
import { RegistrationForm } from './registration-form';
import { notifyCartChanged } from '../cart-storage';

type AccountUser = { id: string; username: string; role: string };
type Status = 'loading' | 'guest' | 'forbidden' | 'owner';

const NAV_ORDER = ['overview', 'orders', 'vehicles', 'service', 'repairs', 'security'] as const;
const NAV_PATH: Record<(typeof NAV_ORDER)[number], string> = {
  overview: '',
  orders: '/orders',
  vehicles: '/vehicles',
  service: '/service',
  repairs: '/repairs',
  security: '/security',
};

// 登录后回跳目标必须是本站相对路径：拒绝绝对 URL 与协议相对地址（//evil.com），
// 避免开放重定向被用来做钓鱼跳板。
function safeReturnTo(value: string | null): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null;
  return value;
}

export function AccountShell({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<Status>('loading');
  const [user, setUser] = useState<AccountUser | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await apiJson<{ user: AccountUser | null }>('/api/auth/status');
      if (!body.user) {
        setUser(null);
        setStatus('guest');
        return;
      }
      setUser(body.user);
      // 车主中心只服务 owner；dealer / supplier / admin 走各自后台，不在此处暴露入口。
      setStatus(body.user.role === 'owner' ? 'owner' : 'forbidden');
    } catch {
      setUser(null);
      setStatus('guest');
    } finally {
      notifyCartChanged();
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const logout = async () => {
    try { await postJson('/api/auth/logout', {}); } catch { /* 会话已失效也视为已退出 */ }
    setUser(null);
    setStatus('guest');
    notifyCartChanged();
  };

  if (status === 'loading') {
    return <main className="container account-page"><p className="account-muted" role="status">{COMMON.loading[locale]}</p></main>;
  }

  if (status !== 'owner') {
    return <LoginGate locale={locale} forbidden={status === 'forbidden'} username={user?.username || ''} onSignedIn={load} onLogout={logout} />;
  }

  return <main className="container account-page">
    <header className="account-head">
      <div>
        <p className="eyebrow">{NAV.overview[locale]}</p>
        <h1 className="account-title">{user?.username}</h1>
        <p className="account-muted">{ROLE[user?.role || 'owner']?.[locale] || user?.role}</p>
      </div>
      <button className="account-ghost" type="button" onClick={() => void logout()}>{SECURITY.logout[locale]}</button>
    </header>
    <nav className="account-nav" aria-label={NAV.overview[locale]}>
      {NAV_ORDER.map((key) => {
        const href = `/${locale}/account${NAV_PATH[key]}`;
        const active = key === 'overview' ? pathname === `/${locale}/account` : pathname.startsWith(href);
        return <Link key={key} className={active ? 'is-active' : undefined} href={href} aria-current={active ? 'page' : undefined}>{NAV[key][locale]}</Link>;
      })}
    </nav>
    {children}
  </main>;
}

function LoginGate({ locale, forbidden, username, onSignedIn, onLogout }: {
  locale: Locale;
  forbidden: boolean;
  username: string;
  onSignedIn: () => Promise<void>;
  onLogout: () => Promise<void>;
}) {
  const router = useRouter();
  const [form, setForm] = useState({ username, password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // 改密成功后跳回这里并带 ?changed=1：会话已被后端销毁，需要明确告知用户重新登录。
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('changed') === '1') setNotice(SECURITY.changed[locale]);
  }, [locale]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await postJson('/api/auth/login', { username: form.username.trim(), password: form.password });
      const returnTo = safeReturnTo(new URLSearchParams(window.location.search).get('returnTo'));
      await onSignedIn();
      if (returnTo) router.replace(returnTo);
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0;
      setError(status === 401 ? LOGIN.invalid[locale] : status === 429 ? LOGIN.rateLimited[locale] : status === 503 ? LOGIN.unavailable[locale] : COMMON.requestFailed[locale]);
    } finally {
      setBusy(false);
    }
  };

  if (forbidden) {
    return <main className="container account-page">
      <p className="eyebrow">{LOGIN.eyebrow[locale]}</p>
      <h1 className="account-title">{LOGIN.title[locale]}</h1>
      <section className="account-panel">
        <p role="alert">{LOGIN.notOwner[locale]}</p>
        {username && <p className="account-muted">{username}</p>}
        <button className="account-ghost" type="button" onClick={() => void onLogout()}>{SECURITY.logout[locale]}</button>
      </section>
    </main>;
  }

  return <main className="container account-page">
    <p className="eyebrow">{LOGIN.eyebrow[locale]}</p>
    <h1 className="account-title">{LOGIN.title[locale]}</h1>
    <p className="lede">{LOGIN.lede[locale]}</p>
    {notice && <p className="account-success" role="status">{notice}</p>}
    <form className="account-form" onSubmit={submit}>
      <label>{LOGIN.username[locale]}
        <input required autoComplete="username" maxLength={254} value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} />
      </label>
      <label>{LOGIN.password[locale]}
        <input required type="password" autoComplete="current-password" maxLength={200} value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} />
      </label>
      {error && <p className="account-error" role="alert">{error}</p>}
      <button className="button" type="submit" disabled={busy || !form.username.trim() || !form.password}>{busy ? COMMON.submitting[locale] : LOGIN.submit[locale]}</button>
    </form>
    <RegistrationForm locale={locale} onRegistered={email=>{setForm({username:email,password:''});setNotice(locale==='de'?'E-Mail bestätigt. Bitte melden Sie sich an.':locale==='en'?'Email verified. Please sign in.':'邮箱验证成功，请登录。')}}/>
    <p className="account-note">{LOGIN.notice[locale]}</p>
  </main>;
}
