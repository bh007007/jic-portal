import type { Campus, Currency, Line, PriceBook, PriceSystem, PromoRow, QuoteInput, QuoteResult } from './types';

/**
 * 견적 계산(R-014). 규칙 근거: 기획 '견적 정정 목록 1112' → '계산규칙 정정본 1112' → v88 순서(CL-065).
 * - 기간 가격: 4주 단가 ÷ 4 × 주수. 총 연수가 4주 미만이면 1·2·3주 = 4주 단가의 40·65·85%. 줄마다 반올림(.5 올림, CL-058)
 * - 총 학비 = 등록금 + 코스 + 숙소 + 성수기 추가요금 − 할인(비수기·홀리데이·장기, /usd-new는 Global Scholar). 0 미만 없음
 * - 현지비용은 페소로만(환산 없음, CL-059), 공항 픽업은 현지비용에 1회(CL-064). 자유 입력 할인 없음(CL-076)
 * - 혼합 등록·IELTS Guarantee 입력 검사(CL-060·062)
 */

export const SYSTEM_CURRENCY: Record<PriceSystem, Currency> = { kr: 'KRW', usd: 'USD', 'usd-new': 'USD', jp: 'JPY' };
const USD_COUNTRIES = ['대만', '중국', '사우디아라비아'];

/** 지점 국가 → 가격 체계(CL-063): 한국 /kr, 일본 /jp, 대만·중국·사우디 /usd, 그 밖의 모든 국가 /usd-new */
export function systemForCountry(country?: string | null): PriceSystem {
  if (country === '한국') return 'kr';
  if (country === '일본') return 'jp';
  if (country && USD_COUNTRIES.includes(country)) return 'usd';
  return 'usd-new';
}

/** 현지비용 아래 고정 문구(CL-059, 견적 사이트 문구) */
export const LOCAL_FEE_NOTICE: Record<PriceSystem, string> = {
  kr: '※ 상기 현지 비용은 필리핀 이민국의 정책 변경, 인상 및 환율 변동 등에 따라 실제 납부 금액이 달라질 수 있습니다.',
  usd: '※ Local fees are subject to change due to Philippine immigration policy changes, rate adjustments, and exchange rate fluctuations.',
  'usd-new': '※ Local fees are subject to change due to Philippine immigration policy changes, rate adjustments, and exchange rate fluctuations.',
  jp: '※ 現地費用はフィリピン移民局の政策変更・料金改定・為替変動により変更される場合があります。',
};

const CAMPUS_NAME: Record<Campus, string> = { premium: 'Premium', challenger: 'Challenger' };
const SHORT_RATE: Record<number, number> = { 1: 0.4, 2: 0.65, 3: 0.85 };
const DAY = 86400000;

function parseDay(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '');
  if (!m) return NaN;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  return new Date(t).toISOString().slice(0, 10) === s ? t : NaN;
}
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
const inPeriods = (day: string, periods: [string, string][] = []) => periods.some(([a, b]) => day >= a && day <= b);
/** offset 주째부터 count 주 동안 각 주의 날짜(시작일 + 7일 × i) */
const weekDays = (start: number, offset: number, count: number) => Array.from({ length: count }, (_, i) => ymd(start + (offset + i) * 7 * DAY));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const isWeeks = (w: number) => Number.isInteger(w) && w >= 1;

/** 같은 캠퍼스가 이어진 구간으로 묶는다(예: [Challenger 8주, Premium 4주]) */
function blocks(rows: { campus: Campus; weeks: number }[]) {
  const out: { campus: Campus; weeks: number }[] = [];
  for (const r of rows) {
    const last = out[out.length - 1];
    if (last && last.campus === r.campus) last.weeks += r.weeks;
    else out.push({ campus: r.campus, weeks: r.weeks });
  }
  return out;
}
const blockText = (bs: { campus: Campus; weeks: number }[]) => bs.map((b) => `${CAMPUS_NAME[b.campus]} ${b.weeks}주`).join(' → ');

