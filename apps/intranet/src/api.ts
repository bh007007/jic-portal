/**
 * /api 호출. 로컬에는 로그인이 없다(관리자 앱과 같다). 배포에서는 직원·가드 로그인 토큰을 붙인다(docs/intranet.md).
 * 상담 기록 작성·열람자와 접근 기록에 남길 직원 이름은 이 브라우저에 입력해 두고 X-Staff-Name 헤더로 보낸다(로컬 전용).
 */
import { useCallback, useEffect, useState } from 'react';
import type { GuardView, OutingList, OutingRow, PenaltyList, PenaltyRules, RequestList, Settings, StudentFile, StudentFileList, Summary } from '../server/core';

export type { GuardView, OutingList, OutingRow, PenaltyList, PenaltyRules, RequestList, Settings, StudentFile, StudentFileList, Summary };
export type PenaltyRow = PenaltyList['rows'][number];
export type { AuditList, CounselingDetail, CounselingList } from '../server/counseling';
export type { NoticeDetail, NoticeList } from '../server/notices';

const STAFF_KEY = 'jic-staff-name';
let staffMemory = '';
const staffListeners = new Set<() => void>();
export function getStaffName() {
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
    const staff = getStaffName();
    if (staff) headers['X-Staff-Name'] = encodeURIComponent(staff); // 한글은 헤더에 그대로 못 넣는다
    res = await fetch(path, {
      method: init?.method ?? 'GET',
      headers,
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, (data && typeof data.error === 'string' && data.error) || 'unknown', data ?? {});
  return data as T;
}

/** GET 조회. intervalMs 를 주면 그 간격으로 다시 읽는다(가드 태블릿). */
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
};
export const errorText = (code: string) => MESSAGES[code] ?? `처리하지 못했습니다 (${code}).`;
