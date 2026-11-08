/**
 * 가드 계정 관리(인트라넷 '가드 계정'): 출입구마다 하나씩 두는 가드 공용 계정(11/8 결정)을 직원이 만들고, 비밀번호를 바꾸고, 지운다.
 * 계정 작업은 서비스 키가 있는 배포 서버만 한다(GuardAdmin: Supabase Auth Admin API + guard_accounts). 로컬 개발 서버에는 가드 계정이 없다
 * (가드 태블릿이 로그인 없이 열린다). 만들기·비밀번호 바꾸기·지우기는 접근 기록에 남긴다. 비밀번호는 화면·로그에 내보내지 않는다.
 * 파일·네트워크 의존 없음(supabaseGuardAdmin 만 fetch).
 */
import { checkNewPassword } from '../../student/server/accounts';
import { AccountAdminError } from '../../student/server/accountAdmin';

export interface GuardAccount {
  userId: string;
  email: string;
  campus: string;
  label: string; // 출입구 이름(예: 'Challenger 정문'). 가드 기록의 처리자로도 보인다
  createdAt: string | null;
  lastSignIn: string | null;
}
export interface GuardAdmin {
  list(): Promise<GuardAccount[]>;
  create(input: { email: string; password: string; campus: string; label: string }): Promise<string>;
  setPassword(userId: string, password: string): Promise<void>;
  remove(userId: string): Promise<void>;
}
export type GuardAction = 'guard_create' | 'guard_password' | 'guard_delete';

export interface GuardsCtx {
  admin?: GuardAdmin;
  unavailable?: 'local' | 'server_config';
  campuses: string[];
  log: (action: GuardAction, label: string, campus: string) => Promise<void>;
}

export const LABEL_MAX = 40;
type Result = { status: number; body: unknown };
const ok = (body: unknown, status = 200): Result => ({ status, body });
const fail = (status: number, error: string): Result => ({ status, body: { error } });
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const notAvailable = (ctx: GuardsCtx) => fail(503, ctx.unavailable === 'server_config' ? 'server_config' : 'accounts_local');

export async function listGuards(ctx: GuardsCtx) {
  if (!ctx.admin) return { available: false as const, reason: ctx.unavailable ?? 'local', campuses: ctx.campuses, labelMax: LABEL_MAX, rows: [] as GuardAccount[] };
  const rows = (await ctx.admin.list()).sort((a, b) => a.campus.localeCompare(b.campus) || a.label.localeCompare(b.label));
  return { available: true as const, reason: null, campuses: ctx.campuses, labelMax: LABEL_MAX, rows };
}
export type GuardList = Awaited<ReturnType<typeof listGuards>>;

/** 비밀번호: 학생 계정과 같은 규칙(8~72자, 영문과 숫자를 함께, 확인 칸과 같게) */
const passwordError = (input: Record<string, unknown>) => checkNewPassword(String(input.password ?? ''), String(input.confirm ?? ''), '');

export async function createGuard(ctx: GuardsCtx, input: Record<string, unknown>): Promise<Result> {
  if (!ctx.admin) return notAvailable(ctx);
  const email = text(input.email).toLowerCase();
  const label = text(input.label);
  const campus = text(input.campus);
  if (!label || label.length > LABEL_MAX) return fail(400, 'invalid_label');
  if (!ctx.campuses.includes(campus)) return fail(400, 'invalid_campus');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) return fail(400, 'invalid_email');
  const pw = passwordError(input);
  if (pw) return fail(400, pw);
  try {
    const userId = await ctx.admin.create({ email, password: String(input.password), campus, label });
    await ctx.log('guard_create', label, campus);
    return ok({ userId, email, campus, label }, 201);
  } catch (e) {
    if (e instanceof AccountAdminError && e.status === 422) return fail(409, 'email_exists');
    throw e;
  }
}

