/**
 * 학생 계정 규칙 (11/8 결정, 기획안 V4): 학생번호 + 생년월일(YYYYMMDD)로 미리 만들고 첫 로그인 때 비밀번호를 바꾼다.
 * 계정 생성 스크립트(scripts/accounts.ts)와 학생 앱 화면이 같이 쓴다. 파일·네트워크 의존 없음.
 */
import type { Db } from '../../admin/server/core';

/** Supabase Auth 는 이메일로 로그인하므로 학생 번호로 가짜 주소를 만든다. 메일은 보내지 않는다(.internal 은 공개 인터넷에서 쓰지 않는 이름). */
export const DEFAULT_EMAIL_DOMAIN = 'students.jic.internal';

export const studentEmail = (stNo: string, domain = DEFAULT_EMAIL_DOMAIN) => `${stNo}@${domain}`.toLowerCase();

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '');

/** 첫 비밀번호 = 생년월일 8자리. 날짜가 아니면 null(그 학생은 계정을 만들지 않고 건수로 알린다). */
export function initialPassword(birthday: unknown): string | null {
  const d = digits(birthday);
  if (d.length !== 8) return null;
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const t = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === iso ? d : null;
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt 한도

export type PasswordError = 'pw_short' | 'pw_long' | 'pw_weak' | 'pw_same' | 'pw_mismatch';

/** 새 비밀번호: 8~72자, 영문과 숫자를 함께, 지금 비밀번호와 다르게, 확인 칸과 같게. */
export function checkNewPassword(next: string, confirm: string, current: string): PasswordError | null {
  if (next.length < PASSWORD_MIN) return 'pw_short';
  if (next.length > PASSWORD_MAX) return 'pw_long';
  if (!/[A-Za-z]/.test(next) || !/\d/.test(next)) return 'pw_weak';
  if (next === current) return 'pw_same';
  if (next !== confirm) return 'pw_mismatch';
  return null;
}

export interface AccountPlan {
  /** 새로 만들 계정 (password 는 화면·로그에 내보내지 않는다) */
  create: { stNo: string; email: string; password: string }[];
  /** Auth 사용자는 있는데 student_users 연결이 없는 경우(지난 실행이 중간에 끊김) */
  link: { stNo: string; userId: string }[];
  counts: { targets: number; linked: number; noBirthday: number };
}

/** 재학·입학 예정 연수가 있는 학생만 대상. 이미 연결된 학생은 건너뛴다. */
export function planAccounts(db: Db, existing: { linked: Set<string>; authUsers: Map<string, string> }, domain = DEFAULT_EMAIL_DOMAIN): AccountPlan {
  const ids = new Set<string>();
  for (const tab of ['current', 'upcoming']) {
    for (const r of db.listEnrollments(new URLSearchParams({ tab, all: '1' })).rows) if (/^\d+$/.test(r.stId)) ids.add(r.stId);
  }
  const plan: AccountPlan = { create: [], link: [], counts: { targets: ids.size, linked: 0, noBirthday: 0 } };
  for (const stNo of [...ids].sort()) {
    if (existing.linked.has(stNo)) {
      plan.counts.linked++;
      continue;
    }
    const email = studentEmail(stNo, domain);
    const userId = existing.authUsers.get(email);
    if (userId) {
      plan.link.push({ stNo, userId });
      continue;
    }
    const password = initialPassword(db.studentDetail(stNo)?.student.birthday);
    if (!password) {
      plan.counts.noBirthday++;
      continue;
    }
    plan.create.push({ stNo, email, password });
  }
  return plan;
}
