import { useState, type FormEvent } from 'react';
import {
  NEEDS_REASON, PICKUP, VISIT_CAMPUSES, VISIT_NEXT, VISIT_STATUS, visitCampusName, visitOpen, type VisitEvent, type VisitRequest, type VisitStatus,
} from '../../../../partner/src/visits';
import { Loading, Panel } from '../../components/ui';
import { db, errText, must, Status, useLoad, type Note } from './common';

interface Member { user_id: string; agency_name: string; branch: string | null; country: string | null; contact_name: string | null; phone: string | null; email: string }
const STATUS_CLASS: Partial<Record<VisitStatus, string>> = { confirmed: 'text-blue strong', rejected: 'text-red', cancelled: 'muted', done: 'muted' };
/** 단계 버튼 이름(지금 단계 → 다음 단계) */
const actionLabel = (from: VisitStatus, to: VisitStatus) =>
  to === 'scheduling' ? (from === 'approval' ? '다시 조율로' : '일정 조율 시작') : to === 'approval' ? '승인 요청(센터장에게)' : to === 'confirmed' ? '확정' : to === 'rejected' ? '반려' : to === 'cancelled' ? '취소' : VISIT_STATUS[to];

/**
 * 파트너 포털 관리 › 방문 신청(CL-046, 화면 명세 4.6). 모든 신청을 한 목록에, 줄마다 국가·캠퍼스를 앞에. 거르기: 국가·캠퍼스·상태·날짜.
 * 처리: 접수 → 일정 조율 중(유학원과 연락, 일정·메모) → 승인 요청(센터장에게) → 확정 / 반려(사유), 취소(사유). 단계 검사와 이력은 DB(20261111220000).
 * 단계마다 처리할 사람(그 나라 마케터·그 캠퍼스 센터장)은 11/12 권한 정리(Q-4) 뒤. 지금은 직원 모두. '확정' 때 노션 자동 기록은 해야 할 일.
 */
