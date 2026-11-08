import { useState, type FormEvent } from 'react';
import { ApiError, login, setStudentId, type Meta } from '../api';
import { LangSelect } from '../components/Layout';
import { errorText, useI18n } from '../i18n';

export default function Login({ meta }: { meta: Meta | null }) {
  const { t } = useI18n();
  const [stId, setStId] = useState('');
  const [birthday, setBirthday] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await login(stId.trim(), birthday.trim());
      setStudentId(r.stId);
    } catch (err) {
      setError(errorText(t, (err as ApiError).code));
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <header className="app-header">
        <span className="app-brand">
          <span className="app-brand-mark">JIC</span>
          <span className="app-brand-name">{t('app.name')}</span>
        </span>
        <LangSelect />
      </header>
      <form className="login-box" onSubmit={submit}>
        <h1>{t('login.title')}</h1>
        <label>
          {t('login.stId')}
          <input inputMode="numeric" autoComplete="username" required value={stId} onChange={(e) => setStId(e.target.value)} />
        </label>
        <label>
          {t('login.birthday')}
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            maxLength={10}
            required
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {busy ? t('login.checking') : t('login.submit')}
        </button>
        <p className="login-note">{t('login.local')}</p>
        {meta?.sampleLogin && <p className="login-note sample">{t('login.sampleHint', meta.sampleLogin)}</p>}
      </form>
    </div>
  );
}
