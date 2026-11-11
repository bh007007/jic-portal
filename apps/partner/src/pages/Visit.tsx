import { useState, type FormEvent } from 'react';
import { today, useLoad } from '../data';
import { t } from '../i18n';
import { errText, must, supabase } from '../supabase';
import { Box, Loading, Msg, PageHead } from '../ui';
import {
  PICKUP, VISIT_CAMPUSES, VISIT_PURPOSES, VISIT_STATUS, VISIT_TIMES, visitCampusName, visitOpen, type VisitRequest,
} from '../visits';

const empty = () => ({ campuses: [] as string[], visit_date: '', visit_date2: '', visit_time: '', people: '2', purposes: [] as string[], pickup: 'none', purpose: '' });
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const STATUS_CLASS: Record<string, string> = { confirmed: 'text-green strong', rejected: 'text-red', cancelled: 'muted' };

/**
 * 11.1 방문 신청(CL-046, 화면 명세 4.6). 지점 대표만(CL-032).
 * 신청서: 방문 캠퍼스(필수, 두 캠퍼스면 캠퍼스마다 한 건씩 접수), 희망일 1순위(필수)·2순위, 시간, 인원, 방문 목적(여러 개), 공항·시내 픽업, 요청사항.
 * 내 방문 내역: 상태(접수 → 일정 조율 중 → 승인 요청 → 확정 / 반려 / 취소), 조율된 방문 일정, JIC 안내·사유. 끝나지 않은 신청은 사유를 적고 취소한다.
 */
