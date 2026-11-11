import { useEffect, useState, type FormEvent } from 'react';
import type { Course, CourseContent, Question, RuleSet } from '../../../../partner/src/data';
import { courseLabel } from '../../../../partner/src/shared';
import { BOTH_ANSWER, LEGACY, REASON_SLOTS, type CourseReason } from '../../../../partner/src/consult/reasons';
import { CAMPUS_LABEL, I18N_LANGS, MEDIA_BUCKET, PRICE_IN_TEXT, STATUS_LABEL, placementLabel, type ContentItem } from '../../../../partner/src/contentKinds';
import { Loading, Panel } from '../../components/ui';
import { campusName, db, errText, must, Status, useLoad, type Note } from './common';

const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // 필리핀 날짜
const KIND_LABEL: Record<string, string> = { photo: '사진', video: '영상', evidence: '근거 자료' };
type Key = { slot: 1 | 2 | 3; answer: string };
type Form = Pick<CourseReason, 'title' | 'body' | 'evidence' | 'i18n' | 'status' | 'updated_on'>;
const emptyForm = (): Form => ({ title: '', body: '', evidence: [], i18n: {}, status: 'draft', updated_on: today() });
const itemName = (it: ContentItem) => it.title || (typeof it.data?.file_name === 'string' ? it.data.file_name : '') || '(제목 없음)';

/**
 * 파트너 포털 관리 › 상담 설정 › 추천 이유(CL-050, 화면 명세 3장·4.2).
 * 코스를 고르면 칸마다: 이유 1 = 기본 + 학습 목적(Q1) 선택지별, 이유 2 = 기본 + 중요하게 생각하는 것(Q2) 선택지별('둘 다 괜찮음'은 기본), 이유 3 = 기본(공통).
 * 각 이유: 제목(필수), 설명(두 줄 이내), 증거 0~3개(사진 보관함·JIC Play·근거 자료에서 고름), 언어별 문구, 공개 상태. 표 course_reasons(20261112010000).
 * 비어 있는 칸은 기본 이유 → 예전 코스별 글 → '준비 중' 순서로 상담 ②에 보인다(apps/partner/src/consult/reasons.ts).
 */
