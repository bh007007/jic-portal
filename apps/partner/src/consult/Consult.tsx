import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { courseLabel, loadCampuses, loadContents, loadCourses, loadRuleSet, loadSettings, useLoad, type Course } from '../data';
import { CURRENCIES, t } from '../i18n';
import { supabase } from '../supabase';
import { Box, Loading, Msg, OutLink, PageHead, Text } from '../ui';
import { answerLabel, estimateLevel, isScoreModel, recommend, type Answers } from './engine';
import { quoteParams, quoteUrl } from './quoteLink';
import StudyPlan from './StudyPlan';

const STEPS = ['질문', '추천 결과', '추천 이유', '단계 선택', '견적', '학습계획서'];

/**
 * 2.1–2.6 상담. 답변·견적은 이 화면의 메모리에만 있고 어디에도 저장하지 않는다(원칙 P3).
 * 학습계획서를 내려받을 때 지점별 다운로드 수(plan_downloads)만 1 올린다.
 * 질문·선택지·조건(◎○×)·단계는 DB(recommendation_rules·courses.levels)에서 읽는다(요청 R-001). 계산은 engine.ts(CL-021).
 */
export default function Consult() {
  const { member } = useAuth();
  const { data, error } = useLoad(async () => {
    const [set, courses, contents, campuses, settings] = await Promise.all([loadRuleSet(), loadCourses(), loadContents(), loadCampuses(), loadSettings()]);
    return { set, courses, contents, campuses, settings };
  });
  const [step, setStep] = useState(0);
  const [q, setQ] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [checks, setChecks] = useState<(number | undefined)[]>([]); // 레벨 간단 확인 세 문항(0~2점)
  const [chosen, setChosen] = useState<string | null>(null); // 1순위 대신 대안을 고르면 대안 코스 id
  const [level, setLevel] = useState<string | null>(null);
  const [quote, setQuote] = useState({ currency: member?.currency ?? 'KRW', amount: '', memo: '' });

  if (!data) return <Loading error={error} />;
  const { set, courses, contents, campuses, settings } = data;
  if (!set) return <Loading error="추천 조건표가 아직 등록되지 않았습니다. JIC 관리자에게 문의하세요." />;

  const model = isScoreModel(set.rules) ? set.rules : null;
  const lc = model?.level_check;
  const unknownLevel = !!lc && answers[lc.question] === lc.unknown;
  const estimated = lc && unknownLevel ? estimateLevel(lc, checks) : null;
  const allAnswered = set.questions.every((qq) => answers[qq.id]) && (!unknownLevel || !!estimated);
  const rec = allAnswered ? recommend(set, answers, courses, checks) : null;
  const course: Course | null = rec ? (chosen && rec.alt?.id === chosen ? rec.alt : rec.first) : null;
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
  // 견적 사이트에 넘길 값(docs/quote-prefill.md): 캠퍼스·코스(견적 프로그램 이름)·희망 기간·에이전시. 학생 정보는 넘기지 않는다(P3).
  const quoteQuery = quoteParams({
    campusId: course?.campus_id,
    courseId: course?.id,
    level: pickedLevel,
    weeks: answers.weeks,
    agency: member ? [member.agency_name, member.branch].filter(Boolean).join(' ') : null,
  });
  const levelAnswer = (qid: string) =>
    lc && qid === lc.question && unknownLevel ? `잘 모름 → 추정 ${estimated ? answerLabel(set, qid, estimated) : '(확인 중)'}` : answerLabel(set, qid, answers[qid]);

  const reset = () => {
    setStep(0); setQ(0); setAnswers({}); setChecks([]); setChosen(null); setLevel(null);
    setQuote({ currency: member?.currency ?? 'KRW', amount: '', memo: '' });
  };
  const go = (n: number) => {
    if (n === 3 && !hasLevels) n = step < 3 ? 4 : 2; // 단계 고를 것이 없는 코스는 단계 선택을 건너뛴다
    setStep(n);
    window.scrollTo(0, 0);
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
  const cur = set.questions[q];

  return (
    <>
      <PageHead
        title="상담"
        side={<><span>{t('common.notSaved')}</span><button type="button" className="btn" onClick={reset}>새 상담</button></>}
      />
      {set.status !== 'approved' && (
        <Msg kind="warn">추천 조건표 승인 전입니다. 지금 추천은 샘플 규칙({set.version})으로 나옵니다. 실제 상담에는 승인본이 들어온 뒤 쓰세요.</Msg>
      )}

      <ol className="steps" aria-label="상담 단계">
        {STEPS.map((label, i) => (
          <li key={label} className={i < step ? 'done' : i === step ? 'now' : ''} aria-current={i === step ? 'step' : undefined}>
            <span className="dot">{i < step ? '✓' : i + 1}</span>
            <span className="label">{label}</span>
            <span className="bar" aria-hidden="true" />
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Box
          title={`Q${q + 1}. ${cur.label}`}
          extra={<span className="muted" style={{ fontSize: 12 }}>{q + 1} / {set.questions.length}</span>}
          foot={
            <>
              <button type="button" className="btn btn-lg" disabled={q === 0} onClick={() => setQ(q - 1)}>‹ 이전 질문</button>
              <button type="button" className="btn btn-primary btn-lg" disabled={!allAnswered} onClick={() => go(1)}>추천 결과 보기 ›</button>
            </>
          }
        >
          <div className="box-body">
            {model?.intro && q === 0 && <p className="muted" style={{ margin: '0 0 14px', fontSize: 13 }}>{model.intro}</p>}
            <div className="options" role="group" aria-label={cur.label}>
              {cur.options.map(([v, label]) => (
                <button key={v} type="button" className="option" aria-pressed={answers[cur.id] === v} onClick={() => answer(cur.id, v)}>
                  {label}
                </button>
              ))}
            </div>
            {lc && cur.id === lc.question && unknownLevel && (
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line-3)' }}>
                <strong style={{ fontSize: 14 }}>레벨 간단 확인</strong>
                {lc.items.map((it, i) => (
                  <div key={it.label} style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 13, marginBottom: 6 }}>{['①', '②', '③', '④', '⑤'][i] ?? i + 1} {it.label}</div>
                    <div className="options" role="group" aria-label={it.label}>
                      {it.options.map((o, s) => (
                        <button key={o} type="button" className="option" aria-pressed={checks[i] === s} onClick={() => check(i, s)}>{o}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <p style={{ margin: '14px 0 0', fontSize: 13 }}>
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

      {step >= 1 && step <= 4 && allAnswered && !rec && (
        <Box title="추천 결과" foot={<button type="button" className="btn btn-lg" onClick={() => go(0)}>‹ 답 수정</button>}>
          <div className="box-body">
            <p style={{ margin: 0 }}>답한 조건에 모두 맞는 코스가 없습니다. 조건표에서 '추천하지 않음(×)'이 있는 코스는 빠집니다. 답을 다시 확인해 주세요.</p>
          </div>
        </Box>
      )}

      {step >= 1 && step <= 4 && rec && course && (
        <div className="row">
          <Box title="학생 답변" extra={<button type="button" className="btn btn-sm" onClick={() => go(0)}>답 수정</button>} className="grow-1">
            <dl style={{ margin: 0, padding: '6px 20px 14px' }}>
              {set.questions.map((qq, i) => (
                <div key={qq.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line-3)' }}>
                  <dt style={{ flex: '0 0 96px', fontSize: 13, color: 'var(--ink-3)' }}>Q{i + 1} {qq.short ?? qq.label}</dt>
                  <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{levelAnswer(qq.id)}</dd>
                </div>
              ))}
            </dl>
          </Box>

          {step === 1 && (
            <Box
              title="추천 결과"
              className="grow-3"
              foot={
                <>
                  <button type="button" className="btn btn-lg" onClick={() => go(0)}>‹ 이전</button>
                  <button type="button" className="btn btn-primary btn-lg" onClick={() => go(2)}>추천 이유 보기 ›</button>
                </>
              }
            >
              <div className="box-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '8px 14px' }}>
                  <span className="muted" style={{ fontSize: 13 }}>추천 캠퍼스</span>
                  <span style={{ fontSize: 22, fontWeight: 700 }}>{campuses.find((c) => c.id === rec.campus)?.name}</span>
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
                        <Link to={`/courses/${c!.id}`} target="_blank" style={{ fontSize: 13, textDecoration: 'none' }}>코스 상세 ›</Link>
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
                          <span className="text-amber" style={{ marginLeft: 8 }}>
                            희망 기간({weeksLabel(answers.weeks)})과 {Math.abs(rec.diff)}주 차이
                          </span>
                        )}
                      </td>
                    </tr>
                    {hasLevels && <tr><th>단계</th><td>{pickedLevel ? `다음 화면에서 선택 (기본: ${pickedLevel})` : '다음 화면에서 가격과 함께 직접 선택'}</td></tr>}
                    {(() => {
                      // 선행 코스(조건표 '선행 코스 (수준이 낮을 때 먼저)', 11/10 결정 D-5: 추천 결과에 한 줄)
                      const pre = col?.prereq ? courses.find((c) => c.id === col.prereq) : undefined;
                      return pre ? <tr><th>선행 코스</th><td>수준이 낮으면 먼저 {campuses.find((c) => c.id === pre.campus_id)?.name} · {courseLabel(pre)}{col?.prereq_weeks ? ` ${col.prereq_weeks}주` : ''} → {courseLabel(course)}</td></tr> : null;
                    })()}
                    {rec.estimated && <tr><th>수준</th><td>추정 {answerLabel(set, 'level', rec.level ?? '')} <span className="muted">· {lc?.note}</span></td></tr>}
                  </tbody>
                </table>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>최종 반 배정은 입학 테스트와 운영 조건에 따릅니다.</p>
              </div>
            </Box>
          )}

          {step === 2 && (
            <Box
              title={`추천 이유 · ${courseLabel(course)}`}
              className="grow-3"
              foot={
                <>
                  <button type="button" className="btn btn-lg" onClick={() => go(1)}>‹ 이전</button>
                  <button type="button" className="btn btn-primary btn-lg" onClick={() => go(3)}>{hasLevels ? '단계 선택 ›' : '견적 ›'}</button>
                </>
              }
            >
              <div className="box-body">
                <div className="reasons">
                  {[['LEARNING', '수업 방식', content?.reason_learning], ['GROWTH', '성장 확인', content?.reason_growth], ['ENVIRONMENT', '학습 환경', content?.reason_environment]].map(([key, label, text]) => (
                    <div key={key as string} className="reason">
                      <span className="key">{key}</span>
                      <strong>{label}</strong>
                      <Text value={text as string | null | undefined} />
                    </div>
                  ))}
                </div>
                <p style={{ margin: '14px 0 0' }}><Link to={`/courses/${course.id}`} target="_blank">코스 상세 자세히 보기 ›</Link></p>
              </div>
            </Box>
          )}

          {step === 3 && hasLevels && (
            <Box
              title={`단계 선택 · ${courseLabel(course)}`}
              className="grow-3"
              foot={
                <>
                  <button type="button" className="btn btn-lg" onClick={() => go(2)}>‹ 이전</button>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {!pickedLevel && <span className="muted" style={{ fontSize: 12 }}>단계를 고르세요</span>}
                    <button type="button" className="btn btn-primary btn-lg" disabled={!pickedLevel} onClick={() => go(4)}>견적 ›</button>
                  </span>
                </>
              }
            >
              <div className="box-body scroll">
                <table className="tbl center">
                  <thead><tr><th>선택</th><th>단계·옵션</th><th>수업량</th><th>수업 강도</th><th className="left">포함 내용</th><th>가격</th></tr></thead>
                  <tbody>
                    {levels.map((l) => (
                      <tr key={l.name} style={pickedLevel === l.name ? { background: 'var(--primary-soft)' } : undefined}>
                        <td><input type="radio" name="level" aria-label={l.name} checked={pickedLevel === l.name} onChange={() => setLevel(l.name)} /></td>
                        <td className="strong">{l.name}{l.default ? <span className="muted" style={{ fontWeight: 400 }}> (기본)</span> : null}</td>
                        <td><Text value={l.lessons} /></td>
                        <td><Text value={l.intensity} /></td>
                        <td className="left"><Text value={l.includes} /></td>
                        <td className="muted">견적 사이트</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {compare && compare.levels.length > 0 && (
                  <p style={{ fontSize: 13, margin: '10px 0 0' }}>
                    <span className="muted">하루 수업량 비교 · </span>
                    {courseLabel(course)} {levels.map((l) => `${l.name} ${l.lessons ?? ''}`.trim()).join(', ')}
                    <span className="muted"> / </span>
                    {courseLabel(compare)} {compare.levels.map((l) => `${l.name} ${l.lessons ?? ''}`.trim()).join(', ')}
                  </p>
                )}
                <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>단계마다 수업 수와 가격이 다릅니다. 가격은 견적 사이트 값으로 확인하고 직접 고릅니다.</p>
              </div>
            </Box>
          )}

          {step === 4 && (
            <Box
              title="견적"
              className="grow-3"
              foot={
                <>
                  <button type="button" className="btn btn-lg" onClick={() => go(hasLevels ? 3 : 2)}>‹ 이전</button>
                  <button type="button" className="btn btn-primary btn-lg" onClick={() => go(5)}>학습계획서 ›</button>
                </>
              }
            >
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
          )}
        </div>
      )}

      {step === 5 && rec && course && (
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
            if (member) supabase.from('plan_downloads').insert({ course_id: course.id }).then(() => undefined);
          }}
        />
      )}
    </>
  );
}
