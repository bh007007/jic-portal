import { useState, type FormEvent } from 'react';
import { CEFR_LEVELS, SCALES, loadCefr, loadTestTypes, type TestType } from '../data';
import { useT, type Key } from '../i18n';
import { supabase } from '../supabase';
import { Loading, PageHead, Section, useLoad, useSave } from '../ui';

const EMPTY = { code: '', name: '', course: '', scale: 'level' as TestType['scale'], min_value: '1', max_value: '10', step: '1', sections: '' };

/**
 * 시험 종류와 CEFR 대응(원칙 L2·L3, 매니저·직원). 시험 기록은 한 구조로 저장하고 '시험 종류'로 나눈다.
 * CEFR 대응 기준과 시험 주기는 미결정이라 빈칸으로 두고, 정해지면 여기에서 채운다. CEFR은 'JIC 기준 추정 레벨'로 표시한다.
 */
export default function TestTypes() {
  const { t } = useT();
  const types = useLoad(() => loadTestTypes(), []);
  const cefr = useLoad(() => loadCefr(), []);
  const [form, setForm] = useState(EMPTY);
  const save = useSave();
  const mapSave = useSave();
  const scaleName = (s: string) => t(('scale_' + s) as Key);

  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const row = {
      code: form.code.trim().toLowerCase(),
      name: form.name.trim(),
      course: form.course.trim(),
      scale: form.scale,
      min_value: Number(form.min_value),
      max_value: Number(form.max_value),
      step: Number(form.step),
      sections: form.sections.split(',').map((s) => s.trim()).filter(Boolean),
      sort: (types.data?.length ?? 0) + 1,
    };
    if (await save.run(async () => {
      const { error } = await supabase.from('test_types').insert(row);
      if (error) throw error;
    })) {
      setForm(EMPTY);
      types.reload();
    }
  };
  const toggle = async (tt: TestType) => {
    if (await save.run(async () => {
      const { error } = await supabase.from('test_types').update({ active: !tt.active, updated_at: new Date().toISOString() }).eq('code', tt.code);
      if (error) throw error;
    })) types.reload();
  };
  const setMap = async (testType: string, level: string, value: string) => {
    if (await mapSave.run(async () => {
      if (value.trim() === '') {
        const { error } = await supabase.from('cefr_mappings').delete().eq('test_type', testType).eq('cefr', level);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cefr_mappings').upsert({ test_type: testType, cefr: level, min_value: Number(value), updated_at: new Date().toISOString() });
        if (error) throw error;
      }
    })) cefr.reload();
  };

  if (types.loading || cefr.loading) return <Loading />;
  if (types.error) return <Loading error={types.error} />;

  return (
    <>
      <PageHead title={t('testTypes')} sub={t('testTypesSub')} />

      {(types.data ?? []).map((tt) => {
        const maps = (cefr.data ?? []).filter((m) => m.test_type === tt.code);
        return (
          <Section
            key={tt.code}
            title={<>{tt.name} <span className="muted small">{tt.code} · {scaleName(tt.scale)} {tt.min_value}~{tt.max_value} ({t('step')} {tt.step}){tt.course ? ` · ${tt.course}` : ''}</span></>}
            extra={<button type="button" className="btn btn-xs" onClick={() => toggle(tt)} disabled={save.busy}>{tt.active ? t('stopUse') : t('reuse')}</button>}
          >
            {!tt.active && <p className="muted small">{t('stoppedNote')}</p>}
            {tt.sections.length > 0 && <p className="small">{t('sections')}: {tt.sections.join(', ')}</p>}
            <div className="cefr-grid">
              {CEFR_LEVELS.map((lv) => {
                const cur = maps.find((m) => m.cefr === lv);
                return (
                  <label key={lv}>
                    {t('orAbove', { lv })}
                    <input
                      type="number"
                      inputMode="decimal"
                      step={tt.step}
                      min={tt.min_value}
                      max={tt.max_value}
                      defaultValue={cur ? String(cur.min_value) : ''}
                      onBlur={(e) => {
                        if (e.target.value !== (cur ? String(cur.min_value) : '')) setMap(tt.code, lv, e.target.value);
                      }}
                      placeholder="-"
                    />
                  </label>
                );
              })}
            </div>
          </Section>
        );
      })}
      {mapSave.error && <p className="err">{mapSave.error}</p>}

      <Section title={t('addTestType')}>
        <form className="form" onSubmit={submit}>
          <div className="row2">
            <label>{t('codeEn')}<input value={form.code} onChange={set('code')} required pattern="[a-z0-9_]{2,30}" placeholder="esl_level" /></label>
            <label>{t('name')}<input value={form.name} onChange={set('name')} required maxLength={60} placeholder="ESL Level" /></label>
          </div>
          <div className="row2">
            <label>
              {t('scale')}
              <select value={form.scale} onChange={set('scale')}>
                {SCALES.map((v) => <option key={v} value={v}>{scaleName(v)}</option>)}
              </select>
            </label>
            <label>{t('courseOpt')}<input value={form.course} onChange={set('course')} maxLength={80} /></label>
          </div>
          <div className="row3">
            <label>{t('min')}<input type="number" value={form.min_value} onChange={set('min_value')} required /></label>
            <label>{t('max')}<input type="number" value={form.max_value} onChange={set('max_value')} required /></label>
            <label>{t('step')}<input type="number" value={form.step} onChange={set('step')} required min="0.01" step="any" /></label>
          </div>
          <label>{t('sectionsOpt')}<input value={form.sections} onChange={set('sections')} placeholder="Fluency, Pronunciation, Grammar" /></label>
          {save.error && <p className="err" role="alert">{save.error}</p>}
          <button type="submit" className="btn btn-primary btn-lg" disabled={save.busy}>{t('add')}</button>
        </form>
      </Section>
    </>
  );
}