export default function Reasons() {
  const { data, error, reload } = useLoad(async () => {
    const [sets, courses, contents, reasons, items] = await Promise.all([
      must<RuleSet[]>(db().from('recommendation_rules').select('*').order('updated_at', { ascending: false })),
      must<Course[]>(db().from('courses').select('*').order('campus_id').order('sort')),
      must<CourseContent[]>(db().from('course_contents').select('*')),
      must<CourseReason[]>(db().from('course_reasons').select('*')),
      must<ContentItem[]>(db().from('partner_content_items').select('*').in('kind', ['photo', 'video', 'evidence'])),
    ]);
    return { set: sets.find((s) => s.status === 'approved') ?? sets[0] ?? null, courses, contents, reasons, items };
  });
  const [courseId, setCourseId] = useState('');
  const [key, setKey] = useState<Key | null>(null);
  const [msg, setMsg] = useState<Note>(null);
  if (!data) return <Loading error={error} />;

  const course = data.courses.find((c) => c.id === courseId) ?? data.courses[0];
  if (!course) return <p className="state-msg">코스가 없습니다. '화면 콘텐츠 › 캠퍼스·코스 내용'을 먼저 확인하세요.</p>;
  const questions: (Question | undefined)[] = [data.set?.questions[0], data.set?.questions[1]];
  const mine = data.reasons.filter((r) => r.course_id === course.id);
  const legacy = data.contents.find((c) => c.course_id === course.id);
  const find = (k: Key) => mine.find((r) => r.slot === k.slot && r.answer === k.answer);
  const filled = (cid: string) => data.reasons.filter((r) => r.course_id === cid && r.status === 'published').length;

  return (
    <>
      <Panel title="추천 이유 · 코스 고르기">
        <div className="toolbar" style={{ justifyContent: 'flex-start' }}>
          <select aria-label="코스" value={course.id} onChange={(e) => { setCourseId(e.target.value); setKey(null); setMsg(null); }}>
            {data.courses.map((c) => <option key={c.id} value={c.id}>{campusName(c.campus_id)} · {courseLabel(c)} (게시 {filled(c.id)})</option>)}
          </select>
          <span className="hint" style={{ fontSize: 12, color: 'var(--ink-3)' }}>
            상담 ②에서 학생 답에 맞는 이유 → 그 코스의 기본 이유 → 예전 코스별 글 → '준비 중' 순서로 보입니다. 게시한 이유만 보입니다.
          </span>
        </div>
        <Status msg={msg} />
      </Panel>

      {REASON_SLOTS.map(({ slot, head, question }) => {
        const q = question === null ? undefined : questions[question];
        const answers: [string, string][] = [['', '기본 이유'], ...(q?.options ?? []).filter(([v]) => !(slot === 2 && v === BOTH_ANSWER))];
        const old = LEGACY.find((l) => l.slot === slot)!;
        const oldText = legacy?.[old.key];
        return (
          <Panel key={slot} title={<>{head} <small>{q ? `기준 질문: ${q.short ?? q.label}` : ''}</small></>}>
            <div className="grid-box">
              <table className="tbl center">
                <thead><tr><th className="left" style={{ width: 220 }}>학생 답</th><th className="left">제목 · 설명</th><th>증거</th><th>상태</th><th>업데이트</th><th /></tr></thead>
                <tbody>
                  {answers.map(([value, label]) => {
                    const r = find({ slot, answer: value });
                    const on = key?.slot === slot && key.answer === value;
                    return (
                      <tr key={value || 'default'} className={on ? 'on' : ''}>
                        <td className="left strong">{label}{slot === 2 && value === '' && <div className="muted" style={{ fontSize: 11, fontWeight: 400 }}>'둘 다 괜찮음'도 이 이유</div>}</td>
                        <td className="left">
                          {r ? <><strong>{r.title}</strong><div className="muted" style={{ fontSize: 12 }}>{r.body}</div></>
                            : value === '' ? <span className="muted">{oldText ? `비어 있음 → 예전 글 '${old.title}'이 보입니다` : "비어 있음 → 상담 ②에 '준비 중'"}</span>
                            : <span className="muted">비어 있음 → 기본 이유가 보입니다</span>}
                        </td>
                        <td>{r?.evidence?.length || '-'}</td>
                        <td className={r?.status === 'published' ? '' : 'muted'}>{r ? STATUS_LABEL[r.status] : '-'}</td>
                        <td className="muted nowrap">{r?.updated_on ?? '-'}</td>
                        <td className="nowrap"><button type="button" className={'btn btn-xs' + (on ? ' btn-primary' : '')} onClick={() => setKey(on ? null : { slot, answer: value })}>{r ? '고치기' : '쓰기'}</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {key?.slot === slot && (
              <ReasonForm
                key={`${course.id}-${key.slot}-${key.answer}`}
                course={course}
                k={key}
                answerLabel={answers.find(([v]) => v === key.answer)?.[1] ?? ''}
                current={find(key)}
                legacyText={key.answer === '' ? oldText ?? '' : ''}
                legacyTitle={old.title}
                items={data.items}
                onDone={(text) => { setMsg({ ok: true, text }); setKey(null); reload(); }}
                onError={(text) => setMsg({ ok: false, text })}
              />
            )}
          </Panel>
        );
      })}
    </>
  );
}

/** 이유 한 칸 쓰기·고치기·지우기 */
function ReasonForm({ course, k, answerLabel, current, legacyText, legacyTitle, items, onDone, onError }: {
  course: Course; k: Key; answerLabel: string; current?: CourseReason; legacyText: string; legacyTitle: string; items: ContentItem[];
  onDone: (text: string) => void; onError: (text: string) => void;
}) {
  const [f, setF] = useState<Form>(current ? { title: current.title, body: current.body, evidence: current.evidence ?? [], i18n: current.i18n ?? {}, status: current.status, updated_on: current.updated_on } : emptyForm());
  const [lang, setLang] = useState<string | null>(null);
  const [kind, setKind] = useState('');
  const [kw, setKw] = useState('');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const name = `${courseLabel(course)} · 이유 ${k.slot} · ${answerLabel}`;

  // 사진 증거 미리보기(서명 주소)
  useEffect(() => {
    const paths = items.filter((it) => it.kind === 'photo' && typeof it.data?.path === 'string').map((it) => it.data.path as string);
    if (!paths.length) return;
    db().storage.from(MEDIA_BUCKET).createSignedUrls(paths, 3600).then(({ data }) => {
      const m: Record<string, string> = {};
      for (const s of data ?? []) if (s.signedUrl && s.path) m[s.path] = s.signedUrl;
      setThumbs(m);
    });
  }, [items]);

  const priceWarn = [f.title, f.body, ...Object.values(f.i18n).flatMap((x) => [x.title ?? '', x.body ?? ''])].some((s) => PRICE_IN_TEXT.test(s));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!f.title.trim()) return onError('제목을 넣으세요.');
    if (f.body.length > 300) return onError('설명은 두 줄 이내(300자까지)로 줄여 주세요.');
    if (priceWarn && !window.confirm("글에 가격 숫자가 있는 것 같습니다. 금액은 쓰지 않고 '학비표 보기'로 안내합니다(CL-055). 그래도 저장할까요?")) return;
    const row = { course_id: course.id, slot: k.slot, answer: k.answer, title: f.title.trim(), body: f.body.trim(), evidence: f.evidence, i18n: f.i18n, status: f.status, updated_on: f.updated_on || null };
    const { error } = current ? await db().from('course_reasons').update(row).eq('id', current.id) : await db().from('course_reasons').insert(row);
    if (error) return onError(errText(error));
    onDone(`${name} — ${current ? '고쳤습니다' : '저장했습니다'}(${STATUS_LABEL[f.status]}).`);
  };
  const remove = async () => {
    if (!current || !window.confirm(`${name}을(를) 지울까요? 상담 ②에는 ${k.answer ? '기본 이유' : '예전 글 또는 준비 중'}이 보입니다.`)) return;
    const { error } = await db().from('course_reasons').delete().eq('id', current.id);
    if (error) return onError(errText(error));
    onDone(`${name} — 지웠습니다.`);
  };
  const toggleEv = (id: string) => setF((x) => {
    if (x.evidence.includes(id)) return { ...x, evidence: x.evidence.filter((e) => e !== id) };
    if (x.evidence.length >= 3) return x;
    return { ...x, evidence: [...x.evidence, id] };
  });
  const tr = lang ? f.i18n[lang] ?? {} : null;
  const setTr = (key: 'title' | 'body', v: string) => lang && setF({ ...f, i18n: { ...f.i18n, [lang]: { ...f.i18n[lang], [key]: v } } });
  const k2 = kw.trim().toLowerCase();
  // 같은 캠퍼스 자료를 먼저
  const cands = items
    .filter((it) => (!kind || it.kind === kind) && (!k2 || `${itemName(it)} ${it.body}`.toLowerCase().includes(k2)))
    .sort((a, b) => Number(f.evidence.includes(b.id)) - Number(f.evidence.includes(a.id)) || Number(b.campus === course.campus_id) - Number(a.campus === course.campus_id));
  const chosen = f.evidence.map((id) => items.find((it) => it.id === id)).filter(Boolean) as ContentItem[];

  return (
    <form className="edit" onSubmit={save} style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>{name}</h3>
      <table className="kv">
        <tbody>
          <tr><th><label htmlFor="rs-title">제목 *</label></th><td><input id="rs-title" maxLength={120} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} style={{ width: '100%' }} placeholder="한 줄로" /></td></tr>
          <tr>
            <th><label htmlFor="rs-body">설명</label></th>
            <td>
              <textarea id="rs-body" maxLength={300} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="두 줄 이내" />
              <span className="hint">{f.body.length} / 300자. 상담 ② 카드에는 두 줄까지 보입니다.</span>
              {!current && legacyText && !f.body && (
                <button type="button" className="btn btn-xs" style={{ marginTop: 4 }} onClick={() => setF({ ...f, title: f.title || legacyTitle, body: legacyText.slice(0, 300) })}>예전 글 '{legacyTitle}' 가져오기</button>
              )}
            </td>
          </tr>
          <tr>
            <th>증거 (0~3개)</th>
            <td>
              {chosen.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                  {chosen.map((it) => (
                    <span key={it.id} className="ev-chip">
                      {KIND_LABEL[it.kind]} · {itemName(it)}{it.status !== 'published' && <span className="text-red"> (게시 전)</span>}
                      <button type="button" aria-label="빼기" onClick={() => toggleEv(it.id)}>×</button>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <select aria-label="증거 종류" value={kind} onChange={(e) => setKind(e.target.value)}>
                  <option value="">모든 자료</option>
                  {Object.entries(KIND_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <input aria-label="증거 검색" placeholder="제목·설명 검색" value={kw} onChange={(e) => setKw(e.target.value)} style={{ flex: 1 }} />
              </div>
              <div className="ev-pick">
                {cands.length === 0 && <span className="muted">사진 보관함·JIC Play·근거 자료에 넣은 자료가 없습니다.</span>}
                {cands.slice(0, 60).map((it) => {
                  const on = f.evidence.includes(it.id);
                  const thumb = it.kind === 'photo' && typeof it.data?.path === 'string' ? thumbs[it.data.path] : undefined;
                  return (
                    <label key={it.id} className={'ev-item' + (on ? ' on' : '')}>
                      <input type="checkbox" checked={on} disabled={!on && f.evidence.length >= 3} onChange={() => toggleEv(it.id)} />
                      {thumb ? <img src={thumb} alt="" /> : <span className="ev-kind">{KIND_LABEL[it.kind]}</span>}
                      <span>
                        {itemName(it)}
                        <span className="muted" style={{ display: 'block', fontSize: 11 }}>
                          {[CAMPUS_LABEL[it.campus] ?? it.campus, it.kind === 'photo' && typeof it.data?.placement === 'string' ? placementLabel(it.data.placement) : '', it.status !== 'published' ? STATUS_LABEL[it.status] : ''].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <span className="hint">상담 ②의 '증거 보기'에서 같은 화면 위에 크게 열립니다. 게시 전 자료와 노출 국가가 다른 자료는 그 에이전시 화면에 보이지 않습니다.</span>
            </td>
          </tr>
          <tr>
            <th>언어별 문구</th>
            <td>
              <button type="button" className={'btn btn-xs' + (lang === null ? ' btn-primary' : '')} onClick={() => setLang(null)}>한국어</button>
              {I18N_LANGS.map(([code, label]) => (
                <button key={code} type="button" className={'btn btn-xs' + (lang === code ? ' btn-primary' : '')} style={{ marginLeft: 4 }} onClick={() => setLang(code)}>{label}{f.i18n[code]?.title || f.i18n[code]?.body ? ' ✓' : ''}</button>
              ))}
              {tr ? (
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input aria-label="번역 제목" placeholder="제목 (번역)" value={tr.title ?? ''} onChange={(e) => setTr('title', e.target.value)} style={{ width: '100%' }} />
                  <textarea aria-label="번역 설명" placeholder="설명 (번역)" value={tr.body ?? ''} onChange={(e) => setTr('body', e.target.value)} />
                </div>
              ) : <span className="hint">번역이 없으면 한국어로 보입니다.</span>}
            </td>
          </tr>
          <tr>
            <th>공개 상태 · 업데이트</th>
            <td>
              <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Form['status'] })}>
                {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>{' '}
              <input type="date" aria-label="최종 업데이트일" value={f.updated_on ?? ''} onChange={(e) => setF({ ...f, updated_on: e.target.value || null })} />
            </td>
          </tr>
        </tbody>
      </table>
      {priceWarn && <div className="text-red" style={{ fontSize: 12, marginTop: 6 }}>글에 가격 숫자가 있는 것 같습니다(CL-055).</div>}
      <div className="form-actions">
        {current ? <button type="button" className="btn text-red" onClick={remove}>지우기</button> : <span />}
        <button type="submit" className="btn btn-primary">{current ? '고치기' : '저장'}</button>
      </div>
    </form>
  );
}
