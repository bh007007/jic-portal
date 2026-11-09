import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useT, type Key } from '../i18n';
import { PageHead, Section } from '../ui';

// 메뉴 검토표 'LMS' 시트 순서. 출석 체크·출석 확인·무단결석 목록은 11/9에 열었다. 나머지는 결정이나 업체 시간표가 필요하다(원칙 V1·V6, C8).
const PLANNED: [Key, Key][] = [
  ['p_appr', 'p_appr_why'],
  ['p_rep', 'p_rep_why'],
  ['p_rec', 'p_rec_why'],
  ['p_chg', 'p_chg_why'],
];

export default function More() {
  const { me } = useAuth();
  const { t } = useT();
  return (
    <>
      <PageHead title={t('more')} />
      <Section title={t('classSection')}>
        <ul className="menu">
          <li><Link to="/attendance">{t('attendanceMenu')}</Link></li>
          <li><Link to="/attendance/summary">{t('attSummaryMenu')}</Link></li>
          <li><Link to="/attendance/summary?unexcused=1">{t('unexcusedMenu')}</Link></li>
          <li><Link to="/notices">{t('noticesMenu')}</Link></li>
          <li><Link to="/absences">{t('absencesMenu')}</Link></li>
        </ul>
      </Section>
      {me?.canSchedule && (
        <Section title={t('manageClasses')}>
          <ul className="menu">
            <li><Link to="/schedule">{t('scheduleMenu')}</Link></li>
            <li><Link to="/classrooms">{t('classroomsMenu')}</Link></li>
          </ul>
        </Section>
      )}
      {me?.isManager && (
        <Section title={t('manage')}>
          <ul className="menu">
            <li><Link to="/tests">{t('testTypes')}</Link></li>
            <li><Link to="/staff">{t('staffList')}</Link></li>
          </ul>
        </Section>
      )}
      <Section title={t('planned')}>
        <ul className="planned">
          {PLANNED.map(([name, why]) => (
            <li key={name}>
              <strong>{t(name)}</strong>
              <span className="muted small">{t(why)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
