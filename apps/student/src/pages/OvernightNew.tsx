import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, createOvernight, useApi, type OvernightList } from '../api';
import { LoadError, Loading, SubTitle } from '../components/Layout';
import { ymd } from '../format';
import { errorText, useI18n } from '../i18n';

const addDays = (d: string, n: number) => new Date(Date.parse(d) + n * 864e5).toISOString().slice(0, 10);
const nights = (from: string, until: string) => Math.round((Date.parse(until) - Date.parse(from)) / 864e5);

export default function OvernightNew() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data, error, reload } = useApi<OvernightList>('/api/overnights');
  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <SubTitle title={t('ov.title')} />
      {data.windows.length === 0 ? (
        <p className="state-msg">{t('ov.noWindow')}</p>
      ) : (
        <OvernightForm list={data} onDone={(id) => navigate(`/requests/overnight/${id}`, { replace: true })} />
      )}
    </>
  );
}

function OvernightForm({ list, onDone }: { list: OvernightList; onDone: (id: string) => void }) {
  const { t } = useI18n();
  const min = list.windows[0].from;
  const max = list.windows[list.windows.length - 1].to;
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const n = from && until && until > from ? nights(from, until) : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const rec = await createOvernight({ from, until, reason });
      onDone(rec.id);
    } catch (err) {
      const code = (err as ApiError).code;
      setError(errorText(t, code === 'duplicate' ? 'overnight_duplicate' : code, { n: list.reasonMax }));
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <div className="form-field">
        <label htmlFor="ov-from">{t('ov.from')}</label>
        <input id="ov-from" type="date" required min={min} max={max} value={from} onChange={(e) => setFrom(e.target.value)} />
      </div>
      <div className="form-field">
        <label htmlFor="ov-until">{t('ov.until')}</label>
        <input id="ov-until" type="date" required min={from ? addDays(from, 1) : min} max={addDays(max, 1)} value={until} onChange={(e) => setUntil(e.target.value)} />
        <span className="form-hint">
          {t('form.window', { from: ymd(min), to: ymd(max) })}
          {n > 0 && ` · ${t('ov.nights', { n })}`}
        </span>
      </div>
      <div className="form-field">
        <label htmlFor="ov-reason">{t('form.reason')}</label>
        <textarea id="ov-reason" rows={4} required maxLength={list.reasonMax} placeholder={t('ov.reasonPh')} value={reason} onChange={(e) => setReason(e.target.value)} />
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
