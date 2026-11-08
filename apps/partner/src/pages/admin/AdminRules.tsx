import { useEffect, useState } from 'react';
import { loadCourses, useLoad, type RuleSet } from '../../data';
import { errText, must, supabase } from '../../supabase';
import { Box, Loading, Msg } from '../../ui';

// 12.2 추천 규칙 관리: 센터장 승인된 추천 조건표를 반영한다. 질문·선택지·규칙·단계 기본값을 JSON 으로 편집.
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

  const parse = () => {
    const questions = JSON.parse(form.questions);
    const rules = JSON.parse(form.rules);
    const level_defaults = JSON.parse(form.level_defaults);
    if (!Array.isArray(questions) || !Array.isArray(rules)) throw new Error('질문과 규칙은 배열이어야 합니다.');
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
            규칙 (위에서부터 처음 맞는 규칙 사용. when: {'{'}질문id: [값…]{'}'}, campus, first, alt, weeks)
            <textarea className="input" style={{ minHeight: 220, fontFamily: 'Consolas, monospace', fontSize: 12 }} value={form.rules} onChange={(e) => setForm({ ...form, rules: e.target.value })} />
          </label>
          <label>
            단계 기본값 (코스id → 수준값 → 단계)
            <textarea className="input" style={{ minHeight: 120, fontFamily: 'Consolas, monospace', fontSize: 12 }} value={form.level_defaults} onChange={(e) => setForm({ ...form, level_defaults: e.target.value })} />
          </label>
        </div>
      </Box>
    </>
  );
}
