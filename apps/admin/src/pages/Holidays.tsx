import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../supabase';
import { Loading, PageTitle, Panel } from '../components/ui';
import { weekday } from '../api';

interface Holiday {
  day: string;
  campus: string;
  name: string;
  kind: 'public' | 'school';
}
const CAMPUSES = ['', 'Challenger', 'Premium', 'MCO'];
const KIND: Record<Holiday['kind'], string> = { public: '공휴일', school: '학원 휴일' };

/**
 * 휴일(업체 포털 기초코드관리 > 휴일, 기획안 holidays). 관리자 포털에서만 쓰고 강사 포털(출석)·학생 포털·달력이 읽는다(원칙 C2).
 * 데이터는 Supabase 에 있어 배포 주소(로그인한 직원)에서 동작한다. 공휴일은 확인된 날만 넣는다(원칙 C8).
 */
export default function Holidays() {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [rows, setRows] = useState<Holiday[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ day: '', campus: '', name: '', kind: 'public' as Holiday['kind'] });

  const load = useCallback(async () => {
    if (!supabase) return;
    setError('');
    const { data, error: e } = await supabase.from('holidays').select('day, campus, name, kind').gte('day', `${year}-01-01`).lte('day', `${year}-12-31`).order('day');
    if (e) setError(e.message);
    else setRows((data as Holiday[]) ?? []);
  }, [year]);
  useEffect(() => {
    load();
  }, [load]);

  if (!supabase) {
    return (
      <>
        <PageTitle title="휴일" path="홈 > 기초관리 > 휴일" />
        <div className="state-msg">휴일은 Supabase에 있어 배포 주소(로그인한 직원)에서만 보입니다. 로컬 데이터 실행에는 없습니다.</div>
      </>
    );
  }

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const { error: err } = await supabase!.from('holidays').insert({ day: form.day, campus: form.campus, name: form.name.trim(), kind: form.kind });
    setBusy(false);
    if (err) setMsg('추가 실패: ' + (/duplicate key/.test(err.message) ? '같은 날 같은 캠퍼스에 이미 있습니다.' : err.message));
    else {
      setMsg(`${form.day} ${form.name} 추가`);
      setForm({ ...form, day: '', name: '' });
      if (form.day.startsWith(String(year))) load();
    }
  };
  const remove = async (h: Holiday) => {
    if (!window.confirm(`${h.day} ${h.name}${h.campus ? ` (${h.campus})` : ''}을(를) 지울까요?`)) return;
    setBusy(true);
    const { error: err } = await supabase!.from('holidays').delete().eq('day', h.day).eq('campus', h.campus);
    setBusy(false);
    if (err) setMsg('삭제 실패: ' + err.message);
    else load();
  };

  return (
    <>
      <PageTitle title="휴일" path="홈 > 기초관리 > 휴일" />

      <form className="search" aria-label="휴일 추가" onSubmit={add}>
        <div className="search-grid">
          <label className="field">
            <span>날짜</span>
            <input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} required />
          </label>
          <label className="field">
            <span>이름</span>
            <input type="text" value={form.name} maxLength={60} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="예: Christmas Day" />
          </label>
          <label className="field">
            <span>캠퍼스</span>
            <select value={form.campus} onChange={(e) => setForm({ ...form, campus: e.target.value })}>
              {CAMPUSES.map((c) => <option key={c} value={c}>{c || '모든 캠퍼스'}</option>)}
            </select>
          </label>
          <div className="field" role="radiogroup" aria-label="종류">
            <span>종류</span>
            {(Object.keys(KIND) as Holiday['kind'][]).map((k) => (
              <label key={k}>
                <input type="radio" name="kind" checked={form.kind === k} onChange={() => setForm({ ...form, kind: k })} />
                {KIND[k]}
              </label>
            ))}
          </div>
        </div>
        <div className="search-actions">
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>추가</button>
        </div>
      </form>
      {msg && <div className={msg.includes('실패') ? 'text-red' : 'text-blue'} role="status" style={{ fontSize: 12 }}>{msg}</div>}

      <div className="toolbar">
        <span className="cal-nav">
          <button type="button" className="btn" aria-label="이전 해" onClick={() => setYear(year - 1)}>‹</button>
          <strong>{year}년</strong>
          <button type="button" className="btn" aria-label="다음 해" onClick={() => setYear(year + 1)}>›</button>
        </span>
        <span className="muted" style={{ fontSize: 12 }}>강사 포털 출석·달력·학생 포털이 같은 휴일을 읽습니다.</span>
      </div>

      {!rows ? (
        <Loading error={error} />
      ) : (
        <Panel title={<>{year}년 휴일 <small>{rows.length}일</small></>}>
          <table className="tbl center">
            <thead>
              <tr><th>날짜</th><th className="left">이름</th><th>캠퍼스</th><th>종류</th><th /></tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr className="empty"><td colSpan={5}>등록된 휴일이 없습니다.</td></tr>}
              {rows.map((h) => (
                <tr key={h.day + h.campus}>
                  <td className="nowrap">{h.day} ({weekday(h.day)})</td>
                  <td className="left">{h.name}</td>
                  <td>{h.campus || '모든 캠퍼스'}</td>
                  <td className={h.kind === 'school' ? 'text-blue' : ''}>{KIND[h.kind]}</td>
                  <td><button type="button" className="btn btn-xs" onClick={() => remove(h)} disabled={busy}>삭제</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </>
  );
}
