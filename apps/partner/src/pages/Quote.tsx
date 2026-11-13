import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth';
import { useLoad } from '../data';
import { t } from '../i18n';
import { Box, Loading, PageHead } from '../ui';
import { basisLabel, type ActiveBook } from '../priceBook';
import { loadActiveBook } from '../tuition';
import {
  PRICE_BOOK_2026, pickupAllowed, pickupText, presentQuote, quote, systemForCountry,
  type Campus, type PriceBook, type PriceSystem,
} from '../../../../packages/quote/src';
import QuoteResultBlock from '../../../../packages/quote-view/QuoteResultBlock';
import StartDateCalendar from '../../../../packages/quote-view/StartDateCalendar';

/**
 * 견적(T-20, R-013 2단계, 11/12). 견적 사이트 대신 포털에서 계산한다(CL-065: 견적 사이트는 쓰지 않음).
 * 계산은 견적 계산 모듈(packages/quote, R-014) 하나 — 2차 학생등록·인보이스와 같은 금액(CL-076).
 * - 가격 체계는 지점 국가로 자동(CL-063). JIC 직원은 고를 수 있다
 * - 캠퍼스 탭: Challenger / Premium / 혼합(앞뒤로 이어 붙임, CL-062). 어기는 입력은 이유를 보이고 계산하지 않는다
 * - IELTS Guarantee는 8주 고정·마지막(CL-060), 공항 픽업 4가지(CL-064), 현지비용은 페소만 + 고정 문구(CL-059)
 * - 학생 정보는 저장하지 않고 화면·인쇄에만(원칙 P3). 견적서는 가견적: 유효기간·계좌·커미션 없음(CL-067)
 * - 가격은 관리자 포털 '가격표 › 견적 가격'의 승인 버전 중 적용 시작일이 지난 가장 최근 것(price_books, T-21·CL-066).
 *   못 읽으면(마이그레이션 전 등) 모듈의 기획 정정본 PRICE_BOOK_2026 으로 계산한다
 * - 결과는 견적 결과 블록 부품(packages/quote-view, 기획 '견적 수정 목록 1113' 견적-1~4): 2차 학생등록·인보이스도 같은 부품
 * - 캠퍼스 버튼에만 캠퍼스 색(견적-4). 화면 전체 강조색·배경은 바꾸지 않는다(useCampusTone 안 씀)
 * - 시작일은 직접 만든 달력(일요일만, BESA 픽업일 연한 회색), BESA 단체 픽업은 BESA 날만 고를 수 있다(견적-5)
 */

type Tab = Campus | 'mixed';
interface Row { id: string; weeks: number }

const peso = (n: number) => `₱${n.toLocaleString()}`;
const SYSTEMS: [PriceSystem, string][] = [
  ['kr', '/kr · 원(KRW) · 한국'],
  ['jp', '/jp · 엔(JPY) · 일본'],
  ['usd', '/usd · 달러 · 대만·중국·사우디'],
  ['usd-new', '/usd-new · 달러 · 그 밖의 국가(Global Scholar)'],
];
const TABS: [Tab, string][] = [['challenger', 'Challenger'], ['premium', 'Premium'], ['mixed', '혼합 (Challenger + Premium)']];
const WEEKS = Array.from({ length: 52 }, (_, i) => i + 1);
const tag = (campus: Campus) => (campus === 'challenger' ? '[CC] ' : '[PC] ');
/** 오늘 기준 가장 가까운 일요일(오늘이 일요일이면 오늘) */
function nearestSunday(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  return d.toISOString().slice(0, 10);
}

/** 탭의 기본 줄(코스 하나 + 숙소 하나, 같은 주수) */
function defaults(BOOK: PriceBook, tab: Tab, weeks: number, courseId?: string | null) {
  const campus: Campus = tab === 'mixed' ? 'challenger' : tab;
  const course = BOOK.courses.find((c) => c.id === courseId && (tab === 'mixed' || c.campus === tab)) ?? BOOK.courses.find((c) => c.campus === campus)!;
  const w = course.guarantee ? 8 : weeks;
  const dorm = BOOK.dorms.find((d) => d.campus === course.campus)!;
  return { courses: [{ id: course.id, weeks: w }], dorms: [{ id: dorm.id, weeks: w }] };
}

