-- 학교 여행 대기자(11/10 결정 I12, docs/leo-todo.md): 정원이 차면 '대기'로 받고, 참가 신청이 빠지거나 정원이 늘면
-- 신청한 순서대로 참가로 올린다. 규칙은 apps/student/server/trips.ts 와 같다(signUp·promotions·waitingPosition).
-- 20261108160000_school_trips.sql 의 신청·취소·명단 제외 함수를 같은 내용으로 다시 만들고 대기만 더했다.
-- 그 파일을 다시 실행하면 이 파일도 다시 실행한다. 여러 번 실행해도 된다.

-- ── 신청 상태에 waiting(대기). 한 여행에 한 학생은 살아 있는 신청(참가·대기) 하나만
alter table public.trip_signups drop constraint if exists trip_signups_status_check;
alter table public.trip_signups add constraint trip_signups_status_check check (status in ('applied', 'waiting', 'cancelled', 'removed'));
drop index if exists public.trip_signups_one_applied;
create unique index if not exists trip_signups_one_live on public.trip_signups (trip_id, student_no) where status in ('applied', 'waiting');

-- ── 대기자를 참가로 올린다: 취소된 여행이 아니면 남은 자리만큼 신청한 순서대로(같으면 번호 순). 신청 함수·정원 변경에서만 부른다
create or replace function public.trip_promote(p_trip uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.trips;
  room int;
begin
  select * into t from public.trips where id = p_trip;
  if not found or t.status = 'cancelled' then return; end if;
  room := t.capacity - (select count(*) from public.trip_signups where trip_id = p_trip and status = 'applied');
  if room > 0 then
    update public.trip_signups set status = 'applied', updated_at = now()
     where id in (select id from public.trip_signups where trip_id = p_trip and status = 'waiting' order by created_at, id limit room);
  end if;
  perform public.trip_recount(p_trip);
end $$;

-- ── 학생 참가 신청: 정원이 찼으면 대기로 받는다(그 밖의 규칙은 그대로). 여행 행을 잠가 동시에 신청해도 정원을 넘지 않는다
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
  if exists (select 1 from public.trip_signups where trip_id = p_trip and student_no = me and status in ('applied', 'waiting')) then raise exception 'already_applied'; end if;
  if not public.trip_enrollment_ok(p_enrollment, me, t.start_date, t.end_date, t.campus) then raise exception 'outside_enrollment'; end if;
  insert into public.trip_signups (id, trip_id, student_no, enrollment_id, status)
  values (new_id, p_trip, me, p_enrollment, case when t.seats_taken >= t.capacity then 'waiting' else 'applied' end);
  perform public.trip_recount(p_trip);
  return new_id;
end $$;

-- ── 학생 신청 취소(참가·대기): 자기 것만, 신청 마감일까지. 참가가 빠지면 대기자를 올린다
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
  if s.status not in ('applied', 'waiting') then raise exception 'not_applied'; end if;
  if t.status = 'cancelled' then raise exception 'trip_cancelled'; end if;
  if public.manila_today() > t.deadline then raise exception 'deadline_passed'; end if;
  update public.trip_signups set status = 'cancelled', updated_at = now() where id = p_id;
  perform public.trip_promote(s.trip_id);
end $$;

-- ── 직원 명단 제외(참가·대기): 사유 필수(학생에게 보인다). 처리자는 로그인한 직원. 참가가 빠지면 대기자를 올린다
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
  if s.status not in ('applied', 'waiting') then raise exception 'not_applied'; end if;
  update public.trip_signups
     set status = 'removed', removed_reason = reason, handled_at = now(), handled_by = auth.uid(), updated_at = now()
   where id = p_id;
  perform public.trip_promote(s.trip_id);
end $$;

-- ── 대기 순서(1부터): 학생은 남의 신청을 못 읽으므로 자기 대기 신청의 순서만 함수로 받는다. 대기가 아니거나 남의 것이면 null
create or replace function public.trip_waiting_no(p_id uuid)
returns int language sql stable security definer set search_path = public as $$
  select n::int from (
    select s.id, row_number() over (order by s.created_at, s.id) as n
      from public.trip_signups s
     where s.trip_id = (select trip_id from public.trip_signups where id = p_id) and s.status = 'waiting'
  ) w
   where w.id = p_id
     and exists (select 1 from public.trip_signups me where me.id = p_id
                  and (me.student_no = public.current_student_no() or public.is_staff()));
$$;

-- ── 직원이 정원을 늘리면 대기자를 올린다(정원 줄이기는 참가 수 아래로 못 한다: core·DB 확인)
create or replace function public.trip_capacity_promote()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.capacity > old.capacity then perform public.trip_promote(new.id); end if;
  return null;
end $$;
drop trigger if exists trips_capacity_promote on public.trips;
create trigger trips_capacity_promote after update of capacity on public.trips
  for each row execute function public.trip_capacity_promote();

-- ── 실행 권한: 익명은 막는다. 올리기·트리거 함수는 직접 부르지 못한다(신청 함수·트리거 안에서만)
revoke execute on function public.trip_promote(uuid) from public, anon, authenticated;
grant execute on function public.trip_promote(uuid) to service_role;
revoke execute on function public.trip_capacity_promote() from public, anon, authenticated;
revoke execute on function public.trip_sign_up(uuid, text, uuid) from public, anon;
grant execute on function public.trip_sign_up(uuid, text, uuid) to authenticated, service_role;
revoke execute on function public.trip_cancel_signup(uuid) from public, anon;
grant execute on function public.trip_cancel_signup(uuid) to authenticated, service_role;
revoke execute on function public.trip_remove_signup(uuid, text) from public, anon;
grant execute on function public.trip_remove_signup(uuid, text) to authenticated, service_role;
revoke execute on function public.trip_waiting_no(uuid) from public, anon;
grant execute on function public.trip_waiting_no(uuid) to authenticated, service_role;
