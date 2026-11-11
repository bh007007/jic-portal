import { Link } from 'react-router-dom';
import { courseLabel, loadCampuses, loadCourses, useLoad } from '../data';
import { t } from '../i18n';
import { Loading, PageHead } from '../ui';
import { toneOf } from '../tone';

// 3.1 캠퍼스 목록 (캠퍼스 간 강제 비교는 하지 않는다)
export default function Campuses() {
  const { data, error } = useLoad(async () => ({ campuses: await loadCampuses(), courses: await loadCourses() }));
  if (!data) return <Loading error={error} />;
  return (
    <>
      <PageHead title={t('nav.campuses')} />
      <div className="cards">
        {data.campuses.map((c) => {
          const cs = data.courses.filter((x) => x.campus_id === c.id);
          return c.status === 'open' ? (
            <Link key={c.id} className="card" data-tone={toneOf(c.id)} to={`/campuses/${c.id}`}>
              <div className="card-title"><strong>{c.name}</strong><span className="muted" style={{ fontSize: 12 }}>코스 {cs.length}</span></div>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{c.tagline}</span>
              <span style={{ fontSize: 13, lineHeight: 1.7 }}>{cs.map(courseLabel).join(' · ')}</span>
            </Link>
          ) : (
            <div key={c.id} className="card off" data-tone={toneOf(c.id)}>
              <div className="card-title"><strong>{c.name}</strong><span className="chip">{t('common.preparing')}</span></div>
              <span style={{ fontSize: 13 }}>추천과 견적에는 쓰지 않습니다.</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
