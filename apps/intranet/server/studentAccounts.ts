/**
 * 학생 계정 관리(인트라넷 '학생 계정'): 재학·입학 예정 학생의 학생 앱 계정 상태를 보고, 없는 계정을 만들고, 비밀번호를 생년월일로 되돌린다.
 * 규칙은 학생 앱 server/accounts.ts(아이디 = 학생번호, 첫 비밀번호 = 생년월일, 첫 로그인 때 변경)와 같다.
 * 계정 작업은 서비스 키가 있는 배포 서버만 한다(AccountAdmin, 학생 앱 server/accountAdmin.ts). 로컬 개발 서버에는 계정이 없다
 * (학생 앱이 학생번호 + 생년월일로 로그인). 만들기·초기화는 접근 기록에 남긴다. 파일·네트워크 의존 없음.
 */
import type { Db } from '../../admin/server/core';
import { DEFAULT_EMAIL_DOMAIN, initialPassword, planAccounts, studentEmail } from '../../student/server/accounts';
import type { AccountAdmin } from '../../student/server/accountAdmin';

/** 한 번에 만들 계정 수. Cloudflare 무료 요금제의 요청당 외부 호출 한도(50) 안에 들도록 작게 나눠 화면이 이어서 부른다. */
export const ACCOUNT_BATCH = 8;

/** none 계정 없음 · pending 첫 비밀번호(생년월일) 변경 전 · active 사용 중 · no_birthday 생년월일이 없어 못 만듦 */
export type AccountStatus = 'none' | 'pending' | 'active' | 'no_birthday';
export type AccountAction = 'account_create' | 'password_reset';

export interface AccountsCtx {
  db: Db;
  accounts?: AccountAdmin;
  /** 배포가 아니어서 못 쓰는 이유: local 로컬 개발 서버, server_config 서비스 키 없음 */
  unavailable?: 'local' | 'server_config';
  domain?: string;
  /** 접근 기록(배포: DB 함수가 로그인한 직원으로 남김) */
  log: (action: AccountAction, stNo: string, campus: string) => Promise<void>;
}

type Result = { status: number; body: unknown };
const ok = (body: unknown, status = 200): Result => ({ status, body });
const fail = (status: number, error: string): Result => ({ status, body: { error } });

/** 대상: 재학·입학 예정 연수가 있는 학생(학생 앱 계정 생성 대상과 같다). 학생당 한 줄. */
function targets(db: Db) {
  const rows = new Map<string, { stId: string; name: string; campus: string; enroll: 'current' | 'upcoming'; start: string; end: string }>();
  for (const tab of ['current', 'upcoming'] as const) {
    for (const r of db.listEnrollments(new URLSearchParams({ tab, all: '1' })).rows) {
      if (!/^\d+$/.test(r.stId) || rows.has(r.stId)) continue;
      rows.set(r.stId, { stId: r.stId, name: r.name, campus: r.campus, enroll: tab, start: r.start, end: r.end });
    }
  }
  return [...rows.values()];
}

export async function listAccounts(ctx: AccountsCtx, q: URLSearchParams) {
  const status = q.get('status') || '';
  const campus = q.get('campus') || '';
  const kw = (q.get('q') ?? '').trim().toLowerCase();
  const base = targets(ctx.db);
  const campuses = [...new Set(base.map((r) => r.campus))].filter((c) => c && c !== '-').sort();
  if (!ctx.accounts) return { available: false as const, reason: ctx.unavailable ?? 'local', campuses, batch: ACCOUNT_BATCH, counts: { none: 0, pending: 0, active: 0, no_birthday: 0 }, rows: [] };
  const [linked, users] = await Promise.all([ctx.accounts.linked(), ctx.accounts.authUsers()]);
  const byNo = new Map(linked.map((a) => [a.stNo, a]));
  const lastSignIn = new Map(users.map((u) => [u.id, u.lastSignIn]));
  const all = base.map((r) => {
    const a = byNo.get(r.stId);
    const st: AccountStatus = a ? (a.mustChangePassword ? 'pending' : 'active') : initialPassword(ctx.db.studentDetail(r.stId)?.student.birthday) ? 'none' : 'no_birthday';
    return { ...r, status: st, lastSignIn: a ? (lastSignIn.get(a.userId) ?? null) : null };
  });
  const counts = { none: 0, pending: 0, active: 0, no_birthday: 0 };
  for (const r of all) counts[r.status]++;
  const rows = all
    .filter((r) => (!status || r.status === status) && (!campus || r.campus === campus) && (!kw || r.stId.includes(kw) || r.name.toLowerCase().includes(kw)))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { available: true as const, reason: null, campuses, batch: ACCOUNT_BATCH, counts, rows };
}
export type AccountList = Awaited<ReturnType<typeof listAccounts>>;

