import { useEffect, useState } from 'react';
import type { Campus, Course, CourseContent, Level } from '../../../../partner/src/data';
import { courseLabel } from '../../../../partner/src/shared';
import { Loading, Panel } from '../../components/ui';
import { db, errText, must, Status, useLoad, type Note } from './common';

const CAMPUS_FIELDS: [keyof Campus, string][] = [
  ['tagline', '한 줄 소개'],
  ['direction', '교육 방향'],
  ['environment', '학습 환경'],
  ['facilities', '시설 · 기숙사 · 식사'],
  ['activities', '부가 수업 · 활동'],
  ['life', '바기오 생활'],
];
const COURSE_FIELDS: [keyof CourseContent, string, string?][] = [
  ['summary', '한 줄 소개'],
  ['target', '추천 대상'],
  ['structure', '수업 구성 · 시간표 · 교재'],
  ['outcomes', '학습 결과물 · 실제 사례', '확인된 학생 사례만'],
  ['media_links', '사진 · 영상 링크', '한 줄에 하나 (유튜브 일부 공개, 드라이브)'],
  ['reason_learning', '추천 이유: Learning (수업 방식)'],
  ['reason_growth', '추천 이유: Growth (성장 확인)', '리포트 샘플과 확인된 사례만'],
  ['reason_environment', '추천 이유: Environment (학습 환경)'],
];
// 단계·옵션(조건표 v2.1 '단계 구분'): 가격은 견적 사이트 값이라 넣지 않는다(CL-020). '기본'은 단계 선택 화면에서 먼저 골라 둘 옵션(Challenger 옵션만, CL-007)
const LEVEL_FIELDS: ['lessons' | 'intensity' | 'includes', string][] = [['lessons', '수업량'], ['intensity', '수업 강도'], ['includes', '포함 내용']];

