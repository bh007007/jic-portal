import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabase';
import { Loading, Panel } from '../components/ui';
import { diffBooks, promoName, validateBook, withPromoDisplay, type Currency, type PriceBook, type PromoRow } from '../../../../packages/quote/src';

/**
 * 가격표 › 견적 가격(포털 기준, T-21·CL-066 11/12). 에이전시 포털 견적(/quote)이 쓰는 가격 버전(표 price_books, 20261112170000).
 * - 버전째 관리: 지금 적용 중인 승인 버전을 복사해 새 초안 → 고치기 → 승인 요청 → '가격 변경 승인' 권한자가 승인하면 적용 시작일부터 쓴다
 * - 승인된 버전은 바꾸지 않는다(이력). 입력은 기초관리 입력 권한, 승인은 권한표 '사람별 승인'의 가격 변경 승인(CL-066 대표님)
 * - 승인하는 사람에게 기준 버전과 달라진 칸만 따로 보인다. 막는 것은 DB(단계 검사 트리거·RLS)
 * - 프로모션 표시 이름(견적-2, 11/13): 화면에 보이는 유학원용 이름(한국어·영어). 관리용 이름은 그대로. 비어 있는 버전(v1)은 모듈 기본값으로 보이고,
 *   새 버전을 만들 때 기본값을 채운다. 일본어는 견적 담당자 확인 뒤
 */

interface BookRow {
  id: string;
  version: number;
  label: string;
  effective_from: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  data: PriceBook;
  note: string;
  based_on: string | null;
  created_by: string | null;
  created_at: string;
  submitted_by: string | null;
  submitted_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string;
}
interface Draft { label: string; effective_from: string; note: string; data: PriceBook }

const STATUS: Record<BookRow['status'], string> = { draft: '초안', submitted: '승인 요청', approved: '승인', rejected: '반려' };
const CUR: Currency[] = ['KRW', 'USD', 'JPY'];
const ROOM: Record<string, string> = { single: '1인실', semi: 'Semi', double: '2인실', couple: '커플', quad: '4인실' };
const CAMPUS: Record<string, string> = { premium: 'Premium', challenger: 'Challenger' };
const LOCAL: [keyof PriceBook['local'], string][] = [
  ['ssp', 'SSP(24주 이하 1회, 25주+ 2회)'], ['icard', 'SSP I-Card(52주 이하 1회)'], ['studentId', '학생증'], ['deposit', '기숙사 보증금(환불)'],
  ['utilities', '전기·수도(4주)'], ['laundry', '세탁(4주)'], ['facility', '시설관리비(4주)'], ['guarantee', 'IELTS Guarantee(1회)'],
];
const day = (s?: string | null) => (s ? s.slice(0, 10) : '');
const today = () => new Date().toISOString().slice(0, 10);
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
/** 다음 달 1일(가격 변경은 보통 공지 후 1~2달 뒤 적용, CL-066) */
const nextMonth = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1)).toISOString().slice(0, 10);
};
const periodsText = (p: PromoRow) => (p.startDates?.length ? `시작일 ${p.startDates.join(', ')}` : (p.periods ?? []).map(([a, z]) => `${a}~${z}`).join(', '));

