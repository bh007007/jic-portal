-- 파트너 포털 화면 콘텐츠(CL-045 관리 메뉴 7개, CL-054 업데이트 일자, 화면 명세 4장 docs/partner-spec.md).
-- 시제품 V74 화면(CL-030·041)을 채울 콘텐츠를 한 표에 종류(kind)별로 담는다. 종류마다 다른 칸은 data(jsonb)에, 칸 목록은 관리자 앱 contentKinds.ts.
--   about(JIC 소개: 왜 바기오·주변, 왜 JIC) · teacher(선생님) · day(학생의 하루) · activity(액티비티) · camp(캠프, CL-053)
--   playbook(플레이북, CL-052) · evidence(근거 자료) · event(행사 일정) · campus_status(캠퍼스 상태) · school_stat(학교 현황 통계)
--   contact(담당자 연락처) · newsletter(뉴스레터 호) · video(JIC Play, 유튜브 주소, CL-047)
-- 모든 콘텐츠 공통 칸(명세 4.0): 노출 국가·국가별 순서(CL-036), 언어별 문구(P7, i18n), 공개 상태(초안·게시·숨김),
--   최종 업데이트일·다음 업데이트 예정(CL-054), 수정한 사람·날짜(자동).
-- 에이전시는 게시된 것만, 자기 지점 국가에 맞는 것만 본다(partner_country()). 직원은 모두. 여러 번 실행해도 된다.

create table if not exists public.partner_content_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('about', 'teacher', 'day', 'activity', 'camp', 'playbook', 'evidence', 'event', 'campus_status', 'school_stat', 'contact', 'newsletter', 'video')),
  campus text not null default '' check (campus in ('', 'premium', 'challenger', 'new', 'mco')),
  title text not null default '' check (length(title) <= 300),
  body text not null default '' check (length(body) <= 20000),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  i18n jsonb not null default '{}'::jsonb check (jsonb_typeof(i18n) = 'object'),
  countries text[] not null default '{}',
  country_order jsonb not null default '{}'::jsonb check (jsonb_typeof(country_order) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'published', 'hidden')),
  sort integer not null default 0,
  updated_on date,
  next_update text check (next_update is null or next_update ~ '^\d{4}-\d{2}(-\d{2})?$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id)
);
create index if not exists partner_content_items_kind on public.partner_content_items (kind, status, sort);
create index if not exists partner_content_items_updated_by on public.partner_content_items (updated_by);

-- 고칠 때 수정한 사람·시각을 자동으로
create or replace function public.touch_partner_content_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce((select auth.uid()), new.updated_by);
  return new;
end $$;
revoke execute on function public.touch_partner_content_item() from public, anon, authenticated;
drop trigger if exists touch_partner_content_item on public.partner_content_items;
create trigger touch_partner_content_item before update on public.partner_content_items for each row execute function public.touch_partner_content_item();

alter table public.partner_content_items enable row level security;
revoke all on public.partner_content_items from anon, authenticated;
grant select, insert, update, delete on public.partner_content_items to authenticated;
grant select, insert, update, delete on public.partner_content_items to service_role;
drop policy if exists partner_content_items_staff_all on public.partner_content_items;
create policy partner_content_items_staff_all on public.partner_content_items for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists partner_content_items_partner_read on public.partner_content_items;
create policy partner_content_items_partner_read on public.partner_content_items for select to authenticated
  using (public.is_partner() and status = 'published' and (countries = '{}' or public.partner_country() = any (countries)));
