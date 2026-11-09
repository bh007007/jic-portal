import { useEffect, useState } from 'react';
import { courseLabel, loadCourses, useLoad, type Question, type RuleSet, type ScoreModel } from '../../data';
import { isScoreModel } from '../../consult/engine';
import { errText, must, supabase } from '../../supabase';
import { Box, Loading, Msg } from '../../ui';

// 12.2 추천 규칙 관리: 센터장 승인된 추천 조건표를 반영한다. 질문·선택지·조건표(◎○×)를 JSON 으로 편집하고, 아래 표로 확인한다.
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
      const body = { version: form.version.trim(), status: form.status, note: form.note || null, ...parse(), updated_at: new Date().toISOString() };
      const q = asNew ? supabase.from('recommendation_rules').insert(body).select('id').single() : supabase.from('recommendation_rules').update(body).eq('id', current!.id).select('id').single();
      const { data: row, error: e } = await q;
      if (e) throw e;
      setMsg({ kind: 'ok', text: '저장했습니다. 상담 화면은 승인본이 있으면 승인본을, 없으면 가장 최근 초안을 씁니다.' });
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
      <Box title="편집" foot={<><span className="muted" style={{ fontSize: 12 }}>코스 id: {[...courseIds].join(', ')}</span><span style={{ display: 'flex', gap: 6 }}><button type="button" className="btn" onClick={() => save(true)}>새 버전으로 저장</button><button type="button" className="btn btn-primary" onClick={() => save(false)} disabled={!current}>이 버전 저장</button></span></>}>
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
        </div>
      </Box>
      {current && isScoreModel(current.rules) && <Matrix questions={current.questions} model={current.rules} names={Object.fromEntries(data.courses.map((c) => [c.id, `${c.campus_id.charAt(0).toUpperCase()}${c.campus_id.slice(1)} · ${courseLabel(c)}`]))} />}
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

/** 저장된 조건표를 엑셀과 같은 모양으로 보여 준다(빈 칸 = 조건표에 행이 없음: 점수·제외 없음) */
function Matrix({ questions, model, names }: { questions: Question[]; model: ScoreModel; names: Record<string, string> }) {
  return (
    <Box title="조건표 확인 (저장된 버전)">
      <div className="box-body scroll">
        <table className="tbl center" style={{ fontSize: 12 }}>
          <thead>
            <tr><th className="left">질문</th><th className="left">선택지</th>{model.courses.map((c) => <th key={c.course}>{names[c.course] ?? c.course}</th>)}</tr>
          </thead>
          <tbody>
            {questions.flatMap((q, qi) =>
              q.options.map(([v, label], oi) => (
                <tr key={q.id + v}>
                  <td className="left muted">{oi === 0 ? `Q${qi + 1}` : ''}</td>
                  <td className="left">{label}</td>
                  {model.courses.map((c) => <td key={c.course}>{c.marks[q.id]?.[v] ?? ''}</td>)}
                </tr>
              )),
            )}
            <tr><td className="left muted">기간</td><td className="left">권장 기간</td>{model.courses.map((c) => <td key={c.course}>{c.weeks ? `${c.weeks}주` : ''}</td>)}</tr>
            <tr><td /><td className="left">대안 코스</td>{model.courses.map((c) => <td key={c.course}>{c.alt ? names[c.alt] ?? c.alt : ''}</td>)}</tr>
            <tr><td /><td className="left">대안이 되는 조건</td>{model.courses.map((c) => <td key={c.course}>{c.alt_when ?? ''}</td>)}</tr>
            <tr><td /><td className="left">선행 코스</td>{model.courses.map((c) => <td key={c.course}>{c.prereq ? `${names[c.prereq] ?? c.prereq} ${c.prereq_weeks ?? ''}주` : '없음'}</td>)}</tr>
            <tr><td /><td className="left">운영 · 노출</td>{model.courses.map((c) => <td key={c.course}>{c.status} · {c.visible ? '노출' : '숨김'}</td>)}</tr>
          </tbody>
        </table>
        <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>계산: × 가 하나라도 있으면 제외 → ◎ 2점·○ 1점 합산 → 1순위. 2순위는 1순위의 대안 코스가 후보에 남아 있으면 그 코스, 없으면 점수 2위. 동점이면 Q1 ◎ 먼저, 그다음 이 표의 열 순서(CL-021).</p>
      </div>
    </Box>
  );
}
