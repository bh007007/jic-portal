/**
 * 학생 계정 관리(Supabase Auth Admin API + student_users). 서비스 키로만 쓴다.
 * 계정 생성 스크립트(scripts/accounts.ts)와 인트라넷 '학생 계정' 화면(배포: Pages Function)이 같이 쓴다. fetch 만 쓴다.
 * 비밀번호는 화면·로그에 내보내지 않는다.
 */
import { DEFAULT_EMAIL_DOMAIN } from './accounts';

export interface LinkedAccount {
  stNo: string;
  userId: string;
  mustChangePassword: boolean;
}
export interface AuthUserInfo {
  id: string;
  email: string;
  lastSignIn: string | null;
}
export interface AccountAdmin {
  /** student_users 에 연결된 학생 계정 */
  linked(): Promise<LinkedAccount[]>;
  /** 학생 이메일 도메인의 Auth 사용자(지난 실행이 계정만 만들고 끊긴 경우를 잇고, 마지막 로그인을 보인다) */
  authUsers(): Promise<AuthUserInfo[]>;
  /** Auth 사용자 만들기(확인 메일 없음) → 사용자 id */
  create(email: string, password: string): Promise<string>;
  link(userId: string, stNo: string): Promise<void>;
  /** 비밀번호를 바꾸고 다음 로그인 때 다시 바꾸게 한다(첫 로그인과 같게) */
  resetPassword(userId: string, stNo: string, password: string): Promise<void>;
}

export class AccountAdminError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function supabaseAccountAdmin(url: string, serviceKey: string, domain = DEFAULT_EMAIL_DOMAIN, fetchFn: typeof fetch = fetch): AccountAdmin {
  const base = url.replace(/\/+$/, '');
  // 예전 형식 service_role 키(eyJ…)는 Authorization 에도 넣고, 새 형식(sb_secret_…)은 apikey 헤더만 쓴다.
  const headers: Record<string, string> = { apikey: serviceKey, 'Content-Type': 'application/json', ...(serviceKey.startsWith('eyJ') ? { Authorization: `Bearer ${serviceKey}` } : {}) };
  async function call<T>(method: string, pathAndQuery: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
    const r = await fetchFn(`${base}${pathAndQuery}`, { method, headers: { ...headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await r.text();
    if (!r.ok) throw new AccountAdminError(r.status, `${method} ${pathAndQuery.split('?')[0]} ${r.status}: ${text.slice(0, 200)}`);
    return (text ? JSON.parse(text) : null) as T;
  }
  const suffix = `@${domain.toLowerCase()}`;
  return {
    async linked() {
      const out: LinkedAccount[] = [];
      for (let offset = 0; ; offset += 1000) {
        const rows = await call<{ student_no: string; user_id: string; must_change_password: boolean }[]>(
          'GET',
          `/rest/v1/student_users?select=student_no,user_id,must_change_password&order=student_no&limit=1000&offset=${offset}`,
        );
        for (const r of rows) out.push({ stNo: r.student_no, userId: r.user_id, mustChangePassword: r.must_change_password !== false });
        if (rows.length < 1000) return out;
      }
    },
    async authUsers() {
      const out: AuthUserInfo[] = [];
      for (let page = 1; ; page++) {
        const r = await call<{ users: { id: string; email?: string; last_sign_in_at?: string | null }[] }>('GET', `/auth/v1/admin/users?page=${page}&per_page=1000`);
        for (const u of r.users) if (u.email?.toLowerCase().endsWith(suffix)) out.push({ id: u.id, email: u.email.toLowerCase(), lastSignIn: u.last_sign_in_at ?? null });
        if (r.users.length < 1000) return out;
      }
    },
    async create(email, password) {
      const u = await call<{ id: string }>('POST', '/auth/v1/admin/users', {
        email,
        password,
        email_confirm: true, // 가짜 주소라 확인 메일을 보내지 않는다
        user_metadata: { portal: 'student' }, // on_partner_signup 트리거는 'partner' 만 처리
      });
      return u.id;
    },
    async link(userId, stNo) {
      await call('POST', '/rest/v1/student_users', { user_id: userId, student_no: stNo }, { Prefer: 'return=minimal' });
    },
    async resetPassword(userId, stNo, password) {
      await call('PUT', `/auth/v1/admin/users/${encodeURIComponent(userId)}`, { password });
      await call('PATCH', `/rest/v1/student_users?student_no=eq.${encodeURIComponent(stNo)}`, { must_change_password: true }, { Prefer: 'return=minimal' });
    },
  };
}
