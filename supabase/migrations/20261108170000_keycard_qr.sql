-- 카드키 QR(기획안 I6): 학생 앱이 1분마다 바뀌는 서명 QR 을 보여 주고 가드 태블릿이 읽는다(apps/student/server/keycard.ts).
-- 서명 비밀 값은 이 표 한 행에 둔다. 학생·직원·가드 계정은 못 읽고, 서버(학생 앱 Worker, 인트라넷 가드 요청)가 서비스 키로만 읽는다.
-- 외출·귀가 기록에는 찍은 방법(카드키 QR / 학생번호 직접 입력)을 남긴다. 여러 번 실행해도 된다.

create table if not exists public.keycard_secret (
  id int primary key check (id = 1),
  secret text not null check (char_length(secret) >= 32),
  created_at timestamptz not null default now()
);
alter table public.keycard_secret enable row level security;
revoke all on public.keycard_secret from anon, authenticated;
grant select on public.keycard_secret to service_role;
-- 처음 한 번만 만든다(무작위 UUID 두 개 = 16진 64자). 바꾸려면 이 행을 고치면 되고, 그때 쓰던 QR 은 바로 못 쓰게 된다.
insert into public.keycard_secret (id, secret)
values (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

-- 외출·귀가를 찍은 방법: 'qr' 카드키 QR, 'number' 학생번호 직접 입력(휴대폰이 없을 때 등). 그전 기록은 비어 있다.
alter table public.outings add column if not exists out_via text check (out_via is null or out_via in ('qr', 'number'));
alter table public.outings add column if not exists in_via text check (in_via is null or in_via in ('qr', 'number'));
grant insert (out_via, in_via) on public.outings to authenticated;
grant update (in_via) on public.outings to authenticated;
