-- Speaking Course 단계 수업 구성(CL-070, 11/12 결정, CL-019 개정)
--   STARTER 1:1 4 + 그룹 1 + 옵션 2 = 7타임 / PRO 1:1 5 + 그룹 1 + 옵션 2 = 8타임 / MASTER 1:1 6 + 옵션 2 = 8타임
-- 상담 ④ 단계 표·코스 상세·학습계획서가 courses.levels 의 lessons(수업량)를 그대로 보여 준다.
-- 조건표 v2.1(20261109153000)이 넣은 값('1:1 4개' 등)이 그대로인 단계만 바꾼다. 관리자가 고친 단계는 건드리지 않는다.
-- 단계 이름·강도·포함 내용은 그대로(이름은 조건표 V2.2·브로슈어 기준과 함께, CL-069·T-30). 여러 번 실행해도 같다.

update public.courses c
set levels = (
      select jsonb_agg(
               case
                 when e ->> 'name' = 'STARTER' and e ->> 'lessons' = '1:1 4개' then jsonb_set(e, '{lessons}', to_jsonb('7타임 (1:1 4 + 그룹 1 + 옵션 2)'::text))
                 when e ->> 'name' = 'PRO' and e ->> 'lessons' = '1:1 5개' then jsonb_set(e, '{lessons}', to_jsonb('8타임 (1:1 5 + 그룹 1 + 옵션 2)'::text))
                 when e ->> 'name' = 'MASTER' and e ->> 'lessons' = '1:1 6개' then jsonb_set(e, '{lessons}', to_jsonb('8타임 (1:1 6 + 옵션 2)'::text))
                 else e
               end
               order by t.i)
      from jsonb_array_elements(c.levels) with ordinality as t(e, i)
    ),
    updated_at = now()
where c.id = 'p-speaking'
  and jsonb_typeof(c.levels) = 'array'
  and exists (
    select 1 from jsonb_array_elements(c.levels) e
    where (e ->> 'name', e ->> 'lessons') in (('STARTER', '1:1 4개'), ('PRO', '1:1 5개'), ('MASTER', '1:1 6개'))
  );
