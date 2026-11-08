import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { useT, type Key } from '../i18n';
import { PageHead, Section } from '../ui';

// 메뉴 검토표 'LMS' 시트 순서. 업체 시간표·출석 데이터가 필요한 메뉴는 연결 뒤 연다(원칙 V1·V6, C8).
const PLANNED: [Key, Key][] = [
  ['p_att', 'p_att_why'],
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
