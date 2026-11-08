import { useApi, type TripList } from '../api';
import { LoadError, Loading, Section, SubTitle } from '../components/Layout';
import { TripRowLink } from '../components/trips';
import { useI18n } from '../i18n';

/** 학교 여행·액티비티: 다가오는 여행(내 캠퍼스·전체)과, 내가 신청했던 지난 여행 */
export default function Trips() {
  const { t } = useI18n();
  const { data, error, reload } = useApi<TripList>('/api/trips');
  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <Loading />;
  const upcoming = data.rows.filter((r) => r.end >= data.today);
  const past = data.rows.filter((r) => r.end < data.today).reverse();
  return (
    <>
      <SubTitle title={t('trip.title')} back="/requests" />
      <Section labelId="trip-up" title={t('trip.upcoming')}>
        {upcoming.length === 0 ? <p className="list-empty">{t('trip.none')}</p> : upcoming.map((r) => <TripRowLink key={r.id} r={r} today={data.today} />)}
      </Section>
      {past.length > 0 && (
        <Section labelId="trip-past" title={t('trip.past')}>
          {past.map((r) => (
            <TripRowLink key={r.id} r={r} today={data.today} />
          ))}
        </Section>
      )}
    </>
  );
}