/** 입력 검사. 어기면 계산하지 않고 이유를 돌려준다(CL-060·062: 실제 등록할 수 없는 견적을 만들지 않게) */
export function validate(input: QuoteInput, book: PriceBook): string[] {
  const e: string[] = [];
  if (!SYSTEM_CURRENCY[input.system]) e.push('가격 체계를 알 수 없습니다.');
  const start = parseDay(input.start);
  if (Number.isNaN(start)) e.push('시작일을 YYYY-MM-DD로 넣어 주세요.');
  else if (new Date(start).getUTCDay() !== 0) e.push('시작일은 일요일이어야 합니다.');
  if (!input.courses?.length) e.push('코스를 하나 이상 고르세요.');
  if (!input.dorms?.length) e.push('숙소를 하나 이상 고르세요.');
  if ([...(input.courses ?? []), ...(input.dorms ?? [])].some((r) => !isWeeks(r.weeks))) e.push('주수는 1 이상의 정수로 넣어 주세요.');
  const courses = (input.courses ?? []).map((r) => ({ ...r, def: book.courses.find((x) => x.id === r.id) }));
  const dorms = (input.dorms ?? []).map((r) => ({ ...r, def: book.dorms.find((x) => x.id === r.id) }));
  for (const r of courses) if (!r.def) e.push(`없는 코스입니다: ${r.id}`);
  for (const r of dorms) if (!r.def) e.push(`없는 숙소입니다: ${r.id}`);
  if (input.pickup && !book.pickups.some((p) => p.id === input.pickup)) e.push(`없는 공항 픽업입니다: ${input.pickup}`);
  if (e.length) return e;

  const cw = sum(courses.map((r) => r.weeks));
  const dw = sum(dorms.map((r) => r.weeks));
  if (cw !== dw) e.push(`숙소 주수 합(${dw}주)이 코스 주수 합(${cw}주)과 같아야 합니다.`);

  // IELTS Guarantee: 8주 고정, 한 번, 항상 마지막(CL-060)
  const gIdx = courses.flatMap((r, i) => (r.def!.guarantee ? [i] : []));
  if (gIdx.length > 1) e.push('IELTS Guarantee는 한 번만 넣을 수 있습니다.');
  for (const i of gIdx) {
    if (courses[i].weeks !== 8) e.push('IELTS Guarantee는 8주 고정입니다.');
    if (i !== courses.length - 1) e.push('IELTS Guarantee는 항상 마지막 코스입니다. 뒤에 코스를 넣을 수 없습니다.');
  }

  // 혼합 등록(CL-062): 캠퍼스 기간마다 코스와 숙소가 같은 캠퍼스, 캠퍼스 기간은 이어 붙임, 캠퍼스마다 최소 4주
  const cb = blocks(courses.map((r) => ({ campus: r.def!.campus, weeks: r.weeks })));
  const db = blocks(dorms.map((r) => ({ campus: r.def!.campus, weeks: r.weeks })));
  for (const [what, bs] of [['코스', cb], ['숙소', db]] as const) {
    const seen = new Set<Campus>();
    for (const b of bs) {
      if (seen.has(b.campus)) e.push(`${what}의 ${CAMPUS_NAME[b.campus]} 기간이 나뉘어 있습니다. 캠퍼스 기간은 앞뒤로 이어 붙여야 합니다.`);
      seen.add(b.campus);
    }
    if (bs.length > 1) for (const b of bs) if (b.weeks < 4) e.push(`혼합 등록은 캠퍼스마다 ${what} 최소 4주입니다(${CAMPUS_NAME[b.campus]} ${b.weeks}주).`);
  }
  if (blockText(cb) !== blockText(db)) e.push(`캠퍼스 기간마다 코스와 숙소가 같은 캠퍼스여야 합니다(코스 ${blockText(cb)} / 숙소 ${blockText(db)}).`);
  return e;
}

