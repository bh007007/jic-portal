/**
 * /api 호출. 로컬에는 로그인이 없다(관리자 앱과 같다). 배포에서는 직원·가드 로그인 토큰을 붙인다(docs/intranet.md).
 * 상담 기록 작성·열람자와 접근 기록에 남길 직원 이름은 이 브라우저에 입력해 두고 X-Staff-Name 헤더로 보낸다(로컬 전용).
 * 배포에서는 직원 로그인 토큰(Authorization)을 보내고, 이름은 서버가 정한다(auth.ts).
 */
import { useCallback, useEffect, useState } from 'react';
import { authHeaders, authMode, onSessionChange, signOut } from './auth';
import { apiUrl } from './base';
import type { DepartureList, GuardView, LifeRequestList, OutingList, OutingRow, PenaltyList, PenaltyRules, ReportList, RequestList, Settings, StudentFile, StudentFileList, Summary, TripDetail, TripList } from '../server/core';

export type { DepartureList, GuardView, LifeRequestList, OutingList, OutingRow, PenaltyList, PenaltyRules, ReportList, RequestList, Settings, StudentFile, StudentFileList, Summary, TripDetail, TripList };
export type PenaltyRow = PenaltyList['rows'][number];
export type { AuditList, CounselingDetail, CounselingList } from '../server/counseling';
export type { NoticeDetail, NoticeList } from '../server/notices';

const STAFF_KEY = 'jic-staff-name';
let staffMemory = '';
const staffListeners = new Set<() => void>();

// 배포: 처리자 이름은 로그인한 직원(서버가 /api/meta 의 actor 로 알려 준다). 로그인 계정이 바뀌면 다시 읽는다.
let loggedInName = '';
let loggedInLoad: Promise<void> | null = null;
function loadLoggedInName() {
  loggedInLoad ??= api<{ actor: string | null }>('/api/meta')
    .then((m) => {
      loggedInName = m.actor ?? '';
      staffListeners.forEach((fn) => fn());
    })
    .catch(() => {
      loggedInLoad = null;
    });
}
onSessionChange(() => {
  loggedInName = '';
  loggedInLoad = null;
  staffListeners.forEach((fn) => fn());
});

export function getStaffName() {
  if (authMode === 'supabase') {
    loadLoggedInName();
    return loggedInName;
  }
  try {
    return localStorage.getItem(STAFF_KEY) ?? staffMemory;
  } catch {
    return staffMemory;
  }
}
export function setStaffName(name: string) {
  staffMemory = name.trim();
  try {
    if (staffMemory) localStorage.setItem(STAFF_KEY, staffMemory);
    else localStorage.removeItem(STAFF_KEY);
  } catch {
    // 저장소를 못 쓰면 이번 화면에서만 기억
  }
  staffListeners.forEach((fn) => fn());
}
export function useStaffName() {
  const [name, setName] = useState(getStaffName);
  useEffect(() => {
    const fn = () => setName(getStaffName());
    staffListeners.add(fn);
    return () => {
      staffListeners.delete(fn);
    };
  }, []);
  return name;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public data: Record<string, unknown> = {},
  ) {
    super(code);
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    const headers: Record<string, string> = init?.body === undefined ? {} : { 'Content-Type': 'application/json' };
    if (authMode === 'supabase') {
      Object.assign(headers, await authHeaders()); // 배포: 로그인 토큰. 처리자 이름은 서버가 정한다
    } else {
      const staff = getStaffName();
      if (staff) headers['X-Staff-Name'] = encodeURIComponent(staff); // 한글은 헤더에 그대로 못 넣는다
    }
    res = await fetch(apiUrl(path), {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && authMode === 'supabase') void signOut(); // 로그인 만료 → 로그인 화면
    throw new ApiError(res.status, (data && typeof data.error === 'string' && data.error) || 'unknown', data ?? {});
  }
  return data as T;
}

/** GET 조회. intervalMs 를 주면 그 간격으로 다시 읽는다(가드 태블릿). */
/** /api/meta: 데이터 종류, 처리자, 계정 종류. 직원 역할(관리자·오피스)과 오피스의 캠퍼스(null = 모든 캠퍼스)는 메뉴를 숨기는 데만 쓴다(막는 것은 서버·DB). */
export interface Meta {
  source: 'sample' | 'extract';
  refDate: string;
  actor: string | null;
  role: 'staff' | 'guard' | 'manager' | null;
  campus: string | null;
  staffRole: 'admin' | 'office' | null;
  campuses: string[] | null;
}

