import { Link, useParams } from 'react-router-dom';
import { courseLabel, loadCampuses, loadContents, loadCourses, useLoad } from '../data';
import { t } from '../i18n';
import { Box, Loading, PageHead, Text } from '../ui';
import { useCampusTone } from '../tone';

const SECTIONS: [keyof import('../data').Campus, string][] = [
  ['direction', '교육 방향'],
  ['environment', '학습 환경'],
  ['facilities', '시설 · 기숙사 · 식사'],
  ['activities', '부가 수업 · 활동'],
  ['life', '바기오 생활'],
];

// 3.2 / 3.5 / 3.7 캠퍼스 소개 + 3.3 / 3.6 코스 목록
export default function CampusPage() {
  const { id = '' } = useParams();
  useCampusTone(id);
  const { data, error } = useLoad(async () => ({ campuses: await loadCampuses(), courses: await loadCourses(), contents: await loadContents() }), [id]);
  if (!data) return <Loading error={error} />;
  const campus = data.campuses.find((c) => c.id === id);
  if (!campus) return <Loading error="캠퍼스를 찾을 수 없습니다." />;
  const courses = data.courses.filter((c) => c.campus_id === id);

  return (
    <>
      <PageHead
        title={campus.name}
        side={
          <nav aria-label="캠퍼스 전환" style={{ display: 'flex', gap: 6 }}>
            {data.campuses.map((c) => (
              <Link key={c.id} className={'btn btn-sm' + (c.id === id ? ' btn-primary' : '')} to={`/campuses/${c.id}`}>{c.name}</Link>
            ))}
          </nav>
        }
      />
      {campus.status === 'preparing' ? (
        <div className="state">{t('common.preparing')}입니다. 내용이 확정되면 입력합니다. 추천과 견적에는 쓰지 않습니다.</div>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 15, color: 'var(--ink-2)' }}>{campus.tagline}</p>
          <Box title={`코스 (${courses.length})`}>
            <div className="box-body">
              <div className="cards">
                {courses.map((c) => {
                  const ct = data.contents.find((x) => x.course_id === c.id);
                  return (
                    <Link key={c.id} className="card" to={`/courses/${c.id}`}>
                      <div className="card-title"><strong>{courseLabel(c)}</strong>{c.levels.length > 1 && <span className="muted" style={{ fontSize: 12 }}>{c.levels.map((l) => l.name).join(' · ')}</span>}</div>
                      <span style={{ fontSize: 13 }}><Text value={ct?.summary} /></span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </Box>
          <Box title="캠퍼스 소개">
            <div className="box-body">
              <table className="kv">
                <tbody>
                  {SECTIONS.map(([k, label]) => (
                    <tr key={k}><th>{label}</th><td><Text value={campus[k] as string | null} /></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Box>
        </>
      )}
    </>
  );
}