/** 견적 계산. 입력이 규칙을 어기면 { ok: false, errors } */
export function quote(input: QuoteInput, book: PriceBook): QuoteResult {
  const errors = validate(input, book);
  if (errors.length) return { ok: false, errors };
  const cur = SYSTEM_CURRENCY[input.system];
  const start = parseDay(input.start);
  const courses = input.courses.map((r) => ({ ...r, def: book.courses.find((x) => x.id === r.id)! }));
  const dorms = input.dorms.map((r) => ({ ...r, def: book.dorms.find((x) => x.id === r.id)! }));
  const W = sum(courses.map((r) => r.weeks));
  const rowPrice = (base: number, w: number) => Math.round(W < 4 ? base * SHORT_RATE[w] : (base / 4) * w);
  const mixed = blocks(courses.map((r) => ({ campus: r.def.campus, weeks: r.weeks }))).length > 1;
  const name = (campus: Campus, id: string) => (mixed ? `[${campus === 'challenger' ? 'CC' : 'PC'}] ${id}` : id);

  const charges: Line[] = [{ key: 'registration', label: '등록금', amount: book.registration[cur] }];
  for (const r of courses) charges.push({ key: `course:${r.id}`, label: `${name(r.def.campus, r.id)} (${r.weeks}주)`, amount: rowPrice(r.def.price[cur], r.weeks) });
  for (const r of dorms) charges.push({ key: `dorm:${r.id}`, label: `${name(r.def.campus, r.id)} (${r.weeks}주)`, amount: rowPrice(r.def.price[cur], r.weeks) });

  const discounts: Line[] = [];
  const pending: string[] = [];
  const stayDays = weekDays(start, 0, W);
  const promos = book.promotions.filter((p) => p.systems.includes(input.system));
  const amt = (p: PromoRow) => p.amount[cur];
  const units = (p: PromoRow, weeks: number) => (Math.floor(weeks / (p.granularity ?? 1)) * (p.granularity ?? 1)) / (p.unitWeeks ?? 1);

  for (const p of promos.filter((x) => x.apply === 'auto')) {
    const a = amt(p);
    if (a == null) continue;
    if (p.kind === 'surcharge') {
      const n = stayDays.filter((dd) => inPeriods(dd, p.periods)).length;
      if (n) charges.push({ key: p.id, label: `${p.name} (${n}주)`, amount: n * a });
      continue;
    }
    if (W < p.minWeeks) continue;
    if (p.kind === 'room_lean') {
      let offset = 0;
      for (const r of dorms) {
        const n = weekDays(start, offset, r.weeks).filter((dd) => inPeriods(dd, p.periods)).length;
        offset += r.weeks;
        const u = units(p, n);
        if (u > 0 && p.rooms?.includes(r.def.room)) discounts.push({ key: `${p.id}:${r.id}`, label: `${p.name} · ${name(r.def.campus, r.id)}`, amount: u * a, detail: `비수기 ${n}주 → ${u}회 × ${a.toLocaleString()}` });
      }
    } else if (p.kind === 'stay_period') {
      const n = stayDays.filter((dd) => inPeriods(dd, p.periods)).length;
      const u = units(p, n);
      if (u > 0) discounts.push({ key: p.id, label: p.name, amount: u * a, detail: `${n}주 → ${u}회 × ${a.toLocaleString()}` });
    } else if (p.kind === 'holiday') {
      if (!p.startDates?.includes(input.start)) continue;
      const roomWeeks = (rooms: string[] = []) => sum(dorms.filter((r) => rooms.includes(r.def.room)).map((r) => r.weeks));
      const sure = roomWeeks(p.rooms);
      const maybe = roomWeeks(p.pendingRooms);
      const need = p.minRoomWeeks ?? 0;
      if (sure >= need) discounts.push({ key: p.id, label: p.name, amount: a, detail: `시작 ${input.start}, 대상 방 ${sure}주` });
      else if (sure + maybe >= need) pending.push(`${p.name}: ${p.note ?? '대상 방 확인 필요'}`);
    } else if (p.kind === 'long_term') {
      const v = a + Math.floor((W - p.minWeeks) / 2) * (p.step?.[cur] ?? 0);
      discounts.push({ key: p.id, label: `${p.name} (${W}주)`, amount: v });
    }
  }
  // 확인 후 적용(2차): 담당자가 확인한 줄만 그대로 넣는다(적용자·날짜·메모)
  for (const c of input.confirmed ?? []) {
    const p = promos.find((x) => x.id === c.id && x.apply === 'confirm');
    if (p && c.amount > 0) discounts.push({ key: p.id, label: p.name, amount: Math.round(c.amount), detail: `${c.by} · ${c.on}${c.memo ? ` · ${c.memo}` : ''}` });
  }

  const subtotal = sum(charges.map((l) => l.amount));
  const discountTotal = sum(discounts.map((l) => l.amount));

  // 현지비용(₱)
  const L = book.local;
  const billingW = Math.ceil(W / 2) * 2;
  const local: Line[] = [
    { key: 'ssp', label: W >= 25 ? 'SSP × 2' : 'SSP', amount: L.ssp * (W >= 25 ? 2 : 1) },
    { key: 'icard', label: W >= 53 ? 'SSP I-Card × 2' : 'SSP I-Card', amount: L.icard * (W >= 53 ? 2 : 1) },
    { key: 'student_id', label: '학생증', amount: L.studentId },
    { key: 'deposit', label: '기숙사 보증금(환불)', amount: L.deposit },
    { key: 'utilities', label: `전기·수도 (${billingW}주 기준)`, amount: Math.round((L.utilities * billingW) / 4) },
    { key: 'laundry', label: `세탁 (${billingW}주 기준)`, amount: Math.round((L.laundry * billingW) / 4) },
    { key: 'facility', label: `시설관리비 (${billingW}주 기준)`, amount: Math.round((L.facility * billingW) / 4) },
  ];
  const visa = [...L.visa].sort((a, b) => b.minWeeks - a.minWeeks).find((v) => W >= v.minWeeks);
  if (visa) local.push({ key: 'visa', label: `비자 연장 (${visa.minWeeks}주 이상)`, amount: visa.php });
  for (const r of courses) {
    const bw = Math.ceil(r.weeks / 2) * 2;
    local.push({ key: `textbook:${r.id}`, label: `교재비 · ${name(r.def.campus, r.id)} (${bw}주 기준)`, amount: Math.round((r.def.textbookPhp * bw) / 4) });
  }
  if (courses.some((r) => r.def.guarantee)) local.push({ key: 'guarantee', label: 'IELTS Guarantee (8주)', amount: L.guarantee });
  const pickup = book.pickups.find((p) => p.id === input.pickup);
  if (pickup) local.push({ key: `pickup:${pickup.id}`, label: `공항 픽업 · ${pickup.label}`, amount: pickup.php });

  return {
    ok: true,
    system: input.system,
    currency: cur,
    weeks: W,
    start: input.start,
    end: ymd(start + (W * 7 - 1) * DAY),
    mixed,
    charges,
    discounts,
    subtotal,
    discountTotal,
    total: Math.max(0, subtotal - discountTotal),
    local,
    localTotal: sum(local.map((l) => l.amount)),
    pending,
  };
}
