import type { CourseDef, DormDef, PriceBook, PromoDisplay, PromoRow } from './types';

/**
 * 2026 가격(기획 '견적사이트 가격데이터 정정본 1112', 기준 순서: 정정 목록 → 정정본 → v88, CL-065).
 * 코스 이름은 견적 사이트 표기(CL-069). 관리자 포털 가격표(가격 수정 화면 T-21)가 생기면 이 자료를 그쪽에서 읽어 온다.
 * 가격은 모두 4주 단가이고 통화별로 따로 정한 값이다(환율 계산 아님).
 */
const c = (id: string, campus: CourseDef['campus'], KRW: number, USD: number, JPY: number, textbookPhp: number, extra: Partial<CourseDef> = {}): CourseDef => ({
  id, campus, price: { KRW, USD, JPY }, textbookPhp, ...extra,
});
const d = (id: string, campus: DormDef['campus'], room: DormDef['room'], KRW: number, USD: number, JPY: number): DormDef => ({ id, campus, room, price: { KRW, USD, JPY } });

export const COURSES_2026: CourseDef[] = [
  c('Speaking Starter', 'premium', 1030000, 800, 116000, 1500),
  c('Speaking Pro', 'premium', 1215000, 975, 141375, 1700),
  c('Speaking Master', 'premium', 1400000, 1150, 166750, 1900),
  c('ESL TEP 8', 'premium', 1030000, 800, 116000, 1500),
  c('ESL TEP 9', 'premium', 1130000, 900, 130500, 1600),
  c('ESL TEP 10', 'premium', 1230000, 1000, 145000, 1700),
  c('Active Senior 5', 'premium', 830000, 600, 87000, 1100),
  c('Active Senior 6', 'premium', 930000, 700, 101500, 1200),
  c('Working Holiday 8', 'premium', 1130000, 900, 130500, 1600),
  c('TOEIC', 'premium', 1130000, 900, 130500, 1600),
  c('Business Master 8', 'premium', 1400000, 1150, 166750, 1900),
  c('ESL Flex', 'challenger', 800000, 580, 84100, 1100),
  c('ESL Lite', 'challenger', 1000000, 760, 110200, 1500),
  c('ESL Core', 'challenger', 1120000, 860, 124700, 1600),
  c('ESL Standard', 'challenger', 1240000, 960, 139200, 1700),
  c('IELTS Lite', 'challenger', 1240000, 960, 139200, 1900),
  c('IELTS Core', 'challenger', 1320000, 1010, 146450, 1900),
  c('IELTS Standard', 'challenger', 1400000, 1060, 153700, 1900),
  c('IELTS Guarantee', 'challenger', 1400000, 1060, 153700, 1900, { guarantee: true }),
];

export const DORMS_2026: DormDef[] = [
  d('Room for 1 Balcony', 'premium', 'single', 1790000, 1450, 210250),
  d('Room for 1 No Balcony', 'premium', 'single', 1590000, 1250, 181250),
  d('Semi-Single', 'premium', 'semi', 1590000, 1250, 181250),
  d('Couple Room Balcony', 'premium', 'couple', 1290000, 1050, 152250),
  d('Room for 2 Balcony', 'premium', 'double', 1190000, 950, 137750),
  d('Room for 2 No Balcony', 'premium', 'double', 1090000, 850, 123250),
  d('Room for 4 Balcony', 'premium', 'quad', 890000, 750, 108750),
  d('Room for 4 No Balcony', 'premium', 'quad', 790000, 650, 94250),
  d('Room for 1 (studio)', 'challenger', 'single', 1590000, 1300, 188500),
  d('Room for 2 (studio)', 'challenger', 'double', 950000, 800, 116000),
  d('Room for 4 (loft)', 'challenger', 'quad', 890000, 750, 108750),
  d('Room for 4 (studio)', 'challenger', 'quad', 750000, 600, 87000),
];

const LEAN26: [string, string][] = [['2026-02-22', '2026-06-27'], ['2026-08-23', '2027-01-09']];
const LEAN27: [string, string][] = [['2027-02-21', '2027-06-26'], ['2027-08-22', '2028-01-08']];
const PEAK26: [string, string][] = [['2026-06-28', '2026-08-22']];
const PEAK27: [string, string][] = [['2027-06-27', '2027-08-21']];
const KR_USD: PromoRow['systems'] = ['kr', 'usd'];

