import { useCallback, useEffect, useState } from 'react';
import { COUNTRIES } from '../../../../partner/src/shared';
import { VISIT_CAMPUSES } from '../../../../partner/src/visits';
import { supabase } from '../../supabase';
import { Panel } from '../../components/ui';

export interface VisitHandler { id: string; user_id: string; kind: 'marketer' | 'director'; country: string; campus: string }
type StaffOption = { user_id: string; label: string };

/**
 * 방문 신청 처리자 지정(CL-046, 화면 명세 4.6, 11/12 레오님 결정 '명세대로 나누기'). 관리자 포털 '사용자·권한'(관리자만) 안.
 * 나라마다 마케터(일정 조율·승인 요청), 캠퍼스마다 센터장(확정·반려·다시 조율). 아무도 지정하지 않은 나라·캠퍼스는 직원 모두 처리한다.
 * 표 visit_handlers(20261112090000), 쓰기는 관리자만(DB 정책).
 */
export default function VisitHandlers({ staff }: { staff: StaffOption[] }) {
  const [rows, setRows] = useState<VisitHandler[] | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const { data, error } = await supabase!.from('visit_handlers').select('id, user_id, kind, country, campus');
    if (error) setMsg(`불러오지 못했습니다: ${error.message}`);
    else setRows((data as VisitHandler[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const name = (id: string) => staff.find((s) => s.user_id === id)?.label ?? id.slice(0, 8);

  const add = async (kind: VisitHandler['kind'], scope: string) => {
    const user_id = pick[`${kind}:${scope}`];
    if (!user_id) return;
    const row: Pick<VisitHandler, 'user_id' | 'kind' | 'country' | 'campus'> = { user_id, kind, country: kind === 'marketer' ? scope : '', campus: kind === 'director' ? scope : '' };
    const { error } = await supabase!.from('visit_handlers').insert(row);
    setMsg(error ? `지정 실패: ${error.message.includes('duplicate') ? '이미 지정된 사람입니다' : error.message}` : `${scope} ${kind === 'marketer' ? '마케터' : '센터장'}: ${name(user_id)} 지정`);
    setPick({ ...pick, [`${kind}:${scope}`]: '' });
    load();
  };
  const remove = async (h: VisitHandler) => {
    if (!window.confirm(`${h.country || h.campus} ${h.kind === 'marketer' ? '마케터' : '센터장'}에서 ${name(h.user_id)}을(를) 뺄까요?`)) return;
    const { error } = await supabase!.from('visit_handlers').delete().eq('id', h.id);
    setMsg(error ? `빼기 실패: ${error.message}` : `${name(h.user_id)}을(를) 뺐습니다.`);
    load();
  };

  const rowFor = (kind: VisitHandler['kind'], scope: string, label: string) => {
    const mine = (rows ?? []).filter((h) => h.kind === kind && (kind === 'marketer' ? h.country === scope : h.campus === scope));
    const key = `${kind}:${scope}`;
    return (
      <tr key={key}>
        <td className="strong nowrap">{label}</td>
        <td className="left">
          {mine.length === 0 ? <span className="muted">지정 없음 → 직원 모두 처리</span> : mine.map((h) => (
            <span key={h.id} className="ev-chip" style={{ marginRight: 4 }}>{name(h.user_id)}<button type="button" aria-label="빼기" onClick={() => remove(h)}>×</button></span>
          ))}
        </td>
        <td className="nowrap">
          <select aria-label={`${label} 지정할 직원`} value={pick[key] ?? ''} onChange={(e) => setPick({ ...pick, [key]: e.target.value })} style={{ height: 26 }}>
            <option value="">직원 고르기</option>
            {staff.filter((s) => !mine.some((h) => h.user_id === s.user_id)).map((s) => <option key={s.user_id} value={s.user_id}>{s.label}</option>)}
          </select>{' '}
          <button type="button" className="btn btn-xs" disabled={!pick[key]} onClick={() => add(kind, scope)}>지정</button>
        </td>
      </tr>
    );
  };

  return (
    <Panel title="방문 신청 처리자">
      <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
        명세 4.6(11/12 결정): 일정 조율·승인 요청 = 그 나라 마케터(에이전시 지점 국가), 확정·반려·다시 조율 = 그 캠퍼스 센터장, 직원 취소 = 둘 중 누구나.
        아무도 지정하지 않은 나라·캠퍼스는 직원 모두 처리합니다. 센터장이 지정된 캠퍼스는 관리자도 확정·반려할 수 없습니다(승인 권한은 따로).
      </p>
      {msg && <div className="text-blue" role="status" style={{ fontSize: 12, margin: '4px 0' }}>{msg}</div>}
      {!rows ? <p className="muted">불러오는 중…</p> : (
        <div className="grid-box">
          <table className="tbl center">
            <thead><tr><th style={{ width: 160 }}>나라 · 캠퍼스</th><th className="left">지정된 직원</th><th style={{ width: 260 }}>지정</th></tr></thead>
            <tbody>
              <tr><td colSpan={3} className="left strong" style={{ background: 'var(--head-bg)' }}>마케터 (나라별)</td></tr>
              {COUNTRIES.map((c) => rowFor('marketer', c, c))}
              <tr><td colSpan={3} className="left strong" style={{ background: 'var(--head-bg)' }}>센터장 (캠퍼스별)</td></tr>
              {VISIT_CAMPUSES.map(([id, label]) => rowFor('director', id, label))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
