import { useEffect, useState } from 'react';
import { courseLabel, loadCourses, useLoad, type Question, type RuleSet, type ScoreModel } from '../../data';
import { isScoreModel } from '../../consult/engine';
import { errText, must, supabase } from '../../supabase';
import { Box, Loading, Msg } from '../../ui';

// 12.2 추천 규칙 관리: 센터장 승인된 추천 조건표를 반영한다. 조건표(◎○×)·권장 기간·대안·운영 상태는 아래 표에서 눌러 고치고(R-001),
// 질문·선택지는 '고급'의 JSON 으로 고친다.
// v2.1(점수 방식, CL-021)은 rules = { model: 'score', courses: [...] }. 예전 샘플(sample-1)은 rules = [첫 일치 규칙…].
export default function AdminRules() {
  const { data, error, reload } = useLoad(async () => ({
    sets: await must<RuleSet[]>(supabase.from('recommendation_rules').select('*').order('updated_at', { ascending: false })),
    courses: await loadCourses(),
  }));
  const [sel, setSel] = useState<number | null>(null);
  const [form, setForm] = useState({ version: '', status: 'draft', note: '', questions: '', rules: '', level_defaults: '' });
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const current = data?.sets.find((s) => s.id === sel) ?? data?.sets[0];

  useEffect(() => {
    if (!current) return;
    setSel(current.id);
    setForm({
      version: current.version,
      status: current.status,
      note: current.note ?? '',
      questions: JSON.stringify(current.questions, null, 2),
      rules: JSON.stringify(current.rules, null, 2),
      level_defaults: JSON.stringify(current.level_defaults, null, 2),
    });
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <Loading error={error} />;
  const courseIds = new Set(data.courses.map((c) => c.id));
  const names = Object.fromEntries(data.courses.map((c) => [c.id, `${c.campus_id.charAt(0).toUpperCase()}${c.campus_id.slice(1)} · ${courseLabel(c)}`]));
  // 편집 중인 JSON 을 표로 보인다. JSON 이 잘못되면 저장된 버전을 읽기 전용으로 보인다
  let live: { questions: Question[]; rules: ScoreModel } | null = null;
  try {
    const questions = JSON.parse(form.questions);
    const rules = JSON.parse(form.rules);
    if (Array.isArray(questions) && isScoreModel(rules)) live = { questions, rules };
  } catch {
    live = null;
  }

  const parse = (): { questions: Question[]; rules: RuleSet["rules"]; level_defaults: Record<string, unknown> } => {
    const questions = JSON.parse(form.questions);
    const rules = JSON.parse(form.rules);
    const level_defaults = JSON.parse(form.level_defaults);
    if (!Array.isArray(questions)) throw new Error('질문은 배열이어야 합니다.');
    if (isScoreModel(rules)) {
      checkScoreModel(questions, rules, courseIds);
      return { questions, rules, level_defaults };
    }
    if (!Array.isArray(rules)) throw new Error("규칙은 배열(예전 방식)이거나 { model: 'score', courses: [...] }(조건표 v2.1)이어야 합니다.");
    for (const r of rules) {
      if (!courseIds.has(r.first)) throw new Error(`규칙의 1순위 코스 '${r.first}'가 코스 목록에 없습니다.`);
      if (r.alt && !courseIds.has(r.alt)) throw new Error(`규칙의 대안 코스 '${r.alt}'가 코스 목록에 없습니다.`);
    }
    if (!rules.some((r: { when: object }) => Object.keys(r.when ?? {}).length === 0)) throw new Error('조건이 빈 기본 규칙이 마지막에 하나 있어야 합니다.');
    return { questions, rules, level_defaults };
  };

  const save = async (asNew: boolean) => {
    try {
      if (asNew && data.sets.some((x) => x.version === form.version.trim())) throw new Error(`버전 이름 '${form.version.trim()}'이 이미 있습니다. 새 버전은 다른 이름(예: V2.2)으로 저장하세요.`);
      // 새 버전은 늘 초안으로 저장한다(센터장 승인 전에 상담에 쓰이지 않게). 승인 뒤 상태를 '승인본'으로 바꿔 '이 버전 저장'
      const body = { version: form.version.trim(), status: asNew ? 'draft' : form.status, note: form.note || null, ...parse(), updated_at: new Date().toISOString() };
      const q = asNew ? supabase.from('recommendation_rules').insert(body).select('id').single() : supabase.from('recommendation_rules').update(body).eq('id', current!.id).select('id').single();
      const { data: row, error: e } = await q;
      if (e) throw e;
      setMsg({ kind: 'ok', text: asNew ? '새 버전을 초안으로 저장했습니다. 센터장 승인 뒤 상태를 승인본으로 바꿔 [이 버전 저장]을 누르면 상담 화면에 반영됩니다.' : '저장했습니다. 상담 화면은 가장 최근 승인본을, 승인본이 없으면 가장 최근 초안을 씁니다.' });
      setSel(row.id);
      reload();
    } catch (e) {
      setMsg({ kind: 'err', text: errText(e) });
    }
  };

  return (
    <>
      <Box title="버전">
        <div className="box-body" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {data.sets.map((s) => (
            <button key={s.id} type="button" className={'btn btn-sm' + (s.id === current?.id ? ' btn-primary' : '')} onClick={() => setSel(s.id)}>
              {s.version} · {s.status === 'approved' ? '승인본' : '초안'} · {s.updated_at.slice(0, 10)}
            </button>
          ))}
        </div>
      </Box>
      {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
      <Box title="편집" foot={<><span className="muted" style={{ fontSize: 12 }}>코스 id: {[...courseIds].join(', ')}</span><span style={{ display: 'flex', gap: 6 }}><button type="button" className="btn" onClick={() => save(true)}>새 버전으로 저장 (초안)</button><button type="button" className="btn btn-primary" onClick={() => save(false)} disabled={!current}>이 버전 저장</button></span></>}>
        <div className="box-body form">
          <div className="form-grid">
            <label>버전 이름<input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} /></label>
            <label>
              상태
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="draft">초안</option>
                <option value="approved">승인본 (센터장 승인)</option>
              </select>
            </label>
          </div>
          <label>메모<input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13 }}>고급: JSON 직접 고치기 (질문·선택지·레벨 간단 확인)</summary>
          <label>
            질문 (5개: id, label, options [[값, 표시]])
            <textarea className="input" style={{ minHeight: 220, fontFamily: 'Consolas, monospace', fontSize: 12 }} value={form.questions} onChange={(e) => setForm({ ...form, questions: e.target.value })} />
          </label>
          <label>
            조건표 (v2.1: {'{'} model: 'score', points, level_check, courses: [{'{'} course, marks: {'{'}질문id: {'{'}선택지값: ◎·○·×{'}'}{'}'}, weeks, alt, alt_when, prereq, status, visible {'}'}] {'}'} · 예전 방식: 첫 일치 규칙 배열)
            <textarea className="input" style={{ minHeight: 220, fontFamily: 'Consolas, monospace', fontSize: 12 }} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} />
          </label>
          <label>
            단계 기본값 (예전 방식만. v2.1 은 코스 단계의 '기본'으로 정한다)
            <textarea className="input" style={{ minHeight: 120, fontFamily: 'Consolas, monospace', fontSize: 12 }} value={form.level_defaults} onChange={(e) => setForm({ ...form, level_defaults: e.target.value })} />
          </label>
          </details>
        </div>
      </Box>
      {live ? (
        <Matrix questions={live.questions} model={live.rules} saved={current && isScoreModel(current.rules) ? current.rules : undefined} names={names} onChange={(m) => setForm({ ...form, rules: JSON.stringify(m, null, 2) })} />
      ) : current && isScoreModel(current.rules) ? (
        <>
          <Msg kind="warn">JSON 에 오류가 있어 표로 고칠 수 없습니다. 아래는 저장된 버전입니다.</Msg>
          <Matrix questions={current.questions} model={current.rules} names={names} />
        </>
      ) : null}
    </>
  );
}