export default function Visit() {
  const list = useLoad(() => must<VisitRequest[]>(supabase.from('visit_requests').select('*').order('created_at', { ascending: false })));
  const [f, setF] = useState(empty);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.campuses.length) return setMsg({ kind: 'err', text: '방문할 캠퍼스를 고르세요.' });
    if (!f.purposes.length) return setMsg({ kind: 'err', text: '방문 목적을 하나 이상 고르세요.' });
    if (f.visit_date2 && f.visit_date2 === f.visit_date) return setMsg({ kind: 'err', text: '희망일 2순위는 1순위와 다른 날로 고르세요.' });
    setBusy(true);
    // 두 캠퍼스를 방문하면 캠퍼스마다 한 건(명세 4.6)
    const rows = f.campuses.map((campus) => ({
      campus, visit_date: f.visit_date, visit_date2: f.visit_date2 || null, visit_time: f.visit_time || null, people: Number(f.people),
      purposes: f.purposes, pickup: f.pickup, purpose: f.purpose.trim() || null,
    }));
    const { error } = await supabase.from('visit_requests').insert(rows);
    setBusy(false);
    if (error) return setMsg({ kind: 'err', text: errText(error) });
    setMsg({ kind: 'ok', text: `방문 신청 ${rows.length}건을 접수했습니다${rows.length > 1 ? '(캠퍼스마다 한 건)' : ''}. JIC 담당자가 일정을 조율해 연락드립니다.` });
    setF(empty());
    list.reload();
  };

  const cancel = async (v: VisitRequest) => {
    const reason = window.prompt(`${visitCampusName(v.campus)} ${v.visit_date} 방문 신청을 취소합니다. 취소 사유를 적어 주세요.`);
    if (reason === null) return;
    if (!reason.trim()) return setMsg({ kind: 'err', text: '취소 사유를 적어 주세요.' });
    const { error } = await supabase.rpc('cancel_visit_request', { p_id: v.id, p_reason: reason.trim() });
    if (error) return setMsg({ kind: 'err', text: errText(error) });
    setMsg({ kind: 'ok', text: '방문 신청을 취소했습니다.' });
    list.reload();
  };

  return (
    <>
      <PageHead title={t('nav.visit')} />
      <Box title="방문 신청">
        <form className="form box-body" onSubmit={submit}>
          <fieldset className="choice-set">
            <legend>방문 캠퍼스 *</legend>
            {VISIT_CAMPUSES.map(([id, name]) => (
              <label key={id} className="choice"><input type="checkbox" checked={f.campuses.includes(id)} onChange={() => setF({ ...f, campuses: toggle(f.campuses, id) })} /> {name}</label>
            ))}
            <span className="hint">두 캠퍼스를 방문하면 캠퍼스마다 한 건씩 접수됩니다.</span>
          </fieldset>
          <div className="form-grid">
            <label>희망일 1순위 *<input type="date" required min={today()} value={f.visit_date} onChange={(e) => setF({ ...f, visit_date: e.target.value })} /></label>
            <label>희망일 2순위<input type="date" min={today()} value={f.visit_date2} onChange={(e) => setF({ ...f, visit_date2: e.target.value })} /></label>
            <label>시간
              <select value={f.visit_time} onChange={(e) => setF({ ...f, visit_time: e.target.value })}>
                <option value="">-</option>
                {VISIT_TIMES.map((x) => <option key={x}>{x}</option>)}
              </select>
            </label>
            <label>인원 *<input type="number" required min={1} max={50} value={f.people} onChange={(e) => setF({ ...f, people: e.target.value })} /></label>
          </div>
          <fieldset className="choice-set">
            <legend>방문 목적 * (여러 개)</legend>
            {VISIT_PURPOSES.map((p) => (
              <label key={p} className="choice"><input type="checkbox" checked={f.purposes.includes(p)} onChange={() => setF({ ...f, purposes: toggle(f.purposes, p) })} /> {p}</label>
            ))}
          </fieldset>
          <fieldset className="choice-set">
            <legend>공항·시내 픽업</legend>
            {Object.entries(PICKUP).map(([k, v]) => (
              <label key={k} className="choice"><input type="radio" name="pickup" checked={f.pickup === k} onChange={() => setF({ ...f, pickup: k })} /> {v}</label>
            ))}
          </fieldset>
          <label>요청사항<textarea value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="예: 동행 학부모 1명, 점심 포함 부탁" maxLength={2000} /></label>
          {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
          <div className="form-actions"><button type="submit" className="btn btn-primary btn-lg" disabled={busy}>신청</button></div>
        </form>
      </Box>
      <Box title="내 방문 내역">
        {!list.data ? <Loading error={list.error} /> : list.data.length === 0 ? <p className="empty">신청 내역이 없습니다.</p> : (
          <div className="box-body scroll">
            <table className="tbl center">
              <thead><tr><th>캠퍼스</th><th>희망일</th><th>인원</th><th className="left">목적 · 픽업</th><th>상태</th><th>방문 일정</th><th className="left">JIC 안내 · 사유</th><th /></tr></thead>
              <tbody>
                {list.data.map((v) => (
                  <tr key={v.id}>
                    <td className="strong nowrap">{visitCampusName(v.campus)}</td>
                    <td className="nowrap">{v.visit_date}{v.visit_date2 && <div className="muted" style={{ fontSize: 12 }}>2순위 {v.visit_date2}</div>}{v.visit_time && <div className="muted" style={{ fontSize: 12 }}>{v.visit_time}</div>}</td>
                    <td>{v.people}</td>
                    <td className="left">
                      {(v.purposes ?? []).join(', ') || v.purpose}
                      {v.pickup && v.pickup !== 'none' && <div className="muted" style={{ fontSize: 12 }}>픽업: {PICKUP[v.pickup]}</div>}
                    </td>
                    <td className={'nowrap ' + (STATUS_CLASS[v.status] ?? '')}>{VISIT_STATUS[v.status] ?? v.status}</td>
                    <td className="nowrap">{v.schedule_date ? <>{v.schedule_date}{v.schedule_time && <div className="muted" style={{ fontSize: 12 }}>{v.schedule_time}</div>}</> : <span className="muted">-</span>}</td>
                    <td className="left pre">{[v.staff_note, v.decision_reason && `사유: ${v.decision_reason}`].filter(Boolean).join('\n')}</td>
                    <td>{visitOpen(v.status) && <button type="button" className="btn btn-sm" onClick={() => cancel(v)}>취소</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Box>
    </>
  );
}