/**
 * 없는 계정을 최대 ACCOUNT_BATCH 개 만든다(계정만 있고 연결이 빠진 것은 잇기만). 남은 수를 돌려주면 화면이 0이 될 때까지 다시 부른다.
 * 학생별 실패는 학생 번호와 짧은 오류만 돌려준다(비밀번호는 내보내지 않는다).
 */
export async function createAccounts(ctx: AccountsCtx): Promise<Result> {
  if (!ctx.accounts) return fail(503, ctx.unavailable === 'server_config' ? 'server_config' : 'accounts_local');
  const [linked, users] = await Promise.all([ctx.accounts.linked(), ctx.accounts.authUsers()]);
  const plan = planAccounts(ctx.db, { linked: new Set(linked.map((a) => a.stNo)), authUsers: new Map(users.map((u) => [u.email, u.id])) }, ctx.domain ?? DEFAULT_EMAIL_DOMAIN);
  const campusOf = new Map(targets(ctx.db).map((r) => [r.stId, r.campus]));
  const jobs = [...plan.link.map((x) => ({ kind: 'link' as const, ...x })), ...plan.create.map((x) => ({ kind: 'create' as const, ...x }))];
  const todo = jobs.slice(0, ACCOUNT_BATCH);
  let created = 0;
  let linkedCount = 0;
  const failed: { stId: string; error: string }[] = [];
  for (const j of todo) {
    try {
      const userId = j.kind === 'link' ? j.userId : await ctx.accounts.create(j.email, j.password);
      if (j.kind === 'create') created++;
      await ctx.accounts.link(userId, j.stNo);
      linkedCount++;
      await ctx.log('account_create', j.stNo, campusOf.get(j.stNo) ?? '');
    } catch (e) {
      failed.push({ stId: j.stNo, error: String((e as Error).message).slice(0, 120) });
    }
  }
  return ok({ created, linked: linkedCount, failed, remaining: Math.max(0, jobs.length - todo.length), noBirthday: plan.counts.noBirthday });
}

/** 비밀번호를 생년월일로 되돌리고 다음 로그인 때 다시 바꾸게 한다(학생이 비밀번호를 잊었을 때). */
export async function resetAccount(ctx: AccountsCtx, stId: string): Promise<Result> {
  if (!ctx.accounts) return fail(503, ctx.unavailable === 'server_config' ? 'server_config' : 'accounts_local');
  const t = targets(ctx.db).find((r) => r.stId === stId);
  if (!t) return fail(404, 'not_found');
  const acc = (await ctx.accounts.linked()).find((a) => a.stNo === stId);
  if (!acc) return fail(409, 'no_account');
  const password = initialPassword(ctx.db.studentDetail(stId)?.student.birthday);
  if (!password) return fail(409, 'no_birthday');
  await ctx.accounts.resetPassword(acc.userId, stId, password);
  await ctx.log('password_reset', stId, t.campus);
  return ok({ stId, status: 'pending', email: studentEmail(stId, ctx.domain ?? DEFAULT_EMAIL_DOMAIN) });
}
