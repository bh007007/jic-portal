import { Link, useParams } from 'react-router-dom';
import { courseLabel, loadCampuses, loadContents, loadCourses, useLoad } from '../data';
import { t } from '../i18n';
import { Box, Loading, PageHead, Text } from '../ui';
import { useCampusTone } from '../tone';
import { PhotoGrid, str, usePhotos } from '../content';
import { placementLabel } from '../contentKinds';
import { CAMP_PATH } from '../campusCards';

// 캠퍼스 화면의 사진 묶음(사진 보관함 화면 위치, CL-047)
const GALLERY = ['campus_gallery', 'academic', 'dorm', 'meals', 'map'];

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
  const photos = usePhotos(['campus_hero', ...GALLERY], id);
  // 캠퍼스 화면은 그 캠퍼스 사진만(공통 사진은 빼고)
  const mine = photos.filter((p) => p.it.campus === id);
  const hero = mine.filter((p) => str(p.it, 'placement') === 'campus_hero');
  if (!data) return <Loading error={error} />;
  // New Campus 는 캠퍼스 목록에서 빠졌다(CL-077): 운영 중 캠퍼스만 연다
  const open = data.campuses.filter((c) => c.status === 'open');
  const campus = open.find((c) => c.id === id);
  if (!campus) return <Loading error="캠퍼스를 찾을 수 없습니다." />;
  const courses = data.courses.filter((c) => c.campus_id === id);

  return (
    <>
      <PageHead
        title={campus.name}
        side={
          <nav aria-label="캠퍼스 전환" style={{ display: 'flex', gap: 6 }}>
            {open.map((c) => (
              <Link key={c.id} className={'btn btn-sm' + (c.id === id ? ' btn-primary' : '')} to={`/campuses/${c.id}`}>{c.name}</Link>
            ))}
            <Link className="btn btn-sm" to={CAMP_PATH}>캠프</Link>
          </nav>
        }
      />
      {hero.length > 0 && <PhotoGrid photos={hero} max={3} ratio="16 / 7" className="hero-photos" />}
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
          {GALLERY.some((g) => mine.some((p) => str(p.it, 'placement') === g)) && (
            <Box title="사진">
              <div className="box-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {GALLERY.map((g) => {
                  const ps = mine.filter((p) => str(p.it, 'placement') === g);
                  return ps.length ? (
                    <div key={g}>
                      <h3 style={{ margin: '0 0 8px', fontSize: 15 }}>{placementLabel(g)}</h3>
                      <PhotoGrid photos={ps} max={8} />
                    </div>
                  ) : null;
                })}
              </div>
            </Box>
          )}
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
