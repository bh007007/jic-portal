import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../supabase';
import { Loading, PageTitle, Panel } from '../components/ui';

/**
 * 에이전시 포털 관리(1단계, 11/10 결정 '에이전시 관리 화면을 관리자 포털로 옮긴다', docs/leo-todo.md D-4).
 * 직원이 매일 쓰는 가입 승인·지점 계정·방문 신청·사용 통계를 관리자 포털 한 번 로그인으로 처리한다. 표는 파트너 포털 표 그대로
 * (agency_requests·agency_members·visit_requests·plan_downloads, 20261107010000_partner_portal.sql), 권한은 직원(is_staff, RLS).
 * 추천 규칙·콘텐츠·자료실·공지·링크 설정은 2단계로 옮기기 전까지 에이전시 포털 /admin 에 있다.
 */
type Tab = 'requests' | 'members' | 'visits' | 'stats';
const TABS: [Tab, string][] = [['requests', '가입 승인'], ['members', '지점 계정'], ['visits', '방문 신청'], ['stats', '사용 통계']];

export default function AgencyPortal() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get('tab'))?.[0] ?? 'requests') as Tab;
  if (!supabase) {
    return (
      <>
        <PageTitle title="에이전시 포털 관리" path="홈 > 에이전시 > 에이전시 포털 관리" />
        <div className="state-msg">에이전시 포털 계정·신청은 Supabase에 있어 배포 주소(로그인한 직원)에서만 보입니다. 로컬 데이터 실행에는 없습니다.</div>
      </>
    );
  }
  return (
    <>
      <PageTitle title="에이전시 포털 관리" path="홈 > 에이전시 > 에이전시 포털 관리" />
      <div className="toolbar">
        <span>
          {TABS.map(([k, label]) => (
            <button key={k} type="button" className={'btn btn-xs' + (tab === k ? ' btn-primary' : '')} style={{ marginRight: 4 }} onClick={() => setParams(k === 'requests' ? {} : { tab: k }, { replace: true })}>
              {label}
            </button>
          ))}
        </span>
        <span className="toolbar-right muted" style={{ fontSize: 12 }}>추천 규칙·콘텐츠·자료실·공지는 에이전시 포털 관리자 화면(2단계 이전 예정)</span>
      </div>
      {tab === 'requests' && <Requests />}
      {tab === 'members' && <Members />}
      {tab === 'visits' && <Visits />}
      {tab === 'stats' && <Stats />}
    </>
  );
}

/** 조회 + 다시 읽기 */
function useRows<T>(fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  const [rows, setRows] = useState<T | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const { data, error: e } = await fn();
    if (e) setError(e.message);
    else setRows(data);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [load]);
  return { rows, error, reload: load };
}

function Status({ msg }: { msg: { ok: boolean; text: string } | null }) {
  return msg ? <div className={msg.ok ? 'text-blue' : 'text-red'} role="status" style={{ fontSize: 12, margin: '4px 0' }}>{msg.text}</div> : null;
}

// ── 가입 승인(에이전시 포털 12.1)
interface Req {
  id: number;
  email: string;
  agency_name: string;
  branch: string | null;
  country: string | null;
  contact_name: string | null;
  phone: string | null;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}
const REQ_LABEL = { pending: '대기', approved: '승인', rejected: '반려' };

