import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';
import { courseLabel, loadCampuses, loadContents, loadCourses, loadRuleSet, loadSettings, useLoad, type Course } from '../data';
import { CURRENCIES, t } from '../i18n';
import { supabase } from '../supabase';
import { useCampusTone } from '../tone';
import { CUR_LABEL, curOf, TuitionTables, type Cur, type TuitionRow } from '../tuition';
import { Box, Loading, Msg, OutLink, Text } from '../ui';
import { answerLabel, estimateLevel, isScoreModel, recommend, type Answers } from './engine';
import { quotePageFor, quoteParams, quoteUrl } from './quoteLink';
import { CourseSheet, Sheet } from './Sheet';
import { DayTimeline, PhotoGrid, VideoCard, YouTube, byTime, dayMatches, loadItems, str, textOf, usePhotos } from '../content';
import type { ContentItem } from '../contentKinds';
import StudyPlan from './StudyPlan';
import EvidenceSheet from './Evidence';
import { pickReasons, type CourseReason, type PickedReason } from './reasons';

// 상담 모드 ①~⑥(CL-049, 화면 명세 2장)
const STEPS = ['질문', '추천', '생활', '단계', '비용', '마무리'];
const MARK = ['①', '②', '③', '④', '⑤', '⑥'];

/**
 * 상담 모드(CL-049): 학생과 같은 화면을 보며 상담한다. 사이드바 없이 위의 단계 막대로 ①질문 ②추천 ③생활 ④단계 ⑤비용 ⑥마무리를 오가고
 * '상담 끝내기'로 에이전트 모드 홈에 돌아간다. 학생이 봐도 되는 것만 있다(My Students·플레이북·공지·방문 신청·내 계정·커미션 없음).
 * 답변·결과·견적은 이 화면의 메모리에만 있고 저장하지 않는다(원칙 P3). '상담 끝내기'에서 지운다. 학습계획서를 내려받을 때 지점별 다운로드 수만 1 올린다.
 * 질문·선택지·조건(◎○×)·단계는 DB(recommendation_rules·courses.levels)에서 읽는다(R-001). 계산은 engine.ts(CL-021).
 */
