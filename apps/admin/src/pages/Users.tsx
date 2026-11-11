import { useCallback, useEffect, useState } from 'react';
import { supabase, useIsAdmin } from '../supabase';
import { Loading, PageTitle, Panel } from '../components/ui';
import VisitHandlers from './agency/VisitHandlers';

// 원칙 C5의 역할(docs/roles.md, 11/9 승인). 학생·에이전시·가드는 각자 계정 표가 따로 있다(docs/architecture.md).
// 직원 역할: 관리자 포털 직원(staff_users)에게만 뜻이 있다. 역할이 없으면 관리자다.
const STAFF_ROLES: [string, string, string][] = [
  ['admin', '관리자', '모든 화면, 사용자·권한, 회계 쓰기'],
  ['office', '오피스', '사용자·권한 없음, 회계 읽기만, 강사 포털 읽기만'],
];
// 강사 포털(LMS) 역할
const LMS_ROLES: [string, string, string][] = [
  ['teacher', '강사', '학생·성적 입력·자료실, 자기 수업 출석'],
  ['checker', '체커', '모든 수업 출석 입력(성적·자료 등록 없음)'],
  ['scheduler', '스케줄러', '수업·출석 행 만들기(성적·자료 등록 없음)'],
  ['manager', '매니저', '강사 포털 관리(시험 종류·강사 목록·출석 마감·사유 인정), 남의 기록 수정'],
];
const ALL_ROLES = [...STAFF_ROLES, ...LMS_ROLES];
const CAMPUSES = ['', 'Challenger', 'Premium', 'MCO'];
const NAME_ERRORS: Record<string, string> = {
  bad_name: '이름은 1~40자로 넣어 주세요',
  not_staff: '관리자 포털 직원(staff_users)이 아닌 계정입니다',
  not_allowed: '관리자만 고칠 수 있습니다',
};

interface Account {
  user_id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  staff_name: string | null;
  staff_role: string | null;
  roles: string[];
  teacher_name: string | null;
  agency: string | null;
  guard_campus: string | null;
  student_no: string | null;
}
interface StaffRow {
  id: string;
  user_id: string | null;
  name: string;
  active: boolean;
}

const roleName = (r: string) => {
  const [role, campus] = r.split(':');
  return (ALL_ROLES.find(([k]) => k === role)?.[1] ?? role) + (campus ? ` (${campus})` : '');
};
const kinds = (a: Account) =>
  [
    a.staff_role != null && `관리자 포털 직원(${staffLevel(a)})`,
    a.roles.some((r) => LMS_ROLES.some(([k]) => r.split(':')[0] === k)) && '강사 포털',
    a.agency && '에이전시 포털',
    a.guard_campus && '가드 태블릿',
    a.student_no && '학생 포털',
  ].filter(Boolean) as string[];
const day = (s: string | null) => (s ? s.slice(0, 10) : '-');
/** DB is_admin() 과 같은 규칙: office 만 있으면 오피스, 아니면 관리자 */
function staffLevel(a: Account) {
  const has = (k: string) => a.roles.some((r) => r.split(':')[0] === k);
  return has('office') && !has('admin') ? '오피스' : '관리자';
}

/**
 * 사용자·권한(관리자 포털, 관리자만). 로그인 계정과 사용자 종류(4개 포털)를 한눈에 보고, 직원 역할(관리자·오피스)과 강사 포털 역할을 주고 회수한다. 직원 이름도 여기서 고친다.
 * 계정 만들기는 서비스 키가 필요해 아직 Supabase 대시보드(Authentication → Add user)에서 한다.
 */
