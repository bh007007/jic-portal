import { useState, type FormEvent } from 'react';
import { ApiError, saveDeparture, useApi, type DepartureView } from '../api';
import { LoadError, Loading, SubTitle } from '../components/Layout';
import { ymd } from '../format';
import { errorText, useI18n } from '../i18n';

/** 귀국 항공편 등록·수정(디자인 05 '졸업 전 확인'). 인트라넷 '귀국 일정'이 공항 이동 배차에 쓴다. */
export default function Departure() {
  const { t } = useI18n();
  const { data, error, reload } = useApi<DepartureView>('/api/departure');
  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <Loading />;
  return (
    <>
      <SubTitle title={t('dep.title')} back="/" />
      {!data.enrollment ? <p className="state-msg">{t('dep.noEnrollment')}</p> : <DepartureForm view={data} onSaved={reload} />}
    </>
  );
}

function DepartureForm({ view, onSaved }: { view: DepartureView; onSaved: () => void }) {
  const { t } = useI18n();
  const d = view.departure;
  const e = view.enrollment!;
  const min = view.today > e.start ? view.today : e.start;
  const locked = !!d && d.date < view.today;
  const [date, setDate] = useState(d?.date ?? '');
  const [time, setTime] = useState(d?.time ?? '');
  const [flight, setFlight] = useState(d?.flight ?? '');
  const [airport, setAirport] = useState<string>(d?.airport ?? '');
  const [needsRide, setNeedsRide] = useState(d?.needsRide ?? false);
  const [note, setNote] = useState(d?.note ?? '');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!airport) return setMessage({ ok: false, text: errorText(t, 'invalid_airport') });
    setBusy(true);
    setMessage(null);
    try {
      const saved = await saveDeparture({ date, time, flight, airport, needsRide, note });
      setFlight(saved.flight); // 서버가 대문자·공백을 정리한 값
      setNote(saved.note);
      setMessage({ ok: true, text: t('dep.saved') });
      onSaved();
    } catch (err) {
      const code = (err as ApiError).code;
      setMessage({ ok: false, text: code === 'date_out_of_range' ? t('err.dep_date', { from: ymd(min), to: ymd(e.latest) }) : errorText(t, code) });
    }
    setBusy(false);
  }

  return (
    <form className="form" onSubmit={submit}>
      {locked && <p className="form-hint">{t('dep.passed')}</p>}
      <fieldset className="form-group" disabled={locked}>
        <legend className="sr-only">{t('dep.title')}</legend>
        <div className="form-field">
          <label htmlFor="dep-date">{t('dep.date')}</label>
          <input id="dep-date" type="date" required min={min} max={e.latest} value={date} onChange={(x) => setDate(x.target.value)} />
          <span className="form-hint">{t('dep.window', { from: ymd(min), to: ymd(e.latest) })}</span>
        </div>
        <div className="form-field">
          <label htmlFor="dep-time">{t('dep.time')}</label>
          <input id="dep-time" type="time" required value={time} onChange={(x) => setTime(x.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="dep-flight">{t('dep.flight')}</label>
          <input id="dep-flight" type="text" required maxLength={20} autoCapitalize="characters" placeholder="PR 468" value={flight} onChange={(x) => setFlight(x.target.value)} />
        </div>
        <fieldset className="form-field">
          <legend>{t('dep.airport')}</legend>
          <div className="seg">
            {view.airports.map((a) => (
              <label key={a} className={airport === a ? 'on' : ''}>
                <input type="radio" name="airport" value={a} checked={airport === a} onChange={() => {
                    setAirport(a);
                    setMessage(null);
                  }}
                />
                {t(`airport.${a}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="check-row">
          <input type="checkbox" checked={needsRide} onChange={(x) => setNeedsRide(x.target.checked)} />
          <span>
            {t('dep.ride')}
            <span className="form-hint block">{t('dep.rideHint')}</span>
          </span>
        </label>
        <div className="form-field">
          <label htmlFor="dep-note">{t('dep.note')}</label>
          <textarea id="dep-note" rows={2} maxLength={200} placeholder={t('dep.notePh')} required={airport === 'OTHER'} value={note} onChange={(x) => setNote(x.target.value)} />
        </div>
      </fieldset>
      {message && (
        <p className={message.ok ? 'form-ok' : 'form-error'} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
      {!locked && (
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {t('dep.save')}
        </button>
      )}
    </form>
  );
}