/** 조건표 v2.1 저장 전 확인: 코스 id, ◎○× 값, 질문 선택지마다 칸이 있는지 */
function checkScoreModel(questions: Question[], m: ScoreModel, courseIds: Set<string>) {
  if (!Array.isArray(m.courses) || !m.courses.length) throw new Error('조건표에 코스가 없습니다.');
  for (const c of m.courses) {
    for (const [k, v] of [['코스', c.course], ['대안 코스', c.alt], ['선행 코스', c.prereq], ['비교 코스', c.compare]] as const) {
      if (v && !courseIds.has(v)) throw new Error(`${k} '${v}'가 코스 목록에 없습니다.`);
    }
    for (const q of questions) {
      for (const [v] of q.options) {
        const mark = c.marks?.[q.id]?.[v];
        if (mark !== undefined && !['◎', '○', '×'].includes(mark)) throw new Error(`${c.course} ${q.id}=${v}: '${mark}'는 ◎·○·× 가 아닙니다.`);
      }
    }
  }
}

const MARKS = ['◎', '○', '×'] as const;
const STATUSES = ['운영 중', '운영 예정', '미확정'];
const nextMark = (m: string | undefined) => MARKS[(MARKS.indexOf((m ?? '×') as (typeof MARKS)[number]) + 1) % MARKS.length];

