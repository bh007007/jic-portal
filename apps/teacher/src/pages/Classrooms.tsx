import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { CAMPUS_NAMES, addClassroom, loadClassrooms, setClassroomActive, type Classroom } from '../data';
import { useT } from '../i18n';
import { Loading, PageHead, Section, useLoad, useSave } from '../ui';

/** 교실 목록(업체 '교실 관리' cro_*): 캠퍼스·번호·1:1/그룹·건물·층·정원. 스케줄러·매니저·관리자가 추가하고, 지우지 않고 '안 쓰기'로 둔다. */
export default function Classrooms() {
  const { me } = useAuth();
  const { t } = useT();
  const rooms = useLoad(() => loadClassrooms(), []);
  const save = useSave();
  const [form, setForm] = useState({ campus: 'Premium', num: '', kind: 'G' as Classroom['kind'], building: '', floor: '', capacity: '' });

  if (me && !me.canSchedule) return <Navigate to="/more" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cap = form.capacity.trim() ? Number(form.capacity) : null;
    const ok = await save.run(() => addClassroom({ campus: form.campus, num: form.num.trim(), kind: form.kind, building: form.building.trim(), floor: form.floor.trim(), capacity: cap }));
    if (ok) {
      setForm({ ...form, num: '', building: '', floor: '', capacity: '' });
      rooms.reload();
    }
  }
  async function toggle(r: Classroom) {
    if (await save.run(() => setClassroomActive(r.id, !r.active))) rooms.reload();
  }

  const byCampus = new Map<string, Classroom[]>();
  for (const r of rooms.data ?? []) byCampus.set(r.campus, [...(byCampus.get(r.campus) ?? []), r]);

  return (
    <>
      <PageHead title={t('classroomList')} right={<Link to="/schedule" className="more">{t('schedule')}</Link>} />
      {save.error && <p className="err">{save.error}</p>}
      {rooms.loading || rooms.error ? (
        <Loading error={rooms.error} />
      ) : byCampus.size === 0 ? (
        <div className="state">{t('noClassrooms')}</div>
      ) : (
        [...byCampus].map(([c, list]) => (
          <Section key={c} title={c} extra={<span className="muted small">{list.filter((r) => r.active).length}</span>}>
            <ul className="rows">
              {list.map((r) => (
                <li key={r.id} className={r.active ? undefined : 'muted'}>
                  <span><strong>{r.num}</strong> {r.active ? '' : `· ${t('inactive')}`}</span>
                  <button type="button" className="link-btn" disabled={save.busy} onClick={() => toggle(r)}>{t(r.active ? 'deactivate' : 'activate')}</button>
                  <span className="muted small">{[t(r.kind === 'G' ? 'kind_G' : 'kind_1'), r.building, r.floor && `${r.floor}F`, r.capacity && `${t('capacity')} ${r.capacity}`].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          </Section>
        ))
      )}
      <Section title={t('addClassroom')}>
        <form className="form" onSubmit={submit}>
          <div className="row3">
            <label>{t('campus')}
              <select value={form.campus} onChange={(e) => setForm({ ...form, campus: e.target.value })}>
                {CAMPUS_NAMES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label>{t('roomNum')}<input required maxLength={30} value={form.num} onChange={(e) => setForm({ ...form, num: e.target.value })} /></label>
            <label>{t('kindLabel')}
              <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as Classroom['kind'] })}>
                <option value="G">{t('kind_G')}</option>
                <option value="1">{t('kind_1')}</option>
              </select>
            </label>
          </div>
          <div className="row3">
            <label>{t('building')}<input maxLength={30} value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} /></label>
            <label>{t('floor')}<input maxLength={10} value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} /></label>
            <label>{t('capacity')}<input type="number" min={1} max={200} value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></label>
          </div>
          <button type="submit" className="btn btn-primary full" disabled={save.busy}>{t('add')}</button>
        </form>
      </Section>
    </>
  );
}
