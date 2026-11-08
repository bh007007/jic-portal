/** /api 호출. 로컬에는 로그인이 없다(관리자 앱과 같다). 배포에서는 직원·가드 로그인 토큰을 붙인다(docs/intranet.md). */
import { useCallback, useEffect, useState } from 'react';
import type { GuardView, OutingList, OutingRow, PenaltyList, PenaltyRules, RequestList, Settings, StudentFile, StudentFileList, Summary } from '../server/core';

export type { GuardView, OutingList, OutingRow, PenaltyList, PenaltyRules, RequestList, Settings, StudentFile, StudentFileList, Summary };
export type PenaltyRow = PenaltyList['rows'][number];

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
    res = await fetch(path, {
      method: init?.method ?? 'GET',
      headers: init?.body === undefined ? {} : { 'Content-Type': 'application/json' },
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
};
export const errorText = (code: string) => MESSAGES[code] ?? `처리하지 못했습니다 (${code}).`;
