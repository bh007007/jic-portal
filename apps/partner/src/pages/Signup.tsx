import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { errText, supabase } from '../supabase';
import { Box, Msg } from '../ui';

const COUNTRIES = ['한국', '일본', '대만', '중국', '베트남', '사우디아라비아', '태국', '몽골', '기타'];

// 0.2 등록 신청: 지점 계정 신청 → JIC 관리자 승인 후 로그인 가능
export default function Signup() {
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
        </form>
      </Box>
    </div>
  );
}
