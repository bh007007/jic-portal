import { Link } from 'react-router-dom';
import type { Absence, OvernightRow } from '../api';
import { dayOfWeek, md, mdhm } from '../format';
import { useI18n, type T } from '../i18n';

const STATUS_CLASS: Record<Absence['status'], string> = {
  pending: 'st-pending',
  approved: 'st-approved',
  rejected: 'st-rejected',
  cancelled: 'st-cancelled',
};

export function periodsText(t: T, periods: number[]) {
  return periods.length === 0 ? t('abs.allDay') : t('abs.periods', { p: periods.join('·') });
}

export function StatusText({ status }: { status: Absence['status'] }) {
  const { t } = useI18n();
  return <span className={'status ' + STATUS_CLASS[status]}>{t(`status.${status}`)}</span>;
}

/** 목록 한 줄: "11.10 (화) 병결 · 종일" / "11.09 21:40 제출" / 상태 */
export function AbsenceRow({ a }: { a: Absence }) {
  const { t, weekday } = useI18n();
  return (
    <Link to={`/requests/${a.id}`} className="list-row">
      <span className="list-main">
        <span className="list-title">
          {md(a.date)} ({weekday(dayOfWeek(a.date))}) {t(`kind.${a.kind}`)}
          <span className="list-extra"> · {periodsText(t, a.periods)}</span>
        </span>
        <span className="list-sub">{t('abs.submitted', { t: mdhm(a.submittedAt) })}</span>
      </span>
      <StatusText status={a.status} />
    </Link>
  );
}

/** 외박 목록 한 줄: "11.08 (일) ~ 11.10 (화) · 2박" / "11.07 21:40 제출" / 상태 */
export function OvernightRowLink({ o }: { o: OvernightRow }) {
  const { t, weekday } = useI18n();
  return (
    <Link to={`/requests/overnight/${o.id}`} className="list-row">
      <span className="list-main">
        <span className="list-title">
          {md(o.from)} ({weekday(dayOfWeek(o.from))}) ~ {md(o.until)} ({weekday(dayOfWeek(o.until))})
          <span className="list-extra"> · {t('ov.nights', { n: o.nights })}</span>
        </span>
        <span className="list-sub">{t('abs.submitted', { t: mdhm(o.submittedAt) })}</span>
      </span>
      <StatusText status={o.status} />
    </Link>
  );
}
