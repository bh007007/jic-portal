import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth';
import { loadCampuses, loadContents, loadCourses, loadRuleSet, loadSettings, useLoad, type Course } from '../data';
import { CURRENCIES, t } from '../i18n';
import { supabase } from '../supabase';
import { Box, Loading, Msg, OutLink, PageHead, Text } from '../ui';
import { answerLabel, recommend, type Answers } from './engine';
import StudyPlan from './StudyPlan';

const STEPS = ['질문', '추천 결과', '추천 이유', '단계 선택', '견적', '학습계획서'];

/**
 * 2.1–2.6 상담. 답변·견적은 이 화면의 메모리에만 있고 어디에도 저장하지 않는다(원칙 P3).
 * 학습계획서를 내려받을 때 지점별 다운로드 수(plan_downloads)만 1 올린다.
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
  const [chosen, setChosen] = useState<string | null>(null); // 1순위 대신 대안을 고르면 대안 코스 id
  const [level, setLevel] = useState<string | null>(null);
  const [quote, setQuote] = useState({ currency: member?.currency ?? 'KRW', amount: '', memo: '' });

  if (!data) return <Loading error={error} />;
  const { set, courses, contents, campuses, settings } = data;
  if (!set) return <Loading error="추천 조건표가 아직 등록되지 않았습니다. JIC 관리자에게 문의하세요." />;

  const allAnswered = set.questions.every((qq) => answers[qq.id]);
  const rec = allAnswered ? recommend(set, answers, courses) : null;
  const course: Course | null = rec ? (chosen && rec.alt?.id === chosen ? rec.alt : rec.first) : null;
  const campus = campuses.find((c) => c.id === course?.campus_id);
  const content = contents.find((c) => c.course_id === course?.id);
  const hasLevels = (course?.levels.length ?? 0) > 0;
  const pickedLevel = level ?? (course?.id === rec?.first.id ? rec?.defaultLevel : course?.levels[0]?.name) ?? null;

  const reset = () => {
    setStep(0); setQ(0); setAnswers({}); setChosen(null); setLevel(null);
    setQuote({ currency: member?.currency ?? 'KRW', amount: '', memo: '' });
  };
  const go = (n: number) => {
    if (n === 3 && !hasLevels) n = step < 3 ? 4 : 2; // 단계가 없는 코스는 단계 선택을 건너뛴다
    setStep(n);
    window.scrollTo(0, 0);
  };
  const answer = (qid: string, v: string) => {
    setAnswers((a) => ({ ...a, [qid]: v }));
    setChosen(null);
    setLevel(null);
    if (q < set.questions.length - 1) setQ(q + 1);
  };

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
          title={`Q${q + 1}. ${set.questions[q].label}`}
          extra={<span className="muted" style={{ fontSize: 12 }}>{q + 1} / {set.questions.length}</span>}
          foot={
            <>
              <button type="button" className="btn btn-lg" disabled={q === 0} onClick={() => setQ(q - 1)}>‹ 이전 질문</button>
              <button type="button" className="btn btn-primary btn-lg" disabled={!allAnswered} onClick={() => go(1)}>추천 결과 보기 ›</button>
            </>
          }
        >
          <div className="box-body">
            <div className="options" role="group" aria-label={set.questions[q].label}>
              {set.questions[q].options.map(([v, label]) => (
                <button key={v} type="button" className="option" aria-pressed={answers[set.questions[q].id] === v} onClick={() => answer(set.questions[q].id, v)}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 16 }}>
              {set.questions.map((qq, i) => (
                <button key={qq.id} type="button" className={'btn btn-sm' + (i === q ? ' btn-primary' : '')} onClick={() => setQ(i)}>
                  Q{i + 1} {answers[qq.id] ? answerLabel(set, qq.id, answers[qq.id]) : qq.label}
                </button>
              ))}
            </div>
          </div>
        </Box>
      )}

      {step >= 1 && step <= 4 && rec && course && (
        <div className="row">
          <Box title="학생 답변" extra={<button type="button" className="btn btn-sm" onClick={() => go(0)}>답 수정</button>} className="grow-1">
            <dl style={{ margin: 0, padding: '6px 20px 14px' }}>
              {set.questions.map((qq, i) => (
                <div key={qq.id} style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line-3)' }}>
                  <dt style={{ flex: '0 0 96px', fontSize: 13, color: 'var(--ink-3)' }}>Q{i + 1} {qq.label}</dt>
                  <dd style={{ margin: 0, fontSize: 15, fontWeight: 500 }}>{answerLabel(set, qq.id, answers[qq.id])}</dd>
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
                      <span className="name">{c!.name}</span>
                      <span style={{ color: 'var(--ink-2)' }}>
                        {campuses.find((x) => x.id === c!.campus_id)?.name}{c!.levels.length ? ' · ' + c!.levels.map((l) => l.name).join(' · ') : ''}
                      </span>
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
                            희망 기간 {answers.weeks}주보다 {Math.abs(rec.diff)}주 {rec.diff > 0 ? '깁니다' : '짧습니다'}
                          </span>
                        )}
                      </td>
                    </tr>
                    {hasLevels && <tr><th>단계</th><td>다음 화면에서 선택 (기본 추천: {pickedLevel})</td></tr>}
                  </tbody>
                </table>
                <p className="muted" style={{ margin: 0, fontSize: 12 }}>최종 반 배정은 입학 테스트와 운영 조건에 따릅니다.</p>
              </div>
            </Box>
          )}

          {step === 2 && (
            <Box
              title={`추천 이유 · ${course.name}`}
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
              title={`단계 선택 · ${course.name}`}
              className="grow-3"
              foot={
                <>
                  <button type="button" className="btn btn-lg" onClick={() => go(2)}>‹ 이전</button>
                  <button type="button" className="btn btn-primary btn-lg" onClick={() => go(4)}>견적 ›</button>
                </>
              }
            >
              <div className="box-body scroll">
                <table className="tbl center">
                  <thead><tr><th>선택</th><th>단계</th><th>하루 수업 수</th><th>수업 강도</th><th>예산 수준</th><th className="left">포함 내용</th></tr></thead>
                  <tbody>
                    {course.levels.map((l) => (
                      <tr key={l.name} style={pickedLevel === l.name ? { background: 'var(--primary-soft)' } : undefined}>
                        <td><input type="radio" name="level" aria-label={l.name} checked={pickedLevel === l.name} onChange={() => setLevel(l.name)} /></td>
                        <td className="strong">{l.name}{rec.defaultLevel === l.name && course.id === rec.first.id ? <span className="muted" style={{ fontWeight: 400 }}> (기본 추천)</span> : null}</td>
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
                    <tr><th>견적에 넣을 값</th><td>{campus?.name} · {course.name}{pickedLevel && hasLevels ? ` ${pickedLevel}` : ''} · {rec.weeks ?? answers.weeks}주</td></tr>
                  </tbody>
                </table>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <OutLink href={settings.quote_kr}>견적 사이트 KR</OutLink>
                  <OutLink href={settings.quote_jp}>JP</OutLink>
                  <OutLink href={settings.quote_usd}>USD</OutLink>
                  <OutLink href={settings.quote_usd_new}>USD-New</OutLink>
                </div>
                <p className="hint" style={{ margin: 0 }}>견적 사이트에 값을 미리 채우는 주소 형식은 결정 대기입니다. 지금은 위 값을 직접 넣어 견적을 받으세요.</p>
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
          answers={answers}
          course={course}
          campusName={campus?.name ?? ''}
          alt={chosen ? rec.first : rec.alt}
          level={hasLevels ? pickedLevel : null}
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
