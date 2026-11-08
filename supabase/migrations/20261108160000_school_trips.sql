-- 학교 여행·액티비티(업체 'Outing > Travel'의 tra 여행 / trt 신청자, 기획안 'Travel → 여행 신청과 외박 허용').
-- 직원이 인트라넷에서 여행을 올리고, 학생이 학생 앱에서 참가 신청·취소한다. 1박 이상 여행의 참가 신청은 외박 허용으로 본다
-- (인트라넷 core 가 계산한다. 이 표에는 외박 허용 행을 따로 만들지 않는다).
-- 규칙은 apps/student/server/trips.ts 와 같다. 쓰기는 나뉜다: 여행 등록·수정·마감·취소·명단 제외는 직원, 신청·취소는 학생(기획안 C2).
-- 기획안 데이터 모델에 여행 테이블 이름이 없어 trips·trip_signups 로 지었다(연수 단위 기록이라 enrollment_id 를 넣는다).
-- 20261108100000_student_intranet.sql 의 is_staff()·is_student()·is_guard()·current_student_no()·current_staff_name()·manila_today() 를 쓴다.
-- 여러 번 실행해도 된다.

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  campus text not null default '', -- '' = 전체 캠퍼스
  title text not null check (char_length(title) between 1 and 100),
  place text not null check (char_length(place) between 1 and 100),
  meeting text not null default '' check (char_length(meeting) <= 100), -- 집합 시간·장소
  description text not null default '' check (char_length(description) <= 1000), -- 일정·포함 사항·준비물
  start_date date not null,
  end_date date not null, -- 당일 여행이면 출발일과 같다
  deadline date not null, -- 신청 마감일(그날까지)
  capacity int not null check (capacity between 1 and 500),
  cost int not null default 0 check (cost between 0 and 1000000), -- PHP, 0 = 무료
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  seats_taken int not null default 0 check (seats_taken >= 0), -- 참가 신청 수. 아래 신청 함수만 바꾼다
  created_by uuid default auth.uid() references auth.users (id),
  created_by_name text not null default coalesce(public.current_staff_name(), ''), -- 올린 직원(화면이 보내는 이름은 믿지 않는다)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date and end_date - start_date <= 14),
  check (deadline <= start_date),
  check (seats_taken <= capacity)
);

create table if not exists public.trip_signups (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  student_no text not null,
  enrollment_id text not null, -- 여행 날짜가 들어가는 연수
  status text not null default 'applied' check (status in ('applied', 'cancelled', 'removed')),
  removed_reason text check (removed_reason is null or char_length(removed_reason) <= 300), -- 학생에게 보인다
  handled_at timestamptz,
  handled_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'removed' or char_length(coalesce(removed_reason, '')) > 0) -- 명단 제외는 사유가 있어야 한다
);
-- 한 여행에 한 학생은 참가 신청 하나만(취소·제외 뒤 다시 신청은 된다)
create unique index if not exists trip_signups_one_applied on public.trip_signups (trip_id, student_no) where status = 'applied';
create index if not exists trip_signups_student on public.trip_signups (student_no);
create index if not exists trip_signups_trip on public.trip_signups (trip_id);

alter table public.trips enable row level security;
alter table public.trip_signups enable row level security;
revoke all on public.trips, public.trip_signups from anon, authenticated;
grant select, insert, update, delete on public.trips, public.trip_signups to service_role;

-- 여행: 직원·학생·가드가 읽는다(일정·장소·비용은 숨길 것이 없다. 학생 화면은 자기 캠퍼스와 전체만 보인다).
-- 직원은 넣을 수 있는 열만 등록·수정한다. 취소한 여행은 고치지 않는다. 지우기는 없다(신청 기록을 남긴다).
grant select on public.trips to authenticated;
grant insert (id, campus, title, place, meeting, description, start_date, end_date, deadline, capacity, cost) on public.trips to authenticated;
grant update (campus, title, place, meeting, description, start_date, end_date, deadline, capacity, cost, status, updated_at) on public.trips to authenticated;
drop policy if exists trips_read on public.trips;
create policy trips_read on public.trips for select to authenticated
  using (public.is_staff() or public.is_student() or public.is_guard());
drop policy if exists trips_insert on public.trips;
create policy trips_insert on public.trips for insert to authenticated
  with check (public.is_staff() and status = 'open' and seats_taken = 0 and start_date >= public.manila_today());
drop policy if exists trips_update on public.trips;
create policy trips_update on public.trips for update to authenticated
  using (public.is_staff() and status <> 'cancelled')
  with check (public.is_staff());

-- 참가 신청: 학생은 자기 것, 직원은 모두, 가드는 참가 신청(applied)만 읽는다(외박 허용 판정용, 제외 사유는 안 보임).
-- 쓰기는 아래 함수로만.
grant select on public.trip_signups to authenticated;
drop policy if exists trip_signups_read on public.trip_signups;
create policy trip_signups_read on public.trip_signups for select to authenticated
  using (student_no = public.current_student_no() or public.is_staff() or (public.is_guard() and status = 'applied'));

