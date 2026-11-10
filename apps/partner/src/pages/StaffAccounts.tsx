import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLoad } from '../data';
import { errText, must, supabase } from '../supabase';
import { Box, Loading, Msg } from '../ui';

interface StaffRow {
  user_id: string;
  email: string;
  contact_name: string | null;
  status: 'active' | 'suspended';
  login_count: number;
  last_login_at: string | null;
  created_at: string;
}
interface Invite {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

/**
 * 직원 아이디(CL-032, 지점 대표만). 11/10 레오님 결정: 대표가 직원 이름·이메일을 등록하면,
 * 직원이 그 이메일로 '직원 가입'(/signup/staff)·이메일 인증 후 로그인할 때 이 지점 직원 아이디가 된다. JIC 승인은 없다.
 * 직원은 상담·자료·공지만 본다. 대표가 정지·해제한다(set_agency_staff_status). DB 규칙은 20261110193000_agency_staff.sql.
 */
export default function StaffAccounts() {
  const { member } = useAuth();
  const ownerId = member?.user_id ?? '';
  const { data, error, reload } = useLoad(async () => {
    const [staff, invites] = await Promise.all([
      must<StaffRow[]>(supabase.from('agency_members').select('user_id,email,contact_name,status,login_count,last_login_at,created_at').eq('owner_id', ownerId).order('created_at')),
      must<Invite[]>(supabase.from('agency_staff_invites').select('id,email,name,created_at').is('claimed_at', null).order('created_at')),
    ]);
    return { staff, invites };
  }, [ownerId]);
  const [f, setF] = useState({ name: '', email: '' });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!data) return <Box title="직원 아이디"><Loading error={error} /></Box>;

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const email = f.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setMsg({ kind: 'err', text: '이메일 형식을 확인하세요.' });
    if (email === member?.email.toLowerCase()) return setMsg({ kind: 'err', text: '대표 아이디 이메일은 직원으로 등록할 수 없습니다.' });
    setBusy(true);
    const { error: e1 } = await supabase.from('agency_staff_invites').insert({ email, name: f.name.trim() });
    setBusy(false);
    if (e1) {
      const dup = /duplicate|unique/i.test(e1.message);
      return setMsg({ kind: 'err', text: dup ? '이미 등록된 이메일입니다. 다른 지점에 등록된 이메일일 수도 있습니다.' : errText(e1) });
    }
    setMsg({ kind: 'ok', text: `${email}을 등록했습니다. 직원에게 '직원 가입' 주소(${location.origin}/signup/staff)를 알려 주세요.` });
    setF({ name: '', email: '' });
    reload();
  };
  const cancel = async (inv: Invite) => {
    if (!window.confirm(`${inv.email} 등록을 지울까요?`)) return;
    const { error: e1 } = await supabase.from('agency_staff_invites').delete().eq('id', inv.id);
    setMsg(e1 ? { kind: 'err', text: errText(e1) } : { kind: 'ok', text: `${inv.email} 등록을 지웠습니다.` });
    reload();
  };
  const setActive = async (s: StaffRow, active: boolean) => {
    if (!active && !window.confirm(`${s.contact_name || s.email} 직원 아이디를 정지할까요? 정지하면 그 직원은 포털을 쓸 수 없습니다.`)) return;
    const { error: e1 } = await supabase.rpc('set_agency_staff_status', { p_user: s.user_id, p_active: active });
    setMsg(e1 ? { kind: 'err', text: errText(e1) } : { kind: 'ok', text: `${s.contact_name || s.email} 직원 아이디를 ${active ? '다시 열었습니다' : '정지했습니다'}.` });
    reload();
  };

  return (
    <Box title={<>직원 아이디 <small className="muted">(대표만)</small></>}>
      <div className="box-body">
        {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
        <div className="scroll">
          <table className="tbl center">
            <thead><tr><th className="left">이름</th><th className="left">아이디 (이메일)</th><th>상태</th><th>접속</th><th>최근 접속</th><th></th></tr></thead>
            <tbody>
              {data.staff.map((s) => (
                <tr key={s.user_id}>
                  <td className="left strong">{s.contact_name || '-'}</td>
                  <td className="left">{s.email}</td>
                  <td>{s.status === 'active' ? '사용 중' : <span className="text-red">정지</span>}</td>
                  <td>{s.login_count}</td>
                  <td className="muted">{s.last_login_at?.slice(0, 10) ?? '-'}</td>
                  <td>
                    {s.status === 'active'
                      ? <button type="button" className="btn btn-sm" onClick={() => setActive(s, false)}>정지</button>
                      : <button type="button" className="btn btn-sm btn-primary" onClick={() => setActive(s, true)}>정지 해제</button>}
                  </td>
                </tr>
              ))}
              {data.invites.map((inv) => (
                <tr key={`i${inv.id}`}>
                  <td className="left strong">{inv.name || '-'}</td>
                  <td className="left">{inv.email}</td>
                  <td className="muted">가입 전</td>
                  <td>-</td>
                  <td className="muted">등록 {inv.created_at.slice(0, 10)}</td>
                  <td><button type="button" className="btn btn-sm" onClick={() => cancel(inv)}>등록 취소</button></td>
                </tr>
              ))}
              {data.staff.length + data.invites.length === 0 && <tr className="empty"><td colSpan={6}>등록한 직원이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
        <form className="form" onSubmit={add} style={{ marginTop: 12 }}>
          <div className="form-grid">
            <label>직원 이름<input value={f.name} maxLength={80} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} /></label>
            <label>
              직원 이메일
              <input type="email" required value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} />
              <span className="hint">직원 본인이 쓰는 이메일. 인증 메일이 이 주소로 갑니다</span>
            </label>
          </div>
          <div className="form-actions"><button type="submit" className="btn btn-primary" disabled={busy}>직원 등록</button></div>
        </form>
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0', lineHeight: 1.7 }}>
          등록한 뒤 직원에게 <Link to="/signup/staff">직원 가입</Link> 주소를 알려 주세요. 직원이 그 이메일로 가입하고 인증 메일을 누른 뒤 로그인하면 이 지점 직원 아이디가 됩니다.
          직원 아이디는 상담·자료·공지만 볼 수 있습니다(견적·학비표·공실·등록·방문 신청·직원 관리는 대표만). 비밀번호는 직원 본인만 압니다.
        </p>
      </div>
    </Box>
  );
}
