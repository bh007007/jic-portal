import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, cancelAbsence, useApi, type AbsenceList } from '../api';
import { periodsText, StatusText } from '../components/absence';
import { LoadError, Loading, SubTitle } from '../components/Layout';
import { dayOfWeek, ymd, ymdhm } from '../format';
import { errorText, useI18n } from '../i18n';

export default function RequestDetail() {
  const { id } = useParams();
  const { t, weekday } = useI18n();
  const { data, error, reload } = useApi<AbsenceList>('/api/absences');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <Loading />;
  const a = data.rows.find((r) => r.id === id);

  async function cancel() {
    if (!a || !window.confirm(t('detail.confirmCancel'))) return;
    setBusy(true);
    setActionError(null);
    try {
      await cancelAbsence(a.id);
      reload();
    } catch (err) {
      setActionError(errorText(t, (err as ApiError).code));
    }
    setBusy(false);
  }

  return (
    <>
      <SubTitle title={t('detail.title')} back="/requests" />
      {!a ? (
        <p className="state-msg">{t('detail.notFound')}</p>
      ) : (
        <>
          <table className="kv">
            <tbody>
              <tr>
                <th>{t('detail.status')}</th>
                <td>
                  <StatusText status={a.status} />
                </td>
              </tr>
              <tr>
                <th>{t('detail.date')}</th>
                <td>
                  {ymd(a.date)} ({weekday(dayOfWeek(a.date))})
                </td>
              </tr>
              <tr>
                <th>{t('detail.kind')}</th>
                <td>{t(`kind.${a.kind}`)}</td>
              </tr>
              <tr>
                <th>{t('detail.periods')}</th>
                <td>{periodsText(t, a.periods)}</td>
              </tr>
              <tr>
                <th>{t('detail.reason')}</th>
                <td className="pre">{a.reason}</td>
              </tr>
              <tr>
                <th>{t('detail.submittedAt')}</th>
                <td>{ymdhm(a.submittedAt)}</td>
              </tr>
              {a.decidedAt && (
                <tr>
                  <th>{t('detail.decidedAt')}</th>
                  <td>{ymdhm(a.decidedAt)}</td>
                </tr>
              )}
              {a.comment && (
                <tr>
                  <th>{t('detail.comment')}</th>
                  <td className="pre">{a.comment}</td>
                </tr>
              )}
            </tbody>
          </table>
          {actionError && (
            <p className="form-error pad" role="alert">
              {actionError}
            </p>
          )}
          {a.status === 'pending' && (
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
