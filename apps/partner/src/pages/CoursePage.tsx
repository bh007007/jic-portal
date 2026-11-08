import { Link, useParams } from 'react-router-dom';
import { loadCampuses, loadContents, loadCourses, useLoad } from '../data';
import { Box, Loading, PageHead, Text } from '../ui';

// 3.8 코스 상세 (공통 템플릿): 소개·추천 대상 → 단계 비교 → 수업 구성 → 결과물·사례 → 사진·영상 → 견적
export default function CoursePage() {
  const { id = '' } = useParams();
  const { data, error } = useLoad(async () => ({ campuses: await loadCampuses(), courses: await loadCourses(), contents: await loadContents() }), [id]);
  if (!data) return <Loading error={error} />;
  const course = data.courses.find((c) => c.id === id);
  if (!course) return <Loading error="코스를 찾을 수 없습니다." />;
  const campus = data.campuses.find((c) => c.id === course.campus_id);
  const ct = data.contents.find((c) => c.course_id === id);
  const media = (ct?.media_links ?? '').split('\n').map((s) => s.trim()).filter(Boolean);

  return (
    <>
      <PageHead
        title={course.name}
        side={<><Link to={`/campuses/${course.campus_id}`}>{campus?.name}</Link><Link className="btn" to="/quote">견적 바로가기</Link></>}
      />
      <Box>
        <div className="box-body">
          <table className="kv">
            <tbody>
              <tr><th>한 줄 소개</th><td><Text value={ct?.summary} /></td></tr>
              <tr><th>추천 대상</th><td><Text value={ct?.target} /></td></tr>
            </tbody>
          </table>
        </div>
      </Box>
      {course.levels.length > 0 && (
        <Box title="단계 비교">
          <div className="box-body scroll">
            <table className="tbl center">
              <thead><tr><th>단계</th><th>하루 수업 수</th><th>수업 강도</th><th>예산 수준</th><th className="left">포함 내용</th></tr></thead>
              <tbody>
                {course.levels.map((l) => (
                  <tr key={l.name}>
                    <td className="strong">{l.name}</td>
                    <td><Text value={l.lessons} /></td>
                    <td><Text value={l.intensity} /></td>
                    <td><Text value={l.budget} /></td>
                    <td className="left"><Text value={l.includes} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>실제 금액은 견적에서 확인합니다.</p>
          </div>
        </Box>
      )}
      <Box title="수업 구성 · 시간표 · 교재"><div className="box-body"><Text value={ct?.structure} /></div></Box>
      <Box title="학습 결과물 · 실제 사례"><div className="box-body"><Text value={ct?.outcomes} /></div></Box>
      <Box title="사진 · 영상">
        <div className="box-body">
          {media.length === 0 ? <Text value={null} /> : (
            <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
              {media.map((m) => <li key={m}><a href={m} target="_blank" rel="noreferrer">{m}</a></li>)}
            </ul>
          )}
        </div>
      </Box>
    </>
  );
}
