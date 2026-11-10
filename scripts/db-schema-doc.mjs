// 공용 DB 설계 문서(docs/db-schema.md)를 마이그레이션에서 만든다. 손으로 쓰지 않아 실제 DB와 어긋나지 않는다.
// 마이그레이션 전체를 PGlite(실제 Postgres)에 순서대로 적용한 뒤 public 의 표·열·RLS 정책을 읽어 마크다운으로 쓴다.
// 실행(저장소 루트, 의존성에 추가하지 않고 임시로 설치):
//   npm i --no-save @electric-sql/pglite@0.3
//   node scripts/db-schema-doc.mjs > docs/db-schema.md
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const { PGlite } = await import(process.env.PGLITE ? pathToFileURL(process.env.PGLITE).href : '@electric-sql/pglite');
const MIG = new URL('../supabase/migrations/', import.meta.url);
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, created_at timestamptz default now(), last_sign_in_at timestamptz, email_confirmed_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
`);
const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort();
const sources = Object.fromEntries(files.map((f) => [f, readFileSync(new URL(f, MIG), 'utf8')]));
for (const f of files) await db.exec(sources[f]);
const q = async (sql) => (await db.query(sql)).rows;

// 표를 처음 만든 마이그레이션(앱 구분용)
// legacy_tables 는 표 이름 목록을 돌며 만들어서(동적 SQL) 이름이 처음 나오는 파일로 찾는다
const createdIn = (t) =>
  files.find((f) => new RegExp(`create table (if not exists )?public\\.${t}\\b`, 'i').test(sources[f])) ??
  files.find((f) => new RegExp(`'${t}'`).test(sources[f])) ??
  '';
const appOf = (f, t) =>
  t === 'staff_users' ? '관리자 앱'
  : t.startsWith('legacy_') ? '업체 원본(legacy)'
  : /partner|reco|agency_staff/.test(f) ? '에이전시(파트너) 포털'
  : /teacher|attendance|lms|schedule|roles|user_directory|holidays|staff_name/.test(f) ? '강사 포털·공통 권한'
  : /intranet|keycard|guard|trip|overnight|nonacademic|absence|student_|notice|counsel/.test(f) ? '학생 앱·인트라넷'
  : /core_schema/.test(f) ? '정규화 표(학원 계정에서 적용)'
  : /change_requests/.test(f) ? '관리자 앱'
  : /legacy/.test(f) ? '업체 원본(legacy)'
  : '기타';

const tables = await q(`
  select c.relname t, c.relrowsecurity rls, obj_description(c.oid) note
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') order by c.relname`);
const cols = await q(`
  select table_name t, column_name c, data_type ty, is_nullable nul, column_default def
  from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`);
const pols = await q(`select tablename t, policyname p, cmd, roles::text roles from pg_policies where schemaname = 'public' order by tablename, policyname`);
const views = await q(`select table_name t from information_schema.views where table_schema = 'public' order by 1`);

const groups = new Map();
for (const t of tables) {
  const f = createdIn(t.t);
  const g = appOf(f, t.t);
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push({ ...t, f });
}
const order = ['업체 원본(legacy)', '관리자 앱', '에이전시(파트너) 포털', '강사 포털·공통 권한', '학생 앱·인트라넷', '정규화 표(학원 계정에서 적용)', '기타'];

const out = [];
out.push('# 공용 DB 설계 (현재 저장소 기준)');
out.push('');
out.push('이 파일은 `node scripts/db-schema-doc.mjs > docs/db-schema.md`로 만든다(마이그레이션 전체를 순서대로 적용한 DB에서 읽음). 손으로 고치지 않는다.');
out.push('');
out.push('- **원본 관계**: 공동 작업 방식(11/10 안)에서 공용 DB 설계의 원본은 이 저장소다. 기획의 \'공용 DB 설계표\'(엑셀)와 다른 곳은 차이 목록으로 맞추고, 테이블 변경은 DB 관리자(지정 필요)가 승인한다(`docs/collab.md`).');
out.push('- **정규화 표 계획**은 `docs/schema.md`, 권한(역할)은 `docs/roles.md`, 업체 원본 열 뜻은 `docs/data-dictionary*.md`.');
out.push(`- 마이그레이션 ${files.length}개, 표 ${tables.length}개, 뷰 ${views.length}개. 모든 표에 RLS 가 켜져 있는지는 CI 시험 \`supabase/tests/security_lint.mjs\`가 본다.`);
out.push('');
out.push('## 표 목록');
out.push('');
out.push('| 영역 | 표 | 열 수 | RLS | 정책 | 처음 만든 마이그레이션 |');
out.push('| --- | --- | --- | --- | --- | --- |');
for (const g of order) for (const t of groups.get(g) ?? []) {
  out.push(`| ${g} | \`${t.t}\` | ${cols.filter((c) => c.t === t.t).length} | ${t.rls ? '켜짐' : '**꺼짐**'} | ${pols.filter((p) => p.t === t.t).length} | ${t.f.replace('.sql', '')} |`);
}
if (views.length) {
  out.push('');
  out.push(`뷰: ${views.map((v) => `\`${v.t}\``).join(', ')}`);
}
for (const g of order) {
  const list = groups.get(g);
  if (!list?.length) continue;
  out.push('');
  out.push(`## ${g}`);
  for (const t of list) {
    out.push('');
    out.push(`### \`${t.t}\``);
    if (t.note) out.push('', t.note);
    out.push('');
    out.push('| 열 | 형식 | 비움 | 기본값 |');
    out.push('| --- | --- | --- | --- |');
    for (const c of cols.filter((c) => c.t === t.t)) {
      out.push(`| \`${c.c}\` | ${c.ty} | ${c.nul === 'YES' ? '가능' : ''} | ${c.def ? '`' + String(c.def).replace(/\|/g, '\\|').slice(0, 60) + '`' : ''} |`);
    }
    const ps = pols.filter((p) => p.t === t.t);
    if (ps.length) out.push('', '정책: ' + ps.map((p) => `\`${p.p}\`(${p.cmd}, ${p.roles.replace(/[{}]/g, '')})`).join(', '));
  }
}
console.log(out.join('\n'));
