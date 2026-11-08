import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, cancelLife, useApi, type LifeList } from '../api';
import { LifeStatusText } from '../components/absence';
import { LoadError, Loading, SubTitle } from '../components/Layout';
import { ymdhm } from '../format';
import { errorText, useI18n } from '../i18n';

export default function LifeDetail() {
  const { id } = useParams();
  const { t } = useI18n();
  const { data, error, reload } = useApi<LifeList>('/api/life-requests');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <Loading />;
  const r = data.rows.find((x) => x.id === id);

  async function cancel() {
    if (!r || !window.confirm(t('life.confirmCancel'))) return;
    setBusy(true);
    setActionError(null);
    try {
      await cancelLife(r.id);
      reload();
    } catch (err) {
      setActionError(errorText(t, (err as ApiError).code));
    }
    setBusy(false);
  }

  return (
    <>
      <SubTitle title={t('life.detail')} back="/requests" />
      {!r ? (
        <p className="state-msg">{t('detail.notFound')}</p>
      ) : (
        <>
          <table className="kv">
            <tbody>
              <tr>
                <th>{t('detail.status')}</th>
                <td>
                  <LifeStatusText status={r.status} />
                </td>
              </tr>
              <tr>
                <th>{t('life.category')}</th>
                <td>{t(`life.cat.${r.category}`)}</td>
              </tr>
              <tr>
                <th>{t('life.content')}</th>
                <td className="pre">{r.content}</td>
              </tr>
              <tr>
                <th>{t('detail.submittedAt')}</th>
                <td>{ymdhm(r.submittedAt)}</td>
              </tr>
              {r.handledAt && (
                <tr>
                  <th>{t('detail.decidedAt')}</th>
                  <td>{ymdhm(r.handledAt)}</td>
                </tr>
              )}
              {r.reply && (
                <tr>
                  <th>{t('life.reply')}</th>
                  <td className="pre">{r.reply}</td>
                </tr>
              )}
            </tbody>
          </table>
          {actionError && (
            <p className="form-error pad" role="alert">
              {actionError}
            </p>
          )}
          {r.status === 'received' && (
            <div className="pad">
              <button type="button" className="btn btn-block" disabled={busy} onClick={cancel}>
                {t('life.cancel')}
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
