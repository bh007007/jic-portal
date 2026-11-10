-- 학비표(CL-038, 11/10 결정): 관리자 포털 가격표(공용 DB legacy_prices)가 원본이고, 에이전시 포털 학비표는 여기서 읽는다. 포털에서 가격을 입력하지 않는다.
-- legacy_prices 는 직원만 읽으므로(정책을 넓히지 않음) 에이전시는 이 함수로만 읽는다. 여러 번 실행해도 된다.
-- - 지금 적용 중인(필리핀 날짜 기준 적용 기간 안, 사용 중) 코스·기숙사·기타 비용만. 커미션(comm_rule)·프로모션·환율·기간별 값은 내보내지 않는다.
-- - 가격표가 가짜 샘플이면(legacy_meta.source = 'sample') 에이전시에게는 아무것도 주지 않는다(원칙 C8: 확인된 가격만). 직원은 sample 표시와 함께 본다.
-- - 기간별 금액·할인·환불 계산은 견적(견적 프로그램)에서 한다. 견적 사이트와 가격표 연결은 R-009.

create or replace function public.partner_tuition()
returns table (section text, campus text, name text, kind text, weeks integer, krw numeric, usd numeric, jpy numeric, php numeric, sort integer, sample boolean)
language sql stable security definer set search_path = public as $$
  with ctx as (
    select (now() at time zone 'Asia/Manila')::date as today,
           coalesce((select data ->> 'source' from public.legacy_meta where id = 'current'), '') = 'sample' as sample,
           public.is_staff() as staff,
           public.is_partner() as partner
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
