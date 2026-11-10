-- 국가별 콘텐츠(CL-036, 11/10 결정): 자료·공지·프로모션에 노출 국가와 국가별 우선 순서를 둔다. 지점 계정의 국가(agency_members.country) 기준.
-- 영상(JIC Play)은 화면을 만들 때 같은 칸을 붙인다. 여러 번 실행해도 된다.
--   countries     노출 국가. 비어 있으면 모든 국가. 값은 가입 화면의 국가 이름(한국·일본·대만·중국·베트남·사우디아라비아·태국·몽골·기타)
--   country_order 국가별로 먼저 보일 순서 {"한국": 1, "일본": 3}. 작은 수가 먼저, 없는 나라는 기본 순서(고정 → 최신)
-- 다른 나라 지점은 그 항목을 읽을 수 없게 정책에서 막는다(화면에서만 거르지 않는다). 직원은 모두 본다(*_staff_all 그대로).

alter table public.partner_notices add column if not exists countries text[] not null default '{}';
alter table public.partner_notices add column if not exists country_order jsonb not null default '{}'::jsonb;
alter table public.partner_resources add column if not exists countries text[] not null default '{}';
alter table public.partner_resources add column if not exists country_order jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'partner_notices_country_order_object') then
    alter table public.partner_notices add constraint partner_notices_country_order_object check (jsonb_typeof(country_order) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'partner_resources_country_order_object') then
    alter table public.partner_resources add constraint partner_resources_country_order_object check (jsonb_typeof(country_order) = 'object');
  end if;
end $$;

-- 로그인한 지점의 국가(승인된 지점만, 아니면 null). 정책과 화면이 같이 쓴다
create or replace function public.partner_country()
returns text language sql stable security definer set search_path = public as $$
  select country from public.agency_members where user_id = (select auth.uid()) and status = 'active';
$$;
revoke execute on function public.partner_country() from public, anon;
grant execute on function public.partner_country() to authenticated;

-- 지점은 '모든 국가' 항목과 자기 나라 항목만 읽는다(국가가 비어 있는 지점은 '모든 국가'만)
alter policy notices_partner_read on public.partner_notices
  using (public.is_partner() and published and (starts_on is null or starts_on <= current_date)
         and (countries = '{}' or public.partner_country() = any (countries)));
alter policy resources_partner_read on public.partner_resources
  using (public.is_partner() and (countries = '{}' or public.partner_country() = any (countries)));