/** 이 화면은 가드 계정만 다룬다(다른 계정 id 로 직원·학생 비밀번호를 바꾸지 못하게 목록에서 찾는다). */
async function findGuard(ctx: GuardsCtx, userId: string) {
  return (await ctx.admin!.list()).find((g) => g.userId === userId) ?? null;
}

export async function setGuardPassword(ctx: GuardsCtx, userId: string, input: Record<string, unknown>): Promise<Result> {
  if (!ctx.admin) return notAvailable(ctx);
  const g = await findGuard(ctx, userId);
  if (!g) return fail(404, 'not_found');
  const pw = passwordError(input);
  if (pw) return fail(400, pw);
  await ctx.admin.setPassword(userId, String(input.password));
  await ctx.log('guard_password', g.label, g.campus);
  return ok({ userId });
}

export async function removeGuard(ctx: GuardsCtx, userId: string): Promise<Result> {
  if (!ctx.admin) return notAvailable(ctx);
  const g = await findGuard(ctx, userId);
  if (!g) return fail(404, 'not_found');
  await ctx.admin.remove(userId);
  await ctx.log('guard_delete', g.label, g.campus);
  return ok({ userId });
}

/** 배포: 서비스 키로 Supabase Auth Admin API 와 guard_accounts 를 쓴다. */
export function supabaseGuardAdmin(url: string, serviceKey: string, fetchFn: typeof fetch = fetch): GuardAdmin {
  const base = url.replace(/\/+$/, '');
  const headers: Record<string, string> = { apikey: serviceKey, 'Content-Type': 'application/json', ...(serviceKey.startsWith('eyJ') ? { Authorization: `Bearer ${serviceKey}` } : {}) };
  async function call<T>(method: string, pathAndQuery: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
    const r = await fetchFn(`${base}${pathAndQuery}`, { method, headers: { ...headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    const t = await r.text();
    if (!r.ok) throw new AccountAdminError(r.status, `${method} ${pathAndQuery.split('?')[0]} ${r.status}: ${t.slice(0, 200)}`);
    return (t ? JSON.parse(t) : null) as T;
  }
  return {
    async list() {
      const rows = await call<{ user_id: string; campus: string; label: string; created_at: string | null }[]>('GET', '/rest/v1/guard_accounts?select=user_id,campus,label,created_at');
      if (!rows.length) return [];
      const users = new Map<string, { email: string; last: string | null }>();
      for (let page = 1; ; page++) {
        const r = await call<{ users: { id: string; email?: string; last_sign_in_at?: string | null }[] }>('GET', `/auth/v1/admin/users?page=${page}&per_page=1000`);
        for (const u of r.users) users.set(u.id, { email: u.email ?? '', last: u.last_sign_in_at ?? null });
        if (r.users.length < 1000) break;
      }
      return rows.map((g) => ({ userId: g.user_id, email: users.get(g.user_id)?.email ?? '', campus: g.campus, label: g.label, createdAt: g.created_at, lastSignIn: users.get(g.user_id)?.last ?? null }));
    },
    async create({ email, password, campus, label }) {
      const u = await call<{ id: string }>('POST', '/auth/v1/admin/users', { email, password, email_confirm: true, user_metadata: { portal: 'guard' } });
      try {
        await call('POST', '/rest/v1/guard_accounts', { user_id: u.id, campus, label }, { Prefer: 'return=minimal' });
      } catch (e) {
        await call('DELETE', `/auth/v1/admin/users/${encodeURIComponent(u.id)}`).catch(() => undefined); // 연결에 실패하면 계정도 지운다
        throw e;
      }
      return u.id;
    },
    async setPassword(userId, password) {
      await call('PUT', `/auth/v1/admin/users/${encodeURIComponent(userId)}`, { password });
    },
    async remove(userId) {
      await call('DELETE', `/auth/v1/admin/users/${encodeURIComponent(userId)}`); // guard_accounts 는 on delete cascade
    },
  };
}
