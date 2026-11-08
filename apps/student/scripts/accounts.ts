/**
 * 학생 계정 만들기 (11/8 결정, 기획안 V4): 재학·입학 예정 학생마다 Supabase Auth 계정을 만들고 student_users 에 잇는다.
 * 아이디 = 학생번호(로그인 화면), 첫 비밀번호 = 생년월일 8자리, 첫 로그인 때 비밀번호를 바꾼다.
 *
 *   $env:SUPABASE_URL = "https://xxxx.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "서비스 키 (Supabase > Project Settings > API)"
 *   npm run student:accounts                      # 미리보기: 만들 건수만 보여 주고 아무것도 바꾸지 않는다
 *   npm run student:accounts -- --apply           # 실제로 만든다(이미 있는 계정은 건너뜀, 여러 번 실행해도 됨)
 *   npm run student:accounts -- --reset 30095     # 비밀번호를 잊은 학생: 생년월일로 되돌리고 다시 바꾸게 한다
 *
 * 데이터는 기본이 가짜 샘플(data-sample/tables). 실제 추출본은 보안 점검 전까지 쓰지 않는다(2026-11-07 결정).
 * 꼭 필요하면 --dir data/tables --allow-real. 화면에는 건수만 내보내고, 학생별 실패는 .local-db/student/ 파일에 남긴다.
 * 이메일 도메인을 바꾸려면 STUDENT_EMAIL_DOMAIN(학생 앱의 VITE_STUDENT_EMAIL_DOMAIN 과 같게).
 * 서비스 키는 모든 권한을 가진 키다. 코드·GitHub·메신저에 붙여 넣지 말고 이 터미널에서만 쓴다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadDir } from '../../admin/server/localData';
import { DEFAULT_EMAIL_DOMAIN, initialPassword, planAccounts } from '../server/accounts';

// npm 이 워크스페이스 스크립트를 apps/student 에서 실행하므로 저장소 루트는 두 단계 위다.
const repo = path.resolve(process.cwd(), '../..');
const args = process.argv.slice(2);
const has = (name: string) => args.includes(name);
const val = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);

const dir = path.resolve(repo, val('--dir') ?? 'data-sample/tables');
const url = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const domain = (process.env.STUDENT_EMAIL_DOMAIN || DEFAULT_EMAIL_DOMAIN).toLowerCase();

function stop(msg: string): never {
  console.error(msg);
  process.exit(1);
}
if (!url || !key) stop('SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 환경변수를 먼저 설정하세요.');
if (!fs.existsSync(path.join(dir, 'enrollments.ndjson'))) stop(`데이터 폴더에 enrollments.ndjson 이 없습니다: ${path.relative(repo, dir)}`);
if (!path.relative(repo, dir).replace(/\\/g, '/').startsWith('data-sample/') && !has('--allow-real')) {
  stop('실제 추출본으로는 보안 점검 전까지 계정을 만들지 않습니다(2026-11-07 결정). 필요하면 --allow-real 을 붙이세요.');
}

// 예전 형식 service_role 키(eyJ…)는 Authorization 에도 넣고, 새 형식(sb_secret_…)은 apikey 헤더만 쓴다(scripts/upload-to-supabase.mjs 와 같음).
const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json', ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };

async function call<T>(method: string, pathAndQuery: string, body?: unknown, extra: Record<string, string> = {}): Promise<T> {
  const r = await fetch(`${url}${pathAndQuery}`, { method, headers: { ...headers, ...extra }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${pathAndQuery.split('?')[0]} ${r.status}: ${text.slice(0, 200)}`);
  return (text ? JSON.parse(text) : null) as T;
}

async function linkedStudents(): Promise<Set<string>> {
  const out = new Set<string>();
  for (let offset = 0; ; offset += 1000) {
    const rows = await call<{ student_no: string }[]>('GET', `/rest/v1/student_users?select=student_no&order=student_no&limit=1000&offset=${offset}`);
    rows.forEach((r) => out.add(r.student_no));
    if (rows.length < 1000) return out;
  }
}

/** 이 도메인의 Auth 사용자(이메일 → id). 지난 실행이 계정만 만들고 끊긴 경우를 잇기 위해 본다. */
async function authUsers(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let page = 1; ; page++) {
    const r = await call<{ users: { id: string; email?: string }[] }>('GET', `/auth/v1/admin/users?page=${page}&per_page=1000`);
    for (const u of r.users) if (u.email?.toLowerCase().endsWith(`@${domain}`)) out.set(u.email.toLowerCase(), u.id);
    if (r.users.length < 1000) return out;
  }
}

