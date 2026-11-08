import { useState, type FormEvent, type ReactNode } from 'react';
import type { Meta } from '../api';
import { authMode, signIn } from '../auth';
import { LangSelect } from '../components/Layout';
import { errorText, useI18n } from '../i18n';

/** 로그인 화면. 로컬 개발은 학생번호 + 생년월일, Supabase 는 학생번호 + 비밀번호(처음에는 생년월일). */
export function AuthShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="login">
      <header className="app-header">
        <span className="app-brand">
          <span className="app-brand-mark">JIC</span>
          <span className="app-brand-name">{t('app.name')}</span>
        </span>
        <LangSelect />
      </header>
      {children}
    </div>
  );
}

export default function Login({ meta, notice }: { meta: Meta | null; notice?: string }) {
  const { t } = useI18n();
  const [stId, setStId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const local = authMode === 'local';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setTried(true);
    setError(null);
    const code = await signIn(stId.replace(/\D/g, ''), local ? password.trim() : password);
    if (code) {
      setError(errorText(t, code));
      setBusy(false);
    }
  }

  const shown = error ?? (!tried && notice ? errorText(t, notice) : null);
  return (
    <AuthShell>
      <form className="login-box" onSubmit={submit}>
        <h1>{t('login.title')}</h1>
        <label>
          {t('login.stId')}
          <input inputMode="numeric" autoComplete="username" required value={stId} onChange={(e) => setStId(e.target.value)} />
        </label>
        <label>
          {local ? t('login.birthday') : t('login.password')}
          <input
            type="password"
            inputMode={local ? 'numeric' : undefined}
            autoComplete="current-password"
            maxLength={local ? 10 : 72}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {shown && (
          <p className="form-error" role="alert">
            {shown}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? t('login.checking') : t('login.submit')}
        </button>
        <p className="login-note">{local ? t('login.local') : t('login.firstHint')}</p>
        {meta?.sampleLogin && <p className="login-note sample">{t('login.sampleHint', meta.sampleLogin)}</p>}
      </form>
    </AuthShell>
  );
}
