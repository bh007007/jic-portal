import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authHeaders, supabase } from '../supabase';
import { Loading, PageTitle, Panel, STATUS_LABEL } from '../components/ui';
import { fmt, type EnrollmentList, type EnrollmentRow } from '../api';

type Kind = 'course' | 'dorm' | 'extension' | 'add_class' | 'cancel' | 'other';
type State = 'requested' | 'received' | 'approved' | 'rejected' | 'canceled' | 'done';
interface Request {
  id: number;
  tr_id: string;
  st_id: string;
  kind: Kind;
  state: State;
  source: 'staff' | 'student' | 'agency';
  want: string;
  period_from: string | null;
  period_to: string | null;
  content: string;
  reply: string;
  staff_memo: string;
  tuition_fee: number | null;
  local_fee: number | null;
  created_by: string | null;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
}
interface LogRow {
  state: State;
  actor: string | null;
  at: string;
}

const KIND: Record<Kind, string> = { course: '코스 변경', dorm: '기숙사 변경', extension: '연장', add_class: '수업 추가', cancel: '취소·중단', other: '기타' };
const STATE: Record<State, string> = { requested: '신청', received: '접수', approved: '승인', rejected: '거절', canceled: '취소', done: '완료' };
const SOURCE: Record<Request['source'], string> = { staff: '직원 입력', student: '학생', agency: '에이전시' };
/** DB 의 change_request_next_ok 와 같은 길(20261110100000_change_requests.sql). */
const NEXT: Record<State, State[]> = { requested: ['received', 'rejected', 'canceled'], received: ['approved', 'rejected', 'canceled'], approved: ['done', 'canceled'], rejected: [], canceled: [], done: [] };
const OPEN: State[] = ['requested', 'received', 'approved'];
const COLS = 'id, tr_id, st_id, kind, state, source, want, period_from, period_to, content, reply, staff_memo, tuition_fee, local_fee, created_by, created_at, decided_by, decided_at';
/** 시각(timestamptz)을 이 PC 날짜로(UTC 그대로 자르면 한국 아침이 전날로 보인다). */
const day = (t: string | null) => (t ? new Date(t).toLocaleDateString('sv-SE') : '');
const period = (a: string | null, b: string | null) => (a || b ? `${a ?? ''} ~ ${b ?? ''}` : '');
const stateClass = (s: State) => (s === 'approved' || s === 'done' ? 'text-blue' : s === 'rejected' || s === 'canceled' ? 'muted' : 'text-red');

async function enrollments(query: string): Promise<EnrollmentRow[]> {
  const r = await fetch('/api/enrollments?' + query, { headers: await authHeaders() });
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? r.statusText);
  return ((await r.json()) as EnrollmentList).rows;
}

/**
 * 변경 요청(11/10 새 기능). 코스·기숙사 변경, 연장, 수업 추가, 취소 요청을 적고 처리한다.
 * 1단계는 직원이 받은 요청을 입력한다. 학생 앱·에이전시 포털의 신청 칸은 다음 단계다(docs/change-requests.md).
 * 데이터는 Supabase(change_requests)에 있어 배포 주소(로그인한 직원)에서 동작한다. 학생 이름은 저장하지 않고 연수 번호로 붙인다.
 */
