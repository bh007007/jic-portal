import { useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { MATERIAL_KINDS, loadMaterials, type Material } from '../data';
import { useT, type Key } from '../i18n';
import { supabase } from '../supabase';
import { Loading, PageHead, Section, useLoad, useSave } from '../ui';

const EMPTY = { course: '', textbook: '', unit: '', kind: 'worksheet', title: '', url: '' };

/**
 * 수업 자료실 목차(원칙 L8): 코스 → 교재 → 단원 → 자료. 파일은 회사 공유 드라이브에 두고 여기에는 링크만 둔다.
 * 학생 공개는 미결정이라 모두 비공개(강사 포털 안에서만 보임).
 */
export default function Materials() {
  const { me } = useAuth();
  const { t } = useT();
  const { data, error, loading, reload } = useLoad(() => loadMaterials(), []);
  const [kw, setKw] = useState('');
  const [course, setCourse] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const save = useSave();
  const del = useSave();
  const kindName = (k: string) => t(('kind_' + k) as Key);

  const courses = useMemo(() => [...new Set((data ?? []).map((m) => m.course))].sort(), [data]);
  const list = useMemo(() => {
    const k = kw.trim().toLowerCase();
    return (data ?? []).filter((m) => (!course || m.course === course) && (!k || `${m.course} ${m.textbook} ${m.unit} ${m.title}`.toLowerCase().includes(k)));
  }, [data, course, kw]);
  // 코스 → 교재 → 단원으로 묶기
  const tree = useMemo(() => {
    const tr = new Map<string, Map<string, Map<string, Material[]>>>();
    for (const m of list) {
      const c = tr.get(m.course) ?? new Map();
      const b = c.get(m.textbook || '-') ?? new Map();
      b.set(m.unit || '-', [...(b.get(m.unit || '-') ?? []), m]);
      c.set(m.textbook || '-', b);
      tr.set(m.course, c);
    }
    return tr;
  }, [list]);

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^https:\/\//.test(form.url.trim())) {
      save.setError(t('linkHttps'));
      return;
    }
    const row = { ...form, course: form.course.trim(), textbook: form.textbook.trim(), unit: form.unit.trim(), title: form.title.trim(), url: form.url.trim() };
    if (await save.run(async () => {
      const { error: err } = await supabase.from('materials').insert(row);
      if (err) throw err;
    })) {
      setForm({ ...EMPTY, course: row.course, textbook: row.textbook, unit: row.unit, kind: row.kind });
      reload();
    }
  };
  const remove = async (m: Material) => {
    if (!window.confirm(t('confirmDeleteMaterial', { title: m.title }))) return;
    if (await del.run(async () => {
      const { error: err } = await supabase.from('materials').delete().eq('id', m.id);
      if (err) throw err;
    })) reload();
  };

  return (
    <>
      <PageHead title={t('materials')} sub={t('materialsSub')} right={<button type="button" className="btn btn-xs" onClick={() => setOpen((o) => !o)}>{open ? t('close') : t('addMaterial')}</button>} />

      {open && (
        <Section title={t('addMaterial')}>
          <form className="form" onSubmit={submit}>
            <div className="row2">
              <label>{t('course')}<input list="courses" value={form.course} onChange={set('course')} required maxLength={80} placeholder="ESL-Core" /></label>
              <label>{t('textbook')}<input value={form.textbook} onChange={set('textbook')} maxLength={80} placeholder="Book 1" /></label>
            </div>
            <div className="row2">
              <label>{t('unit')}<input value={form.unit} onChange={set('unit')} maxLength={80} placeholder="Unit 3" /></label>
              <label>
                {t('kind')}
                <select value={form.kind} onChange={set('kind')}>
                  {MATERIAL_KINDS.map((v) => <option key={v} value={v}>{kindName(v)}</option>)}
                </select>
              </label>
            </div>
            <label>{t('title')}<input value={form.title} onChange={set('title')} required maxLength={120} /></label>
            <label>{t('driveLink')}<input type="url" value={form.url} onChange={set('url')} required placeholder="https://drive.google.com/…" /></label>
            <datalist id="courses">{courses.map((c) => <option key={c} value={c} />)}</datalist>
            {save.error && <p className="err" role="alert">{save.error}</p>}
            <button type="submit" className="btn btn-primary btn-lg" disabled={save.busy}>{save.busy ? t('saving') : t('add')}</button>
          </form>
        </Section>
      )}

      <div className="filters">
        <input type="search" placeholder={t('searchMaterial')} value={kw} onChange={(e) => setKw(e.target.value)} aria-label={t('searchMaterial')} />
        <select value={course} onChange={(e) => setCourse(e.target.value)} aria-label={t('course')}>
          <option value="">{t('allCourses')}</option>
          {courses.map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      {loading || error ? (
        <Loading error={error} />
      ) : tree.size === 0 ? (
        <div className="state">{(data ?? []).length ? t('noMaterialMatch') : t('noMaterial')}</div>
      ) : (
        [...tree].map(([c, books]) => (
          <Section key={c} title={c}>
            {[...books].map(([b, units]) => (
              <div key={b} className="mat-book">
                <h3>{b}</h3>
                {[...units].map(([u, items]) => (
                  <div key={u} className="mat-unit">
                    <span className="mat-unit-name">{u}</span>
                    <ul>
                      {items.map((m) => (
                        <li key={m.id}>
                          <span className="tag">{kindName(m.kind)}</span>
                          <a href={m.url} target="_blank" rel="noreferrer noopener">{m.title}</a>
                          {(m.created_by === me?.session.user.id || me?.isManager) && (
                            <button type="button" className="link-btn" onClick={() => remove(m)} disabled={del.busy}>{t('delete')}</button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </Section>
        ))
      )}
      {del.error && <p className="err">{del.error}</p>}
    </>
  );
}
