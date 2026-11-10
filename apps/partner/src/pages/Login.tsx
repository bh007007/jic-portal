import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { errText, supabase } from '../supabase';
import { Box, Msg } from '../ui';
import { ResendBox } from './Signup';

// 0.1 로그인
export default function Login() {
  const { session, allowed } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);

  if (session && allowed) return <Navigate to={next} replace />;
  if (session && !allowed) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setMsg({ kind: 'err', text: errText(error) });
    setUnconfirmed(Boolean(error && /not confirmed/i.test(error.message)));
  };

  const forgot = async () => {
    if (!email.trim()) {
      setMsg({ kind: 'err', text: '비밀번호를 찾을 이메일을 먼저 입력하세요.' });
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/reset` });
    setMsg(error ? { kind: 'err', text: errText(error) } : { kind: 'ok', text: '비밀번호 재설정 메일을 보냈습니다. 메일의 링크를 눌러 새 비밀번호를 정하세요.' });
  };

  return (
    <div className="auth">
      <Box title="로그인">
        <form className="form box-body" onSubmit={submit}>
          <label>
            아이디 (이메일)
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label>
            비밀번호
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
          {unconfirmed && <ResendBox email={email} />}
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? '확인 중…' : '로그인'}</button>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
            <button type="button" className="link" onClick={forgot}>비밀번호 찾기</button>
            <span><Link to="/signup">등록 신청</Link> · <Link to="/signup/staff">직원 가입</Link></span>
          </div>
          <p className="hint" style={{ margin: 0 }}>대표 아이디는 지점 단위로 발급됩니다(등록 신청 → JIC 승인). 직원 아이디는 지점 대표가 이메일을 등록한 뒤 직원 가입으로 만듭니다.</p>
        </form>
      </Box>
    </div>
  );
}
