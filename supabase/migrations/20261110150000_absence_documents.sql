-- 결석 신청 진단서 사진(11/10 결정 I10, docs/leo-todo.md): 병결이 연속 2일 이상이면 진단서 사진이 필요하다(apps/student/server/requests.ts needsMedicalDoc).
-- 학생이 신청 상세에서 사진을 올리면 Supabase Storage 비공개 버킷 'absence-docs' 의 '<학생번호>/<신청 번호>.<jpg|png|webp>' 에 두고,
-- 신청에 그 경로를 붙인다(absence_attach_document). 학생은 자기 폴더만 올리고 보며, 직원·매니저(결석 신청 처리)는 모두 본다.
-- 실제 학생 진단서는 보안 점검 뒤 운영에서만 받는다(11/7 결정: 시험 DB 에는 가짜만). 여러 번 실행해도 된다.

-- ── 신청에 붙은 진단서 경로(없으면 null)
alter table public.absence_requests add column if not exists document_path text;
alter table public.absence_requests drop constraint if exists absence_requests_document_path_check;
alter table public.absence_requests add constraint absence_requests_document_path_check
  check (document_path is null or document_path ~ '^[A-Za-z0-9_-]{1,40}/[0-9a-f-]{36}\.(jpg|png|webp)$');

-- ── 비공개 버킷: 1MB 까지, 사진 종류만(화면이 휴대폰에서 줄여 보낸다)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('absence-docs', 'absence-docs', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ── Storage 권한: 학생은 자기 폴더(학생번호)에만 올리고 바꾸고 본다. 직원·매니저는 읽기만. 지우기는 없다(기록으로 남긴다)
drop policy if exists absence_docs_student_insert on storage.objects;
create policy absence_docs_student_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'absence-docs' and (storage.foldername(name))[1] = public.current_student_no());
drop policy if exists absence_docs_student_update on storage.objects;
create policy absence_docs_student_update on storage.objects for update to authenticated
  using (bucket_id = 'absence-docs' and (storage.foldername(name))[1] = public.current_student_no())
  with check (bucket_id = 'absence-docs' and (storage.foldername(name))[1] = public.current_student_no());
drop policy if exists absence_docs_read on storage.objects;
create policy absence_docs_read on storage.objects for select to authenticated
  using (bucket_id = 'absence-docs'
         and ((storage.foldername(name))[1] = public.current_student_no() or public.is_staff() or public.is_intranet_manager()));

-- ── 신청에 진단서를 붙인다: 내 신청, 대기 중, 경로는 '<내 학생번호>/<신청 번호>.<확장자>', 그 파일이 Storage 에 있어야 한다
create or replace function public.absence_attach_document(p_id uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me text := public.current_student_no();
  r public.absence_requests;
begin
  if me is null then raise exception 'student_only'; end if;
  select * into r from public.absence_requests where id = p_id and student_no = me for update;
  if not found then raise exception 'not_found'; end if;
  if r.status <> 'pending' then raise exception 'not_pending'; end if;
  if p_path is null or p_path !~ ('^' || me || '/' || p_id::text || '\.(jpg|png|webp)$') then raise exception 'invalid_path'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'absence-docs' and o.name = p_path) then raise exception 'document_missing'; end if;
  update public.absence_requests set document_path = p_path, updated_at = now() where id = p_id;
end $$;
revoke execute on function public.absence_attach_document(uuid, text) from public, anon;
grant execute on function public.absence_attach_document(uuid, text) to authenticated, service_role;
