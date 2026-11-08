import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, cancelOvernight, useApi, type OvernightList } from '../api';
import { StatusText } from '../components/absence';
import { LoadError, Loading, SubTitle } from '../components/Layout';
import { dayOfWeek, ymd, ymdhm } from '../format';
import { errorText, useI18n } from '../i18n';

export default function OvernightDetail() {
  const { id } = useParams();
  const { t, weekday } = useI18n();
  const { data, error, reload } = useApi<OvernightList>('/api/overnights');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <Loading />;
  const o = data.rows.find((r) => r.id === id);
  const day = (d: string) => `${ymd(d)} (${weekday(dayOfWeek(d))})`;

  async function cancel() {
    if (!o || !window.confirm(t('ov.confirmCancel'))) return;
    setBusy(true);
    setActionError(null);
    try {
      await cancelOvernight(o.id);
      reload();
    } catch (err) {
      setActionError(errorText(t, (err as ApiError).code));
    }
    setBusy(false);
  }

  return (
    <>
      <SubTitle title={t('ov.detail')} back="/requests" />
      {!o ? (
        <p className="state-msg">{t('detail.notFound')}</p>
      ) : (
        <>
          <table className="kv">
            <tbody>
              <tr>
                <th>{t('detail.status')}</th>
                <td>
                  <StatusText status={o.status} />
                </td>
              </tr>
              <tr>
                <th>{t('ov.from')}</th>
                <td>{day(o.from)}</td>
              </tr>
              <tr>
                <th>{t('ov.until')}</th>
                <td>
                  {day(o.until)} <span className="muted">({t('ov.nights', { n: o.nights })})</span>
                </td>
              </tr>
              {o.destination && (
                <tr>
                  <th>{t('ov.destination')}</th>
                  <td>{o.destination}</td>
                </tr>
              )}
              {o.accommodation && (
                <tr>
                  <th>{t('ov.accommodation')}</th>
                  <td>{o.accommodation}</td>
                </tr>
              )}
              {o.contact && (
                <tr>
                  <th>{t('ov.contact')}</th>
                  <td>{o.contact}</td>
                </tr>
              )}
              {!!o.companions?.length && (
                <tr>
                  <th>{t('ov.companions')}</th>
                  <td>{o.companions.join(', ')}</td>
                </tr>
              )}
              <tr>
                <th>{t('detail.reason')}</th>
                <td className="pre">{o.reason}</td>
              </tr>
              <tr>
                <th>{t('detail.submittedAt')}</th>
                <td>{ymdhm(o.submittedAt)}</td>
              </tr>
              {o.decidedAt && (
                <tr>
                  <th>{t('detail.decidedAt')}</th>
                  <td>{ymdhm(o.decidedAt)}</td>
                </tr>
              )}
              {o.comment && (
                <tr>
                  <th>{t('detail.comment')}</th>
                  <td className="pre">{o.comment}</td>
                </tr>
              )}
            </tbody>
          </table>
          {actionError && (
            <p className="form-error pad" role="alert">
              {actionError}
            </p>
          )}
          {o.status === 'pending' && (
            <div className="pad">
              <button type="button" className="btn btn-block" disabled={busy} onClick={cancel}>
                {t('detail.cancel')}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
