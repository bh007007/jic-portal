-- 변경 요청(관리자 포털 '학생관리 > 변경 요청', 11/10 레오님 결정: 새 기능으로 만든다). 여러 번 실행해도 된다.
-- 업체 변경요청(reqchg, 2024년 8건)은 옮기지 않고 새로 받는다. 종류·상태는 업체 rqp_type·rqp_state 를 줄여 따랐다.
-- 1단계(이 파일): 직원이 받은 요청을 적고 처리한다. 학생 앱·에이전시 포털의 신청 칸은 다음 단계(source = student·agency, 정책을 더한다).
-- 연수는 업체 tr_id 로 가리킨다(정규화 스키마로 옮기면 enrollments 를 가리키게 바꾼다). 학생 이름·연락처는 저장하지 않는다.
-- 권한: 직원(is_staff(), 관리자·오피스)만 읽고 쓴다. 지우지 않는다(취소 상태로 남긴다). 상태가 바뀔 때마다 기록(change_request_log)이 남는다.
--
-- 상태 흐름: requested 신청 → received 접수 → approved 승인 → done 완료
--            신청·접수에서 rejected 거절, 완료 전 어디서든 canceled 취소. 거절·취소·완료 뒤에는 바꾸지 않는다.

create table if not exists public.change_requests (
  id bigint generated always as identity primary key,
  tr_id text not null check (char_length(tr_id) between 1 and 40),
  st_id text not null default '' check (char_length(st_id) <= 40),
  kind text not null check (kind in ('course', 'dorm', 'extension', 'add_class', 'cancel', 'other')),
  state text not null default 'requested' check (state in ('requested', 'received', 'approved', 'rejected', 'canceled', 'done')),
  source text not null default 'staff' check (source in ('staff', 'student', 'agency')),
  want text not null default '' check (char_length(want) <= 200),          -- 바꾸려는 것(새 코스·기숙사, 연장 주 수 등)
  period_from date,                                                        -- 바꾸려는 기간
  period_to date,
  content text not null default '' check (char_length(content) <= 2000),   -- 요청 내용
  reply text not null default '' check (char_length(reply) <= 2000),       -- 신청자에게 보일 답변(학생·에이전시 신청 칸이 생기면 보인다)
  staff_memo text not null default '' check (char_length(staff_memo) <= 2000), -- 직원끼리 보는 메모
  tuition_fee numeric(12, 2),                                              -- 학비 차액(연수 통화)
  local_fee numeric(12, 2),                                                -- 현지비 차액(PHP)
  created_by uuid default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  updated_at timestamptz not null default now(),
  decided_by uuid references auth.users (id),
  decided_at timestamptz,
  constraint change_requests_period check (period_from is null or period_to is null or period_to >= period_from)
);
create index if not exists change_requests_tr on public.change_requests (tr_id);
create index if not exists change_requests_state on public.change_requests (state, created_at desc);

create table if not exists public.change_request_log (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.change_requests (id) on delete cascade,
  state text not null,
  actor uuid references auth.users (id),
  at timestamptz not null default now()
);
create index if not exists change_request_log_request on public.change_request_log (request_id, at);

-- 상태가 바뀔 수 있는 길만 연다. 완료·거절·취소 뒤에는 상태도 내용도 바꾸지 않는다.
create or replace function public.change_request_next_ok(old_state text, new_state text)
returns boolean language sql immutable as $$
  select case old_state
    when 'requested' then new_state in ('received', 'rejected', 'canceled')
    when 'received' then new_state in ('approved', 'rejected', 'canceled')
    when 'approved' then new_state in ('done', 'canceled')
    else false
  end
$$;

create or replace function public.change_requests_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.state not in ('requested', 'received') then
      raise exception '변경 요청은 신청 또는 접수 상태로만 만들 수 있습니다.';
    end if;
    new.created_at := now();
    new.updated_at := now();
    new.updated_by := auth.uid();
    new.decided_by := null;
    new.decided_at := null;
    return new;
  end if;
  if old.state in ('rejected', 'canceled', 'done') then
    raise exception '끝난 변경 요청(%)은 바꿀 수 없습니다.', old.state;
  end if;
  if new.state <> old.state then
    if not public.change_request_next_ok(old.state, new.state) then
      raise exception '변경 요청 상태를 %에서 %(으)로 바꿀 수 없습니다.', old.state, new.state;
    end if;
    if new.state in ('approved', 'rejected') then
      new.decided_by := auth.uid();
      new.decided_at := now();
    end if;
  end if;
  new.updated_by := auth.uid();
  new.updated_at := now();
  return new;
end
$$;
revoke execute on function public.change_requests_guard() from public, anon, authenticated;

create or replace function public.change_requests_log_state()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.state <> old.state then
    insert into public.change_request_log (request_id, state, actor) values (new.id, new.state, auth.uid());
  end if;
  return null;
end
$$;
revoke execute on function public.change_requests_log_state() from public, anon, authenticated;

drop trigger if exists change_requests_guard on public.change_requests;
create trigger change_requests_guard before insert or update on public.change_requests
  for each row execute function public.change_requests_guard();
drop trigger if exists change_requests_log_state on public.change_requests;
create trigger change_requests_log_state after insert or update on public.change_requests
  for each row execute function public.change_requests_log_state();

alter table public.change_requests enable row level security;
alter table public.change_request_log enable row level security;
revoke all on public.change_requests from anon, authenticated;
revoke all on public.change_request_log from anon, authenticated;
grant select, insert, update, delete on public.change_requests to service_role;
grant select, insert, update, delete on public.change_request_log to service_role;
-- 직원이 쓰는 열만 연다. 출처(source)는 기본값 staff, 만든 사람·시각·결정자는 트리거가 정한다.
grant select on public.change_requests to authenticated;
grant insert (tr_id, st_id, kind, state, want, period_from, period_to, content, reply, staff_memo, tuition_fee, local_fee) on public.change_requests to authenticated;
grant update (state, want, period_from, period_to, content, reply, staff_memo, tuition_fee, local_fee) on public.change_requests to authenticated;
grant select on public.change_request_log to authenticated;

drop policy if exists change_requests_staff_read on public.change_requests;
create policy change_requests_staff_read on public.change_requests for select to authenticated using (public.is_staff());
drop policy if exists change_requests_staff_insert on public.change_requests;
create policy change_requests_staff_insert on public.change_requests for insert to authenticated with check (public.is_staff() and source = 'staff');
drop policy if exists change_requests_staff_update on public.change_requests;
create policy change_requests_staff_update on public.change_requests for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists change_request_log_staff_read on public.change_request_log;
create policy change_request_log_staff_read on public.change_request_log for select to authenticated using (public.is_staff());
