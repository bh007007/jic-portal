/**
 * 로그인 상태. 두 가지 방식이 있다.
 * - 로컬 개발(VITE_SUPABASE_URL 없음): 학생번호 + 생년월일을 개발 서버(/api/login)에서 확인하고, 학생 번호를 이 탭(sessionStorage)에 둔다.
 *   /api 요청에는 X-Student-Id 헤더를 붙인다. 127.0.0.1 에서만 열리는 개발 서버 전용이다.
 * - Supabase(환경변수 있음): 학생 계정(학생번호@도메인, scripts/accounts.ts 가 만듦)으로 로그인하고 토큰(Authorization)을 보낸다.
 *   첫 비밀번호(생년월일)는 바꿔야 앱을 쓸 수 있다(기획안 V4, 11/8 결정).
 */
import { createClient, type AuthError, type Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { checkNewPassword, DEFAULT_EMAIL_DOMAIN, studentEmail } from '../server/accounts';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
const domain = import.meta.env.VITE_STUDENT_EMAIL_DOMAIN || DEFAULT_EMAIL_DOMAIN;

const supabase = url && key ? createClient(url, key, { auth: { storageKey: 'jic-student-auth' } }) : null;
export const authMode: 'local' | 'supabase' = supabase ? 'supabase' : 'local';

export type AuthState =
  | { status: 'loading' }
  /** notice: 로그아웃된 까닭(오류 코드, 예: not_student) */
  | { status: 'out'; notice?: string }
  | { status: 'in'; stId: string; mustChangePassword: boolean };

const listeners = new Set<() => void>();
let state: AuthState = { status: 'loading' };
function setState(next: AuthState) {
  state = next;
  listeners.forEach((fn) => fn());
}

export function useAuth(): AuthState {
  const [s, setS] = useState(state);
  useEffect(() => {
    const fn = () => setS(state);
    listeners.add(fn);
    fn();
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return s;
}

// ── 로컬 개발
const SESSION_KEY = 'jic-student-session';
let memorySession: string | null = null;

function localStudent(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return memorySession;
  }
}
function setLocalStudent(stId: string | null) {
  memorySession = stId;
  try {
    if (stId) sessionStorage.setItem(SESSION_KEY, stId);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // 저장소를 못 쓰면 메모리에만 둔다
  }
  setState(stId ? { status: 'in', stId, mustChangePassword: false } : { status: 'out' });
}

// ── Supabase
let loadSeq = 0;

/**
 * 로그인한 계정이 어느 학생인지와 비밀번호 변경 필요 여부를 읽는다(RLS: 자기 행만).
 * 여러 읽기가 겹치면 나중에 시작한 것만 화면 상태에 반영하고, 부른 쪽에는 이번 결과를 돌려준다.
 */
async function loadStudent(session: Session | null): Promise<AuthState> {
  const seq = ++loadSeq;
  let next: AuthState;
  if (!supabase || !session) {
    next = { status: 'out', notice: state.status === 'out' ? state.notice : undefined };
  } else {
    const { data, error, status } = await supabase.from('student_users').select('student_no, must_change_password').eq('user_id', session.user.id).limit(1);
    const row = data?.[0] as { student_no: string; must_change_password: boolean } | undefined;
    const expired = status === 401 || status === 403; // 토큰 만료·폐기: 조용히 로그인 화면으로
    next = expired
      ? { status: 'out' }
      : error
        ? { status: 'out', notice: 'network' }
        : row
          ? { status: 'in', stId: row.student_no, mustChangePassword: row.must_change_password === true }
          : { status: 'out', notice: 'not_student' }; // 직원·에이전시 계정 등
    if (expired || (!error && !row)) void supabase.auth.signOut();
  }
  if (seq === loadSeq) setState(next);
  return next;
}

if (supabase) {
  supabase.auth.onAuthStateChange((event, session) => {
    // 콜백 안에서 Supabase 를 다시 부르면 멈출 수 있어 다음 차례로 미룬다. 비밀번호 변경(USER_UPDATED)은 changePassword 가 직접 다시 읽는다.
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') setTimeout(() => void loadStudent(session), 0);
  });
} else {
  const stId = localStudent();
  state = stId ? { status: 'in', stId, mustChangePassword: false } : { status: 'out' };
}

function authErrorCode(e: AuthError | null, invalid: string): string | null {
  if (!e) return null;
  if (e.code === 'invalid_credentials' || e.message === 'Invalid login credentials') return invalid;
  if (!e.status) return 'network';
  return 'unknown';
}

/** /api 요청에 붙일 헤더 */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) {
    const stId = localStudent();
    return stId ? { 'X-Student-Id': stId } : {};
  }
  const { data } = await supabase.auth.getSession();
  return data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {};
}

/** 로그인. 실패하면 오류 코드(login_failed, network, …). */
export async function signIn(stNo: string, password: string): Promise<string | null> {
  if (!supabase) {
    let res: Response;
    try {
      res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stId: stNo, birthday: password }) });
    } catch {
      return 'network';
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) return (body && typeof body.error === 'string' && body.error) || 'unknown';
    setLocalStudent(body.stId);
    return null;
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email: studentEmail(stNo, domain), password });
  if (error) return authErrorCode(error, 'login_failed_pw');
  const next = await loadStudent(data.session);
  return next.status === 'out' ? (next.notice ?? 'unknown') : null;
}

export async function signOut() {
  if (!supabase) {
    setLocalStudent(null);
    return;
  }
  loadSeq++;
  setState({ status: 'out' });
  await supabase.auth.signOut();
}

/** 서버가 401(토큰 만료)·403(비밀번호 변경 필요)을 돌려줬을 때 상태를 다시 맞춘다. */
export async function recheck(status: number) {
  if (!supabase) {
    if (status === 401) setLocalStudent(null);
    return;
  }
  const { data } = await supabase.auth.getSession();
  await loadStudent(data.session);
}

/**
 * 비밀번호 변경: 지금 비밀번호를 다시 확인하고 바꾼 뒤 student_users 의 변경 필요 표시를 끈다.
 * 실패하면 오류 코드(pw_short, pw_weak, pw_same, pw_mismatch, pw_current_wrong, network, …).
 */
export async function changePassword(current: string, next: string, confirm: string): Promise<string | null> {
  if (!supabase || state.status !== 'in') return 'unknown';
  const bad = checkNewPassword(next, confirm, current);
  if (bad) return bad;
  const email = studentEmail(state.stId, domain);
  const check = await supabase.auth.signInWithPassword({ email, password: current });
  if (check.error) return authErrorCode(check.error, 'pw_current_wrong');
  const { error } = await supabase.auth.updateUser({ password: next });
  if (error) {
    if (error.code === 'weak_password') return 'pw_weak';
    if (error.code === 'same_password') return 'pw_same';
    return authErrorCode(error, 'unknown');
  }
  const done = await supabase.rpc('student_password_changed');
  if (done.error) return 'unknown';
  await loadStudent(check.data.session);
  return null;
}
