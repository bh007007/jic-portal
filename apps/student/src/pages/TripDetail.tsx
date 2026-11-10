import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, cancelTripSignup, signUpTrip, useApi, type TripDetail as Detail } from '../api';
import { LoadError, Loading, SubTitle } from '../components/Layout';
import { TripStateText, tripCost, tripDates } from '../components/trips';
import { dayOfWeek, md, ymdhm } from '../format';
import { errorText, useI18n } from '../i18n';

export default function TripDetail() {
  const { id = '' } = useParams();
  const { t, weekday } = useI18n();
  const { data, error, reload } = useApi<Detail>(`/api/trips/${encodeURIComponent(id)}`);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error?.status === 404) {
    return (
      <>
        <SubTitle title={t('trip.detail')} back="/trips" />
        <p className="state-msg">{t('trip.notFound')}</p>
      </>
    );
  }
  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <Loading />;
  const r = data;
  const today = data.today;

  async function act(kind: 'apply' | 'cancel') {
    if (!window.confirm(t(kind === 'apply' ? (r.full ? 'trip.confirmWait' : 'trip.confirmApply') : 'trip.confirmCancel'))) return;
    setBusy(true);
    setActionError(null);
    try {
      await (kind === 'apply' ? signUpTrip(r.id) : cancelTripSignup(r.id));
      reload();
    } catch (err) {
      setActionError(errorText(t, (err as ApiError).code));
    }
    setBusy(false);
  }

  // 신청할 수 없는 이유(이미 신청·지난 여행·취소된 여행은 상태로 보이므로 따로 적지 않는다)
  const why = !r.canApply && r.why && r.why !== 'already_applied' && r.status !== 'cancelled' && r.end >= today ? r.why : null;

  return (
    <>
      <SubTitle title={t('trip.detail')} back="/trips" />
      <table className="kv">
        <tbody>
          <tr>
            <th>{t('trip.name')}</th>
            <td>{r.title}</td>
          </tr>
          <tr>
            <th>{t('detail.status')}</th>
            <td>
              <TripStateText r={r} today={today} />
            </td>
          </tr>
          <tr>
            <th>{t('trip.when')}</th>
            <td>{tripDates(t, weekday, r)}</td>
          </tr>
          <tr>
            <th>{t('trip.place')}</th>
            <td>{r.place}</td>
          </tr>
          {r.meeting && (
            <tr>
              <th>{t('trip.meeting')}</th>
              <td>{r.meeting}</td>
            </tr>
          )}
          <tr>
            <th>{t('trip.cost')}</th>
            <td>{tripCost(t, r.cost)}</td>
          </tr>
          <tr>
            <th>{t('trip.deadline')}</th>
            <td>{t('trip.until', { d: `${md(r.deadline)} (${weekday(dayOfWeek(r.deadline))})` })}</td>
          </tr>
          <tr>
            <th>{t('trip.seats')}</th>
            <td>{t('trip.seatsText', { taken: r.taken, cap: r.capacity })}</td>
          </tr>
          {r.description && (
            <tr>
              <th>{t('trip.about')}</th>
              <td className="pre">{r.description}</td>
            </tr>
          )}
          {r.mine && (
            <tr>
              <th>{t('trip.mine')}</th>
              <td>
                {t(`trip.my.${r.mine.status}`, { n: r.mine.waitingNo ?? '' })} · {ymdhm(r.mine.status === 'applied' || r.mine.status === 'waiting' ? r.mine.createdAt : r.mine.updatedAt)}
              </td>
            </tr>
          )}
          {r.mine?.status === 'removed' && r.mine.reason && (
            <tr>
              <th>{t('trip.removedReason')}</th>
              <td className="pre">{r.mine.reason}</td>
            </tr>
          )}
        </tbody>
      </table>
      {r.nights > 0 && r.status !== 'cancelled' && <p className="form-hint pad">{t('trip.overnightNote')}</p>}
      {why && (
        <p className="form-hint pad" role="status">
          {errorText(t, why)}
        </p>
      )}
      {actionError && (
        <p className="form-error pad" role="alert">
          {actionError}
        </p>
      )}
      {(r.mine?.status === 'waiting' || (r.canApply && r.full)) && <p className="form-hint pad">{t('trip.waitingNote')}</p>}
      {r.canApply && (
        <div className="pad">
          <button type="button" className="btn btn-primary btn-block" disabled={busy} onClick={() => act('apply')}>
            {t(r.full ? 'trip.applyWaiting' : 'trip.apply')}
          </button>
        </div>
      )}
      {r.canCancel && (
        <div className="pad">
          <button type="button" className="btn btn-block" disabled={busy} onClick={() => act('cancel')}>
            {t('trip.cancel')}
          </button>
        </div>
      )}
    </>
  );
}
