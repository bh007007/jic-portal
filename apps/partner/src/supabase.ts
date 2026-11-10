import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** 파트너 포털은 데이터가 모두 공용 DB에 있어 Supabase 설정이 반드시 필요하다. */
export const configured = Boolean(url && key);
export const supabase = createClient(url || 'http://localhost', key || 'missing');

/** Supabase 오류를 화면용 문장으로. */
export function errText(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e);
  if (m === 'Invalid login credentials') return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (m === 'Email not confirmed') return '이메일 인증이 끝나지 않았습니다. 받은 편지함의 인증 메일을 확인하세요.';
  if (/User already registered/i.test(m)) return '이미 등록된 이메일입니다. 로그인하거나 비밀번호 찾기를 이용하세요.';
  // 메일 발송 서비스(Resend, docs/mail-service.md) 연결 전에는 Supabase 기본 메일이 팀원 주소로만 간다
  if (/Email address not authorized/i.test(m)) return '지금은 이 주소로 인증 메일을 보낼 수 없습니다(메일 발송 설정 전). JIC 담당자에게 문의하세요.';
  if (/Signups not allowed/i.test(m)) return '지금은 새 가입을 받지 않습니다. JIC 담당자에게 문의하세요.';
  const wait = m.match(/only request this after (\d+) seconds?/i);
  if (wait) return `보안을 위해 ${wait[1]}초 뒤에 다시 시도하세요.`;
  if (/rate limit/i.test(m)) return '메일을 너무 자주 보냈습니다. 잠시 뒤에 다시 시도하세요.';
  if (/invalid format|valid email/i.test(m)) return '이메일 형식을 확인하세요.';
  if (/Password should be at least/i.test(m)) return '비밀번호가 너무 짧습니다. 8자 이상으로 정하세요.';
  if (/Email link is invalid or has expired|otp_expired/i.test(m)) return '메일의 링크가 만료되었거나 이미 쓰였습니다. 다시 요청하세요.';
  if (/Failed to fetch/i.test(m)) return '서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.';
  return m;
}

/** 가입 인증 메일 다시 보내기(링크를 잃어버렸거나 만료됐을 때). 같은 주소로 다시 가입할 수는 없어서 이 길이 필요하다. */
export async function resendSignupEmail(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resend({ type: 'signup', email: email.trim().toLowerCase(), options: { emailRedirectTo: `${location.origin}/login` } });
  return error ? errText(error) : null;
}

/** select 결과에서 오류면 던지고 데이터만 돌려준다. */
export async function must<T>(q: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw error;
  return data as T;
}
