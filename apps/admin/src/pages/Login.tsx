import { useState, type FormEvent } from 'react';
import { supabase } from '../supabase';

function loginMessage(e: { message: string; status?: number }) {
  if (e.message === 'Invalid login credentials') return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (!e.status) return '로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.';
  return e.message;
}

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(loginMessage(error));
  }

  return (
    <div className="login">
      <form className="login-box" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark">JIC</span>
          <span className="brand-name">통합관리</span>
        </div>
        <label>
          이메일
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          비밀번호
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? '확인 중…' : '로그인'}
        </button>
        <p className="login-foot">계정은 관리자가 발급합니다.</p>
      </form>
    </div>
  );
}
