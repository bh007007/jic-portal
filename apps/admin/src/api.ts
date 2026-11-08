import { useEffect, useState } from 'react';
import { authHeaders, supabase } from './supabase';

export type Status = 'current' | 'upcoming' | 'graduated' | 'cancelled' | 'other';

export interface EnrollmentRow {
  trId: string;
  stId: string;
  name: string;
  nation: string;
  gender: string;
  campus: string;
  course: string;
  dorm: string;
  start: string;
  end: string;
  weeks: number;
  agency: string;
  branch: string;
  pay: string;
  batch: string;
  state: string;
  status: Status;
  note: string;
}

export interface NameCount {
  name: string;
  count: number;
}

export interface Dashboard {
  refDate: string;
  current: { total: number; byCampus: NameCount[] };
  batches: { batch: string; date: string; count: number }[];
  graduating: { total: number; until: string; notCleared: number };
  pickup: { batches: { batch: string; date: string; count: number }[]; arrivals: number; missing: number; besa: number };
  nations: NameCount[];
  agencies: number;
  agents: number;
  sync: { extractedAt: string | null; counts: Record<string, number> };
}

export interface EnrollmentList {
  refDate: string;
  tab: string;
  tabCounts: { current: number; upcoming: number; graduated: number; all: number };
  total: number;
  page: number;
  pages: number;
  size: number;
  facets: { nations: string[]; batches: string[]; campuses: string[] };
  rows: EnrollmentRow[];
}

export interface StudentDetail {
  refDate: string;
  student: {
    stId: string;
    name: string;
    lastName: string;
    firstName: string;
    birthday: string;
    age: number | null;
    gender: string;
    nation: string;
    email: string;
    cell: string;
    lang: string;
    vip: string;
  };
  enrollments: (EnrollmentRow & {
    pickType: string;
    pickPlace: string;
    roomClear: boolean;
    pointClear: boolean;
    invoice: { currency: string; paid: number; pointIn: number; pointOut: number; pointBalance: number } | null;
    dormStay: { type: string; campus: string; from: string; to: string; weeks: number } | null;
    memos: { kind: string; text: string }[];
    /** 업체 포인트 내역(충전·현지 비용 사용). 원장이 없는 환경에서는 빈 배열 */
    points: { dt: string; kind: string; item: string; amount: number; staff: string; memo: string }[];
  })[];
}

export interface DormStay {
  trId: string;
  stId: string;
  name: string;
  nation: string;
  gender: string;
  campus: string;
  type: string;
  from: string;
  to: string;
}

export interface DormOverview {
  refDate: string;
  until: string;
  campus: string;
  campuses: string[];
  totals: { staying: number; arriving: number; leaving: number };
  types: { type: string; staying: number; female: number; male: number; arriving: number; leaving: number }[];
  arriving: DormStay[];
  leaving: DormStay[];
}

export interface Paged<T> {
  refDate: string;
  total: number;
  page: number;
  pages: number;
  size: number;
  rows: T[];
}

export interface AgencyRow {
  agId: string;
  name: string;
  nameEn: string;
  country: string;
  demo: boolean;
  agents: number;
  registered: string;
  current: number;
  upcoming: number;
  total: number;
  lastStart: string;
}

export interface AgentRow {
  amId: string;
  agId: string;
  agency: string;
  country: string;
  name: string;
  branch: string;
  loginId: string;
  lang: string;
  main: boolean;
  active: boolean;
  invoice: boolean;
  email: string;
  current: number;
  upcoming: number;
  total: number;
  lastStart: string;
}

export interface AgencyList extends Paged<AgencyRow> {
  facets: { countries: string[] };
  totals: { agencies: number; withCurrent: number };
}

export interface AgentList extends Paged<AgentRow> {
  facets: { countries: string[] };
}

export interface AgencyDetail {
  refDate: string;
  agency: AgencyRow & { ceo: string; tel: string; email: string; homepage: string; address: string; memo: string };
  agents: AgentRow[];
  current: EnrollmentRow[];
  upcoming: EnrollmentRow[];
  byYear: NameCount[];
}

