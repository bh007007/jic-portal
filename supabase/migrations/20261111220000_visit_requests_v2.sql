-- 방문 신청 확장(CL-046, 화면 명세 4.6). 여러 번 실행해도 된다.
-- 신청서(시제품 V74 항목): 방문 캠퍼스(필수, 두 캠퍼스면 캠퍼스마다 한 건), 희망일 1순위(필수)·2순위, 시간, 인원, 방문 목적(여러 개), 공항·시내 픽업, 요청사항.
-- 처리 흐름: 접수 → 일정 조율 중 → 승인 요청 → 확정 / 반려, 끝나지 않은 단계에서는 언제든 취소(에이전시 또는 직원, 사유). 단계 이동은 트리거가 검사하고 이력에 남긴다.
-- 누가 어느 단계를 처리하는지(그 나라 마케터·그 캠퍼스 센터장)는 11/12 권한 정리(Q-4) 뒤. 지금은 직원 모두(정책 visit_requests_staff_all).
-- 에이전시는 자기 신청만 보고, 새로 넣거나(대표만) 취소 함수로 취소만 한다. 이력(visit_request_events)은 직원만 본다. 앱 쪽 같은 규칙: apps/partner/src/visits.ts

-- 1) 칸 더하기
alter table public.visit_requests add column if not exists campus text;
alter table public.visit_requests add column if not exists visit_date2 date;
alter table public.visit_requests add column if not exists visit_time text;
alter table public.visit_requests add column if not exists purposes text[] not null default '{}';
alter table public.visit_requests add column if not exists pickup text not null default 'none';
alter table public.visit_requests add column if not exists schedule_date date;
alter table public.visit_requests add column if not exists schedule_time text;
alter table public.visit_requests add column if not exists decision_reason text;
alter table public.visit_requests add column if not exists updated_at timestamptz not null default now();
-- 예전 '방문 목적' 글은 요청사항으로 쓴다(이제 선택)
alter table public.visit_requests alter column purpose drop not null;

alter table public.visit_requests drop constraint if exists visit_requests_status_check;
alter table public.visit_requests add constraint visit_requests_status_check
  check (status in ('received', 'scheduling', 'approval', 'confirmed', 'rejected', 'cancelled', 'done'));
alter table public.visit_requests drop constraint if exists visit_requests_campus_check;
alter table public.visit_requests add constraint visit_requests_campus_check check (campus is null or campus in ('premium', 'challenger', 'new'));
alter table public.visit_requests drop constraint if exists visit_requests_pickup_check;
alter table public.visit_requests add constraint visit_requests_pickup_check check (pickup in ('none', 'airport', 'city'));
alter table public.visit_requests drop constraint if exists visit_requests_purposes_check;
alter table public.visit_requests add constraint visit_requests_purposes_check
  check (purposes <@ array['캠퍼스 투어', '수업 참관', '기숙사 확인', '운영진 미팅', '학생 면담']::text[]);
alter table public.visit_requests drop constraint if exists visit_requests_text_check;
alter table public.visit_requests add constraint visit_requests_text_check check (
  coalesce(length(visit_time), 0) <= 50 and coalesce(length(schedule_time), 0) <= 50 and coalesce(length(purpose), 0) <= 2000
  and coalesce(length(staff_note), 0) <= 2000 and coalesce(length(decision_reason), 0) <= 1000
);
alter table public.visit_requests drop constraint if exists visit_requests_date2_check;
alter table public.visit_requests add constraint visit_requests_date2_check check (visit_date2 is null or visit_date2 <> visit_date);
create index if not exists visit_requests_status on public.visit_requests (status, visit_date);