export default function Visits() {
  const { data, error, reload } = useLoad(async () => {
    const [visits, members, staff] = await Promise.all([
      must<VisitRequest[]>(db().from('visit_requests').select('*').order('visit_date', { ascending: true })),
      must<Member[]>(db().from('agency_members').select('user_id, agency_name, branch, country, contact_name, phone, email')),
      db().rpc('staff_directory').then((r) => ((r.data ?? []) as { user_id: string; name: string }[])),
    ]);
    return { visits, members, staff };
  });
  const [fl, setFl] = useState({ country: '', campus: '', status: 'open', from: '', to: '' });
  const [open, setOpen] = useState<number | null>(null);
  const [msg, setMsg] = useState<Note>(null);
  if (!data) return <Loading error={error} />;

  const who = new Map(data.members.map((m) => [m.user_id, m]));
  const countries = [...new Set(data.members.map((m) => m.country).filter(Boolean) as string[])].sort();
  const dayOf = (v: VisitRequest) => v.schedule_date ?? v.visit_date;
  const list = data.visits.filter((v) => {
    const m = who.get(v.member_id);
    return (!fl.country || m?.country === fl.country)
      && (!fl.campus || v.campus === fl.campus)
      && (fl.status === '' || (fl.status === 'open' ? visitOpen(v.status) : v.status === fl.status))
      && (!fl.from || dayOf(v) >= fl.from) && (!fl.to || dayOf(v) <= fl.to);
  });
  const current = data.visits.find((v) => v.id === open) ?? null;

  return (
    <>
      {current && (
        <VisitDetail
          // 단계가 바뀌면(고친 시각) 새로 그려 이력·칸을 다시 읽는다
          key={`${current.id}-${current.updated_at}`}
          v={current}
          member={who.get(current.member_id)}
          staffName={(id) => data.staff.find((s) => s.user_id === id)?.name ?? (id && who.get(id) ? `${who.get(id)!.agency_name} (에이전시)` : 'JIC')}
          onClose={() => setOpen(null)}
          onDone={(text) => { setMsg({ ok: true, text }); reload(); }}
        />
      )}
      <Panel title={<>방문 신청 <small>({list.length} / {data.visits.length}건)</small></>}>
        <Status msg={msg} />
        <div className="toolbar" style={{ justifyContent: 'flex-start', marginBottom: 10 }}>
          <select aria-label="국가" value={fl.country} onChange={(e) => setFl({ ...fl, country: e.target.value })}>
            <option value="">모든 국가</option>
            {countries.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select aria-label="캠퍼스" value={fl.campus} onChange={(e) => setFl({ ...fl, campus: e.target.value })}>
            <option value="">모든 캠퍼스</option>
            {VISIT_CAMPUSES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
          </select>
          <select aria-label="상태" value={fl.status} onChange={(e) => setFl({ ...fl, status: e.target.value })}>
            <option value="open">진행 중(접수~확정)</option>
            <option value="">모든 상태</option>
            {(Object.keys(VISIT_STATUS) as VisitStatus[]).map((s) => <option key={s} value={s}>{VISIT_STATUS[s]}</option>)}
          </select>
          <label style={{ fontSize: 12 }}>날짜 <input type="date" aria-label="날짜 부터" value={fl.from} onChange={(e) => setFl({ ...fl, from: e.target.value })} style={{ height: 30 }} /></label>
          <span>~</span>
          <input type="date" aria-label="날짜 까지" value={fl.to} onChange={(e) => setFl({ ...fl, to: e.target.value })} style={{ height: 30 }} />
          <span className="muted" style={{ fontSize: 12 }}>날짜는 조율한 방문일, 없으면 희망일 1순위</span>
        </div>
        <div className="grid-box">
          <table className="tbl center" style={{ minWidth: 1100 }}>
            <thead><tr><th>국가</th><th>캠퍼스</th><th>희망일</th><th className="left">에이전시 · 지점</th><th>인원</th><th className="left">목적 · 픽업</th><th>상태</th><th>방문 일정</th><th>처리</th></tr></thead>
            <tbody>
              {list.length === 0 && <tr className="empty"><td colSpan={9}>{data.visits.length ? '고른 조건에 맞는 신청이 없습니다.' : '방문 신청이 없습니다.'}</td></tr>}
              {list.map((v) => {
                const m = who.get(v.member_id);
                return (
                  <tr key={v.id} className={open === v.id ? 'on' : ''}>
                    <td className="strong nowrap">{m?.country ?? '-'}</td>
                    <td className="strong nowrap">{visitCampusName(v.campus)}</td>
                    <td className="nowrap">{v.visit_date}{v.visit_date2 && <div className="muted" style={{ fontSize: 12 }}>2순위 {v.visit_date2}</div>}{v.visit_time && <div className="muted" style={{ fontSize: 12 }}>{v.visit_time}</div>}</td>
                    <td className="left">{m?.agency_name} {m?.branch}<div className="muted" style={{ fontSize: 12 }}>{m?.contact_name} {m?.phone || m?.email}</div></td>
                    <td>{v.people}</td>
                    <td className="left" style={{ maxWidth: 240 }}>{(v.purposes ?? []).join(', ') || <span className="memo-text">{v.purpose}</span>}{v.pickup && v.pickup !== 'none' && <div className="muted" style={{ fontSize: 12 }}>픽업: {PICKUP[v.pickup]}</div>}</td>
                    <td className={'nowrap ' + (STATUS_CLASS[v.status] ?? '')}>{VISIT_STATUS[v.status] ?? v.status}</td>
                    <td className="nowrap">{v.schedule_date ?? <span className="muted">-</span>}{v.schedule_time && <div className="muted" style={{ fontSize: 12 }}>{v.schedule_time}</div>}</td>
                    <td><button type="button" className={'btn btn-xs' + (open === v.id ? ' btn-primary' : '')} onClick={() => { setOpen(v.id); window.scrollTo(0, 0); }}>{visitOpen(v.status) ? '처리' : '보기'}</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="hint" style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink-3)' }}>단계마다 처리할 사람(그 나라 마케터 → 그 캠퍼스 센터장)은 11/12 권한 정리 뒤 정합니다. 지금은 직원 모두 처리할 수 있고, 누가 처리했는지는 이력에 남습니다.</p>
      </Panel>
    </>
  );
}

/** 신청 한 건 처리: 방문 일정·안내 저장, 단계 이동(반려·취소는 사유), 메모, 이력 */
function VisitDetail({ v, member, staffName, onClose, onDone }: { v: VisitRequest; member?: Member; staffName: (id: string | null) => string; onClose: () => void; onDone: (text: string) => void }) {
  const ev = useLoad(() => must<VisitEvent[]>(db().from('visit_request_events').select('*').eq('request_id', v.id).order('created_at', { ascending: true })));
  const [f, setF] = useState({ schedule_date: v.schedule_date ?? '', schedule_time: v.schedule_time ?? '', staff_note: v.staff_note ?? '' });
  const [memo, setMemo] = useState('');
  const [msg, setMsg] = useState<Note>(null);
  const label = `${member?.agency_name ?? ''} ${visitCampusName(v.campus)} ${v.visit_date}`;
  const fields = () => ({ schedule_date: f.schedule_date || null, schedule_time: f.schedule_time.trim() || null, staff_note: f.staff_note.trim() || null });

  const save = async (e?: FormEvent) => {
    e?.preventDefault();
    const { error } = await db().from('visit_requests').update(fields()).eq('id', v.id);
    if (error) return setMsg({ ok: false, text: errText(error) });
    onDone(`${label} — 일정·안내를 저장했습니다.`);
  };
  const step = async (to: VisitStatus) => {
    let decision_reason: string | undefined;
    if (NEEDS_REASON.includes(to)) {
      const r = window.prompt(`${VISIT_STATUS[to]} 사유를 적어 주세요. 에이전시 화면에 보입니다.`);
      if (r === null) return;
      if (!r.trim()) return setMsg({ ok: false, text: '사유를 적어 주세요.' });
      decision_reason = r.trim();
    }
    if (to === 'approval' && !f.schedule_date) return setMsg({ ok: false, text: '승인 요청 전에 유학원과 조율한 방문 날짜를 넣어 주세요.' });
    const { error } = await db().from('visit_requests').update({ ...fields(), status: to, ...(decision_reason ? { decision_reason } : {}) }).eq('id', v.id);
    if (error) return setMsg({ ok: false, text: errText(error) });
    onDone(`${label} — ${VISIT_STATUS[to]}`);
  };
  const addMemo = async () => {
    if (!memo.trim()) return;
    const { data: u } = await db().auth.getUser();
    const { error } = await db().from('visit_request_events').insert({ request_id: v.id, kind: 'memo', note: memo.trim(), actor: u.user?.id });
    if (error) return setMsg({ ok: false, text: errText(error) });
    setMemo('');
    ev.reload();
  };
  const editable = visitOpen(v.status);

  return (
    <Panel title={<>방문 신청 처리 <small>{label}</small></>} extra={<button type="button" className="btn btn-xs" onClick={onClose}>닫기</button>}>
      <form className="edit" onSubmit={save}>
        <Status msg={msg} />
        <table className="kv">
          <tbody>
            <tr><th>상태</th><td className={STATUS_CLASS[v.status] ?? ''}>{VISIT_STATUS[v.status]}{v.decision_reason && <span className="muted"> · 사유: {v.decision_reason}</span>}</td><th>국가 · 캠퍼스</th><td>{member?.country ?? '-'} · {visitCampusName(v.campus)}</td></tr>
            <tr><th>에이전시</th><td>{member?.agency_name} {member?.branch}</td><th>담당자</th><td>{member?.contact_name} {member?.phone} {member?.email}</td></tr>
            <tr><th>희망일</th><td>{v.visit_date}{v.visit_date2 && ` · 2순위 ${v.visit_date2}`}{v.visit_time && ` · ${v.visit_time}`}</td><th>인원 · 픽업</th><td>{v.people}명 · {PICKUP[v.pickup ?? 'none']}</td></tr>
            <tr><th>방문 목적</th><td colSpan={3}>{(v.purposes ?? []).join(', ') || '-'}</td></tr>
            {v.purpose && <tr><th>요청사항</th><td colSpan={3} className="memo-text">{v.purpose}</td></tr>}
            <tr>
              <th>방문 일정</th>
              <td colSpan={3}>
                <input type="date" aria-label="방문 날짜" value={f.schedule_date} disabled={!editable} onChange={(e) => setF({ ...f, schedule_date: e.target.value })} />{' '}
                <input aria-label="방문 시간" placeholder="예: 10:00" value={f.schedule_time} disabled={!editable} onChange={(e) => setF({ ...f, schedule_time: e.target.value })} style={{ width: 120 }} />
                <span className="hint">유학원과 조율한 날짜·시간. 승인 요청 전에 넣습니다. 에이전시 화면에 보입니다.</span>
              </td>
            </tr>
            <tr>
              <th>안내</th>
              <td colSpan={3}>
                <textarea aria-label="안내" value={f.staff_note} disabled={!editable} onChange={(e) => setF({ ...f, staff_note: e.target.value })} placeholder="에이전시 '내 방문 내역'에 보이는 안내" />
              </td>
            </tr>
          </tbody>
        </table>
        {editable && (
          <div className="form-actions" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {VISIT_NEXT[v.status].filter((s) => s !== 'cancelled').map((s) => (
                <button key={s} type="button" className={'btn' + (s === 'confirmed' || s === 'approval' || (s === 'scheduling' && v.status === 'received') ? ' btn-primary' : '')} onClick={() => step(s)}>{actionLabel(v.status, s)}</button>
              ))}
              {VISIT_NEXT[v.status].includes('cancelled') && <button type="button" className="btn text-red" onClick={() => step('cancelled')}>취소</button>}
            </span>
            <button type="submit" className="btn">일정·안내만 저장</button>
          </div>
        )}
      </form>
      <div className="edit" style={{ marginTop: 12 }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 13 }}>메모 · 이력 <span className="muted" style={{ fontWeight: 400 }}>(직원만 봄)</span></h3>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input aria-label="메모" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 유학원 담당자와 통화, 12/2 오전으로 조율" style={{ flex: 1 }} maxLength={2000} />
          <button type="button" className="btn btn-xs" onClick={addMemo} disabled={!memo.trim()}>메모 남기기</button>
        </div>
        {!ev.data ? <Loading error={ev.error} /> : (
          <ul className="visit-log">
            {ev.data.map((e) => (
              <li key={e.id}>
                <span className="muted nowrap">{e.created_at.slice(0, 16).replace('T', ' ')}</span>
                <span className="nowrap">{staffName(e.actor)}</span>
                <span>{e.kind === 'memo' ? <>메모: {e.note}</> : <>{e.from_status ? `${VISIT_STATUS[e.from_status as VisitStatus] ?? e.from_status} → ` : ''}<strong>{VISIT_STATUS[e.to_status as VisitStatus] ?? e.to_status}</strong>{e.note && <span className="muted"> · {e.note}</span>}</>}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