-- 그 연수가 그 학생 것이고, 여행 날짜(출발일~돌아오는 날)를 모두 담고, 캠퍼스가 맞는지(업체 원본 legacy_enrollments).
-- 캠퍼스 이름은 관리자 core 의 campusName 과 같다(first_co_ca_code). 취소·연기된 연수는 뺀다(core 의 CANCELLED 와 같은 낱말).
create or replace function public.trip_enrollment_ok(p_enrollment text, p_student_no text, p_start date, p_end date, p_campus text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.legacy_enrollments e
     where e.id = p_enrollment
       and e.data ->> 'tr_st_id' = p_student_no
       and coalesce(e.data ->> 'tr_state_name', '') !~ '캔슬|거절|취소|연기|홀드|요청'
       and left(coalesce(e.data ->> 'tr_start_date', ''), 10) <> ''
       and left(e.data ->> 'tr_start_date', 10) <= p_start::text
       and left(coalesce(e.data ->> 'tr_finish_date', ''), 10) >= p_end::text
       and (p_campus = '' or p_campus = case upper(trim(coalesce(e.data ->> 'first_co_ca_code', '')))
             when 'PREMIUM' then 'Premium' when 'CHALLENGER' then 'Challenger' when 'MCO' then 'MCO'
             else e.data ->> 'first_co_ca_code' end)
  );
$$;

-- 참가 신청 수를 다시 센다(신청 함수 안에서만 부른다)
create or replace function public.trip_recount(p_trip uuid)
returns void language sql security definer set search_path = public as $$
  update public.trips set seats_taken = (select count(*) from public.trip_signups where trip_id = p_trip and status = 'applied') where id = p_trip;
$$;

-- 학생 참가 신청: 신청 받는 중, 마감일 전, 같은 여행에 신청하지 않았음, 자리 있음, 연수 기간·캠퍼스가 맞을 때.
-- 여행 행을 잠가 동시에 신청해도 정원을 넘지 않는다. 신청 번호는 서버가 정해 넘길 수 있다(없으면 새로).
create or replace function public.trip_sign_up(p_trip uuid, p_enrollment text, p_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me text := public.current_student_no();
  t public.trips;
  new_id uuid := coalesce(p_id, gen_random_uuid());
begin
  if me is null then raise exception 'student_only'; end if;
  select * into t from public.trips where id = p_trip for update;
  if not found then raise exception 'not_found'; end if;
  if t.status = 'cancelled' then raise exception 'trip_cancelled'; end if;
  if t.status = 'closed' or public.manila_today() > t.deadline then raise exception 'trip_closed'; end if;
  if exists (select 1 from public.trip_signups where trip_id = p_trip and student_no = me and status = 'applied') then raise exception 'already_applied'; end if;
  if t.seats_taken >= t.capacity then raise exception 'trip_full'; end if;
  if not public.trip_enrollment_ok(p_enrollment, me, t.start_date, t.end_date, t.campus) then raise exception 'outside_enrollment'; end if;
  insert into public.trip_signups (id, trip_id, student_no, enrollment_id) values (new_id, p_trip, me, p_enrollment);
  perform public.trip_recount(p_trip);
  return new_id;
end $$;

-- 학생 신청 취소: 자기 참가 신청만, 신청 마감일까지
create or replace function public.trip_cancel_signup(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.trip_signups;
  t public.trips;
begin
  select * into s from public.trip_signups where id = p_id and student_no = public.current_student_no();
  if not found then raise exception 'not_found'; end if;
  select * into t from public.trips where id = s.trip_id for update;
  select * into s from public.trip_signups where id = p_id for update;
  if s.status <> 'applied' then raise exception 'not_applied'; end if;
  if t.status = 'cancelled' then raise exception 'trip_cancelled'; end if;
  if public.manila_today() > t.deadline then raise exception 'deadline_passed'; end if;
  update public.trip_signups set status = 'cancelled', updated_at = now() where id = p_id;
  perform public.trip_recount(s.trip_id);
end $$;

-- 직원 명단 제외: 참가 신청만, 사유 필수(학생에게 보인다). 처리자는 로그인한 직원.
create or replace function public.trip_remove_signup(p_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.trip_signups;
  reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_staff() then raise exception 'staff_only'; end if;
  if reason is null then raise exception 'reason_required'; end if;
  if char_length(reason) > 300 then raise exception 'reason_too_long'; end if;
  select * into s from public.trip_signups where id = p_id;
  if not found then raise exception 'not_found'; end if;
  perform 1 from public.trips where id = s.trip_id for update;
  select * into s from public.trip_signups where id = p_id for update;
  if s.status <> 'applied' then raise exception 'not_applied'; end if;
  update public.trip_signups
     set status = 'removed', removed_reason = reason, handled_at = now(), handled_by = auth.uid(), updated_at = now()
   where id = p_id;
  perform public.trip_recount(s.trip_id);
end $$;

revoke execute on function public.trip_enrollment_ok(text, text, date, date, text) from public, anon, authenticated;
grant execute on function public.trip_enrollment_ok(text, text, date, date, text) to service_role;
revoke execute on function public.trip_recount(uuid) from public, anon, authenticated;
grant execute on function public.trip_recount(uuid) to service_role;
revoke execute on function public.trip_sign_up(uuid, text, uuid) from public, anon;
grant execute on function public.trip_sign_up(uuid, text, uuid) to authenticated, service_role;
revoke execute on function public.trip_cancel_signup(uuid) from public, anon;
grant execute on function public.trip_cancel_signup(uuid) to authenticated, service_role;
revoke execute on function public.trip_remove_signup(uuid, text) from public, anon;
grant execute on function public.trip_remove_signup(uuid, text) to authenticated, service_role;
