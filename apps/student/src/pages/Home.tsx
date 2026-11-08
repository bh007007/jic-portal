import { Link } from 'react-router-dom';
import { useApi, type AbsenceList, type Profile } from '../api';
import { AbsenceRow } from '../components/absence';
import { IconCalendar, IconForm, IconList, IconUser } from '../components/icons';
import { LoadError, Loading, Section } from '../components/Layout';
import { md, ymd } from '../format';
import { useI18n } from '../i18n';

export default function Home() {
  const { t } = useI18n();
  const me = useApi<Profile>('/api/me');
  const abs = useApi<AbsenceList>('/api/absences');

  if (me.error) return <LoadError onRetry={me.reload} />;
  if (!me.data) return <Loading />;
  const { student, enrollment: e, checkout } = me.data;

  return (
    <>
      <section className="id-card" aria-label={t('card.label')}>
        <div className="id-photo">{t('card.photo')}</div>
        <div className="id-text">
          <span className="id-name">{student.name}</span>
          <span className="muted">
            {student.stId}
            {student.nation && ` · ${student.nation}`}
          </span>
          {e && (
            <>
              <span>
                {e.course || '-'} · {e.campus}
              </span>
              <span className="muted">
                {ymd(e.start)} ~ {ymd(e.end)}
                {e.status !== 'current' && <span className={'enroll-tag ' + e.status}>{t(`enroll.${e.status}`)}</span>}
              </span>
            </>
          )}
        </div>
      </section>

      <nav className="shortcuts" aria-label={t('short.label')}>
        <Link to="/timetable">
          <IconCalendar />
          {t('short.timetable')}
        </Link>
        <Link to="/requests/absence/new">
          <IconForm />
          {t('short.absence')}
        </Link>
        <Link to="/requests">
          <IconList />
          {t('short.history')}
        </Link>
        <Link to="/me">
          <IconUser />
          {t('short.me')}
        </Link>
      </nav>

      <Section
        labelId="abs-h"
        title={t('home.absences')}
        action={
          <Link to="/requests" className="more">
            {t('home.viewAll')}
          </Link>
        }
      >
        {abs.error ? (
          <LoadError onRetry={abs.reload} />
        ) : !abs.data ? (
          <p className="list-empty">{t('common.loading')}</p>
        ) : abs.data.rows.length === 0 ? (
          <p className="list-empty">{t('home.noAbsences')}</p>
        ) : (
          abs.data.rows.slice(0, 3).map((a) => <AbsenceRow key={a.id} a={a} />)
        )}
      </Section>

      {checkout && (
        <Section
          labelId="grad-h"
          title={
            <>
              {t('home.checkout')} <span className="text-red">{checkout.daysLeft === 0 ? 'D-Day' : `D-${checkout.daysLeft}`}</span>
            </>
          }
        >
          <div className="list-row plain">
            <span>{t('home.roomClear')}</span>
            <span className={checkout.roomClear ? 'text-blue' : 'muted'}>{checkout.roomClear ? t('home.done') : t('home.notDone')}</span>
          </div>
          <div className="list-row plain">
            <span>{t('home.pointClear')}</span>
            <span className={checkout.pointClear ? 'text-blue' : 'muted'}>{checkout.pointClear ? t('home.done') : t('home.notDone')}</span>
          </div>
          <Link to="/departure" className="list-row plain">
            <span>{t('home.departure')}</span>
            {me.data.departure ? (
              <span className="text-blue">
                {md(me.data.departure.date)} {me.data.departure.time} &gt;
              </span>
            ) : (
              <span className="muted">{t('home.notRegistered')} &gt;</span>
            )}
          </Link>
        </Section>
      )}
    </>
  );
}
