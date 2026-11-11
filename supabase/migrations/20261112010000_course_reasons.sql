-- 추천 이유 3칸(CL-050, 화면 명세 3장·4.2 '상담 설정 › 추천 이유'). 여러 번 실행해도 된다.
-- 코스마다: 이유 1 = 학생의 학습 목적(Q1 답), 이유 2 = 중요하게 생각하는 것(Q2 답), 이유 3 = 성장 근거(모든 학생 공통).
--   answer = '' 이 그 칸의 '기본 이유'(답에 맞는 이유가 없을 때, Q2 '둘 다 괜찮음'일 때). 이유 3은 기본 하나만.
--   각 이유: 제목(필수) + 설명(두 줄 이내) + 증거 0~3개(partner_content_items 의 사진·영상·근거 자료 id) + 언어별 문구(P7) + 공개 상태.
-- 고르는 규칙은 apps/partner/src/consult/reasons.ts. 기본 이유까지 없으면 예전 코스별 글(course_contents.reason_*)을 쓰고, 그것도 없으면 '준비 중'(C8).
-- 에이전시(지점 직원 아이디 포함)는 게시된 것만 읽는다. 직원은 모두. 수정한 사람·시각은 트리거(touch_partner_content_item, 20261111140000).

create table if not exists public.course_reasons (
  id uuid primary key default gen_random_uuid(),
  course_id text not null references public.courses (id) on delete cascade,
  slot smallint not null check (slot between 1 and 3),
  answer text not null default '' check (length(answer) <= 50),
  title text not null check (length(btrim(title)) between 1 and 120),
  body text not null default '' check (length(body) <= 300),
  evidence uuid[] not null default '{}' check (cardinality(evidence) <= 3),
  i18n jsonb not null default '{}'::jsonb check (jsonb_typeof(i18n) = 'object'),
  status text not null default 'draft' check (status in ('draft', 'published', 'hidden')),
  updated_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users (id),
  constraint course_reasons_slot3_common check (slot <> 3 or answer = ''),
  constraint course_reasons_unique unique (course_id, slot, answer)
);
create index if not exists course_reasons_updated_by on public.course_reasons (updated_by);

drop trigger if exists touch_course_reason on public.course_reasons;
create trigger touch_course_reason before update on public.course_reasons for each row execute function public.touch_partner_content_item();

alter table public.course_reasons enable row level security;
revoke all on public.course_reasons from anon, authenticated;
grant select, insert, update, delete on public.course_reasons to authenticated;
grant select, insert, update, delete on public.course_reasons to service_role;
drop policy if exists course_reasons_staff_all on public.course_reasons;
create policy course_reasons_staff_all on public.course_reasons for all to authenticated
  using (public.is_staff()) with check (public.is_staff());
drop policy if exists course_reasons_partner_read on public.course_reasons;
create policy course_reasons_partner_read on public.course_reasons for select to authenticated
  using (public.is_partner() and status = 'published');
