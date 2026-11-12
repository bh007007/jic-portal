import type { Currency, PriceBook, PriceSystem, PromoKind, RoomClass } from './types';

/**
 * 가격 버전 검사·비교(T-21, 관리자 포털 '가격표 › 견적 가격'). 승인 요청 전에 빠진 칸·잘못된 값을 막고,
 * 승인하는 사람(CL-066)에게 기준 버전과 달라진 칸만 보여 준다.
 */

const CURRENCIES: Currency[] = ['KRW', 'USD', 'JPY'];
const SYSTEMS: PriceSystem[] = ['kr', 'usd', 'usd-new', 'jp'];
const ROOMS: RoomClass[] = ['single', 'semi', 'double', 'couple', 'quad'];
const KINDS: PromoKind[] = ['room_lean', 'stay_period', 'surcharge', 'holiday', 'long_term', 'manual'];
const isDay = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const pos = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0;
const nonneg = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** 가격 버전이 계산에 쓸 수 있는 모양인지. 문제가 없으면 빈 배열 */
export function validateBook(b: PriceBook): string[] {
  const e: string[] = [];
  if (!b || typeof b !== 'object') return ['가격 자료가 없습니다.'];
  for (const c of CURRENCIES) if (!pos(b.registration?.[c])) e.push(`등록금 ${c}를 넣어 주세요.`);
  const ids = (xs: { id: string }[] | undefined, what: string) => {
    const seen = new Set<string>();
    for (const x of xs ?? []) {
      if (!x.id?.trim()) e.push(`${what} 이름이 빈 줄이 있습니다.`);
      else if (seen.has(x.id)) e.push(`${what} 이름이 겹칩니다: ${x.id}`);
      seen.add(x.id);
    }
  };
  if (!b.courses?.length) e.push('코스가 없습니다.');
  if (!b.dorms?.length) e.push('숙소가 없습니다.');
  ids(b.courses, '코스');
  ids(b.dorms, '숙소');
  for (const c of b.courses ?? []) {
    if (c.campus !== 'premium' && c.campus !== 'challenger') e.push(`코스 ${c.id}: 캠퍼스를 고르세요.`);
    for (const cur of CURRENCIES) if (!pos(c.price?.[cur])) e.push(`코스 ${c.id}: ${cur} 4주 가격을 넣어 주세요.`);
    if (!nonneg(c.textbookPhp)) e.push(`코스 ${c.id}: 교재비(₱)를 넣어 주세요.`);
  }
  for (const d of b.dorms ?? []) {
    if (d.campus !== 'premium' && d.campus !== 'challenger') e.push(`숙소 ${d.id}: 캠퍼스를 고르세요.`);
    if (!ROOMS.includes(d.room)) e.push(`숙소 ${d.id}: 방 분류를 고르세요.`);
    for (const cur of CURRENCIES) if (!pos(d.price?.[cur])) e.push(`숙소 ${d.id}: ${cur} 4주 가격을 넣어 주세요.`);
  }
  const L = b.local;
  for (const k of ['ssp', 'icard', 'studentId', 'deposit', 'utilities', 'laundry', 'facility', 'guarantee'] as const) if (!nonneg(L?.[k])) e.push(`현지비용 ${k}를 넣어 주세요.`);
  for (const v of L?.visa ?? []) if (!Number.isInteger(v.minWeeks) || v.minWeeks < 1 || !nonneg(v.php)) e.push('비자 연장비 단계(주수·금액)를 확인하세요.');
  ids(b.pickups, '공항 픽업');
  for (const p of b.pickups ?? []) if (!nonneg(p.php)) e.push(`공항 픽업 ${p.id}: 금액(₱)을 넣어 주세요.`);
  ids(b.promotions, '프로모션');
  for (const p of b.promotions ?? []) {
    if (!KINDS.includes(p.kind)) e.push(`프로모션 ${p.id}: 종류가 잘못되었습니다.`);
    if (!p.systems?.length || p.systems.some((s) => !SYSTEMS.includes(s))) e.push(`프로모션 ${p.id}: 적용 가격 체계를 확인하세요.`);
    for (const [a, z] of p.periods ?? []) if (!isDay(a) || !isDay(z) || a > z) e.push(`프로모션 ${p.id}: 기간 ${a} ~ ${z}을 확인하세요.`);
    for (const s of p.startDates ?? []) if (!isDay(s)) e.push(`프로모션 ${p.id}: 시작일 ${s}을 확인하세요.`);
    for (const v of Object.values(p.amount ?? {})) if (!nonneg(v)) e.push(`프로모션 ${p.id}: 금액을 확인하세요.`);
    if (!Number.isInteger(p.minWeeks) || p.minWeeks < 0) e.push(`프로모션 ${p.id}: 최소 주수를 확인하세요.`);
    if ((p.kind === 'room_lean' || p.kind === 'stay_period' || p.kind === 'surcharge') && !p.periods?.length) e.push(`프로모션 ${p.id}: 기간이 없습니다.`);
    if (p.kind === 'holiday' && !p.startDates?.length) e.push(`프로모션 ${p.id}: 시작일이 없습니다.`);
  }
  return [...new Set(e)];
}

export interface BookChange { key: string; label: string; before: string; after: string }

/** 두 가격 버전에서 달라진 칸(기준 → 이번). 승인 화면에서 바뀐 칸만 본다 */
export function diffBooks(base: PriceBook, next: PriceBook): BookChange[] {
  const out: BookChange[] = [];
  const s = (v: unknown) => (v === undefined || v === null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  const push = (key: string, label: string, a: unknown, b: unknown) => {
    if (s(a) !== s(b)) out.push({ key, label, before: s(a), after: s(b) });
  };
  for (const c of CURRENCIES) push(`registration.${c}`, `등록금 ${c}`, base.registration?.[c], next.registration?.[c]);
  const rows = <T extends { id: string }>(what: string, a: T[] = [], b: T[] = [], fields: [string, (x: T) => unknown][]) => {
    for (const x of b) {
      const y = a.find((z) => z.id === x.id);
      if (!y) out.push({ key: `${what}:${x.id}`, label: `${what} 추가 · ${x.id}`, before: '', after: s(x) });
      else for (const [f, get] of fields) push(`${what}:${x.id}:${f}`, `${what} ${x.id} · ${f}`, get(y), get(x));
    }
    for (const y of a) if (!b.some((z) => z.id === y.id)) out.push({ key: `${what}:${y.id}`, label: `${what} 삭제 · ${y.id}`, before: s(y), after: '' });
  };
  rows('코스', base.courses, next.courses, [['캠퍼스', (x) => x.campus], ...CURRENCIES.map((c): [string, (x: (typeof next.courses)[number]) => unknown] => [c, (x) => x.price?.[c]]), ['교재비', (x) => x.textbookPhp]]);
  rows('숙소', base.dorms, next.dorms, [['캠퍼스', (x) => x.campus], ['방 분류', (x) => x.room], ...CURRENCIES.map((c): [string, (x: (typeof next.dorms)[number]) => unknown] => [c, (x) => x.price?.[c]])]);
  for (const k of Object.keys({ ...base.local, ...next.local }) as (keyof PriceBook['local'])[]) push(`local.${k}`, `현지비용 ${k}`, base.local?.[k], next.local?.[k]);
  rows('공항 픽업', base.pickups, next.pickups, [['이름', (x) => x.label], ['금액', (x) => x.php]]);
  rows('프로모션', base.promotions, next.promotions, [['내용', (x) => x]]);
  return out;
}
