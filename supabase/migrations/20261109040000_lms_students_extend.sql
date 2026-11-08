-- 강사 포털 학생 목록(lms_students)의 종료일을 관리자 포털과 같게: 연장이 있으면 마지막 연장 종료일(core finishOf, PR #45).
-- 업체는 연장해도 연수 종료일(tr_finish_date)을 그대로 두어, 연장 중인 학생(실제 데이터 14명)이 강사 포털 목록에서 빠지고 있었다. 여러 번 실행해도 된다.
-- 연장 표는 20261109030000_legacy_extend.sql(PR #46)과 같은 정의다. 어느 쪽을 먼저 적용해도 되도록 여기서도 없으면 만든다.

create table if not exists public.legacy_extensions (id text primary key, data jsonb not null, loaded_at timestamptz not null default now());
alter table public.legacy_extensions enable row level security;
drop policy if exists legacy_extensions_staff_read on public.legacy_extensions;
create policy legacy_extensions_staff_read on public.legacy_extensions for select to authenticated using (public.is_staff());
revoke all on public.legacy_extensions from anon, authenticated;
grant select on public.legacy_extensions to authenticated;
grant select, insert, update, delete on public.legacy_extensions to service_role;
create index if not exists legacy_extensions_tr on public.legacy_extensions ((data ->> 'tr_id'));

-- 20261108200000_teacher_portal.sql 과 같은 열·조건. 종료일만 '원래 종료일과 마지막 연장 종료일 중 늦은 날'.
-- 연장 표는 직원만 읽지만 이 함수는 security definer 라 강사도 종료일만 받는다(금액·메모 같은 연장 열은 주지 않는다).
create or replace function public.lms_students(p_on date default null)
returns table (student_no text, enrollment_id text, name text, nation text, gender text, campus text, course text, dorm text, start_date date, end_date date, batch text)
language sql stable security definer set search_path = public as $$
  with d as (select coalesce(p_on, public.manila_today()) as day),
       x as (select data ->> 'tr_id' as tr, max(left(data ->> 'tt_finish_date', 10)) as fin
               from public.legacy_extensions
              where coalesce(data ->> 'tt_start_date', '') <> ''
                and coalesce(data ->> 'tt_finish_date', '') ~ '^\d{4}-\d{2}-\d{2}'
              group by 1),
       e as (select le.id, le.data, greatest(left(le.data ->> 'tr_finish_date', 10), coalesce(x.fin, '')) as fin
               from public.legacy_enrollments le left join x on x.tr = le.id)
  select e.data ->> 'tr_st_id', e.id,
         coalesce(e.data ->> 'st_name', ''),
         coalesce(nullif(e.data ->> 'st_country_name', ''), e.data ->> 'tr_st_country_name', ''),
         coalesce(e.data ->> 'st_gender_name', ''),
         case upper(trim(coalesce(e.data ->> 'first_co_ca_code', '')))
           when 'PREMIUM' then 'Premium' when 'CHALLENGER' then 'Challenger' when 'MCO' then 'MCO'
           else coalesce(e.data ->> 'first_co_ca_code', '') end,
         coalesce(e.data ->> 'courses', ''),
         coalesce(e.data ->> 'dorms', ''),
         left(e.data ->> 'tr_start_date', 10)::date,
         e.fin::date,
         coalesce(e.data ->> 'sd_name', '')
    from e, d
   where public.is_lms_user()
     and coalesce(e.data ->> 'tr_state_name', '') !~ '캔슬|거절|취소|연기|홀드|요청'
     and coalesce(e.data ->> 'tr_start_date', '') ~ '^\d{4}-\d{2}-\d{2}'
     and coalesce(e.data ->> 'tr_finish_date', '') ~ '^\d{4}-\d{2}-\d{2}'
     and e.fin >= d.day::text
     and left(e.data ->> 'tr_start_date', 10) <= (d.day + 30)::text
   order by 6, 3;
$$;