export default function Users() {
  const isAdmin = useIsAdmin();
  const [rows, setRows] = useState<Account[] | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [withStudents, setWithStudents] = useState(false);
  const [kw, setKw] = useState('');
  const [pick, setPick] = useState<Record<string, { role: string; campus: string }>>({});
  const [editing, setEditing] = useState<{ user_id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setError('');
    const [d, s] = await Promise.all([
      supabase.rpc('user_directory', { p_students: withStudents }),
      supabase.from('staff').select('id, user_id, name, active').order('name'),
    ]);
    if (d.error) setError(d.error.message);
    else setRows((d.data as Account[]) ?? []);
    if (!s.error) setStaff((s.data as StaffRow[]) ?? []);
  }, [withStudents]);

  useEffect(() => {
    load();
  }, [load]);

  if (!supabase) {
    return (
      <>
        <PageTitle title="사용자·권한" path="홈 > 기초관리 > 사용자·권한" />
        <div className="state-msg">로그인 계정은 Supabase에 있어 배포 주소(로그인한 직원)에서만 보입니다. 로컬 데이터 실행에는 계정이 없습니다.</div>
      </>
    );
  }

  if (isAdmin === false) {
    return (
      <>
        <PageTitle title="사용자·권한" path="홈 > 기초관리 > 사용자·권한" />
        <div className="state-msg">사용자·권한은 관리자만 엽니다(오피스 역할).</div>
      </>
    );
  }

  const run = async (label: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    setMsg('');
    const { error: err } = await fn();
    setBusy(false);
    if (err) setMsg(`${label} 실패: ${NAME_ERRORS[err.message] ?? err.message}`);
    else {
      setMsg(`${label} 완료`);
      setEditing(null);
      load();
    }
  };
  const addRole = (a: Account) => {
    const p = pick[a.user_id] ?? { role: 'teacher', campus: '' };
    run(`${a.email} ${roleName(p.campus ? `${p.role}:${p.campus}` : p.role)} 부여`, () => supabase!.from('user_roles').insert({ user_id: a.user_id, role: p.role, campus: p.campus }));
  };
  const removeRole = (a: Account, r: string) => {
    const [role, campus = ''] = r.split(':');
    if (!window.confirm(`${a.email}의 '${roleName(r)}' 역할을 회수할까요?`)) return;
    run(`${a.email} ${roleName(r)} 회수`, () => supabase!.from('user_roles').delete().eq('user_id', a.user_id).eq('role', role).eq('campus', campus));
  };
  /** 직원 이름(staff_users.name): 인트라넷 처리자·상담 작성자, 강사 포털 '체크한 사람'으로 남는다(20261109120000_staff_name.sql, 관리자만) */
  const saveName = (a: Account) => {
    const name = (editing?.name ?? '').trim();
    if (!name || name === a.staff_name) return setEditing(null);
    run(`${a.email} 이름 '${name}'`, () => supabase!.rpc('staff_set_name', { p_user: a.user_id, p_name: name }));
  };
  const linkStaff = (a: Account, staffId: string) => {
    if (!staffId) return;
    run(`${a.email} 강사 목록 연결`, () => supabase!.from('staff').update({ user_id: a.user_id, updated_at: new Date().toISOString() }).eq('id', staffId));
  };

  const k = kw.trim().toLowerCase();
  const list = (rows ?? []).filter((a) => !k || `${a.email} ${a.staff_name ?? ''} ${a.teacher_name ?? ''} ${a.agency ?? ''}`.toLowerCase().includes(k));
  const unlinked = staff.filter((s) => !s.user_id && s.active);

  return (
    <>
      <PageTitle title="사용자·권한" path="홈 > 기초관리 > 사용자·권한" />

      <Panel title="역할 안내">
        <table className="tbl">
          <thead>
            <tr><th className="left">포털</th><th className="left">계정 표 · 역할</th><th className="left">주는 곳</th></tr>
          </thead>
          <tbody>
            <tr><td>관리자 포털(인트라넷 포함)</td><td>직원(staff_users) · {STAFF_ROLES.map(([, n, d]) => <div key={n}><strong>{n}</strong> <span className="muted">{d}</span></div>)}<span className="muted">역할이 없는 직원은 관리자</span></td><td className="muted">직원 등록은 Supabase(서비스 키), 이름·역할은 이 화면</td></tr>
            <tr><td>강사 포털(LMS)</td><td>{LMS_ROLES.map(([, n, d]) => <div key={n}><strong>{n}</strong> <span className="muted">{d}</span></div>)}</td><td>이 화면</td></tr>
            <tr><td>에이전시 포털</td><td>에이전시 지점(agency_members)</td><td className="muted">가입 신청 → 관리자 포털 '파트너 포털 관리 › 지점 계정'에서 승인</td></tr>
            <tr><td>학생 포털</td><td>학생(student_users, 학생번호 + 생년월일, 첫 로그인 때 변경)</td><td className="muted">npm run student:accounts (서비스 키)</td></tr>
            <tr><td>가드 태블릿</td><td>출입구 공용(guard_accounts)</td><td className="muted">Supabase 계정 + SQL(docs/intranet.md)</td></tr>
          </tbody>
        </table>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
          새 로그인 계정은 Supabase → Authentication → Users → Add user(Auto Confirm)로 만든 뒤 이 화면에서 역할을 줍니다. 계정 만들기 화면은 서비스 키 서버를 붙인 뒤 만듭니다.
        </p>
      </Panel>

      <div className="toolbar">
        <span>
          계정 <strong style={{ color: 'var(--primary)' }}>{rows ? list.length : '-'}</strong>개
          <label style={{ marginLeft: 12, fontSize: 12 }}>
            <input type="checkbox" checked={withStudents} onChange={(e) => setWithStudents(e.target.checked)} /> 학생 계정 포함
          </label>
        </span>
        <span className="toolbar-right">
          <input type="search" placeholder="이메일·이름·에이전시" value={kw} onChange={(e) => setKw(e.target.value)} style={{ height: 30, padding: '0 8px', border: '1px solid #c5cad2', borderRadius: 3 }} />
        </span>
      </div>
      {msg && <div className={msg.includes('실패') ? 'text-red' : 'text-blue'} role="status" style={{ fontSize: 12 }}>{msg}</div>}

      {!rows ? (
        <Loading error={error} />
      ) : (
        <div className="grid-box">
          <table className="tbl big" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th className="left">이메일</th>
                <th className="left">쓰는 포털</th>
                <th className="left">이름</th>
                <th className="left">역할</th>
                <th className="left">역할 주기</th>
                <th>가입</th>
                <th>최근 로그인</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && <tr className="empty"><td colSpan={7}>계정이 없습니다.</td></tr>}
              {list.map((a) => {
                const p = pick[a.user_id] ?? { role: 'teacher', campus: '' };
                const setP = (patch: Partial<typeof p>) => setPick((m) => ({ ...m, [a.user_id]: { ...p, ...patch } }));
                return (
                  <tr key={a.user_id}>
                    <td className="left nowrap">{a.email}</td>
                    <td className="left" style={{ fontSize: 12 }}>{kinds(a).join(', ') || <span className="muted">없음</span>}</td>
                    <td className="left">
                      {editing?.user_id === a.user_id ? (
                        <form className="nowrap" onSubmit={(e) => { e.preventDefault(); saveName(a); }}>
                          <input aria-label="직원 이름" autoFocus maxLength={40} value={editing.name} onChange={(e) => setEditing({ user_id: a.user_id, name: e.target.value })}
                            onKeyDown={(e) => e.key === 'Escape' && setEditing(null)} style={{ width: 120, height: 24, fontSize: 12 }} />
                          <button type="submit" className="btn btn-xs" style={{ marginLeft: 4 }} disabled={busy}>저장</button>
                          <button type="button" className="btn btn-xs" style={{ marginLeft: 2 }} onClick={() => setEditing(null)}>취소</button>
                        </form>
                      ) : (
                        <>
                          {a.staff_name || a.teacher_name || a.agency || (a.guard_campus ? `${a.guard_campus} 정문` : '') || a.student_no || (a.staff_role != null ? <span className="text-red">이름 없음</span> : '-')}
                          {a.staff_role != null && (
                            <button type="button" className="btn btn-xs" style={{ marginLeft: 4, height: 22 }} disabled={busy} onClick={() => setEditing({ user_id: a.user_id, name: a.staff_name ?? '' })} aria-label={`${a.email} 직원 이름 고치기`}>이름</button>
                          )}
                        </>
                      )}
                      {a.roles.length > 0 && !a.teacher_name && unlinked.length > 0 && (
                        <select aria-label="강사 목록 연결" defaultValue="" onChange={(e) => linkStaff(a, e.target.value)} disabled={busy} style={{ marginLeft: 6, fontSize: 12 }}>
                          <option value="">강사 목록 연결…</option>
                          {unlinked.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td className="left">
                      {a.roles.length === 0 ? (
                        <span className="muted">-</span>
                      ) : (
                        a.roles.map((r) => (
                          <span key={r} className="nowrap" style={{ marginRight: 8 }}>
                            {roleName(r)}
                            <button type="button" className="btn btn-xs" style={{ marginLeft: 4, height: 22 }} onClick={() => removeRole(a, r)} disabled={busy} aria-label={`${roleName(r)} 회수`}>×</button>
                          </span>
                        ))
                      )}
                    </td>
                    <td className="left nowrap">
                      {!a.student_no && (
                        <>
                          <select aria-label="역할" value={p.role} onChange={(e) => setP({ role: e.target.value })} style={{ fontSize: 12 }}>
                            {(a.staff_role != null ? ALL_ROLES : LMS_ROLES).map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                          </select>
                          <select aria-label="캠퍼스" value={p.campus} onChange={(e) => setP({ campus: e.target.value })} style={{ fontSize: 12, marginLeft: 4 }}>
                            {CAMPUSES.map((c) => <option key={c} value={c}>{c || '전체 캠퍼스'}</option>)}
                          </select>
                          <button type="button" className="btn btn-xs" style={{ marginLeft: 4 }} onClick={() => addRole(a)} disabled={busy}>주기</button>
                        </>
                      )}
                    </td>
                    <td className="nowrap">{day(a.created_at)}</td>
                    <td className="nowrap">{day(a.last_sign_in_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 방문 신청 처리자(CL-046, 11/12 결정): 나라별 마케터, 캠퍼스별 센터장 */}
      {rows && <VisitHandlers staff={rows.filter((a) => a.staff_role != null).map((a) => ({ user_id: a.user_id, label: a.staff_name ? `${a.staff_name} (${a.email})` : a.email }))} />}
    </>
  );
}