/**
 * 프로모션 표(정정본 '프로모션' 시트, CL-061). 견적 계산은 이 표만 보고 적용한다.
 * IELTS Guarantee 공식 시험 50% 지원(2027)은 학비 할인이 아니라 넣지 않는다(공지 콘텐츠, T-34).
 */
// 화면 표시 이름(견적-2, 기획 '견적 수정 목록 1113' 2장). 관리용 name 과 따로. 일본어는 견적 담당자 확인 뒤(그 전에는 영어)
const LEAN: PromoDisplay = { ko: '린시즌 기숙사 할인', en: 'Lean Season Dorm Discount' };
const HOLIDAY: PromoDisplay = { ko: '홀리데이 프로모션', en: 'Holiday Promotion' };
const LONG: PromoDisplay = { ko: '장기등록 할인', en: 'Long-term Discount' };
const GS: PromoDisplay = { ko: 'Global Scholar 프로모션', en: 'Global Scholar Promotion' };
const PEAK: PromoDisplay = { ko: '피크시즌 추가요금', en: 'Peak Season Surcharge' };
const FAIR: PromoDisplay = { ko: 'Taiwan Fair Promotion', en: 'Taiwan Fair Promotion' };

export const PROMOTIONS_2026: PromoRow[] = [
  // 성수기 추가요금: 프로모션이 아니라 추가요금. 4주 미만도 날짜만 맞으면 적용, /usd-new도 2027은 $60(v88 오류 바로잡음)
  { id: 'peak26', name: "성수기 추가요금 '26", display: PEAK, tag: "Peak '26", kind: 'surcharge', systems: ['kr', 'usd', 'usd-new', 'jp'], periods: PEAK26, amount: { KRW: 50000, USD: 40, JPY: 5000 }, minWeeks: 0, apply: 'auto' },
  { id: 'peak27', name: "성수기 추가요금 '27", display: PEAK, tag: "Peak '27", kind: 'surcharge', systems: ['kr', 'usd', 'usd-new', 'jp'], periods: PEAK27, amount: { KRW: 80000, USD: 60, JPY: 8000 }, minWeeks: 0, apply: 'auto' },
  // 비수기(숙소 줄마다): 4주 기준 정액, 2주 단위(2주 = 절반). 일본은 비수기 없음
  { id: 'lean26_quad', name: "비수기 4인실 '26", display: LEAN, tag: "Lean '26", kind: 'room_lean', systems: KR_USD, periods: LEAN26, rooms: ['quad'], amount: { KRW: 150000, USD: 150 }, unitWeeks: 4, granularity: 2, minWeeks: 4, apply: 'auto' },
  { id: 'lean26_sd', name: "비수기 1·2인실 '26", display: LEAN, tag: "Lean '26", kind: 'room_lean', systems: KR_USD, periods: LEAN26, rooms: ['single', 'semi', 'double', 'couple'], amount: { KRW: 50000, USD: 50 }, unitWeeks: 4, granularity: 2, minWeeks: 4, apply: 'auto', note: '2026은 1인실 전체 포함' },
  { id: 'lean27_quad', name: "비수기 4인실 '27", display: LEAN, tag: "Lean '27", kind: 'room_lean', systems: KR_USD, periods: LEAN27, rooms: ['quad'], amount: { KRW: 100000, USD: 100 }, unitWeeks: 4, granularity: 2, minWeeks: 4, apply: 'auto' },
  { id: 'lean27_sd', name: "비수기 2인실·Semi·Couple '27", display: LEAN, tag: "Lean '27", kind: 'room_lean', systems: KR_USD, periods: LEAN27, rooms: ['semi', 'double', 'couple'], amount: { KRW: 50000, USD: 50 }, unitWeeks: 4, granularity: 2, minWeeks: 4, apply: 'auto', note: '2027은 1인실 모두 제외(2027 포스터)' },
  // 홀리데이: 시작일 + 총 4주 이상 + 대상 방 4주 이상, 1회 정액
  { id: 'holiday26', name: "홀리데이 '26", display: HOLIDAY, tag: "Holiday '26", kind: 'holiday', systems: ['kr', 'usd', 'jp'], startDates: ['2026-11-29', '2026-12-13', '2026-12-27', '2027-01-10'], rooms: ['double', 'quad', 'couple'], amount: { KRW: 200000, USD: 200, JPY: 30000 }, minWeeks: 4, minRoomWeeks: 4, apply: 'auto' },
  { id: 'holiday27', name: "홀리데이 '27", display: HOLIDAY, tag: "Holiday '27", kind: 'holiday', systems: ['kr', 'usd'], startDates: ['2027-11-28', '2027-12-12', '2027-12-26', '2028-01-09'], rooms: ['double', 'quad'], pendingRooms: ['couple'], amount: { KRW: 150000, USD: 150 }, minWeeks: 4, minRoomWeeks: 4, apply: 'auto', note: '커플룸 포함 여부는 11/13 담당자 미팅에서 확인(정정 목록 6장)' },
  // 장기등록: 12주부터, 2주마다 증가(24주 이후에도 계속)
  { id: 'long', name: '장기등록', display: LONG, kind: 'long_term', systems: ['kr', 'usd', 'jp'], amount: { KRW: 300000, USD: 300, JPY: 10000 }, step: { KRW: 50000, USD: 50, JPY: 5000 }, minWeeks: 12, apply: 'auto' },
  // Global Scholar(/usd-new만, 장기·비수기·홀리데이 대신): 26년 2주당, 27년 4주당. 26년 비수기 끝은 12/26(비수기 할인의 01/09와 다름, v88)
  { id: 'gs26_lean', name: "Global Scholar '26 Lean", display: GS, tag: "Lean '26", kind: 'stay_period', systems: ['usd-new'], periods: [['2026-02-22', '2026-06-27'], ['2026-08-23', '2026-12-26']], amount: { USD: 200 }, unitWeeks: 2, granularity: 2, minWeeks: 4, apply: 'auto' },
  { id: 'gs26_peak', name: "Global Scholar '26 Peak", display: GS, tag: "Peak '26", kind: 'stay_period', systems: ['usd-new'], periods: PEAK26, amount: { USD: 100 }, unitWeeks: 2, granularity: 2, minWeeks: 4, apply: 'auto' },
  { id: 'gs27_lean', name: "Global Scholar '27 Lean", display: GS, tag: "Lean '27", kind: 'stay_period', systems: ['usd-new'], periods: LEAN27, amount: { USD: 400 }, unitWeeks: 4, granularity: 4, minWeeks: 4, apply: 'auto' },
  { id: 'gs27_peak', name: "Global Scholar '27 Peak", display: GS, tag: "Peak '27", kind: 'stay_period', systems: ['usd-new'], periods: PEAK27, amount: { USD: 200 }, unitWeeks: 4, granularity: 4, minWeeks: 4, apply: 'auto' },
  // 대만 Fair promotion: 국가 담당자 요청 → 담당자 확인 후 적용(2차 인보이스, CL-076). 금액·중복 규칙은 확인 필요
  { id: 'fair_tw', name: 'Fair promotion(대만)', display: FAIR, kind: 'manual', systems: ['usd'], amount: {}, minWeeks: 0, apply: 'confirm', note: '학생 할인. 적용자·날짜·메모 기록. 다른 프로모션과의 중복은 확인 필요' },
];

