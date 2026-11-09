import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createAbsence, useApi, type AbsenceKind, type AbsenceList } from '../api';
import { LoadError, Loading, SubTitle } from '../components/Layout';
import { ymd } from '../format';
import { errorText, useI18n } from '../i18n';

const KINDS: AbsenceKind[] = ['sick', 'official', 'personal'];

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AbsenceNew() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data, error, reload } = useApi<AbsenceList>('/api/absences');

  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <SubTitle title={t('form.title')} />
      {data.windows.length === 0 ? (
        <p className="state-msg">{t('form.noWindow')}</p>
      ) : (
        <AbsenceForm list={data} onDone={(id) => navigate(`/requests/${id}`, { replace: true })} />
      )}
    </>
  );
}

function AbsenceForm({ list, onDone }: { list: AbsenceList; onDone: (id: string) => void }) {
  const { t } = useI18n();
  // 지난 날짜는 3일 전까지(11/10 결정 I10)
  const min = list.windows[0].from > list.minDate ? list.windows[0].from : list.minDate;
  const max = list.windows[list.windows.length - 1].to;
  const today = localToday();
  const [date, setDate] = useState(list.windows.some((w) => w.from <= today && today <= w.to) ? today : '');
  const [kind, setKind] = useState<AbsenceKind | ''>('');
  const [periods, setPeriods] = useState<number[]>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const togglePeriod = (p: number) => setPeriods((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p].sort((a, b) => a - b)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!kind) {
      setError(errorText(t, 'invalid_kind'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const rec = await createAbsence({ date, kind, periods, reason });
      onDone(rec.id);
    } catch (err) {
      setError(errorText(t, (err as ApiError).code, { n: list.reasonMax }));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-field">
        <label htmlFor="abs-date">{t('form.date')}</label>
        <input id="abs-date" type="date" required min={min} max={max} value={date} onChange={(e) => setDate(e.target.value)} />
        <span className="form-hint">{t('form.window', { from: ymd(min), to: ymd(max) })}</span>
      </div>

      <fieldset className="form-field">
        <legend>{t('form.kind')}</legend>
        <div className="seg">
          {KINDS.map((k) => (
            <label key={k} className={kind === k ? 'on' : ''}>
              <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} />
              {t(`kind.${k}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="form-field">
        <legend>{t('form.periods')}</legend>
        <div className="chips">
          <button type="button" className={periods.length === 0 ? 'on' : ''} aria-pressed={periods.length === 0} onClick={() => setPeriods([])}>
            {t('abs.allDay')}
          </button>
          {Array.from({ length: list.periodCount }, (_, i) => i + 1).map((p) => (
            <button key={p} type="button" className={periods.includes(p) ? 'on' : ''} aria-pressed={periods.includes(p)} onClick={() => togglePeriod(p)}>
              {p}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="form-field">
        <label htmlFor="abs-reason">{t('form.reason')}</label>
        <textarea id="abs-reason" rows={5} required maxLength={list.reasonMax} value={reason} onChange={(e) => setReason(e.target.value)} />
        <span className="form-hint right">
          {reason.length} / {list.reasonMax}
        </span>
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
        {busy ? t('form.submitting') : t('form.submit')}
      </button>
    </form>
  );
}
