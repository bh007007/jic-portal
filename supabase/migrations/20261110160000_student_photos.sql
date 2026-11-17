-- 학생 사진(11/10 결정 I9, docs/intranet.md): 인트라넷 '사진 관리'에서 직원이 올리고, Student File·사진 관리에서 직원이 본다.
-- 사진은 Supabase Storage 비공개 버킷 'student-photos' 의 '<학생번호>/<번호>.<jpg|png|webp>' 에 두고, 올릴 때마다 기록(student_photos)을 남긴다.
-- 학생의 지금 사진 = 그 학생의 가장 최근 기록. 지우지 않는다(바꾸면 새로 올린다). 업체 사진을 한꺼번에 옮길 때도 같은 표에 남긴다(source = 'vendor').
-- 권한: 직원(is_staff())만 올리고 본다. 매니저·가드·학생은 못 본다. 오피스의 맡은 캠퍼스 범위는 인트라넷 서버가 Student File 과 같이 막는다.
-- 실제 학생 사진은 보안 점검 뒤 운영에서만 받는다(11/7 결정: 시험 DB 에는 가짜만). 여러 번 실행해도 된다.

-- ── 비공개 버킷: 1MB 까지, 사진 종류만(화면이 줄여 보낸다)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ── Storage 권한: 직원만 올리고(같은 이름 다시 올리기 포함) 본다. 지우기는 없다
drop policy if exists student_photos_staff_insert on storage.objects;
create policy student_photos_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'student-photos' and public.is_staff());
drop policy if exists student_photos_staff_update on storage.objects;
create policy student_photos_staff_update on storage.objects for update to authenticated
  using (bucket_id = 'student-photos' and public.is_staff())
  with check (bucket_id = 'student-photos' and public.is_staff());
drop policy if exists student_photos_staff_read on storage.objects;
create policy student_photos_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'student-photos' and public.is_staff());

-- ── 올린 기록
create table if not exists public.student_photos (
  id uuid primary key default gen_random_uuid(),
  student_no text not null check (student_no ~ '^[A-Za-z0-9_-]{1,40}$'),
  path text not null unique,
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 1048576),
  source text not null default 'staff' check (source in ('staff', 'vendor')),
  uploaded_by uuid default auth.uid() references auth.users (id),
  uploaded_at timestamptz not null default now(),
  constraint student_photos_path_check check (path ~ ('^' || student_no || '/[0-9a-f-]{36}\.(jpg|png|webp)$'))
);
create index if not exists student_photos_student on public.student_photos (student_no, uploaded_at desc);

alter table public.student_photos enable row level security;
revoke all on public.student_photos from anon, authenticated;
grant select on public.student_photos to authenticated;
grant select, insert, update, delete on public.student_photos to service_role;
drop policy if exists student_photos_staff_select on public.student_photos;
create policy student_photos_staff_select on public.student_photos for select to authenticated using (public.is_staff());

-- ── 사진을 올린 뒤 기록: 직원만, 경로는 '<학생번호>/<uuid>.<확장자>', 그 파일이 Storage 에 있어야 한다
create or replace function public.student_photo_record(p_student_no text, p_path text, p_content_type text, p_size integer)
returns setof public.student_photos language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'staff_only'; end if;
  if p_student_no is null or p_student_no !~ '^[A-Za-z0-9_-]{1,40}$' then raise exception 'invalid_student'; end if;
  if p_path is null or p_path !~ ('^' || p_student_no || '/[0-9a-f-]{36}\.(jpg|png|webp)$') then raise exception 'invalid_path'; end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'student-photos' and o.name = p_path) then raise exception 'photo_missing'; end if;
  -- 한 행을 돌려준다(setof: REST 가 배열로 돌려줘 화면 서버가 같은 모양으로 읽는다)
  return query insert into public.student_photos (student_no, path, content_type, size_bytes)
    values (p_student_no, p_path, p_content_type, p_size)
    returning *;
end $$;
revoke execute on function public.student_photo_record(text, text, text, integer) from public, anon;
grant execute on function public.student_photo_record(text, text, text, integer) to authenticated, service_role;