/**
 * 화면에서 버튼·메뉴를 숨길 때 쓰는 역할(docs/roles.md). 막는 것은 서버·DB 다.
 * manager: 강사 포털 매니저(인트라넷 일부만), office: 오피스 직원, readOnlyRules: 점수표 읽기만(오피스·매니저)
 */
export function useAccess() {
  const { data } = useApi<Meta>('/api/meta');
  const manager = data?.role === 'manager';
  return { meta: data, manager, office: data?.staffRole === 'office', readOnlyRules: manager || data?.staffRole === 'office' };
}

export function useApi<T>(path: string, intervalMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () =>
      api<T>(path)
        .then((d) => {
          if (!alive) return;
          setData(d);
          setError(null);
        })
        .catch((e: ApiError) => alive && setError(e.code));
    load();
    const timer = intervalMs ? setInterval(load, intervalMs) : undefined;
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [path, tick, intervalMs]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, reload };
}

/** 패널티 승인 대기 수처럼 메뉴에 보이는 숫자가 바뀌었음을 알린다(Shell 이 다시 읽는다). */
const SUMMARY_EVENT = 'jic-summary-changed';
export const notifySummaryChanged = () => window.dispatchEvent(new Event(SUMMARY_EVENT));
export function useSummaryChanged(fn: () => void) {
  useEffect(() => {
    window.addEventListener(SUMMARY_EVENT, fn);
    return () => window.removeEventListener(SUMMARY_EVENT, fn);
  }, [fn]);
}

