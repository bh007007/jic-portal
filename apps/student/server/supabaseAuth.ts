/**
 * Supabase 로그인 토큰 → 학생 번호. 학생 앱 서버(배포 Workers, 로컬 개발 서버의 Supabase 로그인 시험)가 같이 쓴다.
 * 토큰은 Supabase(PostgREST)가 검증한다: 그 토큰으로 student_users 의 자기 행을 읽어서, 읽히면 그 학생이다.
 * 직원 토큰도 student_users 를 읽을 수 있으므로 토큰의 사용자 id(sub)로 한 행만 고른다.
 */
export interface SupabaseConf {
  url: string;
  key: string; // anon(publishable) 키
}

export interface StudentSession {
  stId: string;
  mustChangePassword: boolean;
}

/** JWT 의 sub(사용자 id). 서명은 여기서 보지 않는다(아래 조회에서 Supabase 가 검증). */
export function tokenSubject(token: string): string | null {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const json = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))));
    return typeof json.sub === 'string' && /^[0-9a-f-]{36}$/i.test(json.sub) ? json.sub : null;
  } catch {
    return null;
  }
}

/** 학생 계정이면 학생 번호와 비밀번호 변경 필요 여부, 아니면 null(토큰 만료·위조, 학생이 아닌 계정). */
export async function studentFromToken(conf: SupabaseConf, token: string, fetchFn: typeof fetch = fetch): Promise<StudentSession | null> {
  const sub = tokenSubject(token);
  if (!sub) return null;
  const r = await fetchFn(`${conf.url.replace(/\/+$/, '')}/rest/v1/student_users?select=student_no,must_change_password&user_id=eq.${sub}`, {
    headers: { apikey: conf.key, Authorization: `Bearer ${token}` },
  });
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw new Error(`supabase_${r.status}`);
  const rows = (await r.json()) as { student_no: string; must_change_password: boolean }[];
  const row = rows[0];
  return row ? { stId: row.student_no, mustChangePassword: row.must_change_password === true } : null;
}

/** 같은 토큰을 매 요청마다 확인하지 않도록 잠깐 기억한다(토큰별이라 학생끼리 섞이지 않음). */
export function tokenCache(conf: SupabaseConf, ttlMs = 30_000, fetchFn: typeof fetch = fetch) {
  const hits = new Map<string, { at: number; s: StudentSession | null }>();
  return {
    async resolve(token: string, now = Date.now()): Promise<StudentSession | null> {
      const hit = hits.get(token);
      if (hit && now - hit.at < ttlMs) return hit.s;
      const s = await studentFromToken(conf, token, fetchFn);
      for (const [k, v] of hits) if (now - v.at >= ttlMs) hits.delete(k);
      // 비밀번호를 바꿔야 하는 상태는 곧 바뀌므로 기억하지 않는다.
      if (!s?.mustChangePassword) hits.set(token, { at: now, s });
      return s;
    },
  };
}
