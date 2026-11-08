-- 휴일(기획안 기준 코드 holidays, 업체 포털 기초코드관리 > 휴일). 여러 번 실행해도 된다.
-- 쓰기는 관리자 포털(직원)만, 읽기는 로그인한 모든 포털(직원·강사·학생·에이전시). 출석(강사 포털)·달력·학생 포털이 같은 표를 읽는다(원칙 C2).
-- 캠퍼스 '' = 모든 캠퍼스. 같은 날 같은 캠퍼스에는 하나만.

create table if not exists public.holidays (
  day date not null,
  campus text not null default '',
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'public' check (kind in ('public', 'school')), -- public = 필리핀 공휴일, school = 학원 휴일
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  primary key (day, campus)
);

alter table public.holidays enable row level security;
revoke all on public.holidays from anon, authenticated;
grant select, insert, update, delete on public.holidays to service_role;
grant select, delete on public.holidays to authenticated;
grant insert (day, campus, name, kind) on public.holidays to authenticated;
grant update (name, kind) on public.holidays to authenticated;

drop policy if exists holidays_read on public.holidays;
create policy holidays_read on public.holidays for select to authenticated using (true);
drop policy if exists holidays_insert on public.holidays;
create policy holidays_insert on public.holidays for insert to authenticated with check (public.is_staff());
drop policy if exists holidays_update on public.holidays;
create policy holidays_update on public.holidays for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists holidays_delete on public.holidays;
create policy holidays_delete on public.holidays for delete to authenticated using (public.is_staff());