export default function Consult() {
  const { member, agencyStaff } = useAuth();
  const navigate = useNavigate();
  const { data, error } = useLoad(async () => {
    const [set, courses, contents, campuses, settings, tuition, life, reasons] = await Promise.all([
      loadRuleSet(), loadCourses(), loadContents(), loadCampuses(), loadSettings(),
      // 학비표(CL-038). 대표 아이디·JIC 직원만 줄이 온다(직원 아이디·샘플 가격표면 0줄). 직원 아이디는 계속 대표만(CL-043, 11/12 레오님 결정)
      supabase.rpc('partner_tuition').then((r) => (r.error ? [] : ((r.data ?? []) as TuitionRow[]))),
      // ③ 생활 자료(학생의 하루·액티비티·JIC Play, CL-045). 못 읽어도 상담은 계속한다
      // ② 추천 이유의 증거(사진·근거 자료)도 같이
      loadItems(['day', 'activity', 'video', 'photo', 'evidence']).catch(() => [] as ContentItem[]),
      // ② 추천 이유 3칸(CL-050). 게시된 것만(정책도 같음), 못 읽으면 예전 코스별 글
      supabase.from('course_reasons').select('*').eq('status', 'published').then((r) => (r.error ? [] : ((r.data ?? []) as CourseReason[]))),
    ]);
    return { set, courses, contents, campuses, settings, tuition, life, reasons };
  });
  const [step, setStep] = useState(0);
  const [q, setQ] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [checks, setChecks] = useState<(number | undefined)[]>([]); // 레벨 간단 확인 세 문항(0~2점)
  const [chosen, setChosen] = useState<string | null>(null); // 1순위 대신 대안을 고르면 대안 코스 id
  const [level, setLevel] = useState<string | null>(null);
  const [quote, setQuote] = useState({ currency: member?.currency ?? 'KRW', amount: '', memo: '' });
  const [cur, setCur] = useState<Cur>(curOf(member?.country));
  const [sheet, setSheet] = useState<string | null>(null); // 크게 여는 코스 상세
  const [planDone, setPlanDone] = useState(false);
  const [video, setVideo] = useState<ContentItem | null>(null); // ③에서 같은 화면 위로 재생하는 영상
  const [proof, setProof] = useState<PickedReason | null>(null); // ② 추천 이유의 '증거 보기'

  const set = data?.set ?? null;
  const model = set && isScoreModel(set.rules) ? set.rules : null;
  const lc = model?.level_check;
  const unknownLevel = !!lc && answers[lc.question] === lc.unknown;
  const estimated = lc && unknownLevel ? estimateLevel(lc, checks) : null;
  const allAnswered = !!set && set.questions.every((qq) => answers[qq.id]) && (!unknownLevel || !!estimated);
  const rec = data && set && allAnswered ? recommend(set, answers, data.courses, checks) : null;
  const course: Course | null = rec ? (chosen && rec.alt?.id === chosen ? rec.alt : rec.first) : null;
  // 추천 캠퍼스가 정해지면 그 캠퍼스 색(디자인 원칙 D2)
  useCampusTone(step > 0 ? course?.campus_id : null);
  // ③ 생활 사진(사진 보관함 '상담 ③'·'기숙사'·'식사', 추천 캠퍼스 + 공통, CL-047)
  const lifePhotos = usePhotos(['consult', 'dorm', 'meals'], course?.campus_id ?? null);

  if (!data) return <Loading error={error} />;
  const { courses, contents, campuses, settings, tuition, life, reasons } = data;
  if (!set) return <Loading error="추천 조건표가 아직 등록되지 않았습니다. JIC 관리자에게 문의하세요." />;

  const campus = campuses.find((c) => c.id === course?.campus_id);
  const content = contents.find((c) => c.course_id === course?.id);
  const levels = course?.levels ?? [];
  // 단계가 하나뿐인 코스(IELTS Guarantee 스파르타)는 단계 선택을 건너뛴다(CL-006)
  const hasLevels = levels.length > 1;
  const fallbackLevel = levels.find((l) => l.default)?.name ?? (levels.length === 1 ? levels[0].name : null);
  const pickedLevel = level ?? (course?.id === rec?.first.id ? rec?.defaultLevel ?? null : fallbackLevel);
  const col = model?.courses.find((c) => c.course === course?.id);
  const compare = col?.compare ? courses.find((c) => c.id === col.compare) : undefined;
  const weeksLabel = (w?: string) => (w ? answerLabel(set, 'weeks', w) : '-');
  // 견적에 넣을 코스·단계: 단계 이름에 코스명이 이미 있으면(TEP 8, Senior 4) 겹치지 않게
  const quoteCourse = course ? (pickedLevel && levels.length ? (pickedLevel.startsWith(course.name) ? pickedLevel : `${course.name} ${pickedLevel}`) : course.name) : '';
  const agency = member ? [member.agency_name, member.branch].filter(Boolean).join(' ') : null;
  // 견적 사이트에 넘길 값(docs/quote-prefill.md): 캠퍼스·코스(견적 프로그램 이름)·희망 기간·에이전시. 학생 정보는 넘기지 않는다(P3).
  const quoteQuery = quoteParams({ campusId: course?.campus_id, courseId: course?.id, level: pickedLevel, weeks: answers.weeks, agency });
  // CL-044: 단계마다 '이 단계로 견적 보기' — 지점 국가의 견적 화면(KR·JP·USD·USD-New)
  const myQuotePage = settings[quotePageFor(member?.country)];
  const levelQuote = (name: string) => quoteUrl(myQuotePage, quoteParams({ campusId: course?.campus_id, courseId: course?.id, level: name, weeks: answers.weeks, agency }));
  const levelAnswer = (qid: string) =>
    lc && qid === lc.question && unknownLevel ? `잘 모름 → 추정 ${estimated ? answerLabel(set, qid, estimated) : '(확인 중)'}` : answerLabel(set, qid, answers[qid]);

  const reset = () => {
    setStep(0); setQ(0); setAnswers({}); setChecks([]); setChosen(null); setLevel(null); setSheet(null); setVideo(null); setProof(null); setPlanDone(false);
    setQuote({ currency: member?.currency ?? 'KRW', amount: '', memo: '' });
  };
  const canGo = (n: number) => n === 0 || (!!rec && !!course && (n !== 3 || hasLevels));
  const go = (n: number) => {
    if (n === 3 && !hasLevels) n = step < 3 ? 4 : 2; // 단계 고를 것이 없는 코스는 ④ 단계를 건너뛴다
    setStep(n);
    window.scrollTo(0, 0);
  };
  // 상담 끝내기: 답과 결과를 지우고 에이전트 모드 홈으로(명세 1장, 끝내기 전 학습계획서 확인)
  const endConsult = () => {
    if (rec && !planDone && !window.confirm('학습계획서를 받으셨나요?\n상담을 끝내면 이 상담의 답과 결과가 지워집니다(저장하지 않음).')) return;
    reset();
    navigate('/');
  };
  const answer = (qid: string, v: string) => {
    setAnswers((a) => ({ ...a, [qid]: v }));
    setChosen(null);
    setLevel(null);
    if (lc && qid === lc.question && v === lc.unknown) return; // 레벨 간단 확인을 먼저 한다
    if (q < set.questions.length - 1) setQ(q + 1);
  };
  const check = (i: number, score: number) => {
    const next = [...checks];
    next[i] = score;
    setChecks(next);
    setChosen(null);
    setLevel(null);
    if (lc && estimateLevel(lc, next) && q < set.questions.length - 1 && next.filter((x) => x != null).length === lc.items.length && checks[i] == null) setQ(q + 1);
  };
  const cur0 = set.questions[q];
  const sheetCourse = sheet ? courses.find((c) => c.id === sheet) : undefined;
  const tuitionHere = campus ? tuition.filter((r) => r.section === 'etc' || r.campus.toLowerCase() === campus.name.toLowerCase()) : [];
  const nav = (back: number | null, next: number | null, nextLabel?: string) => (
    <>
      {back != null ? <button type="button" className="btn btn-lg" onClick={() => go(back)}>‹ {MARK[back]} {STEPS[back]}</button> : <span />}
      {next != null && <button type="button" className="btn btn-primary btn-lg" onClick={() => go(next)}>{nextLabel ?? `${MARK[next]} ${STEPS[next]} ›`}</button>}
    </>
  );

  return (
    <>
      <header className="consult-head">
        <div className="consult-bar">
          <span className="consult-brand"><span className="logo">JIC</span> 상담</span>
          <span className="badge live">상담 중</span>
          <span className="muted" style={{ fontSize: 13 }}>{t('common.notSaved')}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={reset}>처음부터</button>
            <button type="button" className="btn btn-sm btn-primary" onClick={endConsult}>상담 끝내기</button>
          </span>
        </div>
        <ol className="steps" aria-label="상담 단계">
          {STEPS.map((label, i) => (
            <li key={label} className={(i < step ? 'done' : i === step ? 'now' : '') + (canGo(i) ? '' : ' off')} aria-current={i === step ? 'step' : undefined}>
              <button type="button" className="step-btn" disabled={!canGo(i)} onClick={() => go(i)}>
                <span className="dot">{i < step ? '✓' : i + 1}</span>
                <span className="label">{label}</span>
              </button>
              <span className="bar" aria-hidden="true" />
            </li>
          ))}
        </ol>
      </header>

      {set.status !== 'approved' && (
        <Msg kind="warn">추천 조건표 승인 전입니다. 지금 추천은 샘플 규칙({set.version})으로 나옵니다. 실제 상담에는 승인본이 들어온 뒤 쓰세요.</Msg>
      )}

      {/* ① 질문 */}
      {step === 0 && (
        <Box
          title={`Q${q + 1}. ${cur0.label}`}
          extra={<span className="muted" style={{ fontSize: 13 }}>{q + 1} / {set.questions.length}</span>}
          foot={
            <>
              <button type="button" className="btn btn-lg" disabled={q === 0} onClick={() => setQ(q - 1)}>‹ 이전 질문</button>
              <button type="button" className="btn btn-primary btn-lg" disabled={!allAnswered} onClick={() => go(1)}>② 추천 보기 ›</button>
            </>
          }
        >
          <div className="box-body">
            {model?.intro && q === 0 && <p className="muted" style={{ margin: '0 0 14px', fontSize: 14 }}>{model.intro}</p>}
            <div className="options" role="group" aria-label={cur0.label}>
              {cur0.options.map(([v, label]) => (
                <button key={v} type="button" className="option" aria-pressed={answers[cur0.id] === v} onClick={() => answer(cur0.id, v)}>
                  {label}
                </button>
              ))}
            </div>
            {lc && cur0.id === lc.question && unknownLevel && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line-2)' }}>
                <strong style={{ fontSize: 14 }}>레벨 간단 확인</strong>
                {lc.items.map((it, i) => (
                  <div key={it.label} style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 14, marginBottom: 6 }}>{['①', '②', '③', '④', '⑤'][i] ?? i + 1} {it.label}</div>
                    <div className="options" role="group" aria-label={it.label}>
                      {it.options.map((o, s) => (
                        <button key={o} type="button" className="option" aria-pressed={checks[i] === s} onClick={() => check(i, s)}>{o}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <p style={{ margin: '14px 0 0', fontSize: 14 }}>
                  추정 레벨 <strong>{estimated ? answerLabel(set, lc.question, estimated) : '-'}</strong>
                  <span className="muted"> · {lc.note}</span>
                </p>
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
              {set.questions.map((qq, i) => (
                <button key={qq.id} type="button" className={'btn btn-sm' + (i === q ? ' btn-primary' : '')} onClick={() => setQ(i)}>
                  Q{i + 1} {answers[qq.id] ? levelAnswer(qq.id) : qq.short ?? qq.label}
                </button>
              ))}
            </div>
          </div>
        </Box>
      )}

      {step >= 1 && allAnswered && !rec && (
        <Box title="추천" foot={<button type="button" className="btn btn-lg" onClick={() => go(0)}>‹ 답 수정</button>}>
          <div className="box-body">
            <p style={{ margin: 0 }}>답한 조건에 모두 맞는 코스가 없습니다. 조건표에서 '추천하지 않음(×)'이 있는 코스는 빠집니다. 답을 다시 확인해 주세요.</p>
          </div>
        </Box>
      )}

      {step >= 1 && step <= 4 && rec && course && (
        <div className="row">
          <Box title="학생 답변" extra={<button type="button" className="btn btn-sm" onClick={() => go(0)}>답 수정</button>} className="grow-1">
            <dl style={{ margin: 0, padding: '6px 22px 14px' }}>
              {set.questions.map((qq, i) => (
                <div key={qq.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line-2)' }}>
                  <dt style={{ flex: '0 0 96px', fontSize: 13, color: 'var(--muted)' }}>Q{i + 1} {qq.short ?? qq.label}</dt>
                  <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{levelAnswer(qq.id)}</dd>
                </div>
              ))}
            </dl>
          </Box>

          {/* ② 추천: 1순위·대안 + 추천 이유 3칸(CL-050: 학습 목적·중요하게 생각하는 것·성장 근거, 증거는 같은 화면 위에) */}
          {step === 1 && (
            <div className="col grow-3">
              <Box title="추천" foot={nav(0, 2)}>
                <div className="box-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 14px' }}>
                    <span className="muted" style={{ fontSize: 13 }}>추천 캠퍼스</span>
                    <span style={{ fontSize: 22, fontWeight: 600 }}>{campuses.find((c) => c.id === rec.campus)?.name}</span>
                    <span style={{ color: 'var(--ink-2)' }}>{campuses.find((c) => c.id === rec.campus)?.tagline}</span>
                  </div>
                  <div className="reasons">
                    {[rec.first, rec.alt].filter(Boolean).map((c, i) => (
                      <div key={c!.id} className={'pick' + ((chosen ? chosen === c!.id : i === 0) ? ' first' : '')}>
                        <span className="badge">{i === 0 ? '1순위' : '대안'}</span>
                        <span className="name">{courseLabel(c!)}</span>
                        <span style={{ color: 'var(--ink-2)' }}>
                          {campuses.find((x) => x.id === c!.campus_id)?.name}{c!.levels.length > 1 ? ' · ' + c!.levels.map((l) => l.name).join(' · ') : ''}
                        </span>
                        {i === 1 && rec.altWhen && <span className="muted" style={{ fontSize: 13 }}>{rec.altWhen}</span>}
                        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                          <button type="button" className="btn btn-sm" onClick={() => setSheet(c!.id)}>코스 상세</button>
                          {i === 1 && <button type="button" className="btn btn-sm" onClick={() => { setChosen(chosen ? null : c!.id); setLevel(null); }}>{chosen ? '1순위로 진행' : '대안으로 진행'}</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                  <table className="kv">
                    <tbody>
                      <tr>
                        <th>권장 기간</th>
                        <td>
                          {rec.weeks ? <strong style={{ fontSize: 16 }}>{rec.weeks}주</strong> : '-'}
                          {rec.diff != null && rec.diff !== 0 && (
                            <span className="text-amber" style={{ marginLeft: 8 }}>희망 기간({weeksLabel(answers.weeks)})과 {Math.abs(rec.diff)}주 차이</span>
                          )}
                        </td>
                      </tr>
                      {hasLevels && <tr><th>단계</th><td>{pickedLevel ? `④ 단계에서 선택 (기본: ${pickedLevel})` : '④ 단계에서 직접 선택'}</td></tr>}
                      {(() => {
                        // 선행 코스(조건표 '선행 코스 (수준이 낮을 때 먼저)', CL-027: 추천 결과에 한 줄)
                        const pre = col?.prereq ? courses.find((c) => c.id === col.prereq) : undefined;
                        return pre ? <tr><th>선행 코스</th><td>수준이 낮으면 먼저 {campuses.find((c) => c.id === pre.campus_id)?.name} · {courseLabel(pre)}{col?.prereq_weeks ? ` ${col.prereq_weeks}주` : ''} → {courseLabel(course)}</td></tr> : null;
                      })()}
                      {rec.estimated && <tr><th>수준</th><td>추정 {answerLabel(set, 'level', rec.level ?? '')} <span className="muted">· {lc?.note}</span></td></tr>}
                    </tbody>
                  </table>
                  <div>
                    <h3 style={{ margin: '0 0 10px' }}>추천 이유 · {courseLabel(course)}</h3>
                    <div className="reasons">
                      {pickReasons(reasons, course.id, answers, [set.questions[0]?.id, set.questions[1]?.id], content).map((p) => {
                        // 이 에이전시가 볼 수 있는 증거만(게시·노출 국가는 DB 정책이 거름)
                        const ev = p.evidence.map((id) => life.find((it) => it.id === id)).filter(Boolean) as ContentItem[];
                        return (
                          <div key={p.slot} className="reason">
                            <span className="key">이유 {p.slot} · {p.label}</span>
                            {p.source === 'none' ? <span className="muted">{t('common.preparing')}</span> : (
                              <>
                                <strong>{p.title}</strong>
                                {p.body && <span className={p.source === 'legacy' ? 'pre' : 'clamp-2'}>{p.body}</span>}
                                {ev.length > 0 && <div><button type="button" className="btn btn-sm" onClick={() => setProof(p)}>증거 보기 ({ev.length})</button></div>}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>최종 반 배정은 입학 테스트와 운영 조건에 따릅니다.</p>
                </div>
              </Box>
            </div>
          )}

          {/* ③ 생활(명세 2장): 추천된 캠퍼스·코스의 학생의 하루·JIC Play(상담 ③ 표시한 영상)·액티비티가 자동으로. 영상은 같은 화면 위에서 재생 */}
          {step === 2 && (
            <Box title={`생활 · ${campus?.name ?? ''}`} className="grow-3" foot={nav(1, 3)}>
              <div className="box-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {(() => {
                  const cid = course?.campus_id ?? '';
                  const names = course ? [course.name, course.display_name ?? '', course.id] : [];
                  const day = life.filter((it) => it.kind === 'day' && it.campus === cid && dayMatches(it, names)).sort(byTime);
                  // 코스 이름이 맞는 하루가 있으면 그것만, 없으면 캠퍼스 공통(코스 칸 빈 것)
                  const dayForCourse = day.some((it) => str(it, 'course')) ? day.filter((it) => str(it, 'course')) : day;
                  const videos = life.filter((it) => it.kind === 'video' && it.data?.consult === true && (!it.campus || it.campus === cid));
                  const acts = life.filter((it) => it.kind === 'activity' && (!it.campus || it.campus === cid));
                  return (
                    <>
                      <Msg kind="info">추천된 {campus?.name} · {courseLabel(course)}에 맞춘 생활 자료입니다.</Msg>
                      {lifePhotos.length > 0 && <PhotoGrid photos={[...lifePhotos].sort((a, b) => ['consult', 'dorm', 'meals'].indexOf(str(a.it, 'placement')) - ['consult', 'dorm', 'meals'].indexOf(str(b.it, 'placement')))} max={9} />}
                      {dayForCourse.length > 0 && (
                        <div>
                          <h3 style={{ margin: '0 0 6px' }}>학생의 하루 <span className="chip">예시 학생</span></h3>
                          <DayTimeline items={dayForCourse} />
                        </div>
                      )}
                      {videos.length > 0 && (
                        <div>
                          <h3 style={{ margin: '0 0 10px' }}>JIC Play</h3>
                          <div className="cards">{videos.map((v) => <VideoCard key={v.id} it={v} onOpen={() => setVideo(v)} />)}</div>
                        </div>
                      )}
                      {acts.length > 0 && (
                        <div>
                          <h3 style={{ margin: '0 0 6px' }}>액티비티</h3>
                          <ul className="act-list">
                            {acts.map((a) => (
                              <li key={a.id}><strong>{textOf(a).title}</strong>{str(a, 'schedule') && <span className="muted"> · {str(a, 'schedule')}</span>}{textOf(a).body && <div className="pre" style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>{textOf(a).body}</div>}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {[['시설 · 기숙사 · 식사', campus?.facilities], ['부가 수업 · 활동', campus?.activities], ['바기오 생활', campus?.life]].map(([label, text]) => (
                        <div key={label as string}>
                          <h3 style={{ margin: '0 0 6px' }}>{label}</h3>
                          <Text value={text as string | null | undefined} />
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>
            </Box>
          )}
          {proof && (
            <EvidenceSheet title={proof.title} items={proof.evidence.map((id) => life.find((it) => it.id === id)).filter(Boolean) as ContentItem[]} onClose={() => setProof(null)} />
          )}
          {video && (
            <Sheet title={textOf(video).title} onClose={() => setVideo(null)}>
              <YouTube url={str(video, 'youtube')} title={textOf(video).title} />
              {textOf(video).body && <p className="pre" style={{ margin: '12px 0 0' }}>{textOf(video).body}</p>}
            </Sheet>
          )}

          {/* ④ 단계 + CL-044 단계마다 '이 단계로 견적 보기' */}
          {step === 3 && hasLevels && (
            <Box
              title={`단계 · ${courseLabel(course)}`}
              className="grow-3"
              foot={
                <>
                  <button type="button" className="btn btn-lg" onClick={() => go(2)}>‹ ③ 생활</button>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {!pickedLevel && <span className="muted" style={{ fontSize: 13 }}>단계를 고르세요</span>}
                    <button type="button" className="btn btn-primary btn-lg" disabled={!pickedLevel} onClick={() => go(4)}>⑤ 비용 ›</button>
                  </span>
                </>
              }
            >
              <div className="box-body scroll">
                <table className="tbl center">
                  <thead><tr><th>선택</th><th>단계·옵션</th><th>수업량</th><th>수업 강도</th><th className="left">포함 내용</th><th>가격</th></tr></thead>
                  <tbody>
                    {levels.map((l) => (
                      <tr key={l.name} style={pickedLevel === l.name ? { background: 'var(--accent-tint)' } : undefined}>
                        <td><input type="radio" name="level" aria-label={l.name} checked={pickedLevel === l.name} onChange={() => setLevel(l.name)} /></td>
                        <td className="strong">{l.name}{l.default ? <span className="muted" style={{ fontWeight: 400 }}> (기본)</span> : null}</td>
                        <td><Text value={l.lessons} /></td>
                        <td><Text value={l.intensity} /></td>
                        <td className="left"><Text value={l.includes} /></td>
                        <td><OutLink className="btn btn-sm" href={levelQuote(l.name)}>이 단계로 견적 보기</OutLink></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {compare && compare.levels.length > 0 && (
                  <p style={{ fontSize: 14, margin: '10px 0 0' }}>
                    <span className="muted">하루 수업량 비교 · </span>
                    {courseLabel(course)} {levels.map((l) => `${l.name} ${l.lessons ?? ''}`.trim()).join(', ')}
                    <span className="muted"> / </span>
                    {courseLabel(compare)} {compare.levels.map((l) => `${l.name} ${l.lessons ?? ''}`.trim()).join(', ')}
                  </p>
                )}
                <p className="muted" style={{ fontSize: 13, margin: '8px 0 0' }}>단계마다 수업 수와 가격이 다릅니다. '이 단계로 견적 보기'를 누르면 코스·단계·기간을 채운 견적 사이트가 열립니다(CL-044).</p>
              </div>
            </Box>
          )}

          {/* ⑤ 비용: 학비표(가격표 원본, CL-038) + 견적(견적 기능 포털 통합 R-013 전까지 견적 사이트) */}
          {step === 4 && (
            <div className="col grow-3">
              {tuitionHere.length > 0 ? (
                <>
                  <div className="page-head">
                    <h2>학비표 · {campus?.name}</h2>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      통화
                      <select value={cur} onChange={(e) => setCur(e.target.value as Cur)}>
                        {(Object.keys(CUR_LABEL) as Cur[]).map((c) => <option key={c} value={c}>{CUR_LABEL[c]}</option>)}
                      </select>
                    </label>
                  </div>
                  {tuitionHere.some((r) => r.sample) && <Msg kind="warn">샘플 가격입니다(실제 가격이 아닙니다). JIC 직원 화면에만 보입니다.</Msg>}
                  <TuitionTables rows={tuitionHere} cur={cur} campus={campus?.name} />
                </>
              ) : (
                <div className="state">
                  학비표 <span className="chip">{t('common.preparing')}</span>
                  {agencyStaff ? ' · 학비표는 지점 대표 아이디로 볼 수 있습니다.' : ' · 실제 가격표를 올린 뒤 보입니다. 지금은 견적에서 금액을 확인하세요.'}
                </div>
              )}
              <Box title="견적" foot={nav(hasLevels ? 3 : 2, 5)}>
                <div className="box-body form">
                  <table className="kv">
                    <tbody>
                      {/* 견적 사이트·DB 는 내부 코스명(Senior 등)을 쓴다(CL-009) */}
                      <tr><th>견적에 넣을 값</th><td>{campus?.name} · {quoteCourse} · 희망 {weeksLabel(answers.weeks)}{rec.weeks && String(rec.weeks) !== answers.weeks ? ` (권장 ${rec.weeks}주)` : ''}</td></tr>
                    </tbody>
                  </table>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <OutLink href={quoteUrl(settings.quote_kr, quoteQuery)}>견적 사이트 KR</OutLink>
                    <OutLink href={quoteUrl(settings.quote_jp, quoteQuery)}>JP</OutLink>
                    <OutLink href={quoteUrl(settings.quote_usd, quoteQuery)}>USD</OutLink>
                    <OutLink href={quoteUrl(settings.quote_usd_new, quoteQuery)}>USD-New</OutLink>
                  </div>
                  <p className="hint" style={{ margin: 0 }}>견적 사이트를 열 때 캠퍼스·코스·희망 기간을 함께 넘깁니다. 채워지지 않은 값(시작일, 기숙사, 챌린저 ESL·IELTS의 수업 강도)은 위 값을 보고 직접 고르세요.</p>
                  <div className="form-grid">
                    <label>
                      통화
                      <select value={quote.currency} onChange={(e) => setQuote({ ...quote, currency: e.target.value })}>
                        {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </label>
                    <label>견적 금액<input inputMode="decimal" value={quote.amount} onChange={(e) => setQuote({ ...quote, amount: e.target.value })} placeholder="견적 사이트 결과" /></label>
                  </div>
                  <label>견적 메모<textarea value={quote.memo} onChange={(e) => setQuote({ ...quote, memo: e.target.value })} placeholder="포함·제외 항목 등" /></label>
                </div>
              </Box>
            </div>
          )}
        </div>
      )}

      {/* ⑥ 마무리: 학습계획서 PDF → 상담 끝내기 */}
      {step === 5 && rec && course && (
        <>
          <StudyPlan
            set={set}
            answerText={(qid) => levelAnswer(qid)}
            wished={weeksLabel(answers.weeks)}
            course={course}
            campusName={campus?.name ?? ''}
            alt={chosen ? rec.first : rec.alt}
            level={levels.length ? pickedLevel : null}
            weeks={rec.weeks}
            content={content}
            quote={quote}
            member={member}
            onBack={() => go(4)}
            onDownload={() => {
              setPlanDone(true);
              if (member) supabase.from('plan_downloads').insert({ course_id: course.id }).then(() => undefined);
            }}
          />
          <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary btn-lg" onClick={endConsult}>상담 끝내기</button>
          </div>
        </>
      )}

      {sheetCourse && (
        <CourseSheet
          course={sheetCourse}
          content={contents.find((c) => c.course_id === sheetCourse.id)}
          campusName={campuses.find((c) => c.id === sheetCourse.campus_id)?.name}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  );
}
