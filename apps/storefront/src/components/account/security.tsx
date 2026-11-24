'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/alsvid-api';
import { ApiError, apiJson, postJson } from './account-api';
import { COMMON, ROLE, SECURITY } from '@/lib/account-text';

type AccountUser = { id: string; username: string; role: string };

export function SecurityPanel({ locale }: { locale: Locale }) {
  const [user, setUser] = useState<AccountUser | null>(null);
  const [form, setForm] = useState({ oldPassword: '', newPassword: '', confirmPassword: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await apiJson<{ user: AccountUser | null }>('/api/auth/status');
        if (!cancelled) setUser(body.user);
      } catch { /* 会话异常时由外层壳处理，这里只需静默 */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    if (busy) return;
    if (form.newPassword !== form.confirmPassword) { setError(SECURITY.mismatch[locale]); return; }
    setBusy(true);
    setError('');
    try {
      await postJson('/api/portal/password', { oldPassword: form.oldPassword, newPassword: form.newPassword });
      // 后端改密后即销毁该账号的全部会话，所以必须重新登录；
      // 用替换跳转而不是路由跳转，避免用户按返回键回到已失效的账户页。
      window.location.replace(`/${locale}/account?changed=1`);
    } catch (cause) {
      const status = cause instanceof ApiError ? cause.status : 0;
      setError(status === 400 || status === 401 ? (cause as ApiError).message : SECURITY.failed[locale]);
      setBusy(false);
    }
  };

  const valid = form.oldPassword.length > 0 && form.newPassword.length >= 8 && form.newPassword.length <= 20 && form.confirmPassword.length > 0;

  return <>
    <header className="account-section-head">
      <div>
        <h2>{SECURITY.title[locale]}</h2>
        <p className="account-muted">{SECURITY.lede[locale]}</p>
      </div>
    </header>

    <section className="account-panel">
      <h3>{SECURITY.account[locale]}</h3>
      <dl className="account-facts">
        <div><dt>{SECURITY.account[locale]}</dt><dd>{user?.username || '—'}</dd></div>
        <div><dt>{SECURITY.role[locale]}</dt><dd>{user ? (ROLE[user.role]?.[locale] || user.role) : '—'}</dd></div>
      </dl>
    </section>

    <section className="account-panel">
      <h3>{SECURITY.changeTitle[locale]}</h3>
      <div className="account-form">
        <label>{SECURITY.oldPassword[locale]}
          <input required type="password" autoComplete="current-password" maxLength={200} value={form.oldPassword} onChange={(event) => setForm((current) => ({ ...current, oldPassword: event.target.value }))} />
        </label>
        <label>{SECURITY.newPassword[locale]}
          <input required type="password" autoComplete="new-password" minLength={8} maxLength={20} value={form.newPassword} onChange={(event) => setForm((current) => ({ ...current, newPassword: event.target.value }))} />
        </label>
        <label>{SECURITY.confirmPassword[locale]}
          <input required type="password" autoComplete="new-password" minLength={8} maxLength={20} value={form.confirmPassword} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} />
        </label>
        {error && <p className="account-error" role="alert">{error}</p>}
        <button className="button" type="button" disabled={busy || !valid} onClick={() => void submit()}>{busy ? COMMON.submitting[locale] : SECURITY.change[locale]}</button>
      </div>
    </section>

    <section className="account-panel">
      <h3>{SECURITY.sessionTitle[locale]}</h3>
      <button className="account-ghost" type="button" onClick={async () => {
        try { await postJson('/api/auth/logout', {}); } catch { /* 已失效视为退出成功 */ }
        window.location.replace(`/${locale}/account`);
      }}>{SECURITY.logout[locale]}</button>
    </section>
  </>;
}
