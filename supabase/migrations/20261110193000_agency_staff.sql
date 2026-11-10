-- 에이전시 대표·직원 아이디(CL-032, R-006). 11/10 레오님 결정:
--   직원 아이디 = 지점 대표가 직원 이름·이메일을 등록 → 직원이 그 이메일로 가입·이메일 인증 → 로그인하면 자동으로 그 지점 직원.
--   JIC 승인은 대표 아이디만(R-010). 직원 비밀번호는 직원 본인만 안다. 대표가 직원 아이디를 정지·해제한다.
--   직원 화면은 CL-032에 적힌 그대로 상담·자료·공지(1차). 학비표·방문 신청은 대표만(아래에서 DB로도 막음), 메뉴는 apps/partner/src/menu.ts.
-- 지금까지 agency_members 한 행 = 지점 = 대표 아이디였다. 직원 행은 role = 'staff', owner_id = 대표 user_id 로 대표 행에 붙는다.
-- 여러 번 실행해도 된다.

-- ── 역할 칸
alter table public.agency_members add column if not exists role text not null default 'owner';
alter table public.agency_members add column if not exists owner_id uuid references public.agency_members (user_id) on delete cascade;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agency_members_role_check') then
    alter table public.agency_members add constraint agency_members_role_check check (role in ('owner', 'staff'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'agency_members_owner_check') then
    alter table public.agency_members add constraint agency_members_owner_check
      check ((role = 'owner' and owner_id is null) or (role = 'staff' and owner_id is not null and owner_id <> user_id));
  end if;
end $$;
create index if not exists agency_members_owner on public.agency_members (owner_id);

-- 승인된 지점 아이디(대표 또는 직원). 직원은 대표 아이디가 정지되면 같이 막힌다.
create or replace function public.is_partner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.agency_members m
      left join public.agency_members o on o.user_id = m.owner_id
     where m.user_id = (select auth.uid()) and m.status = 'active'
       and (m.owner_id is null or o.status = 'active'));
$$;
revoke execute on function public.is_partner() from public, anon;
grant execute on function public.is_partner() to authenticated, service_role;

-- 지점 대표 아이디(승인·사용 중)
create or replace function public.is_partner_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.agency_members where user_id = (select auth.uid()) and status = 'active' and role = 'owner');
$$;
revoke execute on function public.is_partner_owner() from public, anon;
grant execute on function public.is_partner_owner() to authenticated, service_role;

-- 대표는 자기 지점 직원 아이디를 본다(이름·이메일·상태·접속)
drop policy if exists members_owner_read on public.agency_members;
create policy members_owner_read on public.agency_members for select to authenticated
  using (owner_id = (select auth.uid()) and public.is_partner_owner());

-- 상태·지점·역할은 JIC 관리자만. 단 지점 대표는 자기 직원의 사용 상태만 바꿀 수 있다(set_agency_staff_status).
create or replace function public.guard_member_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then
    if new.role is distinct from old.role or new.owner_id is distinct from old.owner_id
       or new.agency_name is distinct from old.agency_name or new.branch is distinct from old.branch
       or new.country is distinct from old.country or new.legacy_am_id is distinct from old.legacy_am_id
       or new.email is distinct from old.email then
      raise exception '연락처와 화면 설정만 바꿀 수 있습니다.';
    end if;
    if new.status is distinct from old.status
       and not (old.role = 'staff' and old.owner_id = (select auth.uid()) and public.is_partner_owner()) then
      raise exception '연락처와 화면 설정만 바꿀 수 있습니다.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.guard_member_update() from public, anon, authenticated;

-- 대표 행의 에이전시명·지점·국가가 바뀌면 직원 행도 같이(국가별 콘텐츠 partner_country() 가 직원 행의 국가를 읽는다)
create or replace function public.sync_agency_staff()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role = 'owner' and (new.agency_name is distinct from old.agency_name or new.branch is distinct from old.branch
                             or new.country is distinct from old.country) then
    update public.agency_members set agency_name = new.agency_name, branch = new.branch, country = new.country
     where owner_id = new.user_id;
  end if;
  return null;
end $$;
revoke execute on function public.sync_agency_staff() from public, anon, authenticated;
drop trigger if exists sync_agency_staff on public.agency_members;
create trigger sync_agency_staff after update on public.agency_members for each row execute function public.sync_agency_staff();

