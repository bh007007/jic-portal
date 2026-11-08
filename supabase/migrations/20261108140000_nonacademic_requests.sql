-- 생활 요청(기획안 nonacademic_requests, 업체 '요청사항(학생)'·'ID 카드 교체'). 학생 앱에서 내고 인트라넷에서 처리한다.
-- 규칙은 apps/student/server/lifeRequests.ts 와 같다. 쓰기는 나뉜다: 요청·취소는 학생, 처리·답변은 직원(기획안 C2).
-- 20261108100000_student_intranet.sql 의 current_student_no()·is_staff()·enrollment_of_student() 를 쓴다. 여러 번 실행해도 된다.

create table if not exists public.nonacademic_requests (
  id uuid primary key default gen_random_uuid(),
  student_no text not null,
  enrollment_id text not null, -- 요청할 때의 연수(재학 중, 없으면 가장 가까운 입학 예정)
  category text not null check (category in ('facility', 'room_change', 'id_card', 'document', 'other')),
  content text not null check (char_length(content) between 1 and 500),
  status text not null default 'received' check (status in ('received', 'in_progress', 'done', 'rejected', 'cancelled')),
  staff_reply text check (staff_reply is null or char_length(staff_reply) <= 500), -- 학생에게 보인다
  handled_at timestamptz,
  handled_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (status <> 'rejected' or char_length(coalesce(staff_reply, '')) > 0) -- 반려는 사유가 있어야 한다
);
create index if not exists nonacademic_requests_student on public.nonacademic_requests (student_no);

alter table public.nonacademic_requests enable row level security;
revoke all on public.nonacademic_requests from anon, authenticated;
grant select, insert, update, delete on public.nonacademic_requests to service_role;

-- 학생: 자기 것 읽기, 자기 연수로 접수 상태 등록(넣을 수 있는 열만), 열린 요청은 5건까지. 직원: 모두 읽기. 바꾸기는 아래 함수로만.
grant select on public.nonacademic_requests to authenticated;
grant insert (id, student_no, enrollment_id, category, content) on public.nonacademic_requests to authenticated;
drop policy if exists nonacademic_read on public.nonacademic_requests;
create policy nonacademic_read on public.nonacademic_requests for select to authenticated
  using (student_no = public.current_student_no() or public.is_staff());
drop policy if exists nonacademic_insert on public.nonacademic_requests;
create policy nonacademic_insert on public.nonacademic_requests for insert to authenticated
  with check (
    student_no = public.current_student_no()
    and public.enrollment_of_student(enrollment_id, student_no)
    and status = 'received'
    and (select count(*) from public.nonacademic_requests r where r.student_no = public.current_student_no() and r.status in ('received', 'in_progress')) < 5
  );

-- 학생 취소: 직원이 손대기 전(접수)인 자기 요청만
create or replace function public.cancel_nonacademic_request(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.nonacademic_requests set status = 'cancelled', updated_at = now()
   where id = p_id and student_no = public.current_student_no() and status = 'received';
  if not found then raise exception 'not_pending'; end if;
end $$;

-- 직원 처리: 접수 → 처리 중·완료·반려, 처리 중 → 완료·반려. 답변을 비우면 이전 답변을 그대로 둔다. 처리자는 로그인한 직원.
create or replace function public.handle_nonacademic_request(p_id uuid, p_status text, p_reply text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  cur public.nonacademic_requests;
  reply text := nullif(trim(coalesce(p_reply, '')), '');
begin
  if not public.is_staff() then raise exception 'staff_only'; end if;
  if p_status not in ('in_progress', 'done', 'rejected') then raise exception 'invalid_status'; end if;
  if char_length(reply) > 500 then raise exception 'reply_too_long'; end if;
  select * into cur from public.nonacademic_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  if cur.status not in ('received', 'in_progress') then raise exception 'already_closed'; end if;
  if cur.status = 'in_progress' and p_status = 'in_progress' then raise exception 'already_in_progress'; end if;
  if p_status = 'rejected' and coalesce(reply, cur.staff_reply) is null then raise exception 'reply_required'; end if;
  update public.nonacademic_requests
     set status = p_status, staff_reply = coalesce(reply, staff_reply), handled_at = now(), handled_by = auth.uid(), updated_at = now()
   where id = p_id;
end $$;

revoke execute on function public.cancel_nonacademic_request(uuid) from public, anon;
grant execute on function public.cancel_nonacademic_request(uuid) to authenticated, service_role;
revoke execute on function public.handle_nonacademic_request(uuid, text, text) from public, anon;
grant execute on function public.handle_nonacademic_request(uuid, text, text) to authenticated, service_role;
