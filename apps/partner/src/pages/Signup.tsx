import { COUNTRIES } from '../shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { errText, resendSignupEmail, supabase } from '../supabase';
import { Box, Msg } from '../ui';


// 0.2 등록 신청: 지점 대표 아이디 신청 → JIC 관리자 승인 후 로그인 가능.
// staff: 지점 직원 가입(CL-032). 대표가 등록해 둔 이메일로 가입하고 인증하면, 로그인할 때 그 지점 직원 아이디가 된다(JIC 승인 없음).
// 두 화면은 다른 컴포넌트로 둔다(같은 컴포넌트에서 조건부로 return 하면 /signup ↔ /signup/staff 이동 때 훅 순서가 바뀌어 깨진다).
export default function Signup({ staff = false }: { staff?: boolean }) {
  return staff ? <StaffSignup /> : <OwnerSignup />;
}

/** 인증 메일이 안 왔을 때: 스팸함 안내 + 다시 보내기 */
export function ResendBox({ email }: { email: string }) {
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const resend = async () => {
    setBusy(true);
    const err = await resendSignupEmail(email);
    setBusy(false);
    setMsg(err ? { kind: 'err', text: err } : { kind: 'ok', text: `${email}로 인증 메일을 다시 보냈습니다.` });
  };
  return (
    <div style={{ fontSize: 13, lineHeight: 1.7 }}>
      <span className="muted">메일이 안 왔으면 스팸함을 먼저 보세요. 링크는 한 번만 쓸 수 있고 시간이 지나면 끝납니다.</span>{' '}
      <button type="button" className="btn btn-sm" onClick={resend} disabled={busy}>{busy ? '보내는 중…' : '인증 메일 다시 보내기'}</button>
      {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
    </div>
  );
}

function OwnerSignup() {
  const [f, setF] = useState({ agency_name: '', branch: '', country: '한국', contact_name: '', phone: '', email: '', password: '', message: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.password.length < 8) {
      setErr('비밀번호는 8자 이상으로 정하세요.');
      return;
    }
    setBusy(true);
    setErr('');
    const { email, password, ...meta } = f;
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${location.origin}/login`, data: { portal: 'partner', ...meta } },
    });
    setBusy(false);
    if (error) setErr(errText(error));
    else setDone(true);
  };

  if (done) {
    return (
      <div className="auth">
        <Box title="등록 신청 완료">
          <div className="box-body form">
            <Msg kind="ok">신청을 받았습니다.</Msg>
            <p style={{ margin: 0, lineHeight: 1.8 }}>
              1. <strong>{f.email}</strong>로 보낸 인증 메일의 링크를 누르세요.<br />
              2. JIC 관리자가 신청을 확인하고 승인하면 로그인할 수 있습니다.
            </p>
            <ResendBox email={f.email} />
            <Link className="btn" to="/">처음으로</Link>
          </div>
        </Box>
      </div>
    );
  }

  return (
    <div className="auth" style={{ maxWidth: 640 }}>
      <Box title="등록 신청">
        <form className="form box-body" onSubmit={submit}>
          <div className="form-grid">
            <label>에이전시명<input required value={f.agency_name} onChange={set('agency_name')} /></label>
            <label>지점<input value={f.branch} onChange={set('branch')} placeholder="예: 서울점" /></label>
            <label>
              국가
              <select value={f.country} onChange={set('country')}>
                {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>담당자<input required value={f.contact_name} onChange={set('contact_name')} /></label>
            <label>연락처<input value={f.phone} onChange={set('phone')} /></label>
          </div>
          <div className="form-grid">
            <label>
              아이디 (이메일)
              <input type="email" autoComplete="username" required value={f.email} onChange={set('email')} />
              <span className="hint">지점 공용 이메일을 권장합니다.</span>
            </label>
            <label>
              비밀번호
              <input type="password" autoComplete="new-password" required value={f.password} onChange={set('password')} />
              <span className="hint">8자 이상</span>
            </label>
          </div>
          <label>남길 말 (선택)<textarea value={f.message} onChange={set('message')} /></label>
          {err && <Msg kind="err">{err}</Msg>}
          <div className="form-actions">
            <Link className="btn btn-lg" to="/login">취소</Link>
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? '보내는 중…' : '신청'}</button>
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 12 }}>지점 직원이면 이 신청 대신 <Link to="/signup/staff">직원 가입</Link>을 하세요(지점 대표가 먼저 직원 이메일을 등록합니다).</p>
        </form>
      </Box>
    </div>
  );
}

function StaffSignup() {
  const [f, setF] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (f.password.length < 8) {
      setErr('비밀번호는 8자 이상으로 정하세요.');
      return;
    }
    setBusy(true);
    setErr('');
    const { error } = await supabase.auth.signUp({
      email: f.email.trim().toLowerCase(),
      password: f.password,
      options: { emailRedirectTo: `${location.origin}/login`, data: { portal: 'partner_staff' } },
    });
    setBusy(false);
    if (error) setErr(errText(error));
    else setDone(true);
  };

  if (done) {
    return (
      <div className="auth">
        <Box title="직원 가입 완료">
          <div className="box-body form">
            <Msg kind="ok">가입을 받았습니다.</Msg>
            <p style={{ margin: 0, lineHeight: 1.8 }}>
              1. <strong>{f.email}</strong>로 보낸 인증 메일의 링크를 누르세요.<br />
              2. 로그인하면 지점 대표가 등록한 이메일인지 확인하고 바로 지점 직원 아이디로 열립니다.
            </p>
            <ResendBox email={f.email} />
            <Link className="btn" to="/login">로그인</Link>
          </div>
        </Box>
      </div>
    );
  }

  return (
    <div className="auth">
      <Box title="지점 직원 가입">
        <form className="form box-body" onSubmit={submit}>
          <Msg kind="warn">지점 대표가 '내 계정 › 직원 아이디'에서 먼저 이 이메일을 등록해야 합니다. 등록되지 않은 이메일은 가입해도 포털을 쓸 수 없습니다.</Msg>
          <label>
            아이디 (이메일)
            <input type="email" autoComplete="username" required value={f.email} onChange={set('email')} />
            <span className="hint">대표가 등록한 이메일과 같게</span>
          </label>
          <label>
            비밀번호
            <input type="password" autoComplete="new-password" required value={f.password} onChange={set('password')} />
            <span className="hint">8자 이상. 비밀번호는 본인만 압니다</span>
          </label>
          {err && <Msg kind="err">{err}</Msg>}
          <div className="form-actions">
            <Link className="btn btn-lg" to="/login">취소</Link>
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? '보내는 중…' : '가입'}</button>
          </div>
        </form>
      </Box>
    </div>
  );
}
