-- 관리자 포털 '사용자·권한'에서 직원 이름(staff_users.name)을 고친다. 여러 번 실행해도 된다.
-- 이 이름은 인트라넷 처리자·상담 기록 작성자, 강사 포털 출석 '체크한 사람'(current_lms_name)으로 남는다. 지금까지는 Supabase SQL 로만 넣었다.
-- 사용자·권한은 관리자만(docs/roles.md, 20261109010000_roles.sql 의 is_admin()). staff_users 쓰기 권한은 넓히지 않고 이 함수만 연다.
-- 직원 등록·삭제(staff_users 행)는 지금처럼 서비스 키, 담당 캠퍼스(staff_campuses, 상담 범위)는 user_roles.campus 와 합칠지 결정 대기라 여기서 다루지 않는다.

create or replace function public.staff_set_name(p_user uuid, p_name text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
begin
  if not public.is_admin() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if v = '' or char_length(v) > 40 then
    raise exception 'bad_name' using errcode = '22023';
  end if;
  update public.staff_users set name = v where user_id = p_user;
  if not found then
    raise exception 'not_staff' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

revoke execute on function public.staff_set_name(uuid, text) from public, anon;
grant execute on function public.staff_set_name(uuid, text) to authenticated, service_role;
