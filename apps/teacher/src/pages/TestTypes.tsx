import { useState, type FormEvent } from 'react';
import { CEFR_LEVELS, SCALE_LABEL, loadCefr, loadTestTypes, type TestType } from '../data';
import { supabase } from '../supabase';
import { Loading, PageHead, Section, useLoad, useSave } from '../ui';

const EMPTY = { code: '', name: '', course: '', scale: 'level' as TestType['scale'], min_value: '1', max_value: '10', step: '1', sections: '' };

/**
 * 시험 종류와 CEFR 대응(원칙 L2·L3, 매니저·직원). 시험 기록은 한 구조로 저장하고 '시험 종류'로 나눈다.
 * CEFR 대응 기준과 시험 주기는 미결정이라 빈칸으로 두고, 정해지면 여기에서 채운다. CEFR은 'JIC 기준 추정 레벨'로 표시한다.
 */
export default function TestTypes() {
  const types = useLoad(() => loadTestTypes(), []);
  const cefr = useLoad(() => loadCefr(), []);
  const [form, setForm] = useState(EMPTY);
  const save = useSave();
  const mapSave = useSave();

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
  const toggle = async (t: TestType) => {
    if (await save.run(async () => {
      const { error } = await supabase.from('test_types').update({ active: !t.active, updated_at: new Date().toISOString() }).eq('code', t.code);
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
      <PageHead title="시험 종류 · CEFR 대응" sub="CEFR은 JIC 기준 추정 레벨(원칙 L2). 대응 기준·시험 주기는 미결정(L3)" />

      {(types.data ?? []).map((t) => {
        const maps = (cefr.data ?? []).filter((m) => m.test_type === t.code);
        return (
          <Section
            key={t.code}
            title={<>{t.name} <span className="muted small">{t.code} · {SCALE_LABEL[t.scale]} {t.min_value}~{t.max_value} (단위 {t.step}){t.course ? ` · ${t.course}` : ''}</span></>}
            extra={<button type="button" className="btn btn-xs" onClick={() => toggle(t)} disabled={save.busy}>{t.active ? '사용 중지' : '다시 사용'}</button>}
          >
            {!t.active && <p className="muted small">사용 중지됨: 새 성적 입력에 나오지 않는다(기존 기록은 그대로).</p>}
            {t.sections.length > 0 && <p className="small">영역: {t.sections.join(', ')}</p>}
            <div className="cefr-grid">
              {CEFR_LEVELS.map((lv) => {
                const cur = maps.find((m) => m.cefr === lv);
                return (
                  <label key={lv}>
                    {lv} 이상
                    <input
                      type="number"
                      inputMode="decimal"
                      step={t.step}
                      min={t.min_value}
                      max={t.max_value}
                      defaultValue={cur ? String(cur.min_value) : ''}
                      onBlur={(e) => {
                        if (e.target.value !== (cur ? String(cur.min_value) : '')) setMap(t.code, lv, e.target.value);
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

      <Section title="시험 종류 추가">
        <form className="form" onSubmit={submit}>
          <div className="row2">
            <label>코드(영문)<input value={form.code} onChange={set('code')} required pattern="[a-z0-9_]{2,30}" placeholder="예: esl_level" /></label>
            <label>이름<input value={form.name} onChange={set('name')} required maxLength={60} placeholder="예: ESL 레벨" /></label>
          </div>
          <div className="row2">
            <label>
              척도
              <select value={form.scale} onChange={set('scale')}>
                {Object.entries(SCALE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label>해당 코스(일부, 비우면 전체)<input value={form.course} onChange={set('course')} maxLength={80} /></label>
          </div>
          <div className="row3">
            <label>최소<input type="number" value={form.min_value} onChange={set('min_value')} required /></label>
            <label>최대<input type="number" value={form.max_value} onChange={set('max_value')} required /></label>
            <label>단위<input type="number" value={form.step} onChange={set('step')} required min="0.01" step="any" /></label>
          </div>
          <label>영역(쉼표로, 비우면 총점만)<input value={form.sections} onChange={set('sections')} placeholder="예: Fluency, Pronunciation, Grammar" /></label>
          {save.error && <p className="err" role="alert">{save.error}</p>}
          <button type="submit" className="btn btn-primary btn-lg" disabled={save.busy}>추가</button>
        </form>
      </Section>
    </>
  );
}