export default function QuotePrices() {
  const [rows, setRows] = useState<BookRow[] | null>(null);
  const [error, setError] = useState('');
  const [names, setNames] = useState(new Map<string, string>());
  const [can, setCan] = useState({ input: false, approve: false });
  const [selId, setSelId] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [decision, setDecision] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [b, ci, ca, sd] = await Promise.all([
      supabase!.from('price_books').select('*').order('version', { ascending: false }),
      supabase!.rpc('can_input', { p_group: 'base', p_campus: '' }),
      supabase!.rpc('can_approve', { p_kind: 'price_change', p_campus: '' }),
      supabase!.rpc('staff_directory'),
    ]);
    if (b.error) return setError(b.error.message.includes('does not exist') ? '견적 가격 표가 아직 DB에 없습니다(마이그레이션 20261112170000 적용 전).' : b.error.message);
    // 날짜 칸은 YYYY-MM-DD 로 맞춘다(응답에 시각이 붙어 오는 경우)
    setRows(((b.data as BookRow[]) ?? []).map((r) => ({ ...r, effective_from: r.effective_from.slice(0, 10) })));
    setCan({ input: ci.data === true, approve: ca.data === true });
    setNames(new Map(((sd.data as { user_id: string; name: string }[]) ?? []).map((x) => [x.user_id, x.name])));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const approved = (rows ?? []).filter((r) => r.status === 'approved');
  const active = approved.filter((r) => r.effective_from <= today()).sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0];
  const upcoming = approved.filter((r) => r.effective_from > today()).sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  const sel = (rows ?? []).find((r) => r.id === selId) ?? null;
  const base = sel ? (rows ?? []).find((r) => r.id === sel.based_on) ?? (sel.id !== active?.id ? active : undefined) : undefined;
  const editable = !!sel && sel.status === 'draft' && can.input;
  const shown: PriceBook | null = editable && draft ? draft.data : sel?.data ?? null;
  const changes = useMemo(() => (base && shown ? diffBooks(base.data, shown) : []), [base, shown]);
  const changed = useMemo(() => new Set(changes.map((c) => c.key)), [changes]);
  const problems = useMemo(() => (shown && sel && sel.status !== 'approved' ? validateBook(shown) : []), [shown, sel]);
  const name = (id?: string | null) => (id ? names.get(id) ?? id.slice(0, 8) : '');

  const open = (r: BookRow) => {
    setSelId(r.id);
    setDraft(r.status === 'draft' ? { label: r.label, effective_from: r.effective_from, note: r.note, data: clone(r.data) } : null);
    setDecision('');
    setMsg('');
  };
  const run = async (label: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    setMsg('');
    const { error: err } = await fn();
    setBusy(false);
    setMsg(err ? `${label} 실패: ${err.message}` : `${label} 완료`);
    await load();
  };

  const create = async () => {
    if (!active) return;
    setBusy(true);
    const { data, error: err } = await supabase!.from('price_books')
      .insert({ label: `${active.label} 수정`, effective_from: nextMonth(), data: withPromoDisplay(active.data), based_on: active.id, note: '' })
      .select('*').single();
    setBusy(false);
    if (err) return setMsg(`새 버전 만들기 실패: ${err.message}`);
    const row = (Array.isArray(data) ? data[0] : data) as BookRow;
    await load();
    open({ ...row, effective_from: row.effective_from.slice(0, 10) });
    setMsg(`v${row.version} 초안을 만들었습니다. 고친 뒤 저장하고 승인 요청하세요.`);
  };
  const save = () => draft && sel && run(`v${sel.version} 저장`, () => supabase!.from('price_books').update({ label: draft.label, effective_from: draft.effective_from, note: draft.note, data: draft.data }).eq('id', sel.id));
  const setStatus = (status: BookRow['status'], label: string, extra: Record<string, unknown> = {}) =>
    sel && run(`v${sel.version} ${label}`, () => supabase!.from('price_books').update({ status, ...extra }).eq('id', sel.id));
  const submit = async () => {
    if (!draft || !sel) return;
    if (problems.length) return setMsg('고칠 칸이 있어 승인 요청할 수 없습니다(아래 목록).');
    setBusy(true);
    const s1 = await supabase!.from('price_books').update({ label: draft.label, effective_from: draft.effective_from, note: draft.note, data: draft.data }).eq('id', sel.id);
    setBusy(false);
    if (s1.error) return setMsg(`저장 실패: ${s1.error.message}`);
    setStatus('submitted', '승인 요청');
  };
  const remove = () => sel && window.confirm(`v${sel.version} 초안을 지울까요?`) && run(`v${sel.version} 삭제`, () => supabase!.from('price_books').delete().eq('id', sel.id)).then(() => setSelId(''));

  // 초안 고치기
  const patch = (fn: (d: PriceBook) => void) => {
    if (!draft) return;
    const d = clone(draft.data);
    fn(d);
    setDraft({ ...draft, data: d });
  };
  const num = (v: string) => (v.trim() === '' ? NaN : Number(v.replace(/,/g, '')));
  const cell = (key: string, value: number | undefined, onChange: (n: number) => void) =>
    editable ? (
      <td className={changed.has(key) ? 'chg' : ''}>
        <input className="num-in" inputMode="numeric" value={Number.isFinite(value) ? String(value) : ''} onChange={(e) => onChange(num(e.target.value))} aria-label={key} />
      </td>
    ) : (
      <td className={'num' + (changed.has(key) ? ' chg' : '')}>{Number.isFinite(value) ? (value as number).toLocaleString() : '-'}</td>
    );

  if (!supabase) return <div className="state-msg">견적 가격은 Supabase에 있어 배포 주소(로그인한 직원)에서만 봅니다.</div>;
  if (!rows) return <Loading error={error} />;

  return (
    <>
      <div className="toolbar">
        <span>
          지금 적용 중 <strong style={{ color: 'var(--primary)' }}>{active ? `v${active.version} · ${active.label}` : '없음'}</strong>
          {active && <span className="muted"> · {active.effective_from}부터</span>}
          {upcoming.map((u) => <span key={u.id} className="muted"> · 예정 v{u.version} {u.effective_from}부터</span>)}
        </span>
        <span className="toolbar-right">
          {can.input && <button type="button" className="btn" disabled={busy || !active} onClick={create}>새 버전 만들기</button>}
        </span>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
        에이전시 포털 견적은 적용 시작일이 지난 승인 버전 중 가장 최근 것을 씁니다. 승인된 버전은 바꾸지 않고 새 버전으로 고칩니다. 승인은 권한표 '사람별 승인'의 '가격 변경 승인'(CL-066 대표님){can.approve ? ' — 지금 계정에 있음' : ''}.
      </p>
      {msg && <div className={msg.includes('실패') || msg.includes('없습니다') ? 'text-red' : 'text-blue'} role="status" style={{ fontSize: 12, margin: '4px 0 8px' }}>{msg}</div>}

      <div className="grid-box">
        <table className="tbl center">
          <thead><tr><th>버전</th><th className="left">이름</th><th>적용 시작</th><th>상태</th><th>만든 사람</th><th>승인 요청</th><th>승인·반려</th><th>보기</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr className="empty"><td colSpan={8}>가격 버전이 없습니다.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} style={r.id === selId ? { background: 'var(--head-bg)' } : undefined}>
                <td>v{r.version}{r.id === active?.id && <span className="text-blue"> · 적용 중</span>}</td>
                <td className="left">{r.label}</td>
                <td>{r.effective_from}</td>
                <td className={r.status === 'rejected' ? 'text-red' : r.status === 'submitted' ? 'text-blue' : ''}>{STATUS[r.status]}</td>
                <td>{name(r.created_by) || '-'}</td>
                <td>{r.submitted_at ? `${name(r.submitted_by)} ${day(r.submitted_at)}` : '-'}</td>
                <td>{r.decided_at ? `${name(r.decided_by)} ${day(r.decided_at)}` : '-'}</td>
                <td><button type="button" className="btn btn-xs" onClick={() => open(r)}>보기</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {sel && shown && (
        <Panel title={`v${sel.version} · ${STATUS[sel.status]}${base ? ` · 기준 v${base.version}` : ''}`}>
          {editable && draft ? (
            <div className="search-grid" style={{ marginBottom: 10 }}>
              <label className="field"><span>이름</span><input value={draft.label} maxLength={120} onChange={(e) => setDraft({ ...draft, label: e.target.value })} /></label>
              <label className="field"><span>적용 시작일</span><input type="date" value={draft.effective_from} onChange={(e) => setDraft({ ...draft, effective_from: e.target.value })} /></label>
              <label className="field" style={{ gridColumn: 'span 2' }}><span>메모(바꾼 이유)</span><input value={draft.note} maxLength={2000} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>
            </div>
          ) : (
            <p style={{ margin: '0 0 8px', fontSize: 13 }}>
              {sel.label} · {sel.effective_from}부터{sel.note && <span className="muted"> · {sel.note}</span>}
              {sel.status === 'rejected' && sel.decision_note && <span className="text-red"> · 반려 사유: {sel.decision_note}</span>}
            </p>
          )}

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {editable && <button type="button" className="btn" disabled={busy} onClick={save}>저장</button>}
            {editable && <button type="button" className="btn btn-primary" disabled={busy} onClick={submit}>승인 요청</button>}
            {editable && <button type="button" className="btn" disabled={busy} onClick={remove}>삭제</button>}
            {sel.status === 'submitted' && can.input && <button type="button" className="btn" disabled={busy} onClick={() => setStatus('draft', '되돌리기')}>되돌리기(초안으로)</button>}
            {sel.status === 'rejected' && can.input && <button type="button" className="btn" disabled={busy} onClick={() => setStatus('draft', '초안으로')}>초안으로</button>}
            {sel.status === 'submitted' && can.approve && (
              <>
                <input aria-label="승인·반려 메모" placeholder="반려 사유(반려할 때 필수)" value={decision} onChange={(e) => setDecision(e.target.value)} style={{ minWidth: 240 }} />
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setStatus('approved', '승인', { decision_note: decision })}>승인</button>
                <button type="button" className="btn" disabled={busy || !decision.trim()} onClick={() => setStatus('rejected', '반려', { decision_note: decision })}>반려</button>
              </>
            )}
            {sel.status === 'submitted' && !can.approve && <span className="muted" style={{ fontSize: 12 }}>승인은 '가격 변경 승인' 권한자가 합니다.</span>}
          </div>

          {problems.length > 0 && (
            <div className="text-red" role="alert" style={{ fontSize: 12, margin: '0 0 10px' }}>
              고칠 칸 {problems.length}개: {problems.slice(0, 8).join(' / ')}{problems.length > 8 ? ' …' : ''}
            </div>
          )}

          {base && (
            <details open={sel.status !== 'approved'} style={{ marginBottom: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13 }}>기준 v{base.version}와 달라진 칸 {changes.length}개</summary>
              {changes.length > 0 && (
                <table className="tbl" style={{ marginTop: 6 }}>
                  <thead><tr><th className="left">칸</th><th className="num">기준</th><th className="num">이번</th></tr></thead>
                  <tbody>
                    {changes.map((c) => <tr key={c.key}><td className="left">{c.label}</td><td className="num">{c.before.length > 60 ? '(내용)' : c.before}</td><td className="num chg">{c.after.length > 60 ? '(내용)' : c.after}</td></tr>)}
                  </tbody>
                </table>
              )}
            </details>
          )}

          <h3 className="qp-h">등록금</h3>
          <table className="tbl center qp"><thead><tr>{CUR.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody><tr>{CUR.map((c) => cell(`registration.${c}`, shown.registration[c], (n) => patch((d) => { d.registration[c] = n; })))}</tr></tbody>
          </table>

          <h3 className="qp-h">코스 (4주 가격)</h3>
          <table className="tbl center qp">
            <thead><tr><th>캠퍼스</th><th className="left">코스(견적 이름)</th>{CUR.map((c) => <th key={c}>{c}</th>)}<th>교재비 ₱</th></tr></thead>
            <tbody>
              {shown.courses.map((c, i) => (
                <tr key={c.id}>
                  <td>{CAMPUS[c.campus]}</td>
                  <td className="left">{c.id}{c.guarantee ? <span className="muted"> · 8주 고정</span> : null}</td>
                  {CUR.map((cur) => cell(`코스:${c.id}:${cur}`, c.price[cur], (n) => patch((d) => { d.courses[i].price[cur] = n; })))}
                  {cell(`코스:${c.id}:교재비`, c.textbookPhp, (n) => patch((d) => { d.courses[i].textbookPhp = n; }))}
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="qp-h">숙소 (4주 가격)</h3>
          <table className="tbl center qp">
            <thead><tr><th>캠퍼스</th><th className="left">숙소</th><th>방 분류</th>{CUR.map((c) => <th key={c}>{c}</th>)}</tr></thead>
            <tbody>
              {shown.dorms.map((r, i) => (
                <tr key={r.id}>
                  <td>{CAMPUS[r.campus]}</td>
                  <td className="left">{r.id}</td>
                  <td>{ROOM[r.room] ?? r.room}</td>
                  {CUR.map((cur) => cell(`숙소:${r.id}:${cur}`, r.price[cur], (n) => patch((d) => { d.dorms[i].price[cur] = n; })))}
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="qp-h">현지비용 (₱)</h3>
          <table className="tbl center qp">
            <thead><tr><th className="left">항목</th><th>금액 ₱</th></tr></thead>
            <tbody>
              {LOCAL.map(([k, label]) => (
                <tr key={k}><td className="left">{label}</td>{cell(`local.${k}`, shown.local[k] as number, (n) => patch((d) => { (d.local[k] as number) = n; }))}</tr>
              ))}
              {shown.local.visa.map((v, i) => (
                <tr key={`visa-${v.minWeeks}`}><td className="left">비자 연장 {v.minWeeks}주 이상</td>{cell(`local.visa`, v.php, (n) => patch((d) => { d.local.visa[i].php = n; }))}</tr>
              ))}
              {shown.pickups.map((p, i) => (
                <tr key={p.id}><td className="left">공항 픽업 · {p.label}</td>{cell(`공항 픽업:${p.id}:금액`, p.php, (n) => patch((d) => { d.pickups[i].php = n; }))}</tr>
              ))}
            </tbody>
          </table>

          <h3 className="qp-h">프로모션 표</h3>
          <table className="tbl center qp">
            <thead><tr><th className="left">이름(관리용)</th><th className="left">표시 이름(한국어)</th><th className="left">표시 이름(영어)</th><th>가격 체계</th><th className="left">기간·시작일</th>{CUR.map((c) => <th key={c}>{c}</th>)}<th>최소 주수</th><th>적용</th></tr></thead>
            <tbody>
              {shown.promotions.map((p, i) => (
                <tr key={p.id} className={changed.has(`프로모션:${p.id}:내용`) || changed.has(`프로모션:${p.id}:표시 이름`) ? 'chg-row' : ''}>
                  <td className="left">{p.name}{p.tag && <span className="muted"> · {p.tag}</span>}{p.note && <div className="muted" style={{ fontSize: 11 }}>{p.note}</div>}</td>
                  {(['ko', 'en'] as const).map((lang) => (
                    <td key={lang} className="left">
                      {editable ? (
                        <input
                          aria-label={`${p.name} 표시 이름(${lang === 'ko' ? '한국어' : '영어'})`}
                          value={promoName(p, p.id, lang)}
                          onChange={(e) => patch((d) => {
                            const row = d.promotions[i];
                            row.display = { ko: promoName(row, row.id, 'ko'), en: promoName(row, row.id, 'en'), ...(row.display?.ja ? { ja: row.display.ja } : {}), [lang]: e.target.value };
                          })}
                          style={{ width: '100%', minWidth: 150 }}
                        />
                      ) : (
                        <span className={p.display ? '' : 'muted'} title={p.display ? undefined : '이 버전에는 표시 이름이 없어 기본값으로 보입니다'}>{promoName(p, p.id, lang)}</span>
                      )}
                    </td>
                  ))}
                  <td>{p.systems.map((s) => `/${s}`).join(' ')}</td>
                  <td className="left" style={{ fontSize: 12 }}>
                    {editable && !p.startDates?.length && p.periods ? (
                      <input
                        aria-label={`${p.name} 기간`}
                        defaultValue={periodsText(p)}
                        onBlur={(e) => patch((d) => {
                          d.promotions[i].periods = e.target.value.split(',').map((x) => x.trim()).filter(Boolean).map((x) => x.split('~').map((y) => y.trim()) as [string, string]);
                        })}
                        style={{ width: '100%', minWidth: 200 }}
                      />
                    ) : periodsText(p) || '-'}
                  </td>
                  {CUR.map((cur) => (p.amount[cur] === undefined && !editable ? <td key={cur} className="muted">-</td> : cell(`프로모션:${p.id}:${cur}`, p.amount[cur], (n) => patch((d) => { d.promotions[i].amount[cur] = n; }))))}
                  <td>{p.minWeeks}주</td>
                  <td>{p.apply === 'auto' ? '자동' : '확인 후'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12, margin: '8px 0 0' }}>프로모션 규칙(종류·단위·대상 방)은 정정본 기준이고, 바꾸려면 기획 Change Log가 필요합니다. 여기서는 금액·기간과 표시 이름만 고칩니다. 표시 이름은 에이전시 견적 결과에 보이는 유학원용 이름이고(한국 지점은 한국어, 그 밖은 영어), 아래 작은 글씨로 계산 근거가 붙습니다. 일본어 이름은 견적 담당자 확인 뒤 넣습니다(그 전에는 영어).</p>
        </Panel>
      )}
    </>
  );
}