-- 2) 이력(직원 메모·단계 이동). 고치거나 지우지 않는다
create table if not exists public.visit_request_events (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.visit_requests (id) on delete cascade,
  kind text not null check (kind in ('status', 'memo')),
  from_status text,
  to_status text,
  note text check (note is null or length(note) <= 2000),
  actor uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists visit_request_events_request on public.visit_request_events (request_id, created_at);
create index if not exists visit_request_events_actor on public.visit_request_events (actor);
alter table public.visit_request_events enable row level security;
revoke all on public.visit_request_events from anon, authenticated;
grant select, insert on public.visit_request_events to authenticated;
grant select, insert, update, delete on public.visit_request_events to service_role;
drop policy if exists visit_events_staff_read on public.visit_request_events;
create policy visit_events_staff_read on public.visit_request_events for select to authenticated using (public.is_staff());
-- 직원이 직접 넣는 것은 메모만(단계 이동 이력은 트리거가 넣는다)
drop policy if exists visit_events_staff_memo on public.visit_request_events;
create policy visit_events_staff_memo on public.visit_request_events for insert to authenticated
  with check (public.is_staff() and kind = 'memo' and actor = (select auth.uid()) and from_status is null and to_status is null);

-- 3) 단계 검사·이력 트리거
create or replace function public.visit_request_track()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.visit_request_events (request_id, kind, to_status, actor) values (new.id, 'status', new.status, (select auth.uid()));
    return new;
  end if;
  new.updated_at := now();
  if new.status is distinct from old.status then
    if not (
      (old.status = 'received' and new.status in ('scheduling', 'cancelled'))
      or (old.status = 'scheduling' and new.status in ('approval', 'cancelled'))
      or (old.status = 'approval' and new.status in ('confirmed', 'rejected', 'scheduling', 'cancelled'))
      or (old.status = 'confirmed' and new.status in ('cancelled', 'done'))
    ) then
      raise exception '방문 신청을 % 에서 % (으)로 바꿀 수 없습니다', old.status, new.status using errcode = 'check_violation';
    end if;
    if new.status in ('rejected', 'cancelled') and coalesce(btrim(new.decision_reason), '') = '' then
      raise exception '반려·취소는 사유가 있어야 합니다' using errcode = 'check_violation';
    end if;
    if new.status = 'approval' and new.schedule_date is null then
      raise exception '승인 요청 전에 조율한 방문 날짜를 넣어 주세요' using errcode = 'check_violation';
    end if;
    insert into public.visit_request_events (request_id, kind, from_status, to_status, note, actor)
    values (new.id, 'status', old.status, new.status, case when new.status in ('rejected', 'cancelled') then new.decision_reason end, (select auth.uid()));
  end if;
  return new;
end $$;
revoke execute on function public.visit_request_track() from public, anon, authenticated;
drop trigger if exists visit_request_track on public.visit_requests;
create trigger visit_request_track before update on public.visit_requests for each row execute function public.visit_request_track();
drop trigger if exists visit_request_track_insert on public.visit_requests;
create trigger visit_request_track_insert after insert on public.visit_requests for each row execute function public.visit_request_track();

-- 4) 에이전시: 새 신청은 대표만, 캠퍼스·목적·픽업 칸을 채워서, 처리 칸은 비워서
alter policy visits_partner_insert on public.visit_requests
  with check (
    member_id = (select auth.uid()) and public.is_partner_owner() and status = 'received'
    and campus in ('premium', 'challenger', 'new') and cardinality(purposes) > 0
    and staff_note is null and decision_reason is null and schedule_date is null and schedule_time is null
  );

-- 5) 에이전시 취소: 자기 신청이 끝나지 않았을 때만, 사유와 함께(대표만, 방문 신청과 같게)
create or replace function public.cancel_visit_request(p_id bigint, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_partner_owner() then
    raise exception '지점 대표 아이디만 취소할 수 있습니다' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception '취소 사유를 적어 주세요' using errcode = 'check_violation';
  end if;
  update public.visit_requests set status = 'cancelled', decision_reason = left(btrim(p_reason), 1000)
  where id = p_id and member_id = (select auth.uid()) and status in ('received', 'scheduling', 'approval', 'confirmed');
  if not found then
    raise exception '취소할 수 있는 신청이 아닙니다' using errcode = 'no_data_found';
  end if;
end $$;
revoke execute on function public.cancel_visit_request(bigint, text) from public, anon;
grant execute on function public.cancel_visit_request(bigint, text) to authenticated;
