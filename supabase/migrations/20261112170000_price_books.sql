-- 견적 가격 버전(T-21, R-013 3단계, CL-066 11/12). 여러 번 실행해도 된다.
-- 관리자 포털 '기초관리 › 가격표 › 견적 가격'에서 버전을 만들고 고친 뒤 승인 요청 → '가격 변경 승인' 권한자가 승인하면 적용 시작일부터 쓴다.
-- 견적 계산 모듈(packages/quote)의 PriceBook 한 덩어리(코스·숙소·등록금·현지비용·픽업·프로모션 표)를 data(jsonb)에 버전째 담는다.
-- - 승인된 버전은 바꾸지 않는다(이력). 바꾸려면 새 버전을 만든다(지금까지 가격 변경 이력이 없어 포털부터 기록, CL-066)
-- - 입력: 메뉴 그룹 '기초관리'(base) 입력 권한(can_input). 승인: 승인 종류 'price_change'(can_approve).
--   CL-066 '대표님 최종 승인'이라 역할 기본값은 두지 않고, 관리자가 권한표 '사람별 승인'에서 대표님 계정에 준다
-- - 직원은 모두 읽고, 에이전시는 지점 대표 아이디만 승인된 버전을 읽는다(견적은 대표만, CL-032)
-- - 첫 버전은 기획 정정본(2026-11-12, CL-057·065 기준값)을 승인된 상태로 넣는다

