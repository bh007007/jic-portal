import { useState, type FormEvent } from 'react';
import { changePassword, signOut } from '../auth';
import { SubTitle } from '../components/Layout';
import { errorText, useI18n } from '../i18n';
import { AuthShell } from './Login';

/**
 * 비밀번호 변경(Supabase 계정). forced: 첫 로그인(생년월일 비밀번호) 뒤 앱을 쓰기 전에 반드시 바꾸는 화면.
 * 지금 비밀번호를 다시 확인한 뒤 바꾼다. 규칙은 server/accounts.ts 의 checkNewPassword.
 */
export default function Password({ forced = false }: { forced?: boolean }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDone(false);
    const code = await changePassword(current, next, confirm);
    setBusy(false);
    if (code) {
      setError(errorText(t, code));
      return;
    }
    setCurrent('');
    setNext('');
    setConfirm('');
    setDone(true);
  }

  const form = (
    <form className={forced ? 'login-box' : 'login-box in-app'} onSubmit={submit}>
      {forced && <h1>{t('pw.title')}</h1>}
      {forced && <p className="login-note">{t('pw.forced')}</p>}
      <label>
        {t('pw.current')}
        <input type="password" autoComplete="current-password" maxLength={72} required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label>
        {t('pw.new')}
        <input type="password" autoComplete="new-password" maxLength={72} required value={next} onChange={(e) => setNext(e.target.value)} aria-describedby="pw-rule" />
      </label>
      <label>
        {t('pw.confirm')}
        <input type="password" autoComplete="new-password" maxLength={72} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      <p className="login-note" id="pw-rule">
        {t('pw.rule')}
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="form-ok" role="status">
          {t('pw.done')}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? t('pw.saving') : t('pw.submit')}
      </button>
      {forced && (
        <button type="button" className="btn btn-block" onClick={() => void signOut()}>
          {t('me.logout')}
        </button>
      )}
    </form>
  );

  if (forced) return <AuthShell>{form}</AuthShell>;
  return (
    <>
      <SubTitle title={t('pw.title')} back="/me" />
      {form}
    </>
  );
}
