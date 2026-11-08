import { useState, type FormEvent } from 'react';
import { signIn } from '../auth';

/** 배포 전용: 직원 계정 로그인(관리자 앱과 같은 계정). */
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const msg = await signIn(email, password);
    setBusy(false);
    if (msg) setError(msg);
  }

  return (
    <div className="login">
      <form className="login-box" onSubmit={submit}>
        <div className="brand">
          <span className="brand-mark">JIC</span>
          <span className="brand-name">인트라넷</span>
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
        <p className="login-foot">직원 계정은 관리자가 발급합니다.</p>
      </form>
    </div>
  );
}