export interface ArrivalRow extends EnrollmentRow {
  pickType: string;
  place: string;
  terminal: string;
  airline: string;
  flight: string;
  arrival: string;
  remark: string;
}

export interface Arrivals {
  refDate: string;
  batch: string;
  date: string;
  batches: { batch: string; date: string; count: number }[];
  total: number;
  byType: NameCount[];
  byPlace: NameCount[];
  rows: ArrivalRow[];
}

export interface StatusCounts {
  current: number;
  upcoming: number;
  graduated: number;
  all: number;
}

export interface AgencyOption {
  id: string;
  name: string;
  count: number;
}

export interface CurrencyAmount {
  currency: string;
  amount: number;
}

/** 연수 한 건의 회계 요약. 금액은 연수 통화(currency), 현지 인보이스(local*)는 페소로 보인다. */
export interface InvoiceRow extends EnrollmentRow {
  agId: string;
  currency: string;
  hasInvoice: boolean;
  /** 해외 인보이스 총액(sum_ic_price) */
  total: number;
  /** 입금 매칭 합계(sum_id_amount) */
  paid: number;
  /** 총액 − 입금 매칭, 미납·부분납만(완납은 0) */
  remaining: number;
  localBilled: number;
  localPaid: number;
  pointIn: number;
  pointOut: number;
  pointBalance: number;
  dueDate: string;
  pointClear: boolean;
  roomClear: boolean;
}

export interface InvoiceList extends Paged<InvoiceRow> {
  tab: string;
  tabCounts: StatusCounts;
  facets: { campuses: string[]; nations: string[]; currencies: string[]; agencies: AgencyOption[] };
  totals: { byPay: NameCount[]; totalByCurrency: CurrencyAmount[]; paidByCurrency: CurrencyAmount[]; remainingByCurrency: CurrencyAmount[] };
}

export interface UnpaidList extends Paged<InvoiceRow> {
  scope: string;
  scopeCounts: StatusCounts;
  views: { unpaid: number; ledger: number };
  facets: { campuses: string[]; currencies: string[]; agencies: AgencyOption[] };
  totals: { byPay: NameCount[]; overdue: number; paidByCurrency: CurrencyAmount[]; remainingByCurrency: CurrencyAmount[] };
}

export interface DepositRow {
  dpId: string;
  date: string;
  name: string;
  agency: string;
  currency: string;
  amount: number;
  fee: number;
  total: number;
  matches: number;
  matched: number;
  matchedCurrency: string;
  balance: number;
  confirmed: boolean;
  memo: string;
}

export interface DepositList extends Paged<DepositRow> {
  available: boolean;
  views: { unpaid: number; ledger: number };
  facets: { currencies: string[] };
  totals: { none: number; open: number; done: number; amountByCurrency: CurrencyAmount[] };
}

export interface PointList extends Paged<InvoiceRow> {
  view: 'balance' | 'clear' | 'leftover';
  within: number;
  until: string;
  tabCounts: { balance: number; clear: number; leftover: number };
  facets: { campuses: string[]; nations: string[] };
  totals: { withBalance: number; pointIn: number; pointOut: number; notCleared: number };
}

export interface CodeRow {
  campus: string;
  name: string;
  current: number;
  upcoming: number;
  students: number;
  assigned: number;
  staying: number;
  lastStart: string;
}

export interface CodeList extends Paged<CodeRow> {
  kind: 'course' | 'dorm';
  tabCounts: { course: number; dorm: number };
  facets: { campuses: string[] };
}

export interface BatchRow {
  batch: string;
  date: string;
  start: string;
  total: number;
  cancelled: number;
  byCampus: Record<string, number>;
  upcoming: boolean;
  linkable: boolean;
}