function Requests() {
  const { rows, error, reload } = useRows<Req[]>(() => supabase!.from('agency_requests').select('*').order('created_at', { ascending: false }));
  const [done, setDone] = useState(false);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!rows) return <Loading error={error} />;
  const list = rows.filter((r) => (done ? r.status !== 'pending' : r.status === 'pending'));
  const decide = async (r: Req, approve: boolean) => {
    if (!approve && !window.confirm(`${r.agency_name} ${r.branch ?? ''} 신청을 반려할까요?`)) return;
    setBusy(true);
    const { error: e } = await supabase!.rpc('approve_agency_request', { p_request_id: r.id, p_approve: approve, p_note: notes[r.id] || null });
    setBusy(false);
    setMsg(e ? { ok: false, text: `처리 실패: ${e.message}` } : { ok: true, text: `${r.agency_name} ${r.branch ?? ''} — ${approve ? '승인' : '반려'}했습니다.` });
    reload();
  };
  return (
    <Panel
      title={<>가입 승인 <small>(대기 {rows.filter((r) => r.status === 'pending').length}건)</small></>}
      extra={<button type="button" className="btn btn-xs" onClick={() => setDone(!done)}>{done ? '대기 보기' : '처리 완료 보기'}</button>}
    >
      <Status msg={msg} />
      <div className="grid-box">
        <table className="tbl center" style={{ minWidth: 980 }}>
          <thead>
            <tr><th>신청일</th><th className="left">에이전시 · 지점</th><th>국가</th><th className="left">담당자</th><th className="left">아이디</th><th className="left">남길 말</th><th className="left">메모</th><th>{done ? '결과' : '처리'}</th></tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr className="empty"><td colSpan={8}>{done ? '처리한 신청이 없습니다.' : '대기 중인 신청이 없습니다.'}</td></tr>}
            {list.map((r) => (
              <tr key={r.id}>
                <td className="nowrap">{r.created_at.slice(0, 10)}</td>
                <td className="left strong">{r.agency_name} {r.branch}</td>
                <td>{r.country}</td>
                <td className="left">{r.contact_name}<div className="muted" style={{ fontSize: 12 }}>{r.phone}</div></td>
                <td className="left">{r.email}</td>
                <td className="left memo-text" style={{ maxWidth: 240 }}>{r.message}</td>
                <td className="left">
                  {done ? <span className="memo-text">{r.review_note}</span> : (
                    <input aria-label="관리자 메모" value={notes[r.id] ?? ''} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} style={{ height: 26, minWidth: 140 }} />
                  )}
                </td>
                <td className="nowrap">
                  {done ? (
                    <span className={r.status === 'approved' ? 'text-blue' : 'text-red'}>{REQ_LABEL[r.status]} {r.reviewed_at?.slice(0, 10)}</span>
                  ) : (
                    <>
                      <button type="button" className="btn btn-xs btn-primary" disabled={busy} onClick={() => decide(r, true)}>승인</button>
                      <button type="button" className="btn btn-xs" style={{ marginLeft: 4 }} disabled={busy} onClick={() => decide(r, false)}>반려</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>신청자는 이메일 인증을 마쳐야 로그인할 수 있습니다. 승인하면 바로 에이전시 포털을 쓸 수 있습니다.</p>
    </Panel>
  );
}

// ── 지점 계정·정지(12.1)
interface Member {
  user_id: string;
  email: string;
  agency_name: string;
  branch: string | null;
  country: string | null;
  contact_name: string | null;
  phone: string | null;
  status: 'active' | 'suspended';
  legacy_am_id: string | null;
  login_count: number;
  last_login_at: string | null;
}

function Members() {
  const { rows, error, reload } = useRows<Member[]>(() => supabase!.from('agency_members').select('user_id, email, agency_name, branch, country, contact_name, phone, status, legacy_am_id, login_count, last_login_at').order('agency_name'));
  const [kw, setKw] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!rows) return <Loading error={error} />;
  const k = kw.trim().toLowerCase();
  const list = rows.filter((m) => !k || `${m.agency_name} ${m.branch ?? ''} ${m.email} ${m.contact_name ?? ''}`.toLowerCase().includes(k));
  const update = async (m: Member, patch: Partial<Member>, done: string) => {
    if (patch.status === 'suspended' && !window.confirm(`${m.agency_name} ${m.branch ?? ''} 계정을 정지할까요? 정지하면 에이전시 포털에서 아무것도 볼 수 없습니다.`)) return;
    const { error: e } = await supabase!.from('agency_members').update(patch).eq('user_id', m.user_id);
    setMsg(e ? { ok: false, text: `저장 실패: ${e.message}` } : { ok: true, text: done });
    reload();
  };
  return (
    <Panel
      title={<>지점 계정 <small>({rows.length}개)</small></>}
      extra={<input type="search" placeholder="에이전시·지점·아이디" aria-label="검색" value={kw} onChange={(e) => setKw(e.target.value)} style={{ height: 28, padding: '0 8px', border: '1px solid #c5cad2', borderRadius: 3 }} />}
    >
      <Status msg={msg} />
      <div className="grid-box">
        <table className="tbl center" style={{ minWidth: 960 }}>
          <thead><tr><th className="left">에이전시 · 지점</th><th>국가</th><th className="left">담당자</th><th className="left">아이디</th><th>업체 담당자 번호</th><th>접속</th><th>최근 접속</th><th>상태</th></tr></thead>
          <tbody>
            {list.length === 0 && <tr className="empty"><td colSpan={8}>지점 계정이 없습니다.</td></tr>}
            {list.map((m) => (
              <tr key={m.user_id}>
                <td className="left strong">{m.agency_name} {m.branch}</td>
                <td>{m.country}</td>
                <td className="left">{m.contact_name}<div className="muted" style={{ fontSize: 12 }}>{m.phone}</div></td>
                <td className="left">{m.email}</td>
                <td>
                  <input
                    aria-label="업체 포털 담당자 번호"
                    defaultValue={m.legacy_am_id ?? ''}
                    style={{ height: 26, width: 90 }}
                    onBlur={(e) => e.target.value !== (m.legacy_am_id ?? '') && update(m, { legacy_am_id: e.target.value.trim() || null }, '업체 담당자 번호를 저장했습니다.')}
                  />
                </td>
                <td>{m.login_count}</td>
                <td className="muted nowrap">{m.last_login_at?.slice(0, 10) ?? '-'}</td>
                <td>
                  {m.status === 'active' ? (
                    <button type="button" className="btn btn-xs" onClick={() => update(m, { status: 'suspended' }, `${m.agency_name} 계정을 정지했습니다.`)}>정지</button>
                  ) : (
                    <button type="button" className="btn btn-xs btn-primary" onClick={() => update(m, { status: 'active' }, `${m.agency_name} 계정을 다시 열었습니다.`)}>정지 해제</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>업체 담당자 번호는 '담당자 계정'의 담당자번호입니다. 2차 My Students에서 지점 학생을 연결할 때 씁니다.</p>
    </Panel>
  );
}

// ── 방문 신청(12.6). '안내' 칸은 에이전시 포털 내 신청 내역에 보인다
interface Visit {
  id: number;
  member_id: string;
  visit_date: string;
  people: number;
  purpose: string;
  status: string;
  staff_note: string | null;
}
type VisitMember = { user_id: string; agency_name: string; branch: string | null; contact_name: string | null; phone: string | null; email: string };
const VISIT_STATUS: Record<string, string> = { received: '접수', confirmed: '확정', done: '방문 완료', cancelled: '취소' };

function Visits() {
  // 신청과 지점 계정을 따로 읽어 화면에서 잇는다(표를 묶어 읽는 조회에 기대지 않음)
  const { rows, error, reload } = useRows<Visit[]>(() => supabase!.from('visit_requests').select('id, member_id, visit_date, people, purpose, status, staff_note').order('visit_date', { ascending: true }));
  const mem = useRows<VisitMember[]>(() => supabase!.from('agency_members').select('user_id, agency_name, branch, contact_name, phone, email'));
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  if (!rows || !mem.rows) return <Loading error={error || mem.error} />;
  const who = new Map(mem.rows.map((x) => [x.user_id, x]));
  const update = async (v: Visit, status: string) => {
    const { error: e } = await supabase!.from('visit_requests').update({ status, staff_note: notes[v.id] ?? v.staff_note }).eq('id', v.id);
    setMsg(e ? { ok: false, text: `저장 실패: ${e.message}` } : { ok: true, text: `${who.get(v.member_id)?.agency_name ?? ''} ${v.visit_date} — ${VISIT_STATUS[status]}` });
    reload();
  };
  return (
    <Panel title={<>방문 신청 <small>({rows.length}건)</small></>}>
      <Status msg={msg} />
      <div className="grid-box">
        <table className="tbl center" style={{ minWidth: 980 }}>
          <thead><tr><th>희망 날짜</th><th className="left">에이전시 · 지점</th><th className="left">담당자</th><th>인원</th><th className="left">목적</th><th>상태</th><th className="left">안내 (에이전시에 보임)</th><th>처리</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr className="empty"><td colSpan={8}>방문 신청이 없습니다.</td></tr>}
            {rows.map((v) => {
              const a = who.get(v.member_id);
              return (
              <tr key={v.id}>
                <td className="strong nowrap">{v.visit_date}</td>
                <td className="left">{a?.agency_name} {a?.branch}</td>
                <td className="left">{a?.contact_name}<div className="muted" style={{ fontSize: 12 }}>{a?.phone || a?.email}</div></td>
                <td>{v.people}</td>
                <td className="left memo-text" style={{ maxWidth: 260 }}>{v.purpose}</td>
                <td>{VISIT_STATUS[v.status] ?? v.status}</td>
                <td className="left"><input aria-label="안내" defaultValue={v.staff_note ?? ''} onChange={(e) => setNotes({ ...notes, [v.id]: e.target.value })} style={{ height: 26, minWidth: 160 }} /></td>
                <td className="nowrap">
                  {(['confirmed', 'done', 'cancelled'] as const).map((s) => (
                    <button key={s} type="button" className={'btn btn-xs' + (v.status === s ? ' btn-primary' : '')} style={{ marginRight: 4 }} onClick={() => update(v, s)}>{VISIT_STATUS[s]}</button>
                  ))}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

// ── 사용 통계(12.7): 지점별 학습계획서 다운로드·접속 수(학생 정보 없이 숫자만, 원칙 P3)
interface StatMember { user_id: string; agency_name: string; branch: string | null; country: string | null; login_count: number; last_login_at: string | null }
interface Download { member_id: string; course_id: string | null; created_at: string }

function Stats() {
  const m = useRows<StatMember[]>(() => supabase!.from('agency_members').select('user_id, agency_name, branch, country, login_count, last_login_at'));
  const d = useRows<Download[]>(() => supabase!.from('plan_downloads').select('member_id, course_id, created_at'));
  if (!m.rows || !d.rows) return <Loading error={m.error || d.error} />;
  const month = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 7);
  const rows = m.rows
    .map((x) => {
      const ds = d.rows!.filter((y) => y.member_id === x.user_id);
      return { ...x, downloads: ds.length, thisMonth: ds.filter((y) => y.created_at.startsWith(month)).length };
    })
    .sort((a, b) => b.downloads - a.downloads || b.login_count - a.login_count);
  const byCourse = new Map<string, number>();
  for (const y of d.rows) byCourse.set(y.course_id ?? '-', (byCourse.get(y.course_id ?? '-') ?? 0) + 1);
  return (
    <>
      <Panel title="지점별 학습계획서·접속">
        <div className="grid-box">
          <table className="tbl center" style={{ minWidth: 760 }}>
            <thead><tr><th className="left">에이전시 · 지점</th><th>국가</th><th>학습계획서 (전체)</th><th>이번 달</th><th>접속 수</th><th>최근 접속</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr className="empty"><td colSpan={6}>지점 계정이 없습니다.</td></tr>}
              {rows.map((x) => (
                <tr key={x.user_id}>
                  <td className="left strong">{x.agency_name} {x.branch}</td>
                  <td>{x.country}</td>
                  <td className="strong">{x.downloads}</td>
                  <td>{x.thisMonth}</td>
                  <td>{x.login_count}</td>
                  <td className="muted nowrap">{x.last_login_at?.slice(0, 10) ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="코스별 학습계획서">
        <table className="tbl center" style={{ maxWidth: 420 }}>
          <thead><tr><th className="left">코스</th><th>건수</th></tr></thead>
          <tbody>
            {[...byCourse].sort((a, b) => b[1] - a[1]).map(([c, n]) => <tr key={c}><td className="left">{c}</td><td>{n}</td></tr>)}
            {byCourse.size === 0 && <tr className="empty"><td colSpan={2}>아직 없습니다.</td></tr>}
          </tbody>
        </table>
      </Panel>
    </>
  );
}
