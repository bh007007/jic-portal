import { Link } from 'react-router-dom';
import type { TripRow } from '../api';
import { dayOfWeek, md } from '../format';
import { useI18n, type T } from '../i18n';

/** 상태 한 낱말: 내 신청이 먼저(신청함·명단 제외), 그다음 여행 상태(취소·지난 여행), 그다음 신청 가능 여부 */
type TripStateKey = 'applied' | 'waiting' | 'cancelled' | 'past' | 'removed' | 'open' | 'waitlist' | 'full' | 'closed' | 'unavailable';
function tripState(r: TripRow, today: string): { key: TripStateKey; cls: string } {
  if (r.mine?.status === 'applied') return { key: r.status === 'cancelled' ? 'cancelled' : 'applied', cls: r.status === 'cancelled' ? 'st-cancelled' : 'st-approved' };
  if (r.status === 'cancelled') return { key: 'cancelled', cls: 'st-cancelled' };
  if (r.mine?.status === 'waiting') return { key: 'waiting', cls: 'st-pending' }; // 대기(11/10 결정 I12)
  if (r.end < today) return { key: 'past', cls: 'st-cancelled' };
  if (r.mine?.status === 'removed') return { key: 'removed', cls: 'st-rejected' };
  if (r.canApply) return r.full ? { key: 'waitlist', cls: 'st-pending' } : { key: 'open', cls: 'st-progress' };
  if (r.why === 'trip_full') return { key: 'full', cls: 'st-rejected' };
  if (r.why === 'trip_closed') return { key: 'closed', cls: 'st-cancelled' };
  return { key: 'unavailable', cls: 'st-cancelled' };
}

export function TripStateText({ r, today }: { r: TripRow; today: string }) {
  const { t } = useI18n();
  const s = tripState(r, today);
  return <span className={'status ' + s.cls}>{t(`trip.st.${s.key}`)}</span>;
}

/** 11.14 (토) ~ 11.15 (일) · 1박 / 11.14 (토) · 당일 */
export function tripDates(t: T, weekday: (n: number) => string, r: Pick<TripRow, 'start' | 'end' | 'nights'>) {
  const day = (d: string) => `${md(d)} (${weekday(dayOfWeek(d))})`;
  return r.nights > 0 ? `${day(r.start)} ~ ${day(r.end)} · ${t('ov.nights', { n: r.nights })}` : `${day(r.start)} · ${t('trip.dayTrip')}`;
}

export const tripCost = (t: T, cost: number) => (cost > 0 ? t('trip.costPhp', { n: cost.toLocaleString('en-US') }) : t('trip.free'));

/** 여행 목록 한 줄: "보라카이 1박" / "11.14 (토) ~ 11.15 (일) · 1박 · 2,500 PHP" / 상태 */
export function TripRowLink({ r, today }: { r: TripRow; today: string }) {
  const { t, weekday } = useI18n();
  return (
    <Link to={`/trips/${r.id}`} className="list-row">
      <span className="list-main">
        <span className="list-title">
          {r.title}
          <span className="list-extra"> · {r.place}</span>
        </span>
        <span className="list-sub">
          {tripDates(t, weekday, r)} · {tripCost(t, r.cost)}
        </span>
      </span>
      <TripStateText r={r} today={today} />
    </Link>
  );
}
