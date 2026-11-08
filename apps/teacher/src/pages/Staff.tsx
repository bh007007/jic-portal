import { useState, type FormEvent } from 'react';
import { loadStaff, type StaffRow } from '../data';
import { supabase } from '../supabase';
import { Loading, PageHead, Section, useLoad, useSave } from '../ui';

const EMPTY = { name: '', nickname: '', campus: '', legacy_id: '' };
const CAMPUSES = ['Challenger', 'Premium', 'MCO'];

/**
 * 강사 목록(매니저·직원). 로그인 계정이 없어도 등록하고, 업체 포털 교사 번호(legacy_id)로 시간표와 잇는다.
 * 로그인 계정 발급과 역할(강사·체커·스케줄러·매니저) 부여는 관리자 포털 '사용자·권한'에서 한다(준비 중, 그때까지 Claude가 SQL로).
 */
export default function Staff() {
  const { data, error, loading, reload } = useLoad(() => loadStaff(), []);
  const [form, setForm] = useState(EMPTY);
  const save = useSave();
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const row = { name: form.name.trim(), nickname: form.nickname.trim(), campus: form.campus, legacy_id: form.legacy_id.trim() || null, kind: 'teacher' };
    if (await save.run(async () => {
      const { error: err } = await supabase.from('staff').insert(row);
      if (err) throw err;
    })) {
      setForm(EMPTY);
      reload();
    }
  };
  const toggle = async (s: StaffRow) => {
    if (await save.run(async () => {
      const { error: err } = await supabase.from('staff').update({ active: !s.active, updated_at: new Date().toISOString() }).eq('id', s.id);
      if (err) throw err;
    })) reload();
  };

  return (
    <>
      <PageHead title="강사 목록" sub={data ? `${data.filter((s) => s.active).length}명 근무` : undefined} />
      {loading || error ? (
        <Loading error={error} />
      ) : (data ?? []).length === 0 ? (
        <div className="state">등록된 강사가 없습니다. 업체 포털 교사 목록을 옮겨 오거나 아래에서 추가합니다.</div>
      ) : (
        <table className="tbl">
          <thead>
            <tr><th>이름</th><th>부르는 이름</th><th>캠퍼스</th><th>업체 번호</th><th>로그인</th><th /></tr>
          </thead>
          <tbody>
            {(data ?? []).map((s) => (
              <tr key={s.id} className={s.active ? '' : 'muted'}>
                <td className="strong">{s.name}</td>
                <td>{s.nickname || '-'}</td>
                <td>{s.campus || '전체'}</td>
                <td>{s.legacy_id || '-'}</td>
                <td>{s.user_id ? '있음' : <span className="muted">없음</span>}</td>
                <td><button type="button" className="link-btn" onClick={() => toggle(s)} disabled={save.busy}>{s.active ? '퇴직' : '복직'}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <Section title="강사 추가">
        <form className="form" onSubmit={submit}>
          <div className="row2">
            <label>이름<input value={form.name} onChange={set('name')} required maxLength={60} /></label>
            <label>부르는 이름<input value={form.nickname} onChange={set('nickname')} maxLength={40} placeholder="예: Teacher Ann" /></label>
          </div>
          <div className="row2">
            <label>
              캠퍼스
              <select value={form.campus} onChange={set('campus')}>
                <option value="">전체</option>
                {CAMPUSES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>업체 포털 교사 번호<input value={form.legacy_id} onChange={set('legacy_id')} maxLength={20} placeholder="te_id (선택)" /></label>
          </div>
          {save.error && <p className="err" role="alert">{save.error}</p>}
          <button type="submit" className="btn btn-primary btn-lg" disabled={save.busy}>추가</button>
        </form>
      </Section>
    </>
  );
}
