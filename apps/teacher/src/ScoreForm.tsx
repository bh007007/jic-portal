import { useEffect, useState, type FormEvent } from 'react';
import type { LmsStudent, TestType } from './data';
import { useT } from './i18n';
import { manilaToday, supabase } from './supabase';
import { useSave } from './ui';

/**
 * 성적 한 건 입력(원칙 L7: 휴대폰에서 몇 번의 터치로). 시험 종류의 범위·단위·영역은 DB 트리거가 다시 확인한다.
 * 영역이 있는 시험(IELTS 등)은 영역마다 칸을 보여 주고, 채운 칸만 저장한다(빈 칸 = 입력 안 함).
 */
export default function ScoreForm({ student, types, onSaved }: { student: LmsStudent; types: TestType[]; onSaved: () => void }) {
  const { t } = useT();
  const active = types.filter((x) => x.active);
  const [code, setCode] = useState(active[0]?.code ?? '');
  const [date, setDate] = useState(manilaToday());
  const [values, setValues] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const { busy, error, setError, run } = useSave();
  const type = active.find((x) => x.code === code);
  const fields = type ? (type.sections.length ? [...type.sections, ''] : ['']) : [];

  useEffect(() => setValues({}), [code]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!type) return;
    const rows = fields
      .filter((f) => values[f]?.trim())
      .map((section) => ({ student_no: student.student_no, enrollment_id: student.enrollment_id, test_type: type.code, test_date: date, section, value: Number(values[section]), note: note.trim() }));
    if (!rows.length) {
      setError(t('needOneScore'));
      return;
    }
    const ok = await run(async () => {
      const { error: err } = await supabase.from('test_results').insert(rows);
      if (err) throw err;
    });
    if (ok) {
      setValues({});
      setNote('');
      onSaved();
    }
  };

  if (!active.length) return <p className="muted">{t('noTestTypes')}</p>;
  return (
    <form className="form" onSubmit={submit}>
      <div className="row2">
        <label>
          {t('test')}
          <select value={code} onChange={(e) => setCode(e.target.value)}>
            {active.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
          </select>
        </label>
        <label>
          {t('date')}
          <input type="date" value={date} max={manilaToday()} onChange={(e) => setDate(e.target.value)} required />
        </label>
      </div>
      {type && (
        <div className="score-grid">
          {fields.map((f) => (
            <label key={f || 'total'}>
              {f || t('total')}
              <input
                type="number"
                inputMode="decimal"
                min={type.min_value}
                max={type.max_value}
                step={type.step}
                value={values[f] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
                placeholder={`${type.min_value}~${type.max_value}`}
              />
            </label>
          ))}
        </div>
      )}
      <label>
        {t('memo')}
        <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('optional')} />
      </label>
      {error && <p className="err" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? t('saving') : t('save')}</button>
    </form>
  );
}
