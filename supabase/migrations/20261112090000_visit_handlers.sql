-- 방문 신청 단계별 처리자(CL-046, 화면 명세 4.6, 11/12 레오님 결정 '명세대로 나누기'). 여러 번 실행해도 된다.
-- 일정 조율 시작·승인 요청 = 그 나라 마케터(에이전시 지점 국가), 확정·반려·다시 조율로 = 그 캠퍼스 센터장, 직원 취소 = 둘 중 누구나.
-- 처리자 지정(visit_handlers)은 관리자만(관리자 포털 '사용자·권한'). 어느 나라·캠퍼스에 아무도 지정되지 않았으면 직원 모두 처리한다(지정 전에 신청이 멈추지 않게).
-- 승인 권한은 따로(CL-025): 관리자라도 지정된 센터장이 있는 캠퍼스는 확정·반려할 수 없다. 방문 일정·안내 칸도 같은 사람만 고친다. 메모는 직원 모두.
-- 단계 검사·이력 트리거(20261111220000)에 이 검사를 더한다. 에이전시 취소(cancel_visit_request)는 직원이 아니라서 이 검사를 건너뛴다.

create table if not exists public.visit_handlers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.staff_users (user_id) on delete cascade,
  kind text not null check (kind in ('marketer', 'director')),
  country text not null default '',
  campus text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  constraint visit_handlers_scope check (
    (kind = 'marketer' and country <> '' and length(country) <= 40 and campus = '')
    or (kind = 'director' and campus in ('premium', 'challenger', 'new') and country = '')
  ),
  constraint visit_handlers_unique unique (kind, country, campus, user_id)
);
create index if not exists visit_handlers_user on public.visit_handlers (user_id);
create index if not exists visit_handlers_created_by on public.visit_handlers (created_by);

alter table public.visit_handlers enable row level security;
revoke all on public.visit_handlers from anon, authenticated;
grant select, insert, delete on public.visit_handlers to authenticated;
grant select, insert, update, delete on public.visit_handlers to service_role;
drop policy if exists visit_handlers_staff_read on public.visit_handlers;
create policy visit_handlers_staff_read on public.visit_handlers for select to authenticated using (public.is_staff());
drop policy if exists visit_handlers_admin_insert on public.visit_handlers;
create policy visit_handlers_admin_insert on public.visit_handlers for insert to authenticated with check (public.is_admin());
drop policy if exists visit_handlers_admin_delete on public.visit_handlers;
create policy visit_handlers_admin_delete on public.visit_handlers for delete to authenticated using (public.is_admin());

-- 지금 사용자가 그 나라 마케터(또는 그 캠퍼스 센터장)인가. 그 나라·캠퍼스에 아무도 지정되지 않았으면 직원 모두 참
create or replace function public.visit_handler_ok(p_kind text, p_country text, p_campus text)
returns boolean language sql stable security definer set search_path = public as $$
  with scope as (
    select h.user_id from public.visit_handlers h
    where h.kind = p_kind
      and ((p_kind = 'marketer' and h.country = coalesce(p_country, '')) or (p_kind = 'director' and h.campus = coalesce(p_campus, '')))
  )
  select public.is_staff() and (not exists (select 1 from scope) or exists (select 1 from scope where user_id = (select auth.uid())));
$$;
revoke execute on function public.visit_handler_ok(text, text, text) from public, anon, authenticated;

-- 단계 검사·이력 트리거(20261111220000)에 처리자 검사를 더한다
create or replace function public.visit_request_track()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_country text;
  v_marketer boolean;
  v_director boolean;
begin
  if tg_op = 'INSERT' then
    insert into public.visit_request_events (request_id, kind, to_status, actor) values (new.id, 'status', new.status, (select auth.uid()));
    return new;
  end if;
  new.updated_at := now();
  if public.is_staff() then
    select am.country into v_country from public.agency_members am where am.user_id = new.member_id;
    v_marketer := public.visit_handler_ok('marketer', v_country, new.campus);
    v_director := public.visit_handler_ok('director', v_country, new.campus);
    -- 방문 일정·안내는 그 나라 마케터 또는 그 캠퍼스 센터장
    if (new.schedule_date, new.schedule_time, new.staff_note) is distinct from (old.schedule_date, old.schedule_time, old.staff_note)
       and not (v_marketer or v_director) then
      raise exception '이 신청의 방문 일정·안내는 % 담당 마케터나 % 센터장이 고칩니다', coalesce(v_country, '그 나라'), coalesce(new.campus, '그 캠퍼스') using errcode = '42501';
    end if;
  end if;
  if new.status is distinct from old.status then
    if not (
      (old.status = 'received' and new.status in ('scheduling', 'cancelled'))
      or (old.status = 'scheduling' and new.status in ('approval', 'cancelled'))
      or (old.status = 'approval' and new.status in ('confirmed', 'rejected', 'scheduling', 'cancelled'))
      or (old.status = 'confirmed' and new.status in ('cancelled', 'done'))
    ) then
      raise exception '방문 신청을 % 에서 % (으)로 바꿀 수 없습니다', old.status, new.status using errcode = 'check_violation';
    end if;
    if public.is_staff() then
      if ((old.status = 'received' and new.status = 'scheduling') or new.status = 'approval') and not v_marketer then
        raise exception '일정 조율·승인 요청은 % 담당 마케터가 합니다', coalesce(v_country, '그 나라') using errcode = '42501';
      end if;
      if (new.status in ('confirmed', 'rejected', 'done') or (old.status = 'approval' and new.status = 'scheduling')) and not v_director then
        raise exception '확정·반려·다시 조율은 그 캠퍼스 센터장이 합니다' using errcode = '42501';
      end if;
      if new.status = 'cancelled' and not (v_marketer or v_director) then
        raise exception '직원 취소는 그 나라 마케터나 그 캠퍼스 센터장이 합니다' using errcode = '42501';
      end if;
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