export interface BatchList extends Paged<BatchRow> {
  tab: string;
  tabCounts: { upcoming: number; past: number; all: number };
  campuses: string[];
  campusStats: { name: string; current: number; upcoming: number; total: number; nextBatch: string }[];
  facets: { years: string[] };
  people: number;
}

export function useApi<T>(url: string | null) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: !!url });

  useEffect(() => {
    if (!url) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    authHeaders()
      .then((headers) => fetch(url, { headers }))
      .then(async (r) => {
        const body = await r.json().catch(() => null);
        // 세션 만료: 로그아웃시키면 App 이 로그인 화면으로 바꾼다.
        if (r.status === 401 && supabase) await supabase.auth.signOut();
        if (!r.ok) throw new Error(body?.error ?? r.statusText);
        return body as T;
      })
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message, loading: false }));
    return () => {
      alive = false;
    };
  }, [url]);

  return state;
}

export const fmt = (n: number) => n.toLocaleString('ko-KR');
export const weekday = (d: string) => (d ? '일월화수목금토'[new Date(d + 'T00:00:00').getDay()] : '');
export const pct = (part: number, whole: number) => (whole ? ((part / whole) * 100).toFixed(1) + '%' : '-');

export interface RoomRow {
  roomId: string;
  number: string;
  building: string;
  floor: string;
  type: string;
  campus: string;
  gender: string;
  max: number;
  beds: number;
  bedNumbers: string[];
  status: string;
  start: string;
  end: string;
  memo: string;
}

export interface CalendarDay {
  date: string;
  inSchool: number;
  arrive: number;
  leave: number;
  offsite: number;
  byCampus: Record<string, number>;
}

export interface CalendarStudent extends EnrollmentRow {
  depart: string;
  ret: string;
  offsite: boolean;
}

export interface StudentCalendar {
  refDate: string;
  month: string;
  prev: string;
  next: string;
  campus: string;
  campuses: string[];
  totals: { arrive: number; leave: number; max: number; min: number };
  days: CalendarDay[];
  selected: { date: string; kind: 'in' | 'arrive' | 'leave'; rows: CalendarStudent[] } | null;
}

export interface RegistrationPeriod {
  from: string;
  to: string;
  label: string;
}

export interface RegistrationStudent extends EnrollmentRow {
  basisDate: string;
  depart: string;
}

export interface Registrations {
  refDate: string;
  basis: 'invoice' | 'departure';
  unit: 'batch' | 'month';
  withCancel: boolean;
  withTrainCancel: boolean;
  compare: boolean;
  end: string;
  prevEnd: string;
  nextEnd: string;
  periods: RegistrationPeriod[];
  campuses: string[];
  byCampus: Record<string, number[]>;
  rows: { code: string; nation: string; counts: number[]; total: number; prevTotal: number }[];
  totals: number[];
  prevTotals: number[] | null;
  list: { period: RegistrationPeriod; nation: string; campus: string; rows: RegistrationStudent[] } | null;
}

export interface StopRow extends EnrollmentRow {
  stateCode: string;
  stateLabel: string;
  stopDate: string;
  reason: string;
  depart: string;
  ret: string;
}

export interface StopList extends Paged<StopRow> {
  tab: 'stopped' | 'cancel';
  tabCounts: { stopped: number; cancel: number };
  stateCounts: Record<string, number>;
  facets: { years: string[]; nations: string[]; campuses: string[] };
}

export interface MemoRow extends EnrollmentRow {
  depart: string;
  pickType: string;
  pickPlace: string;
  agencyMemo: string;
  marketingMemo: string;
  academyMemo: string;
}

export interface MemoList extends Paged<MemoRow> {
  tab: string;
  tabCounts: { upcoming: number; current: number; all: number };
  facets: { batches: string[]; campuses: string[]; pickTypes: string[] };
}

export interface RoomList extends Paged<RoomRow> {
  facets: { buildings: string[]; floors: string[]; types: string[]; campuses: string[] };
  totals: { rooms: number; beds: number };
  byType: { type: string; rooms: number; beds: number }[];
}