const link = (userId: string, stNo: string) =>
  call('POST', '/rest/v1/student_users', { user_id: userId, student_no: stNo }, { Prefer: 'return=minimal' });

function saveFailures(kind: string, rows: { stNo: string; error: string }[]) {
  if (!rows.length) return;
  const out = path.join(repo, '.local-db/student', `accounts-${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(rows, null, 2));
  console.log(`실패 ${rows.length}건 → ${path.relative(repo, out)} (학생 번호와 오류. Git 제외 폴더)`);
}

const db = loadDir(dir);
console.log(`데이터: ${path.relative(repo, dir)} (${db.meta().source === 'sample' ? '샘플' : '실제 추출본'}, 기준일 ${db.refDate}) · 이메일 도메인 ${domain}`);

const resetNo = val('--reset');
if (resetNo !== undefined) {
  // 비밀번호 초기화: 생년월일로 되돌리고 첫 로그인처럼 다시 바꾸게 한다.
  const rows = await call<{ user_id: string }[]>('GET', `/rest/v1/student_users?select=user_id&student_no=eq.${encodeURIComponent(resetNo)}`);
  if (!rows[0]) stop('그 학생 번호로 연결된 계정이 없습니다.');
  const password = initialPassword(db.studentDetail(resetNo)?.student.birthday);
  if (!password) stop('데이터에서 그 학생의 생년월일을 찾지 못했습니다.');
  if (!has('--apply')) stop('미리보기: 계정 1건을 생년월일 비밀번호로 되돌립니다. 실행하려면 --apply 를 붙이세요.');
  await call('PUT', `/auth/v1/admin/users/${rows[0].user_id}`, { password });
  await call('PATCH', `/rest/v1/student_users?student_no=eq.${encodeURIComponent(resetNo)}`, { must_change_password: true }, { Prefer: 'return=minimal' });
  console.log('비밀번호를 생년월일로 되돌렸습니다. 다음 로그인 때 새 비밀번호를 정하게 됩니다.');
  process.exit(0);
}

const plan = planAccounts(db, { linked: await linkedStudents(), authUsers: await authUsers() }, domain);
console.log(`대상(재학·입학 예정 학생) ${plan.counts.targets}명 · 이미 있음 ${plan.counts.linked} · 새로 만들 계정 ${plan.create.length} · 연결만 할 계정 ${plan.link.length} · 생년월일 없음(건너뜀) ${plan.counts.noBirthday}`);
if (!has('--apply')) {
  console.log('미리보기라 아무것도 바꾸지 않았습니다. 만들려면 --apply 를 붙이세요.');
  process.exit(0);
}

const failures: { stNo: string; error: string }[] = [];
let created = 0;
let linked = 0;
for (const x of plan.link) {
  try {
    await link(x.userId, x.stNo);
    linked++;
  } catch (e) {
    failures.push({ stNo: x.stNo, error: (e as Error).message });
  }
}
for (const x of plan.create) {
  try {
    const u = await call<{ id: string }>('POST', '/auth/v1/admin/users', {
      email: x.email,
      password: x.password,
      email_confirm: true, // 가짜 주소라 확인 메일을 보내지 않는다
      user_metadata: { portal: 'student' }, // on_partner_signup 트리거는 'partner' 만 처리
    });
    created++;
    await link(u.id, x.stNo);
    linked++;
  } catch (e) {
    failures.push({ stNo: x.stNo, error: (e as Error).message });
  }
}
console.log(`만든 계정 ${created} · 연결 ${linked} · 실패 ${failures.length}`);
saveFailures('failed', failures);
if (failures.length) {
  console.log('실패한 학생은 다시 실행하면 이어서 처리합니다(계정만 만들어진 경우 연결만 한다).');
  process.exit(1);
}