create table if not exists public.price_books (
  id uuid primary key default gen_random_uuid(),
  version integer not null,
  label text not null default '' check (length(label) <= 120),
  effective_from date not null,
  status text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  note text not null default '' check (length(note) <= 2000),
  based_on uuid references public.price_books (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_by uuid references auth.users (id) on delete set null,
  submitted_at timestamptz,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text not null default '' check (length(decision_note) <= 1000),
  constraint price_books_version unique (version)
);
create index if not exists price_books_status_from on public.price_books (status, effective_from);
create index if not exists price_books_based_on on public.price_books (based_on);
create index if not exists price_books_created_by on public.price_books (created_by);
create index if not exists price_books_submitted_by on public.price_books (submitted_by);
create index if not exists price_books_decided_by on public.price_books (decided_by);

-- 승인 종류 '가격 변경 승인'(권한표, 20261112110000). 역할 기본값 없음(CL-066: 대표님 → 사람별 승인으로 준다)
insert into public.approval_kinds (kind, label, sort) values ('price_change', '가격 변경 승인', 14)
on conflict (kind) do nothing;

-- 단계 검사: 초안 고치기·승인 요청·되돌리기는 기초관리 입력 권한, 승인·반려는 가격 변경 승인 권한. 승인된 버전은 바꾸지 않는다.
-- 로그인 사용자가 없는 경우(마이그레이션·서비스 키)는 검사하지 않는다.
create or replace function public.price_books_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if v_uid is not null then
      if new.status <> 'draft' then raise exception '새 가격 버전은 초안으로 만듭니다' using errcode = '42501'; end if;
      new.created_by := v_uid;
      new.submitted_by := null; new.submitted_at := null; new.decided_by := null; new.decided_at := null; new.decision_note := '';
    end if;
    if new.version is null then new.version := coalesce((select max(version) from public.price_books), 0) + 1; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if v_uid is not null and old.status not in ('draft', 'rejected') then
      raise exception '승인 요청 중이거나 승인된 가격 버전은 지울 수 없습니다' using errcode = '42501';
    end if;
    return old;
  end if;
  -- UPDATE
  if v_uid is null then new.updated_at := now(); return new; end if;
  if old.status = 'approved' then raise exception '승인된 가격 버전은 바꿀 수 없습니다. 새 버전을 만드세요' using errcode = '42501'; end if;
  if new.version <> old.version or new.created_by is distinct from old.created_by or new.based_on is distinct from old.based_on then
    raise exception '버전 번호·만든 사람·기준 버전은 바꿀 수 없습니다' using errcode = '42501';
  end if;
  if new.status = old.status then
    if old.status <> 'draft' then raise exception '초안일 때만 고칠 수 있습니다(승인 요청을 되돌린 뒤 고치세요)' using errcode = '42501'; end if;
    if not public.can_input('base') then raise exception '가격표 입력 권한이 없습니다' using errcode = '42501'; end if;
  elsif old.status = 'draft' and new.status = 'submitted' then
    if not public.can_input('base') then raise exception '가격표 입력 권한이 없습니다' using errcode = '42501'; end if;
    new.submitted_by := v_uid; new.submitted_at := now();
  elsif old.status = 'submitted' and new.status = 'draft' then
    if not public.can_input('base') then raise exception '가격표 입력 권한이 없습니다' using errcode = '42501'; end if;
    new.submitted_by := null; new.submitted_at := null;
  elsif old.status = 'submitted' and new.status in ('approved', 'rejected') then
    if not public.can_approve('price_change') then raise exception '가격 변경 승인 권한이 없습니다(권한표 › 사람별 승인)' using errcode = '42501'; end if;
    if new.data is distinct from old.data or new.effective_from <> old.effective_from then
      raise exception '승인할 때 가격·적용 시작일은 바꿀 수 없습니다' using errcode = '42501';
    end if;
    if new.status = 'rejected' and coalesce(btrim(new.decision_note), '') = '' then
      raise exception '반려는 사유가 있어야 합니다' using errcode = 'check_violation';
    end if;
    new.decided_by := v_uid; new.decided_at := now();
  elsif old.status = 'rejected' and new.status = 'draft' then
    if not public.can_input('base') then raise exception '가격표 입력 권한이 없습니다' using errcode = '42501'; end if;
    new.submitted_by := null; new.submitted_at := null; new.decided_by := null; new.decided_at := null;
  else
    raise exception '가격 버전을 % 에서 % (으)로 바꿀 수 없습니다', old.status, new.status using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.price_books_guard() from public, anon, authenticated;
drop trigger if exists price_books_guard on public.price_books;
create trigger price_books_guard before insert or update or delete on public.price_books for each row execute function public.price_books_guard();

alter table public.price_books enable row level security;
revoke all on public.price_books from anon, authenticated;
grant select, insert, update, delete on public.price_books to authenticated;
grant select, insert, update, delete on public.price_books to service_role;
drop policy if exists price_books_read on public.price_books;
create policy price_books_read on public.price_books for select to authenticated
  using (public.is_staff() or (status = 'approved' and public.is_partner_owner()));
drop policy if exists price_books_insert on public.price_books;
create policy price_books_insert on public.price_books for insert to authenticated
  with check (public.can_input('base') and status = 'draft');
drop policy if exists price_books_update on public.price_books;
create policy price_books_update on public.price_books for update to authenticated
  using (public.can_input('base') or public.can_approve('price_change'))
  with check (public.can_input('base') or public.can_approve('price_change'));
drop policy if exists price_books_delete on public.price_books;
create policy price_books_delete on public.price_books for delete to authenticated
  using (public.can_input('base') and status in ('draft', 'rejected'));

-- 첫 버전: 기획 정정본(견적 사이트 v88 + 정정 목록, CL-057·065). 이미 버전이 있으면 넣지 않는다
insert into public.price_books (version, label, effective_from, status, data, note)
select 1, '2026 · 기획 정정본 2026-11-12', date '2026-01-01', 'approved', $book${"version":"2026 · 기획 정정본 2026-11-12","registration":{"KRW":100000,"USD":100,"JPY":14500},"courses":[{"id":"Speaking Starter","campus":"premium","price":{"KRW":1030000,"USD":800,"JPY":116000},"textbookPhp":1500},{"id":"Speaking Pro","campus":"premium","price":{"KRW":1215000,"USD":975,"JPY":141375},"textbookPhp":1700},{"id":"Speaking Master","campus":"premium","price":{"KRW":1400000,"USD":1150,"JPY":166750},"textbookPhp":1900},{"id":"ESL TEP 8","campus":"premium","price":{"KRW":1030000,"USD":800,"JPY":116000},"textbookPhp":1500},{"id":"ESL TEP 9","campus":"premium","price":{"KRW":1130000,"USD":900,"JPY":130500},"textbookPhp":1600},{"id":"ESL TEP 10","campus":"premium","price":{"KRW":1230000,"USD":1000,"JPY":145000},"textbookPhp":1700},{"id":"Active Senior 5","campus":"premium","price":{"KRW":830000,"USD":600,"JPY":87000},"textbookPhp":1100},{"id":"Active Senior 6","campus":"premium","price":{"KRW":930000,"USD":700,"JPY":101500},"textbookPhp":1200},{"id":"Working Holiday 8","campus":"premium","price":{"KRW":1130000,"USD":900,"JPY":130500},"textbookPhp":1600},{"id":"TOEIC","campus":"premium","price":{"KRW":1130000,"USD":900,"JPY":130500},"textbookPhp":1600},{"id":"Business Master 8","campus":"premium","price":{"KRW":1400000,"USD":1150,"JPY":166750},"textbookPhp":1900},{"id":"ESL Flex","campus":"challenger","price":{"KRW":800000,"USD":580,"JPY":84100},"textbookPhp":1100},{"id":"ESL Lite","campus":"challenger","price":{"KRW":1000000,"USD":760,"JPY":110200},"textbookPhp":1500},{"id":"ESL Core","campus":"challenger","price":{"KRW":1120000,"USD":860,"JPY":124700},"textbookPhp":1600},{"id":"ESL Standard","campus":"challenger","price":{"KRW":1240000,"USD":960,"JPY":139200},"textbookPhp":1700},{"id":"IELTS Lite","campus":"challenger","price":{"KRW":1240000,"USD":960,"JPY":139200},"textbookPhp":1900},{"id":"IELTS Core","campus":"challenger","price":{"KRW":1320000,"USD":1010,"JPY":146450},"textbookPhp":1900},{"id":"IELTS Standard","campus":"challenger","price":{"KRW":1400000,"USD":1060,"JPY":153700},"textbookPhp":1900},{"id":"IELTS Guarantee","campus":"challenger","price":{"KRW":1400000,"USD":1060,"JPY":153700},"textbookPhp":1900,"guarantee":true}],"dorms":[{"id":"Room for 1 Balcony","campus":"premium","room":"single","price":{"KRW":1790000,"USD":1450,"JPY":210250}},{"id":"Room for 1 No Balcony","campus":"premium","room":"single","price":{"KRW":1590000,"USD":1250,"JPY":181250}},{"id":"Semi-Single","campus":"premium","room":"semi","price":{"KRW":1590000,"USD":1250,"JPY":181250}},{"id":"Couple Room Balcony","campus":"premium","room":"couple","price":{"KRW":1290000,"USD":1050,"JPY":152250}},{"id":"Room for 2 Balcony","campus":"premium","room":"double","price":{"KRW":1190000,"USD":950,"JPY":137750}},{"id":"Room for 2 No Balcony","campus":"premium","room":"double","price":{"KRW":1090000,"USD":850,"JPY":123250}},{"id":"Room for 4 Balcony","campus":"premium","room":"quad","price":{"KRW":890000,"USD":750,"JPY":108750}},{"id":"Room for 4 No Balcony","campus":"premium","room":"quad","price":{"KRW":790000,"USD":650,"JPY":94250}},{"id":"Room for 1 (studio)","campus":"challenger","room":"single","price":{"KRW":1590000,"USD":1300,"JPY":188500}},{"id":"Room for 2 (studio)","campus":"challenger","room":"double","price":{"KRW":950000,"USD":800,"JPY":116000}},{"id":"Room for 4 (loft)","campus":"challenger","room":"quad","price":{"KRW":890000,"USD":750,"JPY":108750}},{"id":"Room for 4 (studio)","campus":"challenger","room":"quad","price":{"KRW":750000,"USD":600,"JPY":87000}}],"local":{"ssp":7800,"icard":4500,"studentId":200,"deposit":3000,"utilities":3000,"laundry":1200,"facility":1000,"visa":[{"minWeeks":24,"php":23870},{"minWeeks":20,"php":19630},{"minWeeks":16,"php":15390},{"minWeeks":12,"php":11150},{"minWeeks":8,"php":4940}],"guarantee":18000},"pickups":[{"id":"manila_besa","label":"Manila NAIA 일요일(BESA 단체)","php":3000},{"id":"manila_solo","label":"Manila NAIA 그 밖의 날 1인","php":13000},{"id":"clark_besa","label":"Clark CRK 월요일(BESA 단체)","php":3000},{"id":"clark_solo","label":"Clark CRK 그 밖의 날 1인","php":8500}],"promotions":[{"id":"peak26","name":"성수기 추가요금 '26","kind":"surcharge","systems":["kr","usd","usd-new","jp"],"periods":[["2026-06-28","2026-08-22"]],"amount":{"KRW":50000,"USD":40,"JPY":5000},"minWeeks":0,"apply":"auto"},{"id":"peak27","name":"성수기 추가요금 '27","kind":"surcharge","systems":["kr","usd","usd-new","jp"],"periods":[["2027-06-27","2027-08-21"]],"amount":{"KRW":80000,"USD":60,"JPY":8000},"minWeeks":0,"apply":"auto"},{"id":"lean26_quad","name":"비수기 4인실 '26","kind":"room_lean","systems":["kr","usd"],"periods":[["2026-02-22","2026-06-27"],["2026-08-23","2027-01-09"]],"rooms":["quad"],"amount":{"KRW":150000,"USD":150},"unitWeeks":4,"granularity":2,"minWeeks":4,"apply":"auto"},{"id":"lean26_sd","name":"비수기 1·2인실 '26","kind":"room_lean","systems":["kr","usd"],"periods":[["2026-02-22","2026-06-27"],["2026-08-23","2027-01-09"]],"rooms":["single","semi","double","couple"],"amount":{"KRW":50000,"USD":50},"unitWeeks":4,"granularity":2,"minWeeks":4,"apply":"auto","note":"2026은 1인실 전체 포함"},{"id":"lean27_quad","name":"비수기 4인실 '27","kind":"room_lean","systems":["kr","usd"],"periods":[["2027-02-21","2027-06-26"],["2027-08-22","2028-01-08"]],"rooms":["quad"],"amount":{"KRW":100000,"USD":100},"unitWeeks":4,"granularity":2,"minWeeks":4,"apply":"auto"},{"id":"lean27_sd","name":"비수기 2인실·Semi·Couple '27","kind":"room_lean","systems":["kr","usd"],"periods":[["2027-02-21","2027-06-26"],["2027-08-22","2028-01-08"]],"rooms":["semi","double","couple"],"amount":{"KRW":50000,"USD":50},"unitWeeks":4,"granularity":2,"minWeeks":4,"apply":"auto","note":"2027은 1인실 모두 제외(2027 포스터)"},{"id":"holiday26","name":"홀리데이 '26","kind":"holiday","systems":["kr","usd","jp"],"startDates":["2026-11-29","2026-12-13","2026-12-27","2027-01-10"],"rooms":["double","quad","couple"],"amount":{"KRW":200000,"USD":200,"JPY":30000},"minWeeks":4,"minRoomWeeks":4,"apply":"auto"},{"id":"holiday27","name":"홀리데이 '27","kind":"holiday","systems":["kr","usd"],"startDates":["2027-11-28","2027-12-12","2027-12-26","2028-01-09"],"rooms":["double","quad"],"pendingRooms":["couple"],"amount":{"KRW":150000,"USD":150},"minWeeks":4,"minRoomWeeks":4,"apply":"auto","note":"커플룸 포함 여부는 11/13 담당자 미팅에서 확인(정정 목록 6장)"},{"id":"long","name":"장기등록","kind":"long_term","systems":["kr","usd","jp"],"amount":{"KRW":300000,"USD":300,"JPY":10000},"step":{"KRW":50000,"USD":50,"JPY":5000},"minWeeks":12,"apply":"auto"},{"id":"gs26_lean","name":"Global Scholar '26 Lean","kind":"stay_period","systems":["usd-new"],"periods":[["2026-02-22","2026-06-27"],["2026-08-23","2026-12-26"]],"amount":{"USD":200},"unitWeeks":2,"granularity":2,"minWeeks":4,"apply":"auto"},{"id":"gs26_peak","name":"Global Scholar '26 Peak","kind":"stay_period","systems":["usd-new"],"periods":[["2026-06-28","2026-08-22"]],"amount":{"USD":100},"unitWeeks":2,"granularity":2,"minWeeks":4,"apply":"auto"},{"id":"gs27_lean","name":"Global Scholar '27 Lean","kind":"stay_period","systems":["usd-new"],"periods":[["2027-02-21","2027-06-26"],["2027-08-22","2028-01-08"]],"amount":{"USD":400},"unitWeeks":4,"granularity":4,"minWeeks":4,"apply":"auto"},{"id":"gs27_peak","name":"Global Scholar '27 Peak","kind":"stay_period","systems":["usd-new"],"periods":[["2027-06-27","2027-08-21"]],"amount":{"USD":200},"unitWeeks":4,"granularity":4,"minWeeks":4,"apply":"auto"},{"id":"fair_tw","name":"Fair promotion(대만)","kind":"manual","systems":["usd"],"amount":{},"minWeeks":0,"apply":"confirm","note":"학생 할인. 적용자·날짜·메모 기록. 다른 프로모션과의 중복은 확인 필요"}]}$book$::jsonb,
  '견적 사이트 v88 + 정정 목록(2026-11-12) 기준값(CL-057·065). 포털에 처음 넣은 가격이라 승인 기록 없이 승인된 상태로 시작'
where not exists (select 1 from public.price_books);
