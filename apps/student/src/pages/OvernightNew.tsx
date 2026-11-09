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
  // 출발일은 내일부터(하루 전까지 신청), 한 번에 최대 maxNights 박(11/10 결정 I11)
  const min = list.windows[0].from > list.minDate ? list.windows[0].from : list.minDate;
  const max = list.windows[list.windows.length - 1].to;
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [reason, setReason] = useState('');
  const [destination, setDestination] = useState('');
  const [accommodation, setAccommodation] = useState('');
  const [contact, setContact] = useState('');
  const [companions, setCompanions] = useState('');
  const [guardianConsent, setGuardianConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const n = from && until && until > from ? nights(from, until) : 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const rec = await createOvernight({ from, until, reason, destination, accommodation, contact, companions, guardianConsent });
      onDone(rec.id);
    } catch (err) {
      const code = (err as ApiError).code;
      setError(errorText(t, code === 'duplicate' ? 'overnight_duplicate' : code, { n: code === 'too_many_nights' ? list.maxNights : list.reasonMax }));
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
        <input
          id="ov-until"
          type="date"
          required
          min={from ? addDays(from, 1) : min}
          max={from && addDays(from, list.maxNights) < addDays(max, 1) ? addDays(from, list.maxNights) : addDays(max, 1)}
          value={until}
          onChange={(e) => setUntil(e.target.value)}
        />
        <span className="form-hint">
          {t('form.window', { from: ymd(min), to: ymd(max) })}
          {n > 0 && ` · ${t('ov.nights', { n })}`}
        </span>
        <span className="form-hint">{t('ov.rules', { n: list.maxNights })}</span>
      </div>
      <div className="form-field">
        <label htmlFor="ov-dest">{t('ov.destination')}</label>
        <input id="ov-dest" type="text" required maxLength={100} placeholder={t('ov.destinationPh')} value={destination} onChange={(e) => setDestination(e.target.value)} />
      </div>
      <div className="form-field">
        <label htmlFor="ov-stay">{t('ov.accommodation')}</label>
        <input id="ov-stay" type="text" maxLength={100} placeholder={t('ov.accommodationPh')} value={accommodation} onChange={(e) => setAccommodation(e.target.value)} />
      </div>
      <div className="form-field">
        <label htmlFor="ov-contact">{t('ov.contact')}</label>
        <input id="ov-contact" type="tel" required maxLength={30} placeholder={t('ov.contactPh')} value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      <div className="form-field">
        <label htmlFor="ov-with">{t('ov.companions')}</label>
        <input id="ov-with" type="text" inputMode="numeric" placeholder={t('ov.companionsPh')} value={companions} onChange={(e) => setCompanions(e.target.value)} />
      </div>
      <div className="form-field">
        <label htmlFor="ov-reason">{t('form.reason')}</label>
        <textarea id="ov-reason" rows={4} required maxLength={list.reasonMax} placeholder={t('ov.reasonPh')} value={reason} onChange={(e) => setReason(e.target.value)} />
        <span className="form-hint right">
          {reason.length} / {list.reasonMax}
        </span>
      </div>
      {list.minor && (
        <div className="form-field">
          <label className="check-row">
            <input type="checkbox" checked={guardianConsent} onChange={(e) => setGuardianConsent(e.target.checked)} /> {t('ov.guardian')}
          </label>
          <span className="form-hint">{t('ov.guardianHint')}</span>
        </div>
      )}
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
