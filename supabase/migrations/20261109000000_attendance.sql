-- 강사 포털 출석 1차: 교실, 수업, 출석, 출석 마감. 여러 번 실행해도 된다.
-- 원칙 L1(출석은 강사 포털에서), L4(결석 사유는 출석에 표시), L7(휴대폰). 테이블 이름은 기획안 '학업' 그룹(class_sessions·attendance·attendance_closings)과 '기숙사·교실'(classrooms).
-- 단위는 업체 정규 출석(adm/attendance_v2/regular, sta_*, 11/9 LMS 조사)과 같다: 한 수업(날짜·시각·교사·교실) × 학생 한 명.
--   업체는 시간표에서 그날 출석 행을 만들고(regular_import) 교사가 결과(AT 출석·AB 결석·TA 지각)를 고친 뒤 캠퍼스·날짜별로 마감한다(closing).
--   여기서도 수업과 출석 행을 미리 만들고 결과는 비워 둔다(null = 아직 체크 안 함). 반복 시간표(class_enrollments, 스케줄러 화면)는 다음 단계다.
-- 출석 입력자(레오님 결정 #5)는 Claude 제안대로 둔다: 그 수업의 강사·보조 강사, 체커, 매니저·직원. 마감·되돌리기는 매니저·직원. 바꾸려면 can_mark_attendance 하나만 고친다.

-- ── 교실 (업체 cro_*)
create table if not exists public.classrooms (
  id uuid primary key default gen_random_uuid(),
  campus text not null check (char_length(campus) between 1 and 30),
  num text not null check (char_length(num) between 1 and 30),
  kind text not null default '1' check (kind in ('1', 'G')), -- 1:1 / 그룹
  building text not null default '' check (char_length(building) <= 30),
  floor text not null default '' check (char_length(floor) <= 10),
  capacity smallint check (capacity between 1 and 200),
  active boolean not null default true,
  legacy_id text unique, -- 업체 cro_id
  created_at timestamptz not null default now(),
  unique (campus, num)
);

-- ── 수업: 그날 한 시간대의 한 수업
create table if not exists public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  start_time time not null,
  minutes smallint not null default 50 check (minutes between 10 and 300),
  campus text not null check (char_length(campus) between 1 and 30),
  kind text not null default '1' check (kind in ('1', 'G')),
  subject text not null default '' check (char_length(subject) <= 80),
  teacher_id uuid references public.staff (id) on delete set null,
  sub_teacher_id uuid references public.staff (id) on delete set null,
  classroom_id uuid references public.classrooms (id) on delete set null,
  legacy_key text unique, -- 업체에서 옮긴 수업 표시(날짜·시각·교사·교실)
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists class_sessions_day on public.class_sessions (day, campus, start_time);
create index if not exists class_sessions_teacher on public.class_sessions (teacher_id, day);

-- ── 출석: 수업 × 학생
create table if not exists public.attendance (
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  student_no text not null check (student_no ~ '^[A-Za-z0-9_-]{1,40}$'),
  enrollment_id text not null default '',
  result text check (result in ('AT', 'AB', 'TA')), -- 출석·결석·지각, null = 아직
  late_min smallint check (late_min between 1 and 300),
  excused boolean not null default false, -- 사유 인정(업체 sta_excused). 매니저·직원만 바꾼다
  note text not null default '' check (char_length(note) <= 200),
  checked_by uuid,
  checked_name text not null default '',
  checked_at timestamptz,
  legacy_id text unique, -- 업체 sta_id
  primary key (session_id, student_no),
  check (late_min is null or result = 'TA')
);
create index if not exists attendance_student on public.attendance (student_no);

-- ── 출석 마감: 캠퍼스·날짜
create table if not exists public.attendance_closings (
  day date not null,
  campus text not null check (char_length(campus) between 1 and 30),
  closed_by uuid default auth.uid(),
  closed_name text not null default '',
  closed_at timestamptz not null default now(),
  primary key (day, campus)
);

-- ── 기록에 남길 이름(20261108200000_teacher_portal.sql 의 같은 함수를 바꿈): 강사 목록 이름 → 직원 이름 → 로그인 이메일 → 계정 id.
-- 강사 목록에 없는 매니저가 마감하면 계정 id 가 남던 것을 이메일로 보이게 했다. 뜻(기록자 이름)은 그대로다.
create or replace function public.current_lms_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(
    (select nullif(s.name, '') from public.staff s where s.user_id = auth.uid()),
    public.current_staff_name(),
    (select nullif(u.email, '') from auth.users u where u.id = auth.uid()),
    auth.uid()::text
  );
$$;

-- ── 판단 함수
-- 이 수업의 강사·보조 강사인지(강사 목록의 계정으로 판단)
create or replace function public.teaches_session(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_sessions s join public.staff st on st.id in (s.teacher_id, s.sub_teacher_id)
     where s.id = p_session and st.user_id = auth.uid() and st.active
  );
$$;
-- 출석을 쓸 수 있는지(결정 #5 제안: 그 수업 강사, 체커, 매니저·직원)
create or replace function public.can_mark_attendance(p_session uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_lms_manager() or public.has_role(array['checker']) or public.teaches_session(p_session);
$$;
create or replace function public.attendance_closed(p_day date, p_campus text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.attendance_closings where day = p_day and campus = p_campus);
$$;
-- 수업·출석 행을 만들고 지우는 사람: 매니저·직원, 스케줄러
create or replace function public.can_schedule()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_lms_manager() or public.has_role(array['scheduler']);
$$;

-- 마감된 날은 고치지 못한다(서비스 키로 옮겨 넣을 때는 예외). 앞날 수업은 결과를 못 넣는다. 사유 인정은 매니저·직원만.
-- 결과·지각·메모를 바꾸면 체크한 사람과 시각을 서버가 넣는다(화면이 보낸 이름은 믿지 않는다).
create or replace function public.attendance_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare s public.class_sessions;
begin
  select * into s from public.class_sessions where id = coalesce(new.session_id, old.session_id);
  if auth.uid() is not null and public.attendance_closed(s.day, s.campus) then raise exception 'attendance_closed'; end if;
  if tg_op = 'DELETE' then return old; end if;
  if new.result is distinct from 'TA' then new.late_min := null; end if;
  if auth.uid() is null then return new; end if;
  if new.result is not null and s.day > public.manila_today() then raise exception 'future_session'; end if;
  if tg_op = 'INSERT' then
    if new.excused and not public.is_lms_manager() then raise exception 'manager_only'; end if;
    if new.result is not null then
      new.checked_by := auth.uid(); new.checked_name := coalesce(public.current_lms_name(), ''); new.checked_at := now();
    else
      new.checked_by := null; new.checked_name := ''; new.checked_at := null;
    end if;
    return new;
  end if;
  if new.excused is distinct from old.excused and not public.is_lms_manager() then raise exception 'manager_only'; end if;
  if new.result is distinct from old.result or new.late_min is distinct from old.late_min or new.note is distinct from old.note then
    new.checked_by := auth.uid(); new.checked_name := coalesce(public.current_lms_name(), ''); new.checked_at := now();
  end if;
  return new;
end $$;
drop trigger if exists attendance_guard on public.attendance;
create trigger attendance_guard before insert or update or delete on public.attendance for each row execute function public.attendance_guard();

-- 마감: 오늘까지만, 마감한 사람 이름은 서버가 넣는다
create or replace function public.attendance_closing_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.day > public.manila_today() then raise exception 'future_day'; end if;
  new.closed_by := auth.uid();
  new.closed_name := coalesce(public.current_lms_name(), '');
  new.closed_at := now();
  return new;
end $$;
drop trigger if exists attendance_closing_stamp on public.attendance_closings;
create trigger attendance_closing_stamp before insert on public.attendance_closings for each row execute function public.attendance_closing_stamp();

-- ── RLS 켜기, 권한 초기화, 서비스 키는 전부
do $$
declare t text;
begin
  foreach t in array array['classrooms', 'class_sessions', 'attendance', 'attendance_closings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end
$$;

-- 교실: 강사 포털 사용자 읽기, 등록·수정은 매니저·직원·스케줄러
grant select on public.classrooms to authenticated;
grant insert (campus, num, kind, building, floor, capacity, active) on public.classrooms to authenticated;
grant update (num, kind, building, floor, capacity, active) on public.classrooms to authenticated;
drop policy if exists classrooms_read on public.classrooms;
create policy classrooms_read on public.classrooms for select to authenticated using (public.is_lms_user());
drop policy if exists classrooms_insert on public.classrooms;
create policy classrooms_insert on public.classrooms for insert to authenticated with check (public.can_schedule());
drop policy if exists classrooms_update on public.classrooms;
create policy classrooms_update on public.classrooms for update to authenticated using (public.can_schedule()) with check (public.can_schedule());

-- 수업: 강사 포털 사용자 읽기, 학생은 자기가 든 수업만. 만들기·고치기·지우기는 매니저·직원·스케줄러
grant select, delete on public.class_sessions to authenticated;
grant insert (day, start_time, minutes, campus, kind, subject, teacher_id, sub_teacher_id, classroom_id) on public.class_sessions to authenticated;
grant update (day, start_time, minutes, kind, subject, teacher_id, sub_teacher_id, classroom_id) on public.class_sessions to authenticated;
drop policy if exists class_sessions_read on public.class_sessions;
create policy class_sessions_read on public.class_sessions for select to authenticated
  using (public.is_lms_user() or exists (select 1 from public.attendance a where a.session_id = class_sessions.id and a.student_no = public.current_student_no()));
drop policy if exists class_sessions_insert on public.class_sessions;
create policy class_sessions_insert on public.class_sessions for insert to authenticated with check (public.can_schedule());
drop policy if exists class_sessions_update on public.class_sessions;
create policy class_sessions_update on public.class_sessions for update to authenticated
  using (public.can_schedule() and not public.attendance_closed(day, campus)) with check (public.can_schedule());
drop policy if exists class_sessions_delete on public.class_sessions;
create policy class_sessions_delete on public.class_sessions for delete to authenticated
  using (public.can_schedule() and not public.attendance_closed(day, campus));

-- 출석: 강사 포털 사용자 읽기, 학생은 자기 것만. 결과 입력은 can_mark_attendance, 행 넣기·지우기는 매니저·직원·스케줄러
grant select, delete on public.attendance to authenticated;
grant insert (session_id, student_no, enrollment_id, result, late_min, excused, note) on public.attendance to authenticated;
grant update (result, late_min, excused, note) on public.attendance to authenticated;
drop policy if exists attendance_read on public.attendance;
create policy attendance_read on public.attendance for select to authenticated
  using (public.is_lms_user() or student_no = public.current_student_no());
drop policy if exists attendance_insert on public.attendance;
create policy attendance_insert on public.attendance for insert to authenticated with check (public.can_schedule());
drop policy if exists attendance_update on public.attendance;
create policy attendance_update on public.attendance for update to authenticated
  using (public.can_mark_attendance(session_id)) with check (public.can_mark_attendance(session_id));
drop policy if exists attendance_delete on public.attendance;
create policy attendance_delete on public.attendance for delete to authenticated using (public.can_schedule());

-- 마감: 강사 포털 사용자 읽기, 마감·되돌리기는 매니저·직원
grant select, delete on public.attendance_closings to authenticated;
grant insert (day, campus) on public.attendance_closings to authenticated;
drop policy if exists attendance_closings_read on public.attendance_closings;
create policy attendance_closings_read on public.attendance_closings for select to authenticated using (public.is_lms_user());
drop policy if exists attendance_closings_insert on public.attendance_closings;
create policy attendance_closings_insert on public.attendance_closings for insert to authenticated with check (public.is_lms_manager());
drop policy if exists attendance_closings_delete on public.attendance_closings;
create policy attendance_closings_delete on public.attendance_closings for delete to authenticated using (public.is_lms_manager());

-- ── 화면용 함수
-- 그날 수업 목록: 교사(부르는 이름)·교실·학생 수·체크 수·결석·지각, 내 수업인지, 마감인지
create or replace function public.lms_sessions(p_day date, p_campus text default '')
returns table (id uuid, day date, start_time time, minutes smallint, campus text, kind text, subject text,
               teacher_id uuid, teacher_name text, sub_teacher_name text, room text,
               students int, checked int, absent int, late int, mine boolean, closed boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.day, s.start_time, s.minutes, s.campus, s.kind, s.subject,
         s.teacher_id, coalesce(nullif(t.nickname, ''), t.name, ''), coalesce(nullif(u.nickname, ''), u.name, ''), coalesce(c.num, ''),
         count(a.student_no)::int, count(a.result)::int,
         (count(*) filter (where a.result = 'AB'))::int, (count(*) filter (where a.result = 'TA'))::int,
         coalesce(t.user_id = auth.uid(), false) or coalesce(u.user_id = auth.uid(), false),
         public.attendance_closed(s.day, s.campus)
    from public.class_sessions s
    left join public.staff t on t.id = s.teacher_id
    left join public.staff u on u.id = s.sub_teacher_id
    left join public.classrooms c on c.id = s.classroom_id
    left join public.attendance a on a.session_id = s.id
   where public.is_lms_user() and s.day = p_day and (coalesce(p_campus, '') = '' or s.campus = p_campus)
   group by s.id, t.id, u.id, c.id
   order by s.start_time, 11, 9;
$$;

-- 아직 체크하지 않은 학생을 모두 출석으로(업체 '전체 출석'). 권한·마감은 출석 표의 RLS·트리거가 그대로 막는다.
create or replace function public.attendance_mark_all(p_session uuid)
returns integer language plpgsql security invoker set search_path = public as $$
declare n integer;
begin
  update public.attendance set result = 'AT' where session_id = p_session and result is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.lms_sessions(date, text) from public, anon;
grant execute on function public.lms_sessions(date, text) to authenticated;
revoke all on function public.attendance_mark_all(uuid) from public, anon;
grant execute on function public.attendance_mark_all(uuid) to authenticated;
