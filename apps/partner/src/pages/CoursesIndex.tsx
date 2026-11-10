import { Link } from 'react-router-dom';
import { courseLabel, loadCampuses, loadContents, loadCourses, useLoad } from '../data';
import { t } from '../i18n';
import { Box, Loading, PageHead, Text } from '../ui';

// 코스·생활 > 코스 안내(CL-037): 캠퍼스별 코스 목록과 한 줄 소개. 상세는 코스 공통 템플릿(/courses/:id).
// 주니어·가족 캠프는 상담 추천·캠퍼스 카드에서 빼고 따로 보인다(CL-039, '주니어·가족 캠프' 메뉴).
export default function CoursesIndex() {
  const { data, error } = useLoad(async () => ({ campuses: await loadCampuses(), courses: await loadCourses(), contents: await loadContents() }));
  if (!data) return <Loading error={error} />;
  const summary = new Map(data.contents.map((c) => [c.course_id, c.summary]));
  return (
    <>
      <PageHead title={t('menu.courses')} />
      {data.campuses.map((c) => {
        const cs = data.courses.filter((x) => x.campus_id === c.id);
        return (
          <Box key={c.id} title={<>{c.name}{c.status !== 'open' && <> <span className="chip">{t('common.preparing')}</span></>}</>} extra={c.status === 'open' ? <Link className="more" to={`/campuses/${c.id}`}>캠퍼스 소개 ›</Link> : undefined}>
            {cs.length === 0 ? (
              <p className="empty">{t('common.preparing')}</p>
            ) : (
              <ul className="list">
                {cs.map((x) => (
                  <li key={x.id}>
                    <Link className="title" to={`/courses/${x.id}`}>{courseLabel(x)}</Link>
                    <span className="muted" style={{ fontSize: 13 }}><Text value={summary.get(x.id)} /></span>
                    {x.status !== 'open' && <span className="chip">{t('common.preparing')}</span>}
                  </li>
                ))}
              </ul>
            )}
          </Box>
        );
      })}
    </>
  );
}