-- ── 직원 등록(대표가 이름·이메일을 적어 둔다. 그 이메일로 가입·인증한 사람이 로그인하면 직원이 된다)
create table if not exists public.agency_staff_invites (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.agency_members (user_id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  name text not null default '' check (length(name) <= 80),
  created_at timestamptz not null default now(),
  claimed_by uuid references auth.users (id) on delete set null,
  claimed_at timestamptz
);
-- 아직 연결되지 않은 등록은 이메일마다 하나(어느 지점 직원이 될지 하나로 정해지게)
create unique index if not exists agency_staff_invites_open_email on public.agency_staff_invites (email) where claimed_at is null;
create index if not exists agency_staff_invites_owner on public.agency_staff_invites (owner_id);
create index if not exists agency_staff_invites_claimed_by on public.agency_staff_invites (claimed_by);

alter table public.agency_staff_invites enable row level security;
revoke all on public.agency_staff_invites from anon, authenticated;
grant select, insert, delete on public.agency_staff_invites to authenticated;
grant select, insert, update, delete on public.agency_staff_invites to service_role;
grant usage on sequence public.agency_staff_invites_id_seq to authenticated;
drop policy if exists agency_staff_invites_staff_all on public.agency_staff_invites;
create policy agency_staff_invites_staff_all on public.agency_staff_invites for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists invites_owner_read on public.agency_staff_invites;
create policy invites_owner_read on public.agency_staff_invites for select to authenticated
  using (owner_id = (select auth.uid()) and public.is_partner_owner());
drop policy if exists invites_owner_insert on public.agency_staff_invites;
create policy invites_owner_insert on public.agency_staff_invites for insert to authenticated
  with check (owner_id = (select auth.uid()) and public.is_partner_owner() and claimed_by is null and claimed_at is null);
drop policy if exists invites_owner_delete on public.agency_staff_invites;
create policy invites_owner_delete on public.agency_staff_invites for delete to authenticated
  using (owner_id = (select auth.uid()) and public.is_partner_owner() and claimed_at is null);

-- 로그인한 사람의 (인증된) 이메일로 등록된 직원 자리가 있으면 직원 아이디를 만든다. 만들었으면 true.
-- 이미 지점 아이디(대표·직원)가 있거나, 이메일 인증 전이거나, 대표 아이디가 정지됐으면 아무것도 하지 않는다.
create or replace function public.claim_agency_staff_invite()
returns boolean language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := (select auth.uid());
  u_email text;
  u_confirmed timestamptz;
  inv public.agency_staff_invites;
  o public.agency_members;
begin
  if uid is null or exists (select 1 from public.agency_members where user_id = uid) then
    return false;
  end if;
  select email, email_confirmed_at into u_email, u_confirmed from auth.users where id = uid;
  if u_email is null or u_confirmed is null then
    return false;
  end if;
  select * into inv from public.agency_staff_invites where email = lower(btrim(u_email)) and claimed_at is null for update;
  if not found then
    return false;
  end if;
  select * into o from public.agency_members where user_id = inv.owner_id and role = 'owner' and status = 'active';
  if not found then
    return false;
  end if;
  insert into public.agency_members (user_id, email, agency_name, branch, country, contact_name, role, owner_id, status, approved_by)
  values (uid, lower(btrim(u_email)), o.agency_name, o.branch, o.country, nullif(inv.name, ''), 'staff', o.user_id, 'active', o.user_id);
  update public.agency_staff_invites set claimed_by = uid, claimed_at = now() where id = inv.id;
  return true;
end $$;
revoke execute on function public.claim_agency_staff_invite() from public, anon;
grant execute on function public.claim_agency_staff_invite() to authenticated;

-- 대표가 자기 지점 직원 아이디를 정지·해제한다
create or replace function public.set_agency_staff_status(p_user uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_partner_owner() then
    raise exception '지점 대표만 직원 아이디를 관리할 수 있습니다.';
  end if;
  update public.agency_members set status = case when p_active then 'active' else 'suspended' end
   where user_id = p_user and role = 'staff' and owner_id = (select auth.uid());
  if not found then
    raise exception '이 지점의 직원 아이디가 아닙니다.';
  end if;
end $$;
revoke execute on function public.set_agency_staff_status(uuid, boolean) from public, anon;
grant execute on function public.set_agency_staff_status(uuid, boolean) to authenticated;

-- 대표 아이디 승인(가입 승인)은 대표 아이디만. 이미 직원 아이디인 사람은 승인할 수 없다.
create or replace function public.approve_agency_request(p_request_id bigint, p_approve boolean, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r public.agency_requests;
begin
  if not public.is_staff() then raise exception '관리자만 처리할 수 있습니다.'; end if;
  select * into r from public.agency_requests where id = p_request_id for update;
  if not found then raise exception '신청을 찾을 수 없습니다.'; end if;
  if p_approve and exists (select 1 from public.agency_members where user_id = r.user_id and role = 'staff') then
    raise exception '이 아이디는 이미 다른 지점의 직원 아이디입니다. 대표 아이디로 승인할 수 없습니다.';
  end if;
  update public.agency_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         reviewed_by = auth.uid(), reviewed_at = now(), review_note = p_note
   where id = p_request_id;
  if p_approve then
    insert into public.agency_members (user_id, email, agency_name, branch, country, contact_name, phone, approved_by)
    values (r.user_id, r.email, r.agency_name, r.branch, r.country, r.contact_name, r.phone, auth.uid())
    on conflict (user_id) do update set status = 'active', updated_at = now();
  end if;
end $$;
revoke execute on function public.approve_agency_request(bigint, boolean, text) from public, anon;
grant execute on function public.approve_agency_request(bigint, boolean, text) to authenticated;

-- ── 대표만: 방문 신청(학교와 소통)
alter policy visits_partner_insert on public.visit_requests
  with check (member_id = (select auth.uid()) and public.is_partner_owner() and status = 'received' and staff_note is null);

-- ── 대표만: 학비표(비용·등록). 20261110173500_partner_tuition.sql 과 같고 지점 조건만 is_partner() → is_partner_owner()
create or replace function public.partner_tuition()
returns table (section text, campus text, name text, kind text, weeks integer, krw numeric, usd numeric, jpy numeric, php numeric, sort integer, sample boolean)
language sql stable security definer set search_path = public as $$
  with ctx as (
    select (now() at time zone 'Asia/Manila')::date as today,
           coalesce((select data ->> 'source' from public.legacy_meta where id = 'current'), '') = 'sample' as sample,
           public.is_staff() as staff,
           public.is_partner_owner() as partner
  ),
  p as (select data from public.legacy_prices),
  campus_of as (
    select data ->> 'co_id' as id, data ->> 'co_name' as name, data ->> 'co_type' as type, upper(coalesce(data ->> 'ca_code', '')) as ca, coalesce(data ->> 'co_use_yn', 'Y') as use_yn
    from p where data ->> '_table' = 'course_code'
  ),
  dorm_of as (
    select data ->> 'do_id' as id, data ->> 'do_name' as name, upper(coalesce(data ->> 'ca_code', '')) as ca, coalesce(data ->> 'do_use_yn', 'Y') as use_yn
    from p where data ->> '_table' = 'dorm_code'
  ),
  rows as (
    select 'course'::text as section, c.ca, c.name, case c.type when 'REG' then '' when 'FAMILY' then '가족' when 'PARENT' then '부모' else coalesce(c.type, '') end as kind,
           nullif(x.data ->> 'cc_week', '')::integer as weeks,
           nullif(x.data ->> 'cc_won', '')::numeric as krw, nullif(x.data ->> 'cc_usd', '')::numeric as usd, nullif(x.data ->> 'cc_yen', '')::numeric as jpy, nullif(x.data ->> 'cc_peso', '')::numeric as php,
           0 as sort, left(x.data ->> 'cc_start_date', 10) as s, left(x.data ->> 'cc_finish_date', 10) as f, c.use_yn
    from p x join campus_of c on c.id = x.data ->> 'cc_co_id'
    where x.data ->> '_table' = 'price_course'
    union all
    select 'dorm', d.ca, d.name, '', null,
           nullif(x.data ->> 'dc_won', '')::numeric, nullif(x.data ->> 'dc_usd', '')::numeric, nullif(x.data ->> 'dc_yen', '')::numeric, nullif(x.data ->> 'dc_peso', '')::numeric,
           0, left(x.data ->> 'dc_start_date', 10), left(x.data ->> 'dc_finish_date', 10), d.use_yn
    from p x join dorm_of d on d.id = x.data ->> 'dc_do_id'
    where x.data ->> '_table' = 'price_dorm'
    union all
    select 'etc', '', x.data ->> 'ec_name', coalesce(x.data ->> 'ec_type', ''), null,
           nullif(x.data ->> 'ec_won', '')::numeric, nullif(x.data ->> 'ec_usd', '')::numeric, nullif(x.data ->> 'ec_yen', '')::numeric, nullif(x.data ->> 'ec_peso', '')::numeric,
           coalesce(nullif(x.data ->> 'ec_order', '')::integer, 0), left(x.data ->> 'ec_start_date', 10), left(x.data ->> 'ec_finish_date', 10), coalesce(x.data ->> 'ec_use_yn', 'Y')
    from p x
    where x.data ->> '_table' = 'price_etc'
  )
  select r.section,
         case r.ca when 'PREMIUM' then 'Premium' when 'CHALLENGER' then 'Challenger' when 'MCO' then 'MCO' else coalesce(nullif(r.ca, ''), '') end,
         r.name, r.kind, r.weeks, r.krw, r.usd, r.jpy, r.php, r.sort, ctx.sample
  from rows r, ctx
  where (ctx.staff or (ctx.partner and not ctx.sample))
    and upper(coalesce(r.use_yn, 'Y')) <> 'N'
    and (r.s is null or r.s = '' or r.s <= ctx.today::text)
    and (r.f is null or r.f = '' or r.f >= ctx.today::text)
  order by case r.section when 'course' then 1 when 'dorm' then 2 else 3 end, 2, r.sort, r.name, r.weeks;
$$;
revoke execute on function public.partner_tuition() from public, anon;
grant execute on function public.partner_tuition() to authenticated;
