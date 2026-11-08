import { useEffect, useState } from 'react';
import { loadCampuses, loadContents, loadCourses, useLoad, type Campus, type Course, type CourseContent, type Level } from '../../data';
import { errText, supabase } from '../../supabase';
import { Box, Loading, Msg } from '../../ui';

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
const LEVEL_FIELDS: [keyof Level, string][] = [['lessons', '하루 수업 수'], ['intensity', '수업 강도'], ['budget', '예산 수준'], ['includes', '포함 내용']];

// 12.3 콘텐츠 관리: 캠퍼스 소개, 코스 상세, 추천 이유, 단계 비교. 확인된 내용만 넣는다(원칙 C8).
export default function AdminContent() {
  const { data, error, reload } = useLoad(async () => ({ campuses: await loadCampuses(), courses: await loadCourses(), contents: await loadContents() }));
  const [target, setTarget] = useState('campus:premium');
  const [campus, setCampus] = useState<Partial<Campus>>({});
  const [course, setCourse] = useState<{ levels: Level[]; status: Course['status'] }>({ levels: [], status: 'open' });
  const [content, setContent] = useState<Partial<CourseContent>>({});
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [kind, id] = target.split(':');

  useEffect(() => {
    if (!data) return;
    setMsg(null);
    if (kind === 'campus') setCampus(data.campuses.find((c) => c.id === id) ?? {});
    else {
      const c = data.courses.find((x) => x.id === id);
      setCourse({ levels: c?.levels ?? [], status: c?.status ?? 'open' });
      setContent(data.contents.find((x) => x.course_id === id) ?? { course_id: id });
    }
  }, [target, data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <Loading error={error} />;

  const save = async () => {
    const now = new Date().toISOString();
    const results =
      kind === 'campus'
        ? [await supabase.from('campuses').update({ ...Object.fromEntries(CAMPUS_FIELDS.map(([k]) => [k, campus[k] || null])), status: campus.status, updated_at: now }).eq('id', id)]
        : [
            await supabase.from('courses').update({ levels: course.levels, status: course.status, updated_at: now }).eq('id', id),
            await supabase.from('course_contents').upsert({ course_id: id, ...Object.fromEntries(COURSE_FIELDS.map(([k]) => [k, content[k] || null])), updated_at: now }),
          ];
    const failed = results.find((r) => r.error);
    setMsg(failed ? { kind: 'err', text: errText(failed.error) } : { kind: 'ok', text: '저장했습니다. 같은 내용이 포털의 모든 화면에 반영됩니다.' });
    reload();
  };

  return (
    <div className="row">
      <Box title="고칠 곳" className="grow-1">
        <div className="box-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {data.campuses.map((c) => (
            <div key={c.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              <button type="button" className={'btn' + (target === `campus:${c.id}` ? ' btn-primary' : '')} style={{ justifyContent: 'flex-start' }} onClick={() => setTarget(`campus:${c.id}`)}>
                {c.name} 캠퍼스 소개
              </button>
              {data.courses.filter((x) => x.campus_id === c.id).map((x) => (
                <button key={x.id} type="button" className={'btn btn-sm' + (target === `course:${x.id}` ? ' btn-primary' : '')} style={{ justifyContent: 'flex-start', marginLeft: 14 }} onClick={() => setTarget(`course:${x.id}`)}>
                  {x.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      </Box>
      <Box
        title={kind === 'campus' ? `${data.campuses.find((c) => c.id === id)?.name} 캠퍼스` : data.courses.find((c) => c.id === id)?.name}
        className="grow-3"
        foot={<><span />{<button type="button" className="btn btn-primary btn-lg" onClick={save}>저장</button>}</>}
      >
        <div className="box-body form">
          {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
          {kind === 'campus' ? (
            <>
              <label>
                상태
                <select value={campus.status ?? 'open'} onChange={(e) => setCampus({ ...campus, status: e.target.value as Campus['status'] })}>
                  <option value="open">운영</option>
                  <option value="preparing">준비 중</option>
                </select>
              </label>
              {CAMPUS_FIELDS.map(([k, label]) => (
                <label key={k}>{label}<textarea value={(campus[k] as string) ?? ''} onChange={(e) => setCampus({ ...campus, [k]: e.target.value })} /></label>
              ))}
            </>
          ) : (
            <>
              <label>
                상태
                <select value={course.status} onChange={(e) => setCourse({ ...course, status: e.target.value as Course['status'] })}>
                  <option value="open">운영</option>
                  <option value="preparing">준비 중</option>
                </select>
              </label>
              {COURSE_FIELDS.map(([k, label, hint]) => (
                <label key={k}>
                  {label}
                  <textarea value={(content[k] as string) ?? ''} onChange={(e) => setContent({ ...content, [k]: e.target.value })} />
                  {hint && <span className="hint">{hint}</span>}
                </label>
              ))}
              {course.levels.length > 0 && (
                <div className="field">
                  단계 비교
                  <div className="scroll">
                    <table className="tbl center">
                      <thead><tr><th>단계</th>{LEVEL_FIELDS.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
                      <tbody>
                        {course.levels.map((lv, i) => (
                          <tr key={lv.name}>
                            <td className="strong">{lv.name}</td>
                            {LEVEL_FIELDS.map(([k]) => (
                              <td key={k}>
                                <input
                                  className="input"
                                  style={{ height: 30 }}
                                  aria-label={`${lv.name} ${k}`}
                                  value={lv[k] ?? ''}
                                  onChange={(e) => setCourse({ ...course, levels: course.levels.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)) })}
                                />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </Box>
    </div>
  );
}
