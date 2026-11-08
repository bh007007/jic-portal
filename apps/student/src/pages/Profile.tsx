import { useNavigate } from 'react-router-dom';
import { setStudentId, useApi, type Profile as ProfileData } from '../api';
import { LoadError, Loading, Section } from '../components/Layout';
import { ymd } from '../format';
import { useI18n, type MsgKey } from '../i18n';

// 관리자 core 는 성별을 '여'/'남'으로 준다.
const GENDER: Record<string, MsgKey> = { 여: 'gender.F', 남: 'gender.M' };

export default function Profile() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data, error, reload } = useApi<ProfileData>('/api/me');
  const logout = () => {
    // 다음 사람이 로그인하면 홈부터 보이게 주소도 되돌린다.
    navigate('/', { replace: true });
    setStudentId(null);
  };
  if (error) return <LoadError onRetry={reload} />;
  if (!data) return <Loading />;
  const { student: s, enrollment: e, enrollments } = data;
  const dash = (v: string) => v || '-';

  return (
    <>
      <div className="page-head">
        <h1>{t('me.title')}</h1>
      </div>

      <Section labelId="me-st" title={t('me.student')}>
        <table className="kv">
          <tbody>
            <tr>
              <th>{t('me.stId')}</th>
              <td>{s.stId}</td>
            </tr>
            <tr>
              <th>{t('me.name')}</th>
              <td>{s.name}</td>
            </tr>
            <tr>
              <th>{t('me.birthday')}</th>
              <td>{ymd(s.birthday)}</td>
            </tr>
            <tr>
              <th>{t('me.gender')}</th>
              <td>{GENDER[s.gender] ? t(GENDER[s.gender]) : dash(s.gender)}</td>
            </tr>
            <tr>
              <th>{t('me.nation')}</th>
              <td>{dash(s.nation)}</td>
            </tr>
            <tr>
              <th>{t('me.email')}</th>
              <td>{dash(s.email)}</td>
            </tr>
            <tr>
              <th>{t('me.cell')}</th>
              <td>{dash(s.cell)}</td>
            </tr>
          </tbody>
        </table>
      </Section>

      {e && (
        <Section labelId="me-en" title={t('me.enrollment')}>
          <table className="kv">
            <tbody>
              <tr>
                <th>{t('me.course')}</th>
                <td>{dash(e.course)}</td>
              </tr>
              <tr>
                <th>{t('me.campus')}</th>
                <td>{dash(e.campus)}</td>
              </tr>
              <tr>
                <th>{t('me.dorm')}</th>
                <td>{dash(e.dorm)}</td>
              </tr>
              <tr>
                <th>{t('me.period')}</th>
                <td>
                  {ymd(e.start)} ~ {ymd(e.end)}
                  {e.weeks > 0 && <span className="muted"> ({t('me.weeks', { n: e.weeks })})</span>}
                </td>
              </tr>
              <tr>
                <th>{t('me.batch')}</th>
                <td>{dash(e.batch)}</td>
              </tr>
            </tbody>
          </table>
        </Section>
      )}

      {enrollments.length > 1 && (
        <Section labelId="me-hist" title={t('me.history')}>
          {enrollments.map((x) => (
            <div key={x.trId} className="list-row plain">
              <span className="list-main">
                <span className="list-title">
                  {ymd(x.start)} ~ {ymd(x.end)}
                </span>
                <span className="list-sub">
                  {dash(x.course)} · {x.campus}
                </span>
              </span>
              <span className="muted">{t(`enroll.${x.status}`)}</span>
            </div>
          ))}
        </Section>
      )}

      <div className="pad">
        <button type="button" className="btn btn-block" onClick={logout}>
          {t('me.logout')}
        </button>
      </div>
    </>
  );
}