export default function ChangeRequests() {
  const [rows, setRows] = useState<Request[] | null>(null);
  const [who, setWho] = useState<Map<string, EnrollmentRow>>(new Map());
  const [staff, setStaff] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState('');
  const [filter, setFilter] = useState({ state: 'open', kind: '', q: '' });
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    setError('');
    const { data, error: e } = await supabase.from('change_requests').select(COLS).order('created_at', { ascending: false }).limit(1000);
    if (e) {
      setError(/change_requests|PGRST205|does not exist/.test(e.message + e.code) ? '변경 요청 표가 아직 없습니다(Supabase 마이그레이션 20261110100000_change_requests.sql 적용 전).' : e.message);
      return;
    }
    const list = (data as Request[]) ?? [];
    setRows(list);
    const trs = [...new Set(list.map((r) => r.tr_id))];
    if (trs.length) {
      try {
        const found = await enrollments(`tab=all&all=1&tr=${encodeURIComponent(trs.join(','))}`);
        setWho(new Map(found.map((e) => [e.trId, e])));
      } catch (err) {
        setError('학생 이름을 붙이지 못했습니다: ' + (err as Error).message);
      }
    }
  }, []);
  useEffect(() => {
    load();
    supabase?.rpc('staff_directory').then(({ data }) => setStaff(new Map(((data as { user_id: string; name: string }[]) ?? []).map((s) => [s.user_id, s.name]))));
  }, [load]);

  const shown = useMemo(() => {
    if (!rows) return [];
    const kw = filter.q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter.state === 'open' ? !OPEN.includes(r.state) : filter.state && r.state !== filter.state) return false;
      if (filter.kind && r.kind !== filter.kind) return false;
      if (kw) {
        const e = who.get(r.tr_id);
        if (!`${e?.name ?? ''} ${r.st_id} ${r.want}`.toLowerCase().includes(kw)) return false;
      }
      return true;
    });
  }, [rows, who, filter]);
  const openCount = rows?.filter((r) => OPEN.includes(r.state)).length ?? 0;
  const current = rows?.find((r) => Number(r.id) === openId) ?? null;

  if (!supabase) {
    return (
      <>
        <PageTitle title="변경 요청" path="홈 > 학생관리 > 변경 요청" />
        <div className="state-msg">변경 요청은 Supabase에 있어 배포 주소(로그인한 직원)에서만 보입니다. 로컬 데이터 실행에는 없습니다.</div>
      </>
    );
  }

  return (
    <>
      <PageTitle title="변경 요청" path="홈 > 학생관리 > 변경 요청" />

      <form className="search" aria-label="변경 요청 검색" onSubmit={(e) => e.preventDefault()}>
        <div className="search-grid">
          <label className="field">
            <span>상태</span>
            <select value={filter.state} onChange={(e) => setFilter({ ...filter, state: e.target.value })}>
              <option value="open">처리 중(신청·접수·승인)</option>
              <option value="">전체</option>
              {(Object.keys(STATE) as State[]).map((s) => <option key={s} value={s}>{STATE[s]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>종류</span>
            <select value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value })}>
              <option value="">전체</option>
              {(Object.keys(KIND) as Kind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
            </select>
          </label>
          <label className="field">
            <span>검색</span>
            <input type="text" value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="이름·학생번호·바꾸려는 것" />
          </label>
        </div>
      </form>

      <div className="toolbar">
        <span>처리 중 <strong>{fmt(openCount)}</strong>건</span>
        <button type="button" className="btn btn-primary" onClick={() => setAdding(!adding)}>{adding ? '등록 닫기' : '요청 등록'}</button>
      </div>

      {adding && <NewRequest onDone={(id) => { setAdding(false); setOpenId(id); load(); }} />}

      {current && <Detail key={current.id} req={current} who={who.get(current.tr_id)} staff={staff} onClose={() => setOpenId(null)} onSaved={load} />}

      {!rows ? (
        <Loading error={error} />
      ) : (
        <Panel title={<>변경 요청 <small>{fmt(shown.length)}건</small></>}>
          {error && <div className="text-red" style={{ fontSize: 12, marginBottom: 6 }}>{error}</div>}
          <table className="tbl center">
            <thead>
              <tr><th>번호</th><th>등록일</th><th className="left">학생</th><th>연수 기간</th><th>종류</th><th className="left">바꾸려는 것</th><th>바꾸려는 기간</th><th>상태</th><th>결정일</th></tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr className="empty"><td colSpan={9}>{rows.length ? '조건에 맞는 요청이 없습니다.' : '등록된 변경 요청이 없습니다.'}</td></tr>}
              {shown.map((r) => {
                const e = who.get(r.tr_id);
                return (
                  <tr key={r.id} className={Number(r.id) === openId ? 'selected' : ''} onClick={() => setOpenId(Number(r.id) === openId ? null : Number(r.id))} style={{ cursor: 'pointer' }}>
                    <td>{r.id}</td>
                    <td className="nowrap">{day(r.created_at)}</td>
                    <td className="left nowrap">{e ? e.name : <span className="muted">{r.st_id || r.tr_id}</span>}</td>
                    <td className="nowrap">{e ? `${e.start} ~ ${e.end}` : ''}</td>
                    <td className="nowrap">{KIND[r.kind]}</td>
                    <td className="left">{r.want}</td>
                    <td className="nowrap">{period(r.period_from, r.period_to)}</td>
                    <td className={stateClass(r.state)}>{STATE[r.state]}</td>
                    <td className="nowrap">{day(r.decided_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}

/** 직원이 받은 요청을 적는다: 학생을 찾아 연수를 고른 뒤 종류·내용. */
function NewRequest({ onDone }: { onDone: (id: number) => void }) {
  const [kw, setKw] = useState('');
  const [found, setFound] = useState<EnrollmentRow[] | null>(null);
  const [pick, setPick] = useState<EnrollmentRow | null>(null);
  const [form, setForm] = useState({ kind: 'course' as Kind, state: 'requested' as State, want: '', from: '', to: '', content: '', memo: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const search = async (e: FormEvent) => {
    e.preventDefault();
    if (!kw.trim()) return;
    setMsg('');
    try {
      const field = /^\d+$/.test(kw.trim()) ? 'no' : 'name';
      setFound((await enrollments(`tab=all&size=20&field=${field}&q=${encodeURIComponent(kw.trim())}`)).slice(0, 20));
    } catch (err) {
      setMsg('찾기 실패: ' + (err as Error).message);
    }
  };
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!pick) return;
    setBusy(true);
    setMsg('');
    const { data, error } = await supabase!
      .from('change_requests')
      .insert({ tr_id: pick.trId, st_id: pick.stId, kind: form.kind, state: form.state, want: form.want.trim(), period_from: form.from || null, period_to: form.to || null, content: form.content.trim(), staff_memo: form.memo.trim() })
      .select('id')
      .single();
    setBusy(false);
    if (error) setMsg('등록 실패: ' + (/change_requests_period/.test(error.message) ? '기간의 끝이 시작보다 빠릅니다.' : error.message));
    else onDone(Number((data as { id: number | string }).id));
  };

  return (
    <Panel title="요청 등록">
      <form onSubmit={search} className="search" aria-label="학생 찾기" style={{ marginBottom: 8 }}>
        <div className="search-grid">
          <label className="field">
            <span>학생</span>
            <input type="text" value={kw} onChange={(e) => setKw(e.target.value)} placeholder="이름 또는 학생번호" />
          </label>
        </div>
        <div className="search-actions">
          <button type="submit" className="btn">찾기</button>
        </div>
      </form>
      {found && !pick && (
        <table className="tbl center" style={{ marginBottom: 8 }}>
          <thead><tr><th className="left">이름</th><th>학생번호</th><th>상태</th><th>캠퍼스</th><th className="left">코스</th><th className="left">기숙사</th><th>기간</th><th /></tr></thead>
          <tbody>
            {found.length === 0 && <tr className="empty"><td colSpan={8}>찾은 연수가 없습니다.</td></tr>}
            {found.map((e) => (
              <tr key={e.trId}>
                <td className="left">{e.name}</td>
                <td>{e.stId}</td>
                <td>{STATUS_LABEL[e.status] ?? e.status}</td>
                <td>{e.campus}</td>
                <td className="left">{e.course}</td>
                <td className="left">{e.dorm}</td>
                <td className="nowrap">{e.start} ~ {e.end}</td>
                <td><button type="button" className="btn btn-xs" onClick={() => setPick(e)}>고르기</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {pick && (
        <form onSubmit={save} aria-label="요청 내용">
          <table className="kv" style={{ marginBottom: 8 }}>
            <tbody>
              <tr>
                <th>연수</th>
                <td>
                  {pick.name} ({pick.stId}) · {pick.campus} · {pick.course} · {pick.dorm} · {pick.start} ~ {pick.end}{' '}
                  <button type="button" className="btn btn-xs" onClick={() => setPick(null)}>다시 고르기</button>
                </td>
              </tr>
              <tr>
                <th>종류</th>
                <td>
                  <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Kind })}>
                    {(Object.keys(KIND) as Kind[]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}
                  </select>{' '}
                  <label><input type="radio" checked={form.state === 'requested'} onChange={() => setForm({ ...form, state: 'requested' })} /> 신청</label>{' '}
                  <label><input type="radio" checked={form.state === 'received'} onChange={() => setForm({ ...form, state: 'received' })} /> 바로 접수</label>
                </td>
              </tr>
              <tr><th>바꾸려는 것</th><td><input type="text" value={form.want} maxLength={200} onChange={(e) => setForm({ ...form, want: e.target.value })} placeholder="예: ESL → TOEIC, 4주 연장" style={{ width: '100%' }} /></td></tr>
              <tr>
                <th>바꾸려는 기간</th>
                <td>
                  <input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /> ~{' '}
                  <input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
                </td>
              </tr>
              <tr><th>요청 내용</th><td><textarea rows={3} maxLength={2000} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ width: '100%' }} /></td></tr>
              <tr><th>직원 메모</th><td><textarea rows={2} maxLength={2000} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} style={{ width: '100%' }} /></td></tr>
            </tbody>
          </table>
          <button type="submit" className="btn btn-primary" disabled={busy}>등록</button>
        </form>
      )}
      {msg && <div className="text-red" role="status" style={{ fontSize: 12, marginTop: 6 }}>{msg}</div>}
    </Panel>
  );
}

/** 요청 한 건: 내용·답변·메모·차액을 고치고 상태를 바꾼다. 끝난 요청(거절·취소·완료)은 읽기만. */
function Detail({ req, who, staff, onClose, onSaved }: { req: Request; who?: EnrollmentRow; staff: Map<string, string>; onClose: () => void; onSaved: () => void }) {
  const done = NEXT[req.state].length === 0;
  const [form, setForm] = useState({
    want: req.want,
    from: req.period_from ?? '',
    to: req.period_to ?? '',
    content: req.content,
    reply: req.reply,
    memo: req.staff_memo,
    tuition: req.tuition_fee == null ? '' : String(req.tuition_fee),
    local: req.local_fee == null ? '' : String(req.local_fee),
  });
  const [log, setLog] = useState<LogRow[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const name = (u: string | null) => (u ? staff.get(u) ?? '직원' : '');

  useEffect(() => {
    supabase!.from('change_request_log').select('state, actor, at').eq('request_id', req.id).order('at').then(({ data }) => setLog((data as LogRow[]) ?? []));
  }, [req.id, req.state]);

  const fields = () => ({
    want: form.want.trim(),
    period_from: form.from || null,
    period_to: form.to || null,
    content: form.content.trim(),
    reply: form.reply.trim(),
    staff_memo: form.memo.trim(),
    tuition_fee: form.tuition === '' ? null : Number(form.tuition),
    local_fee: form.local === '' ? null : Number(form.local),
  });
  const update = async (patch: Partial<Request>, label: string) => {
    setBusy(true);
    setMsg('');
    const { error } = await supabase!.from('change_requests').update(patch).eq('id', req.id);
    setBusy(false);
    if (error) setMsg(`${label} 실패: ` + (/change_requests_period/.test(error.message) ? '기간의 끝이 시작보다 빠릅니다.' : error.message));
    else {
      setMsg(`${label}했습니다.`);
      onSaved();
    }
  };
  const move = (to: State) => {
    if ((to === 'rejected' || to === 'canceled') && !window.confirm(`요청 #${req.id}을(를) ${STATE[to]}할까요? 되돌릴 수 없습니다.`)) return;
    update({ ...fields(), state: to } as Partial<Request>, STATE[to]);
  };

  return (
    <Panel title={<>요청 #{req.id} <small>{KIND[req.kind]} · <span className={stateClass(req.state)}>{STATE[req.state]}</span></small></>} extra={<button type="button" className="btn btn-xs" onClick={onClose}>닫기</button>}>
      <table className="kv" style={{ marginBottom: 8 }}>
        <tbody>
          <tr>
            <th>학생·연수</th>
            <td>
              {who ? (
                <>
                  <Link to={`/students/${encodeURIComponent(who.stId)}`}>{who.name}</Link> ({who.stId}) · {who.campus} · {who.course} · {who.dorm} · {who.start} ~ {who.end}
                </>
              ) : (
                <span className="muted">연수 {req.tr_id}(지금 데이터에 없음)</span>
              )}
            </td>
          </tr>
          <tr><th>받은 곳</th><td>{SOURCE[req.source]} · {day(req.created_at)} {name(req.created_by)}</td></tr>
          <tr><th>바꾸려는 것</th><td><input type="text" value={form.want} maxLength={200} disabled={done} onChange={(e) => setForm({ ...form, want: e.target.value })} style={{ width: '100%' }} /></td></tr>
          <tr>
            <th>바꾸려는 기간</th>
            <td>
              <input type="date" value={form.from} disabled={done} onChange={(e) => setForm({ ...form, from: e.target.value })} /> ~{' '}
              <input type="date" value={form.to} disabled={done} onChange={(e) => setForm({ ...form, to: e.target.value })} />
            </td>
          </tr>
          <tr><th>요청 내용</th><td><textarea rows={3} maxLength={2000} value={form.content} disabled={done} onChange={(e) => setForm({ ...form, content: e.target.value })} style={{ width: '100%' }} /></td></tr>
          <tr><th>답변</th><td><textarea rows={2} maxLength={2000} value={form.reply} disabled={done} onChange={(e) => setForm({ ...form, reply: e.target.value })} style={{ width: '100%' }} placeholder="신청자에게 보일 답변(학생·에이전시 신청 칸이 생기면 보입니다)" /></td></tr>
          <tr><th>직원 메모</th><td><textarea rows={2} maxLength={2000} value={form.memo} disabled={done} onChange={(e) => setForm({ ...form, memo: e.target.value })} style={{ width: '100%' }} /></td></tr>
          <tr>
            <th>차액</th>
            <td>
              학비 <input type="number" step="0.01" value={form.tuition} disabled={done} onChange={(e) => setForm({ ...form, tuition: e.target.value })} style={{ width: 120 }} /> (연수 통화){' '}
              현지비 <input type="number" step="0.01" value={form.local} disabled={done} onChange={(e) => setForm({ ...form, local: e.target.value })} style={{ width: 120 }} /> PHP
            </td>
          </tr>
          <tr>
            <th>처리 기록</th>
            <td>{log.length ? log.map((l, i) => <div key={i}>{STATE[l.state]} · {day(l.at)} {name(l.actor)}</div>) : <span className="muted">-</span>}</td>
          </tr>
        </tbody>
      </table>
      {!done && (
        <div className="search-actions" style={{ justifyContent: 'flex-start', gap: 6 }}>
          <button type="button" className="btn" disabled={busy} onClick={() => update(fields() as Partial<Request>, '저장')}>저장</button>
          {NEXT[req.state].map((s) => (
            <button key={s} type="button" className={s === 'rejected' || s === 'canceled' ? 'btn' : 'btn btn-primary'} disabled={busy} onClick={() => move(s)}>
              {STATE[s]}
            </button>
          ))}
        </div>
      )}
      {msg && <div className={msg.includes('실패') ? 'text-red' : 'text-blue'} role="status" style={{ fontSize: 12, marginTop: 6 }}>{msg}</div>}
    </Panel>
  );
}
