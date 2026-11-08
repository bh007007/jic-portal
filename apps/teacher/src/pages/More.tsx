import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useT, type Key } from '../i18n';
import { PageHead, Section } from '../ui';

// 메뉴 검토표 'LMS' 시트 순서. 출석 체크는 11/9에 열었다. 나머지는 결정이나 출석 원본이 필요하다(원칙 V1·V6, C8).
const PLANNED: [Key, Key][] = [
  ['p_attv', 'p_attv_why'],
  ['p_appr', 'p_appr_why'],
  ['p_unex', 'p_unex_why'],
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
          <li><Link to="/absences">{t('absencesMenu')}</Link></li>
        </ul>
      </Section>
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
