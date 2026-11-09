import { useState } from 'react';
import { useApi, type ClassMark, type TimetableView } from '../api';
import { LoadError, Loading, Section, SubTitle } from '../components/Layout';
import { dayOfWeek, md } from '../format';
import { useI18n, type T } from '../i18n';

/** 끝나는 시각 'HH:MM' */
const endOf = (time: string, minutes: number) => {
  const [h, m] = time.split(':').map(Number);
  const t = h * 60 + m + minutes;
  return `${String(Math.floor(t / 60) % 24).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** 출석 결과 한 낱말: 출석 · 지각 N분 · 결석 · 사유 인정 · 체크 전 · 예정 */
function Result({ c, day, today, t }: { c: ClassMark; day: string; today: string; t: T }) {
  if (c.result === 'AT') return <span className="status st-approved">{t('tt.at')}</span>;
  if (c.result === 'TA') return <span className="status st-pending">{c.lateMin ? t('tt.lateMin', { n: c.lateMin }) : t('tt.late')}</span>;
  if (c.result === 'AB') return <span className={'status ' + (c.excused ? 'st-progress' : 'st-rejected')}>{c.excused ? t('tt.excused') : t('tt.ab')}</span>;
  return <span className="status st-cancelled">{day > today ? t('tt.planned') : t('tt.unchecked')}</span>;
}

/**
 * 시간표: 강사 포털(LMS)의 이번 주 수업과 출석 결과(읽기만). 결석이 틀렸으면 결석 신청이나 담당 선생님에게 말한다(사유 인정은 강사 포털 매니저).
 * 주는 월~일, 이전·다음 주로 옮긴다.
 */
export default function Timetable() {
  const { t, weekday } = useI18n();
  const [week, setWeek] = useState<string | null>(null);
  const { data, error, reload } = useApi<TimetableView>(`/api/timetable${week ? `/${week}` : ''}`);
  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <Loading />;
  const day = (d: string) => `${md(d)} (${weekday(dayOfWeek(d))})`;
  const days = data.days.filter((d) => d.classes.length > 0);
  const thisWeek = data.today >= data.from && data.today <= data.to;
  const c = data.counts;
  return (
    <>
      <SubTitle title={t('short.timetable')} back="/" />
      <div className="tt-week" role="group" aria-label={t('tt.week')}>
        <button type="button" className="btn" onClick={() => setWeek(data.prev)}>
          ‹ {t('tt.prev')}
        </button>
        <span className="tt-range">
          {md(data.from)} ~ {md(data.to)}
          {!thisWeek && (
            <button type="button" className="more" onClick={() => setWeek(null)}>
              {t('tt.thisWeek')}
            </button>
          )}
        </span>
        <button type="button" className="btn" onClick={() => setWeek(data.next)}>
          {t('tt.next')} ›
        </button>
      </div>
      {c.classes > 0 && (
        <p className="tt-counts">
          {t('tt.counts', { n: c.classes, at: c.attended, late: c.late, ab: c.absent })}
          {c.excused > 0 && ` · ${t('tt.excusedCount', { n: c.excused })}`}
        </p>
      )}
      {(c.absent > 0 || c.late > 0) && <p className="tt-note">{t('tt.note')}</p>}
      {days.length === 0 ? (
        <p className="state-msg">{data.available ? t('tt.none') : t('tt.notReady')}</p>
      ) : (
        days.map((d) => (
          <Section key={d.day} labelId={`tt-${d.day}`} title={d.day === data.today ? `${day(d.day)} · ${t('tt.today')}` : day(d.day)}>
            {d.classes.map((x) => (
              <div key={x.id} className="list-row">
                <span className="list-main">
                  <span className="list-title">
                    {x.time}–{endOf(x.time, x.minutes)} {x.subject || t('tt.class')}
                  </span>
                  <span className="list-sub">{[x.teacher, x.room && t('tt.room', { room: x.room }), x.kind === 'G' ? t('tt.group') : t('tt.oneOnOne')].filter(Boolean).join(' · ')}</span>
                </span>
                <Result c={x} day={d.day} today={data.today} t={t} />
              </div>
            ))}
          </Section>
        ))
      )}
    </>
  );
}
