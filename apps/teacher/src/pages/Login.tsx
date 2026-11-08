import { useState, type FormEvent } from 'react';
import { errText, supabase } from '../supabase';

export default function Login() {
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
        <div className="brand">
          <span className="brand-mark">JIC</span>
          <span className="brand-name">강사 포털</span>
        </div>
        <label>
          이메일
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          비밀번호
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error && <p className="err" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
        <p className="muted small">관리자 포털과 같은 계정입니다. 계정은 관리자가 발급합니다.</p>
      </form>
    </div>
  );
}
