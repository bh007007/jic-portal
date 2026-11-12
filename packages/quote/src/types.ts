/**
 * 견적 계산 모듈의 자료형(R-014, CL-058~068·076). 1차 상담 ⑤ 견적과 2차 학생등록·인보이스가 같은 모듈을 쓴다.
 * 가격·프로모션은 자료(PriceBook·PromoRow)로 받고, 계산 규칙만 코드에 둔다. 화면·DB에 기대지 않는다.
 */

/** 가격 체계(견적 사이트 주소와 같음). 지점 국가로 자동 선택(CL-063) */
export type PriceSystem = 'kr' | 'usd' | 'usd-new' | 'jp';
export type Currency = 'KRW' | 'USD' | 'JPY';
export type Campus = 'premium' | 'challenger';
/** 방 분류: 프로모션 대상 판단용(1인실은 발코니·스튜디오 구분 없이 single) */
export type RoomClass = 'single' | 'semi' | 'double' | 'couple' | 'quad';
export type Money = Partial<Record<Currency, number>>;

export interface CourseDef {
  id: string; // 견적 사이트 표기 = 화면 이름(CL-069)
  campus: Campus;
  price: Record<Currency, number>; // 4주 단가
  textbookPhp: number; // 교재비 4주 단가(₱)
  /** IELTS Guarantee: 8주 고정, 복합 연수면 항상 마지막, 현지비용 ₱18,000(CL-060) */
  guarantee?: boolean;
}
export interface DormDef {
  id: string;
  campus: Campus;
  room: RoomClass;
  price: Record<Currency, number>; // 4주 단가
}
export interface PickupDef { id: string; label: string; php: number }

export interface LocalFees {
  ssp: number; // 24주 이하 1회, 25주 이상 2회
  icard: number; // 52주 이하 1회, 53주 이상 2회
  studentId: number;
  deposit: number;
  /** 4주 금액. 2주 단위 올림 주수(billingW)로 나눠 계산 */
  utilities: number;
  laundry: number;
  facility: number;
  /** 비자 연장비: 등록 주수가 minWeeks 이상인 가장 높은 단계 1회 */
  visa: { minWeeks: number; php: number }[];
  guarantee: number;
}

export interface PriceBook {
  version: string; // 예: '2026-11-12 정정본'
  registration: Record<Currency, number>;
  courses: CourseDef[];
  dorms: DormDef[];
  local: LocalFees;
  pickups: PickupDef[];
  promotions: PromoRow[];
}

/**
 * 프로모션 표 한 줄(R-014: 국가 묶음·기간·대상 방·금액·적용 단위·최소 주수·자동/확인 후 적용).
 * - room_lean: 숙소 줄마다 기간에 든 주를 센다(비수기). 금액은 unitWeeks 기준, granularity 주 단위로 적용(2주 = 절반)
 * - stay_period: 연수 전체 주 중 기간에 든 주를 센다(Global Scholar)
 * - surcharge: 기간에 든 주마다 더한다(성수기, 주수 무관)
 * - holiday: 시작일이 startDates 중 하나이고 대상 방 주수 합이 minRoomWeeks 이상이면 1회
 * - long_term: 총 주수 minWeeks 이상이면 amount + floor((주수 - minWeeks) / 2) × step
 * - manual: 담당자가 확인 후 적용(대만 Fair promotion, 2차). 자동 계산하지 않는다
 */
export type PromoKind = 'room_lean' | 'stay_period' | 'surcharge' | 'holiday' | 'long_term' | 'manual';
export interface PromoRow {
  id: string;
  name: string;
  kind: PromoKind;
  systems: PriceSystem[];
  /** 기간(YYYY-MM-DD, 양 끝 포함). 주는 시작일부터 7일마다의 날짜로 판단 */
  periods?: [string, string][];
  startDates?: string[];
  rooms?: RoomClass[];
  amount: Money;
  step?: Money;
  unitWeeks?: number;
  granularity?: number;
  /** 총 연수 주수가 이보다 작으면 적용 안 함(할인 4주, 장기 12주, 성수기 0) */
  minWeeks: number;
  minRoomWeeks?: number;
  apply: 'auto' | 'confirm';
  /** 정해지지 않은 부분: 이 방 분류가 결과를 바꾸면 할인하지 않고 '확인 필요'로 남긴다(2027 홀리데이 커플룸) */
  pendingRooms?: RoomClass[];
  note?: string;
}

export interface QuoteInput {
  system: PriceSystem;
  /** 연수 시작일(일요일, YYYY-MM-DD) */
  start: string;
  /** 넣은 순서 = 기간 순서. 복합 연수는 캠퍼스 기간이 앞뒤로 이어진다 */
  courses: { id: string; weeks: number }[];
  dorms: { id: string; weeks: number }[];
  pickup?: string | null;
  /** 확인 후 적용 프로모션(2차): 담당자가 확인한 것만 */
  confirmed?: { id: string; amount: number; by: string; on: string; memo?: string }[];
}

export interface Line { key: string; label: string; amount: number; detail?: string }
export interface QuoteOk {
  ok: true;
  system: PriceSystem;
  currency: Currency;
  weeks: number;
  start: string;
  end: string;
  mixed: boolean;
  /** 등록금·코스·숙소·성수기(더하는 줄) */
  charges: Line[];
  /** 할인 줄(양수 금액) */
  discounts: Line[];
  subtotal: number;
  discountTotal: number;
  total: number;
  /** 현지비용(₱, 환산 없음, CL-059) */
  local: Line[];
  localTotal: number;
  /** 정해지지 않아 계산하지 않은 것(확인 필요) */
  pending: string[];
}
export interface QuoteErr { ok: false; errors: string[] }
export type QuoteResult = QuoteOk | QuoteErr;
