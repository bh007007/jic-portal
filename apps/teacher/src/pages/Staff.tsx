import { useState, type FormEvent } from 'react';
import { loadStaff, type StaffRow } from '../data';
import { useT } from '../i18n';
import { supabase } from '../supabase';
import { Loading, PageHead, Section, useLoad, useSave } from '../ui';

const EMPTY = { name: '', nickname: '', campus: '', legacy_id: '' };
const CAMPUSES = ['Challenger', 'Premium', 'MCO'];

/**
 * 강사 목록(매니저·직원). 로그인 계정이 없어도 등록하고, 업체 포털 교사 번호(legacy_id)로 시간표와 잇는다.
 * 로그인 계정 발급과 역할 부여는 관리자 포털 '사용자·권한'에서 한다.
 */
export default function Staff() {
  const { t } = useT();
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
      <PageHead title={t('staffList')} sub={data ? t('working', { n: data.filter((s) => s.active).length }) : undefined} />
      {loading || error ? (
        <Loading error={error} />
      ) : (data ?? []).length === 0 ? (
        <div className="state">{t('noStaff')}</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
        <table className="tbl">
          <thead>
            <tr><th>{t('name')}</th><th>{t('nickname')}</th><th>{t('campus')}</th><th>{t('vendorNo')}</th><th>{t('loginAcct')}</th><th /></tr>
          </thead>
          <tbody>
            {(data ?? []).map((s) => (
              <tr key={s.id} className={s.active ? '' : 'muted'}>
                <td className="strong">{s.name}</td>
                <td>{s.nickname || '-'}</td>
                <td>{s.campus || t('all')}</td>
                <td>{s.legacy_id || '-'}</td>
                <td>{s.user_id ? t('yes') : <span className="muted">{t('no')}</span>}</td>
                <td><button type="button" className="link-btn" onClick={() => toggle(s)} disabled={save.busy}>{s.active ? t('retire') : t('rehire')}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <Section title={t('addTeacher')}>
        <form className="form" onSubmit={submit}>
          <div className="row2">
            <label>{t('name')}<input value={form.name} onChange={set('name')} required maxLength={60} /></label>
            <label>{t('nickname')}<input value={form.nickname} onChange={set('nickname')} maxLength={40} placeholder="Teacher Ann" /></label>
          </div>
          <div className="row2">
            <label>
              {t('campus')}
              <select value={form.campus} onChange={set('campus')}>
                <option value="">{t('all')}</option>
                {CAMPUSES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label>{t('vendorTeacherNo')}<input value={form.legacy_id} onChange={set('legacy_id')} maxLength={20} placeholder="te_id" /></label>
          </div>
          {save.error && <p className="err" role="alert">{save.error}</p>}
          <button type="submit" className="btn btn-primary btn-lg" disabled={save.busy}>{t('add')}</button>
        </form>
      </Section>
    </>
  );
}