/**
 * 조건표 편집(요청 R-001: 조건표가 바뀌면 코드 대신 데이터만 바꾼다). 엑셀과 같은 모양이다.
 * 칸을 누르면 ◎ → ○ → × 로 바뀌고, 저장된 버전과 다른 칸은 색이 바뀐다. 아래 줄에서 권장 기간·대안·선행 코스·운영 상태·노출을 고친다.
 * onChange 가 없으면 읽기 전용(JSON 이 잘못돼 편집할 수 없을 때). 빈 칸은 조건표에 행이 없다는 뜻이라 점수·제외가 없다(Q2 '둘 다 괜찮음').
 */
function Matrix({ questions, model, saved, names, onChange }: { questions: Question[]; model: ScoreModel; saved?: ScoreModel; names: Record<string, string>; onChange?: (m: ScoreModel) => void }) {
  const savedOf = (course: string) => saved?.courses.find((c) => c.course === course);
  const edit = (i: number, patch: Partial<ScoreModel['courses'][number]>) => onChange?.({ ...model, courses: model.courses.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const toggle = (i: number, qid: string, v: string) => {
    const c = model.courses[i];
    edit(i, { marks: { ...c.marks, [qid]: { ...c.marks[qid], [v]: nextMark(c.marks[qid]?.[v]) } } });
  };
  const changed = (course: string, qid: string, v: string, mark?: string) => !!saved && (savedOf(course)?.marks[qid]?.[v] ?? '') !== (mark ?? '');
  let changes = 0;
  for (const c of model.courses) for (const q of questions) for (const [v] of q.options) if (c.marks[q.id]?.[v] && changed(c.course, q.id, v, c.marks[q.id]?.[v])) changes++;
  const cellStyle = (on: boolean) => (on ? { background: '#fff3cd', fontWeight: 700 } : undefined);
  const opts = Object.entries(names);
  return (
    <Box title={onChange ? '조건표 편집' : '조건표 확인 (저장된 버전)'} extra={onChange && saved ? <span className="muted" style={{ fontSize: 12 }}>저장된 버전과 다른 칸 {changes}개</span> : undefined}>
      <div className="box-body scroll">
        {onChange && <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>칸을 누르면 ◎ → ○ → × 순서로 바뀝니다. 고친 뒤 '새 버전으로 저장'(초안)하고, 센터장 승인 뒤 상태를 '승인본'으로 바꿔 저장합니다. 상담 화면은 가장 최근 승인본을 씁니다.</p>}
        <table className="tbl center" style={{ fontSize: 12 }}>
          <thead>
            <tr><th className="left">질문</th><th className="left">선택지</th>{model.courses.map((c) => <th key={c.course}>{names[c.course] ?? c.course}</th>)}</tr>
          </thead>
          <tbody>
            {questions.flatMap((q, qi) =>
              q.options.map(([v, label], oi) => {
                const blankRow = model.courses.every((c) => !c.marks[q.id]?.[v]);
                return (
                  <tr key={q.id + v}>
                    <td className="left muted">{oi === 0 ? `Q${qi + 1}` : ''}</td>
                    <td className="left">{label}</td>
                    {model.courses.map((c, i) => {
                      const m = c.marks[q.id]?.[v];
                      if (!onChange || blankRow) return <td key={c.course} style={cellStyle(!!m && changed(c.course, q.id, v, m))}>{m ?? ''}</td>;
                      return (
                        <td key={c.course} style={{ padding: 0, ...cellStyle(changed(c.course, q.id, v, m)) }}>
                          <button type="button" className="btn btn-sm" style={{ width: '100%', minWidth: 34, border: 0, background: 'transparent' }} aria-label={`${names[c.course] ?? c.course} ${label}: ${m ?? '빈 칸'}`} onClick={() => toggle(i, q.id, v)}>
                            {m ?? '·'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                );
              }),
            )}
            <tr>
              <td className="left muted">기간</td><td className="left">권장 기간(주)</td>
              {model.courses.map((c, i) => (
                <td key={c.course}>
                  {onChange ? <input className="input" style={{ width: 56, height: 26 }} type="number" min={1} max={52} aria-label={`${names[c.course] ?? c.course} 권장 기간`} value={c.weeks ?? ''} onChange={(e) => edit(i, { weeks: e.target.value ? Number(e.target.value) : null })} /> : c.weeks ? `${c.weeks}주` : ''}
                </td>
              ))}
            </tr>
            <tr>
              <td /><td className="left">대안 코스</td>
              {model.courses.map((c, i) => (
                <td key={c.course}>
                  {onChange ? (
                    <select aria-label={`${names[c.course] ?? c.course} 대안 코스`} value={c.alt ?? ''} onChange={(e) => edit(i, { alt: e.target.value || null })} style={{ maxWidth: 120 }}>
                      <option value="">없음</option>
                      {opts.filter(([id]) => id !== c.course).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                    </select>
                  ) : c.alt ? names[c.alt] ?? c.alt : ''}
                </td>
              ))}
            </tr>
            <tr>
              <td /><td className="left">대안이 되는 조건</td>
              {model.courses.map((c, i) => (
                <td key={c.course}>
                  {onChange ? <input className="input" style={{ width: 120, height: 26 }} maxLength={40} aria-label={`${names[c.course] ?? c.course} 대안이 되는 조건`} value={c.alt_when ?? ''} onChange={(e) => edit(i, { alt_when: e.target.value || null })} /> : c.alt_when ?? ''}
                </td>
              ))}
            </tr>
            <tr>
              <td /><td className="left">선행 코스</td>
              {model.courses.map((c, i) => (
                <td key={c.course}>
                  {onChange ? (
                    <select aria-label={`${names[c.course] ?? c.course} 선행 코스`} value={c.prereq ?? ''} onChange={(e) => edit(i, { prereq: e.target.value || null, prereq_weeks: e.target.value ? c.prereq_weeks ?? 4 : null })} style={{ maxWidth: 120 }}>
                      <option value="">없음</option>
                      {opts.filter(([id]) => id !== c.course).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
                    </select>
                  ) : c.prereq ? `${names[c.prereq] ?? c.prereq} ${c.prereq_weeks ?? ''}주` : '없음'}
                </td>
              ))}
            </tr>
            <tr>
              <td /><td className="left">운영 · 노출</td>
              {model.courses.map((c, i) => (
                <td key={c.course}>
                  {onChange ? (
                    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
                      <select aria-label={`${names[c.course] ?? c.course} 운영 상태`} value={c.status} onChange={(e) => edit(i, { status: e.target.value })}>
                        {[...new Set([c.status, ...STATUSES])].map((s) => <option key={s}>{s}</option>)}
                      </select>
                      <label style={{ fontSize: 11 }}><input type="checkbox" checked={c.visible} onChange={(e) => edit(i, { visible: e.target.checked })} /> 노출</label>
                    </span>
                  ) : `${c.status} · ${c.visible ? '노출' : '숨김'}`}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>계산: × 가 하나라도 있으면 제외 → ◎ 2점·○ 1점 합산 → 1순위. 2순위는 1순위의 대안 코스가 후보에 남아 있으면 그 코스, 없으면 점수 2위. 동점이면 Q1 ◎ 먼저, 그다음 이 표의 열 순서(CL-021). 운영 중이고 노출인 코스만 추천합니다.</p>
      </div>
    </Box>
  );
}
