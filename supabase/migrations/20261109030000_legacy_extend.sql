-- 연장·변경 기록(업체 추출 portal-extract-extend.js, 관리자 포털 '연장 현황'·'변경 이력', PR #45). 여러 번 실행해도 된다.
-- legacy_* 와 같은 방식: 원본 jsonb, 직원만 읽기, 서비스 키만 쓰기. 업로드 스크립트는 화면에 쓰는 열만 올린다
-- (apps/admin/server/core.ts EXTENSION_COLUMNS·CHANGE_COLUMNS, 입금 은행명·연락처 같은 열은 올리지 않음).
-- 업체는 연장해도 연수 종료일(tr_finish_date)을 그대로 두므로, 재학 여부·종료일은 마지막 연장 종료일로 계산한다(core finishOf).
-- 강사 포털 학생 목록(lms_students)도 같은 기준이 되도록 20261109040000_lms_students_extend.sql 이 legacy_extensions 를 읽는다.

create table if not exists public.legacy_extensions (id text primary key, data jsonb not null, loaded_at timestamptz not null default now()); -- 연장(tt_id)
create table if not exists public.legacy_course_changes (id text primary key, data jsonb not null, loaded_at timestamptz not null default now()); -- 코스 변경(ic_id)
create table if not exists public.legacy_dorm_changes (id text primary key, data jsonb not null, loaded_at timestamptz not null default now()); -- 기숙사 변경(ic_id)
create table if not exists public.legacy_comebacks (id text primary key, data jsonb not null, loaded_at timestamptz not null default now()); -- 복귀(ic_id)

do $$
declare t text;
begin
  foreach t in array array['legacy_extensions', 'legacy_course_changes', 'legacy_dorm_changes', 'legacy_comebacks'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_staff_read', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end
$$;

create index if not exists legacy_extensions_tr on public.legacy_extensions ((data ->> 'tr_id'));