/** 캠퍼스·코스 내용(에이전시 포털 12.3): 캠퍼스 소개, 코스 상세, 추천 이유, 단계 비교. 확인된 내용만 넣는다(원칙 C8). 11/10 에이전시 포털에서 옮겼다 */
export default function Content() {
  const { data, error, reload } = useLoad(async () => ({
    campuses: await must<Campus[]>(db().from('campuses').select('*').order('sort')),
    courses: await must<Course[]>(db().from('courses').select('*').order('campus_id').order('sort')),
    contents: await must<CourseContent[]>(db().from('course_contents').select('*')),
  }));
  const [target, setTarget] = useState('campus:premium');
  const [campus, setCampus] = useState<Partial<Campus>>({});
  const [course, setCourse] = useState<{ levels: Level[]; status: Course['status']; display_name: string }>({ levels: [], status: 'open', display_name: '' });
  const [content, setContent] = useState<Partial<CourseContent>>({});
  const [msg, setMsg] = useState<Note>(null);
  const [kind, id] = target.split(':');

  // 고칠 곳을 바꿀 때만 안내를 지운다(저장 뒤 다시 읽어도 '저장했습니다'·오류가 남게)
  useEffect(() => setMsg(null), [target]);
  useEffect(() => {
    if (!data) return;
    if (kind === 'campus') setCampus(data.campuses.find((c) => c.id === id) ?? {});
    else {
      const c = data.courses.find((x) => x.id === id);
      setCourse({ levels: c?.levels ?? [], status: c?.status ?? 'open', display_name: c?.display_name ?? '' });
      setContent(data.contents.find((x) => x.course_id === id) ?? { course_id: id });
    }
  }, [target, data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <Loading error={error} />;
  const courseName = data.courses.find((c) => c.id === id)?.name;

  const save = async () => {
    const now = new Date().toISOString();
    const results =
      kind === 'campus'
        ? [await db().from('campuses').update({ ...Object.fromEntries(CAMPUS_FIELDS.map(([k]) => [k, campus[k] || null])), status: campus.status, updated_at: now }).eq('id', id)]
        : [
            await db().from('courses').update({ levels: course.levels, status: course.status, display_name: course.display_name.trim() || null, updated_at: now }).eq('id', id),
            await db().from('course_contents').upsert({ course_id: id, ...Object.fromEntries(COURSE_FIELDS.map(([k]) => [k, content[k] || null])), updated_at: now }),
          ];
    const failed = results.find((r) => r.error);
    setMsg(failed ? { ok: false, text: errText(failed.error) } : { ok: true, text: '저장했습니다. 같은 내용이 에이전시 포털의 모든 화면에 반영됩니다.' });
    reload();
  };

  return (
    <div className="row">
      <Panel title="고칠 곳" className="side-list">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.campuses.map((c) => (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              <button type="button" className={'btn' + (target === `campus:${c.id}` ? ' btn-primary' : '')} style={{ justifyContent: 'flex-start' }} onClick={() => setTarget(`campus:${c.id}`)}>
                {c.name} 캠퍼스 소개
              </button>
              {data.courses.filter((x) => x.campus_id === c.id).map((x) => (
                <button key={x.id} type="button" className={'btn btn-xs' + (target === `course:${x.id}` ? ' btn-primary' : '')} style={{ justifyContent: 'flex-start', marginLeft: 14 }} onClick={() => setTarget(`course:${x.id}`)}>
                  {courseLabel(x)}
                </button>
              ))}
            </div>
          ))}
        </div>
      </Panel>
      <Panel title={kind === 'campus' ? `${data.campuses.find((c) => c.id === id)?.name ?? ''} 캠퍼스` : courseName ?? ''} className="grow-2">
        <div className="edit">
          <Status msg={msg} />
          <table className="kv">
            <tbody>
              {kind === 'campus' ? (
                <>
                  <tr>
                    <th><label htmlFor="c-status">상태</label></th>
                    <td>
                      <select id="c-status" value={campus.status ?? 'open'} onChange={(e) => setCampus({ ...campus, status: e.target.value as Campus['status'] })}>
                        <option value="open">운영</option>
                        <option value="preparing">준비 중</option>
                      </select>
                    </td>
                  </tr>
                  {CAMPUS_FIELDS.map(([k, label]) => (
                    <tr key={k}>
                      <th><label htmlFor={`c-${k}`}>{label}</label></th>
                      <td><textarea id={`c-${k}`} value={(campus[k] as string) ?? ''} onChange={(e) => setCampus({ ...campus, [k]: e.target.value })} /></td>
                    </tr>
                  ))}
                </>
              ) : (
                <>
                  <tr>
                    <th><label htmlFor="k-status">상태</label></th>
                    <td>
                      <select id="k-status" value={course.status} onChange={(e) => setCourse({ ...course, status: e.target.value as Course['status'] })}>
                        <option value="open">운영</option>
                        <option value="preparing">준비 중</option>
                      </select>
                    </td>
                  </tr>
                  <tr>
                    <th><label htmlFor="k-display">화면 표시 이름</label></th>
                    <td>
                      <input id="k-display" value={course.display_name} maxLength={40} onChange={(e) => setCourse({ ...course, display_name: e.target.value })} placeholder={courseName} style={{ width: 260 }} />
                      <span className="hint">상담·코스 소개 화면에 보이는 이름. 견적·DB 에는 코스명({courseName})을 그대로 쓴다(예: Senior → 1:1 맞춤 과정)</span>
                    </td>
                  </tr>
                  {COURSE_FIELDS.map(([k, label, hint]) => (
                    <tr key={k}>
                      <th><label htmlFor={`k-${k}`}>{label}</label></th>
                      <td>
                        <textarea id={`k-${k}`} value={(content[k] as string) ?? ''} onChange={(e) => setContent({ ...content, [k]: e.target.value })} />
                        {hint && <span className="hint">{hint}</span>}
                      </td>
                    </tr>
                  ))}
                  {course.levels.length > 0 && (
                    <tr>
                      <th>단계 · 옵션</th>
                      <td>
                        <table className="tbl center">
                          <thead><tr><th>단계</th>{LEVEL_FIELDS.map(([, l]) => <th key={l}>{l}</th>)}<th>기본</th></tr></thead>
                          <tbody>
                            {course.levels.map((lv, i) => (
                              <tr key={lv.name}>
                                <td className="strong nowrap">{lv.name}</td>
                                {LEVEL_FIELDS.map(([k, l]) => (
                                  <td key={k}>
                                    <input
                                      style={{ width: '100%' }}
                                      aria-label={`${lv.name} ${l}`}
                                      value={lv[k] ?? ''}
                                      onChange={(e) => setCourse({ ...course, levels: course.levels.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })}
                                    />
                                  </td>
                                ))}
                                <td>
                                  <input
                                    type="checkbox"
                                    aria-label={`${lv.name} 기본`}
                                    checked={!!lv.default}
                                    onChange={(e) => setCourse({ ...course, levels: course.levels.map((x, j) => ({ ...x, default: j === i ? e.target.checked : e.target.checked ? false : x.default })) })}
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
          <div className="form-actions">
            <span />
            <button type="button" className="btn btn-primary btn-lg" onClick={save}>저장</button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