export default function Quote() {
  const { member } = useAuth();
  // 가격 버전을 읽은 뒤에 입력 칸을 만든다(읽는 동안 기본값으로 그렸다가 바뀌지 않게)
  const { data: loaded, loading } = useLoad(() => loadActiveBook().catch(() => null));
  if (loading) return <Loading />;
  return <QuoteForm active={loaded ?? null} member={member} />;
}

function QuoteForm({ active, member }: { active: ActiveBook | null; member: ReturnType<typeof useAuth>['member'] }) {
  const BOOK = active?.data ?? PRICE_BOOK_2026;
  const courseDef = (id: string) => BOOK.courses.find((c) => c.id === id);
  const dormDef = (id: string) => BOOK.dorms.find((d) => d.id === id);
  const [params] = useSearchParams();
  const fixed = member ? systemForCountry(member.country) : null;
  const [picked, setPicked] = useState<PriceSystem>('kr');
  const system = fixed ?? picked;

  // 상담 ④ '이 단계로 견적 보기'에서 넘긴 값(campus·course·weeks·agency, 학생 정보는 넘기지 않음)
  const pTab: Tab = params.get('campus') === 'premium' ? 'premium' : 'challenger';
  const pWeeks = Math.min(52, Math.max(1, Number(params.get('weeks')) || 12));
  const [tab, setTab] = useState<Tab>(pTab);
  const [rows, setRows] = useState(() => defaults(BOOK, pTab, pWeeks, params.get('course')));
  const [start, setStart] = useState(nearestSunday);
  const [pickup, setPickup] = useState('');
  const [student, setStudent] = useState({
    name: '', gender: '', birth: '',
    agency: member ? [member.agency_name, member.branch].filter(Boolean).join(' ') : (params.get('agency') ?? ''),
  });

  const courseOptions = BOOK.courses.filter((c) => tab === 'mixed' || c.campus === tab);
  const dormOptions = BOOK.dorms.filter((d) => tab === 'mixed' || d.campus === tab);
  const totalWeeks = rows.courses.reduce((a, r) => a + r.weeks, 0);
  const lastIsGuarantee = !!courseDef(rows.courses[rows.courses.length - 1]?.id)?.guarantee;

  // 숙소가 한 줄이면 코스 주수 합을 따라간다(같은 캠퍼스 탭)
  const withSync = (next: { courses: Row[]; dorms: Row[] }) =>
    next.dorms.length === 1 && tab !== 'mixed' ? { ...next, dorms: [{ ...next.dorms[0], weeks: next.courses.reduce((a, r) => a + r.weeks, 0) }] } : next;
  const setCourse = (i: number, patch: Partial<Row>) => {
    const courses = rows.courses.map((r, j) => (j === i ? { ...r, ...patch } : r));
    // IELTS Guarantee는 8주 고정(CL-060)
    if (courseDef(courses[i].id)?.guarantee) courses[i] = { ...courses[i], weeks: 8 };
    setRows(withSync({ ...rows, courses }));
  };
  const setDorm = (i: number, patch: Partial<Row>) => setRows({ ...rows, dorms: rows.dorms.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const addCourse = () => {
    const last = courseDef(rows.courses[rows.courses.length - 1].id)!;
    const next = tab === 'mixed' ? BOOK.courses.find((c) => c.campus !== last.campus && !c.guarantee)! : courseOptions.find((c) => !c.guarantee && c.id !== last.id) ?? courseOptions[0];
    setRows(withSync({ ...rows, courses: [...rows.courses, { id: next.id, weeks: 4 }] }));
  };
  const addDorm = () => {
    const last = dormDef(rows.dorms[rows.dorms.length - 1].id)!;
    const next = tab === 'mixed' ? BOOK.dorms.find((d) => d.campus !== last.campus)! : dormOptions[0];
    setRows({ ...rows, dorms: [...rows.dorms, { id: next.id, weeks: 4 }] });
  };
  const removeCourse = (i: number) => setRows(withSync({ ...rows, courses: rows.courses.filter((_, j) => j !== i) }));
  const removeDorm = (i: number) => setRows({ ...rows, dorms: rows.dorms.filter((_, j) => j !== i) });
  const changeTab = (next: Tab) => {
    setTab(next);
    if (next === 'mixed') {
      const c = BOOK.courses.find((x) => x.campus === 'challenger' && !x.guarantee)!;
      const p = BOOK.courses.find((x) => x.campus === 'premium')!;
      const cd = BOOK.dorms.find((x) => x.campus === 'challenger')!;
      const pd = BOOK.dorms.find((x) => x.campus === 'premium')!;
      setRows({ courses: [{ id: c.id, weeks: 8 }, { id: p.id, weeks: 4 }], dorms: [{ id: cd.id, weeks: 8 }, { id: pd.id, weeks: 4 }] });
    } else setRows(defaults(BOOK, next, Math.max(1, totalWeeks)));
  };

  // 시작일을 BESA 날이 아닌 날로 바꾸면 BESA 단체 픽업은 '신청 안 함'으로 돌아간다(견적-5)
  const changeStart = (day: string) => {
    setStart(day);
    const p = BOOK.pickups.find((x) => x.id === pickup);
    if (p && !pickupAllowed(p, day)) setPickup('');
  };

  const result = useMemo(
    () => quote({ system, start, courses: rows.courses, dorms: rows.dorms, pickup: pickup || null }, BOOK),
    [system, start, rows, pickup, BOOK],
  );
  const pickedPickup = BOOK.pickups.find((p) => p.id === pickup);
  const pickupLabel = pickedPickup ? pickupText(pickedPickup) : undefined;
  const label = (campus: Campus, id: string) => (tab === 'mixed' ? tag(campus) : '') + id;

  const rowEditor = (kind: 'course' | 'dorm') => {
    const list = kind === 'course' ? rows.courses : rows.dorms;
    return list.map((r, i) => {
      const def = kind === 'course' ? courseDef(r.id) : dormDef(r.id);
      const guarantee = kind === 'course' && !!courseDef(r.id)?.guarantee;
      const options = kind === 'course' ? courseOptions : dormOptions;
      return (
        <div key={`${kind}-${i}`} className="quote-row">
          <select aria-label={kind === 'course' ? `코스 ${i + 1}` : `숙소 ${i + 1}`} value={r.id} onChange={(e) => (kind === 'course' ? setCourse(i, { id: e.target.value }) : setDorm(i, { id: e.target.value }))}>
            {options.map((o) => <option key={o.id} value={o.id}>{label(o.campus, o.id)}</option>)}
          </select>
          <select aria-label={`${kind === 'course' ? '코스' : '숙소'} ${i + 1} 주수`} value={r.weeks} disabled={guarantee} onChange={(e) => (kind === 'course' ? setCourse(i, { weeks: +e.target.value }) : setDorm(i, { weeks: +e.target.value }))}>
            {WEEKS.map((w) => <option key={w} value={w}>{w}주</option>)}
          </select>
          {list.length > 1 && <button type="button" className="btn btn-sm" aria-label="이 줄 빼기" onClick={() => (kind === 'course' ? removeCourse(i) : removeDorm(i))}>×</button>}
          {guarantee && <span className="muted" style={{ fontSize: 12 }}>8주 고정 · 마지막 · 스파르타</span>}
          {!def && <span className="err">없는 항목</span>}
        </div>
      );
    });
  };

  return (
    <>
      <PageHead title={t('menu.quote')} side={<span className="muted" style={{ fontSize: 13 }}>가격 기준: {basisLabel(active)}</span>} />
      <div className="quote-grid">
        <div className="quote-form">
          <Box title="가격 체계">
            <div className="box-body form">
              {fixed ? (
                <p style={{ margin: 0 }}><strong>{SYSTEMS.find(([s]) => s === system)?.[1]}</strong> <span className="muted">· 지점 국가({member?.country ?? '미정'})로 정해집니다(CL-063)</span></p>
              ) : (
                <label className="quote-label">
                  JIC 직원은 가격 체계를 고릅니다
                  <select value={picked} onChange={(e) => setPicked(e.target.value as PriceSystem)}>
                    {SYSTEMS.map(([s, l]) => <option key={s} value={s}>{l}</option>)}
                  </select>
                </label>
              )}
            </div>
          </Box>
          <Box title="학생 · 기간">
            <div className="box-body form form-grid">
              <label>학생 이름<input value={student.name} onChange={(e) => setStudent({ ...student, name: e.target.value })} maxLength={60} /></label>
              <label>성별<select value={student.gender} onChange={(e) => setStudent({ ...student, gender: e.target.value })}><option value="">선택 안 함</option><option>남</option><option>여</option></select></label>
              <label>생년월일<input type="date" value={student.birth} onChange={(e) => setStudent({ ...student, birth: e.target.value })} /></label>
              <label>유학원 · 담당자<input value={student.agency} onChange={(e) => setStudent({ ...student, agency: e.target.value })} maxLength={80} /></label>
              <div className="field">
                <span id="quote-start-label">연수 시작일(일요일)</span>
                <StartDateCalendar labelledBy="quote-start-label" value={start} onChange={changeStart} />
              </div>
              <label>
                공항 픽업
                <select value={pickup} onChange={(e) => setPickup(e.target.value)}>
                  <option value="">신청 안 함</option>
                  {/* BESA 단체 픽업은 시작일이 BESA 날일 때만(견적-5). 목록에서 빼지 않고 흐리게 둔다 */}
                  {BOOK.pickups.map((p) => <option key={p.id} value={p.id} disabled={!pickupAllowed(p, start)}>{pickupText(p)} · {peso(p.php)}</option>)}
                </select>
              </label>
              <p className="hint" style={{ gridColumn: '1 / -1', margin: 0 }}>{t('common.notSaved')}. 이름·성별·생년월일·유학원은 인쇄할 때만 씁니다.</p>
            </div>
          </Box>
          <Box title="코스 · 숙소">
            <div className="box-body">
              <div role="tablist" aria-label="캠퍼스" className="campus-pick">
                {TABS.map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} className={`campus-btn ${k}`} onClick={() => changeTab(k)}>
                    <span className="dots" aria-hidden="true">
                      {(k === 'mixed' ? (['challenger', 'premium'] as const) : [k]).map((c) => <span key={c} className={`dot ${c}`} />)}
                    </span>
                    {l}
                  </button>
                ))}
              </div>
              <h3 className="quote-h">코스 <span className="muted">· 넣은 순서가 기간 순서, 합계 {totalWeeks}주</span></h3>
              {rowEditor('course')}
              <button type="button" className="btn btn-sm" onClick={addCourse} disabled={lastIsGuarantee} title={lastIsGuarantee ? 'IELTS Guarantee 뒤에는 코스를 넣을 수 없습니다' : undefined}>+ 코스</button>
              <h3 className="quote-h">숙소 <span className="muted">· 합계 {rows.dorms.reduce((a, r) => a + r.weeks, 0)}주</span></h3>
              {rowEditor('dorm')}
              <button type="button" className="btn btn-sm" onClick={addDorm}>+ 숙소</button>
              {tab === 'mixed' && <p className="hint" style={{ margin: '10px 0 0' }}>혼합은 캠퍼스 기간마다 코스와 숙소가 같은 캠퍼스, 캠퍼스마다 최소 4주, 앞뒤로 이어 붙입니다(CL-062).</p>}
            </div>
          </Box>
        </div>

        <div className="quote-result">
          {result.ok ? (
            <QuoteResultBlock
              view={presentQuote(result, BOOK)}
              actions={<button type="button" className="btn btn-sm no-print" onClick={() => window.print()}>인쇄·PDF</button>}
              top={
                // 인쇄용 요약(화면에서는 숨김). 학생 정보는 저장하지 않고 인쇄에만(P3)
                <div className="quote-print">
                  <h2>JIC English Academy · 견적{tab === 'mixed' ? ' (Challenger + Premium)' : ` (${TABS.find(([k]) => k === tab)?.[1]})`}</h2>
                  <table className="kv compact">
                    <tbody>
                      {[
                        ['견적일', new Date().toISOString().slice(0, 10)], ['유학원', student.agency], ['학생', student.name], ['성별', student.gender], ['생년월일', student.birth],
                        ['픽업', pickupLabel ?? '신청 안 함'],
                      ].filter(([, v]) => v).map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              }
              footnote="가견적입니다. 정식 견적서와 재발행은 학생 등록 때 만듭니다(유효기간·계좌 없음, CL-067)."
            />
          ) : (
            <Box title="견적">
              <div className="box-body">
                <div className="msg err" role="alert">
                  <strong>이대로는 등록할 수 없는 조합입니다.</strong>
                  <ul>{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                </div>
              </div>
            </Box>
          )}
        </div>
      </div>
    </>
  );
}