export const PRICE_BOOK_2026: PriceBook = {
  version: '2026 · 기획 정정본 2026-11-12',
  registration: { KRW: 100000, USD: 100, JPY: 14500 },
  courses: COURSES_2026,
  dorms: DORMS_2026,
  local: {
    ssp: 7800,
    icard: 4500,
    studentId: 200,
    deposit: 3000,
    utilities: 3000,
    laundry: 1200,
    facility: 1000,
    visa: [{ minWeeks: 24, php: 23870 }, { minWeeks: 20, php: 19630 }, { minWeeks: 16, php: 15390 }, { minWeeks: 12, php: 11150 }, { minWeeks: 8, php: 4940 }],
    guarantee: 18000,
  },
  // 공항 픽업(CL-064): 견적 사이트 선택지 4개 그대로, 현지비용에 1회
  pickups: [
    // 표시 글자는 기획 '견적 수정 목록 1113' 5-1장 표기(공항 · 요일 · 단체 여부)
    { id: 'manila_besa', label: 'Manila NAIA · 일요일 (BESA 단체)', php: 3000, besa: true },
    { id: 'manila_solo', label: 'Manila NAIA · 그 밖의 날 1인', php: 13000 },
    { id: 'clark_besa', label: 'Clark CRK · 월요일 (BESA 단체)', php: 3000, besa: true },
    { id: 'clark_solo', label: 'Clark CRK · 그 밖의 날 1인', php: 8500 },
  ],
  promotions: PROMOTIONS_2026,
};