/** 서버 오류 코드 → 화면 문구 */
const MESSAGES: Record<string, string> = {
  network: '서버에 연결하지 못했습니다.',
  not_current: '재학생 명단에 없는 번호입니다.',
  already_out: '이미 외출 중으로 기록되어 있습니다. 귀가로 처리하세요.',
  guard_required: '근무자를 고르세요.',
  code_required: '학생번호를 입력하세요.',
  campus_required: '캠퍼스를 고르세요.',
  invalid_rules: '점수는 0~100, 경고 기준은 1 이상이며 단계가 올라갈수록 커야 합니다.',
  invalid_settings: '통금 시각과 근무자 이름을 확인하세요.',
  ids_required: '처리할 건을 고르세요.',
  invalid_decision: '승인 또는 반려를 고르세요.',
  actor_required: '오른쪽 위에 직원 이름을 먼저 입력하세요. 상담 기록은 누가 보고 썼는지 남깁니다.',
  unknown_student: '학생번호를 확인하세요.',
  invalid_date: '상담일을 확인하세요(오늘 이후는 안 됩니다).',
  invalid_title: '제목을 입력하세요.',
  invalid_content: '내용을 입력하세요(글자 수 제한을 넘지 않게).',
  invalid_followup: '후속 조치 기한은 상담일과 같거나 뒤여야 합니다.',
  no_followup: '후속 조치 기한이 없는 기록입니다.',
  not_found: '찾을 수 없습니다.',
  invalid_campus: '대상 캠퍼스를 다시 고르세요.',
  invalid_until: '게시 종료일을 확인하세요(새 공지는 오늘 이후).',
  invalid_kind: '종류를 고르세요.',
  invalid_note: '내용을 입력하세요(500자까지).',
  invalid_time: '시각을 확인하세요.',
  no_ride_request: '학생이 차량을 요청하지 않은 항공편입니다.',
  invalid_pickup_date: '기숙사 출발은 항공편 출발일이나 그 전날이어야 합니다.',
  pickup_after_flight: '기숙사 출발이 비행기 출발보다 늦습니다.',
  reason_required: '배차 불가 사유를 적어 주세요.',
  departure_passed: '출발일이 지난 항공편입니다.',
  invalid_status: '처리 상태를 고르세요.',
  reply_required: '반려할 때는 답변에 사유를 적어 주세요.',
  reply_too_long: '답변은 500자까지 쓸 수 있습니다.',
  already_closed: '이미 끝난 요청입니다(완료·반려·학생 취소).',
  already_in_progress: '이미 처리 중인 요청입니다.',
  destination_required: '행선지를 입력하세요.',
  contact_required: '비상 연락처를 입력하세요.',
  invalid_contact: '연락처를 확인하세요.',
  invalid_companion: '같이 가는 학생번호를 확인하세요.',
  // 배포(Supabase)
  invalid_label: '출입구 이름을 입력하세요(40자까지).',
  invalid_email: '로그인 이메일을 확인하세요.',
  email_exists: '이미 쓰는 이메일입니다. 다른 이메일을 쓰세요.',
  pw_short: '비밀번호는 8자 이상이어야 합니다.',
  pw_long: '비밀번호는 72자까지 쓸 수 있습니다.',
  pw_weak: '비밀번호에 영문과 숫자를 함께 쓰세요.',
  pw_mismatch: '비밀번호 확인이 맞지 않습니다.',
  accounts_local: '로컬 개발 서버에는 학생 계정이 없습니다.',
  server_config: '서버 설정(서비스 키)이 빠져 있습니다. 관리자에게 알려 주세요.',
  no_account: '아직 계정이 없는 학생입니다. 먼저 계정을 만드세요.',
  no_birthday: '생년월일이 없어 첫 비밀번호를 정할 수 없습니다. 학생 정보를 먼저 고치세요.',
  invalid_qr: '올바른 카드키 QR이 아닙니다. 학생 앱의 출입 QR을 다시 비춰 주세요.',
  qr_expired: '시간이 지난 QR입니다. 학생 앱에서 새 QR을 비춰 주세요(캡처한 QR은 쓸 수 없습니다).',
  qr_unavailable: '지금은 카드키 QR을 확인할 수 없습니다. 학생번호로 입력하세요.',
  title_required: '제목을 입력하세요.',
  title_too_long: '제목은 100자까지 쓸 수 있습니다.',
  place_required: '장소를 입력하세요.',
  place_too_long: '장소는 100자까지 쓸 수 있습니다.',
  meeting_too_long: '집합 안내는 100자까지 쓸 수 있습니다.',
  description_too_long: '안내는 1000자까지 쓸 수 있습니다.',
  end_before_start: '돌아오는 날은 출발일과 같거나 뒤여야 합니다.',
  trip_too_long: '여행 기간은 14박까지입니다.',
  start_in_past: '출발일은 오늘 이후여야 합니다.',
  invalid_deadline: '신청 마감일을 확인하세요.',
  deadline_after_start: '신청 마감일은 출발일과 같거나 앞이어야 합니다.',
  invalid_capacity: '정원은 1~500명입니다.',
  capacity_below_signups: '정원을 이미 신청한 학생 수보다 줄일 수 없습니다. 먼저 명단을 정리하세요.',
  invalid_cost: '비용은 0 이상의 숫자(PHP)로 적어 주세요.',
  trip_cancelled: '취소한 여행입니다. 바꿀 수 없습니다.',
  same_status: '이미 그 상태입니다.',
  not_applied: '참가 신청 상태가 아닙니다(학생 취소·명단 제외).',
  campus_not_allowed: '맡은 캠퍼스의 학생만 상담 기록을 쓸 수 있습니다. 관리자에게 담당 캠퍼스 등록을 요청하세요.',
  staff_only: '직원·매니저·가드 계정으로 등록되지 않았습니다.',
  guard_forbidden: '가드 계정으로는 가드 태블릿만 쓸 수 있습니다.',
  admin_only: '관리자만 할 수 있습니다.',
  manager_forbidden: '매니저 계정으로는 열 수 없는 화면입니다.',
  manager_absence_only: '매니저는 무단결석만 승인·반려할 수 있습니다.',
  own_notice_only: '내가 쓴 공지만 고칠 수 있습니다.',
  campus_forbidden: '맡은 캠퍼스의 학생만 볼 수 있습니다.',
  unauthorized: '로그인이 필요합니다.',
};
export const errorText = (code: string) =>
  // 배포에서는 처리자 이름을 서버에서 읽는 동안에만 비어 있다
  code === 'actor_required' && authMode === 'supabase' ? '불러오는 중…' : (MESSAGES[code] ?? `처리하지 못했습니다 (${code}).`);
