-- 파트너 포털 사진 보관함(CL-047)과 캠프 브로슈어 PDF(CL-053). 화면 명세 4.4·4.3.
-- 사진도 화면 콘텐츠 표(partner_content_items)에 종류 'photo'로 담는다: 공통 칸(노출 국가·국가별 순서·언어별 설명·공개 상태·업데이트일·수정 기록)을 그대로 쓰고,
--   data = { path(저장소 경로), placement(화면 위치), course, focus[x,y](사진 중심점 0~1), width, height, size, file_name }.
-- 파일은 비공개 저장소 partner-media 에 둔다(사진 photos/…, 캠프 브로슈어 camps/…). 큰 사진은 관리자 화면이 올리기 전에 가로 1600px로 줄인다.
-- 에이전시는 '게시된 콘텐츠가 가리키는 파일'만 서명 주소로 연다: 저장소 정책이 partner_content_items 를 보고, 그 표의 정책(게시·지점 국가)이 그대로 걸린다.
-- 직원은 모두 올리고 지운다. 여러 번 실행해도 된다.

-- 1) 종류에 'photo' 더하기
alter table public.partner_content_items drop constraint if exists partner_content_items_kind_check;
alter table public.partner_content_items add constraint partner_content_items_kind_check
  check (kind in ('about', 'teacher', 'day', 'activity', 'camp', 'playbook', 'evidence', 'event', 'campus_status', 'school_stat', 'contact', 'newsletter', 'video', 'photo'));
-- 저장소 정책이 경로로 찾는다
create index if not exists partner_content_items_path on public.partner_content_items ((data ->> 'path')) where kind = 'photo';

-- 2) 비공개 저장소(사진·PDF만, 한 파일 10MB까지)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('partner-media', 'partner-media', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists partner_media_read on storage.objects;
create policy partner_media_read on storage.objects for select to authenticated
  using (
    bucket_id = 'partner-media'
    and (
      public.is_staff()
      -- partner_content_items 의 정책이 함께 걸려 게시된 것·내 지점 국가 것만 찾아진다
      or exists (
        select 1 from public.partner_content_items i
        where (i.kind = 'photo' and i.data ->> 'path' = objects.name) or (i.kind = 'camp' and i.data ->> 'brochure_path' = objects.name)
      )
    )
  );
drop policy if exists partner_media_write on storage.objects;
create policy partner_media_write on storage.objects for all to authenticated
  using (bucket_id = 'partner-media' and public.is_staff())
  with check (bucket_id = 'partner-media' and public.is_staff());
