import { useState, type FormEvent } from 'react';
import { useT } from '../i18n';
import { errText, supabase } from '../supabase';

export default function Login() {
  const { t, lang, setLang } = useT();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError(errText(err));
    setBusy(false);
  };

  return (
    <div className="login">
      <form className="login-box" onSubmit={submit}>
        <div className="login-head">
          <div className="brand">
            <span className="brand-mark">JIC</span>
            <span className="brand-name">{t('appName')}</span>
          </div>
          <button type="button" className="btn btn-xs" onClick={() => setLang(lang === 'ko' ? 'en' : 'ko')} aria-label="Language">{lang === 'ko' ? 'EN' : '한국어'}</button>
        </div>
        <label>
          {t('email')}
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          {t('password')}
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="err" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? t('checking') : t('login')}</button>
        <p className="muted small">{t('loginNote')}</p>
      </form>
    </div>
  );
}
