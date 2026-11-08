# 클라우드 연결 (GitHub + Supabase + Cloudflare)

화면은 Cloudflare Pages, DB와 로그인은 Supabase, 코드는 GitHub에 둔다. GitHub `main`에 올리면 Cloudflare가 자동으로 빌드·배포한다.

```
브라우저 ──▶ Cloudflare Pages  (apps/admin/dist 화면 + functions/api/* 서버)
                  │  로그인한 직원의 토큰으로 조회
                  ▼
             Supabase  (Auth 로그인 + Postgres: staff_users, legacy_* 테이블, RLS)
GitHub main ──▶ Cloudflare 자동 배포 / GitHub Actions 빌드 확인·DB 반영
```

- 로컬(`npm run admin`)은 지금처럼 로그인 없이 이 PC의 데이터로 돈다. 환경변수가 있을 때만 로그인 화면이 나온다.
- Supabase에는 **샘플 데이터만** 올린다. 실제 추출본은 보안 점검(접근 기록, 백업, 2단계 인증) 이후에 정한다.

## 키 정리 (어디에 넣는지)

| 이름 | 어디서 | 넣는 곳 | 공개돼도 되나 |
| --- | --- | --- | --- |
| Project URL | Supabase 상단 **Connect** 또는 Project Settings | Cloudflare 환경변수 `VITE_SUPABASE_URL`, 업로드 시 `SUPABASE_URL` | 됨 |
| anon / publishable 키 | Project Settings → API Keys | Cloudflare 환경변수 `VITE_SUPABASE_ANON_KEY` | 됨 (RLS가 막음) |
| service_role / secret 키 | Project Settings → API Keys | 업로드할 때 내 PC 터미널에서만 `SUPABASE_SERVICE_ROLE_KEY` | **절대 안 됨** |
| DB 비밀번호·연결 주소 | 프로젝트 만들 때 / Connect → Session pooler | GitHub 시크릿 `SUPABASE_DB_URL` (선택) | **절대 안 됨** |

service_role 키와 DB 비밀번호는 코드, GitHub, 메신저, Claude 대화창에 붙여 넣지 않는다. 비밀번호 관리자에 보관한다.

## 1. Supabase

1. https://supabase.com/dashboard → **New project**
   - Name `jic-portal`, Region **Southeast Asia (Singapore)**(*Need a specific region?*을 눌러야 보임), Database Password는 생성 버튼으로 만들고 비밀번호 관리자에 저장.
   - Security: *Enable Data API* 켬, *Automatically expose new tables* **끔**, *Enable automatic RLS* 켬. 테이블 권한은 마이그레이션 SQL이 직접 준다.
   - 2026-11-07 만든 프로젝트: `https://isayrrexurledojngqbx.supabase.co` (baguiojic 조직, Free 플랜. 일주일 미사용 시 자동 일시정지)
2. **SQL Editor** → New query → `supabase/migrations/20261107000000_legacy_tables.sql` 내용을 붙여 넣고 **Run**.
   - Table Editor에 `staff_users`와 `legacy_*` 7개가 보이면 된다.
3. **Authentication → Sign In / Providers** → *Allow new users to sign up* 끄기. 계정은 관리자가 만든다.
4. **Authentication → Users → Add user → Create new user**: 직원 이메일과 비밀번호, *Auto Confirm User* 체크.
5. 만든 계정을 직원으로 등록한다. SQL Editor에서 이메일과 이름만 바꿔 실행:

   ```sql
   insert into public.staff_users (user_id, name)
   select id, '레오' from auth.users where email = '직원이메일@example.com';
   ```

   `staff_users`에 없는 계정은 로그인은 돼도 데이터가 하나도 안 보인다(403).
6. 샘플 데이터 올리기. **Project Settings → API Keys → Secret keys**의 복사 버튼으로 키를 복사하고, 내 PC의 PowerShell에서:

   ```powershell
   cd C:\Users\bh007\portal
   powershell -ExecutionPolicy Bypass -File scripts\upload-sample.ps1 -Url https://<프로젝트>.supabase.co
   ```

   키를 묻는 줄에 붙여 넣고 Enter(화면에 안 보임). 키는 그 실행에서만 쓰고 지워진다.

   `legacy_students: 224건` 같은 줄이 나오면 된다. 스크립트는 `data-sample/tables`만 올리고, 실제 추출본(`data/`)은 거부한다.

## 2. Cloudflare Pages

GitHub `main`에 이 코드가 올라가 있어야 한다.

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** 탭 → **Connect to Git**
   (Workers 화면이 먼저 나오면 아래쪽 *Looking to deploy Pages? Get started*)
2. GitHub 연결 → 저장소 접근은 **Only select repositories**에서 `jic-portal`만 선택 → 저장소 선택.
3. 빌드 설정

   | 항목 | 값 |
   | --- | --- |
   | Project name | `jic-portal` (주소가 `jic-portal.pages.dev`가 됨) |
   | Production branch | `main` |
   | Framework preset | None |
   | Build command | `npm run admin:build` |
   | Build output directory | `apps/admin/dist` |
   | Root directory | 비워 둠 (저장소 루트) |

4. **Environment variables** (Production·Preview 둘 다)

   | 이름 | 값 |
   | --- | --- |
   | `VITE_SUPABASE_URL` | Project URL |
   | `VITE_SUPABASE_ANON_KEY` | anon / publishable 키 |
   | `NODE_VERSION` | `22` |

5. **Save and Deploy**. 끝나면 `https://jic-portal.pages.dev`에서 로그인 화면이 나온다(이름이 이미 쓰이면 숫자가 붙는다. 2026-11-07 만든 주소: `https://jic-portal-916.pages.dev`). 1-4에서 만든 계정으로 로그인하면 대시보드(오른쪽 위 '샘플 데이터')가 보인다.
6. Supabase → **Authentication → URL Configuration** → Site URL을 `https://jic-portal.pages.dev`로 바꾼다(비밀번호 재설정 메일 링크용).

이후에는 `main`에 머지될 때마다 자동 배포되고, 다른 브랜치를 올리면 미리보기 주소(`<브랜치>.jic-portal.pages.dev`)가 생긴다.

### 파트너 포털 (Cloudflare Workers)

Cloudflare는 이미 Pages 프로젝트에 연결된 저장소로 Pages 프로젝트를 하나 더 만들지 못하게 한다(저장소 옆에 'In use'가 뜬다). 그래서 파트너 포털은 **Workers 정적 파일**로 올린다. 설정 파일은 `apps/partner/wrangler.jsonc`이고, 정적 파일만 있으며 서버 코드는 없다.

1. **Workers & Pages → Create → Workers → Import a repository** → `jic-portal` 선택
2. 설정

   | 항목 | 값 |
   | --- | --- |
   | Project name | `jic-partner` |
   | Root directory | `/` (비워 둠) |
   | Build command | `npm run partner:build` |
   | Deploy command | `npx wrangler deploy --config apps/partner/wrangler.jsonc` |
   | Build variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (관리자 앱과 같은 값), `NODE_VERSION=22` |

3. 배포되면 `https://jic-partner.<계정>.workers.dev` 주소가 생긴다(2026-11-08 만든 주소: `https://jic-partner.bh007007.workers.dev`). 이후 `main`에 머지할 때마다 다시 배포된다.

배포한 뒤 해야 할 일:
- Supabase **Authentication → URL Configuration → Redirect URLs**에 파트너 포털 주소(`https://jic-partner.….workers.dev/**`)와 `http://127.0.0.1:5175/**`를 추가한다. 이메일 인증과 비밀번호 재설정 링크가 이 주소로 돌아온다.
- 등록 신청을 받으려면 **Allow new users to sign up**을 켠다(`docs/partner-portal.md` '계정 흐름').

### 학생 앱 (Cloudflare Workers)

파트너 포털과 같은 Workers 방식이지만 정적 파일에 `/api` 서버 코드가 붙는다(`apps/student/wrangler.jsonc`, `apps/student/worker/index.ts`). Project name `jic-student`, Build command `npm run student:build`, Deploy command `npx wrangler deploy --config apps/student/wrangler.jsonc`. 빌드 변수 외에 실행 변수(`SUPABASE_URL`, `SUPABASE_ANON_KEY`, Secret `SUPABASE_SERVICE_ROLE_KEY`)가 필요하다. 순서와 확인 방법은 `docs/student-app.md` '배포'.

### 강사 포털 LMS (위 Pages 프로젝트 안 `/teacher`)

- 따로 프로젝트를 만들지 않는다. 같은 주소라 직원은 한 번 로그인으로 오간다(원칙 C6).
- Pages 빌드 명령 끝에 강사 포털 빌드를 붙인다: `npm run portal:build && npm run teacher:portal --if-present`. 출력은 `apps/admin/dist/teacher`다.
- 서버 코드는 없고 `functions/teacher/[[path]].ts`가 화면 주소만 강사 포털 `index.html`로 보낸다. 데이터는 Supabase RLS다.
- 변수는 관리자 앱과 같은 `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY`를 쓴다.
- 마이그레이션은 `20261108200000_teacher_portal.sql`, `20261108220000_lms_absences.sql`이다. 순서는 `docs/teacher-portal.md`.

### 인트라넷 (위 Pages 프로젝트 안 `/intranet`)

인트라넷은 따로 프로젝트를 만들지 않고 이 Pages 프로젝트 주소 아래 `/intranet/`에 함께 올린다(11/8 결정, 한 번 로그인으로 오간다). 위 2번 표의 Build command(`npm run admin:build`)가 인트라넷까지 빌드하므로 빌드 설정은 그대로 두고, Variables and Secrets 에 **Secret** `SUPABASE_SERVICE_ROLE_KEY` 만 더한다(가드 태블릿만 씀. 없어도 직원 화면은 동작). 서버 코드는 `functions/intranet/`. 가드 공용 계정(출입구마다)은 인트라넷 **직원 > 가드 계정**에서 만든다(서비스 키 필요). 순서는 `docs/intranet.md` '배포'.

## 3. GitHub (선택)

- `.github/workflows/ci.yml`: PR과 `main`에서 빌드가 깨지지 않는지 확인한다. 설정할 것 없음.
- `.github/workflows/supabase-migrate.yml`: `main`에 `supabase/migrations/` 변경이 들어오면 DB에 반영한다.
  쓰려면 저장소 **Settings → Secrets and variables → Actions → New repository secret**에 `SUPABASE_DB_URL`을 넣는다.
  값은 Supabase **Connect → Session pooler**의 URI이고 `[YOUR-PASSWORD]`를 DB 비밀번호로 바꾼다.
  넣기 전에는 이 작업이 건너뛰어지니, 그동안은 1-2처럼 SQL Editor에서 직접 실행한다.
  마이그레이션 파일은 여러 번 실행해도 되게 써야 한다(`if not exists`, `drop policy if exists`). SQL Editor로 먼저 실행한 것이 나중에 다시 실행될 수 있기 때문이다.

## 로컬에서 로그인까지 시험하기 (선택)

`apps/admin/.env.example`을 `apps/admin/.env.local`로 복사해 URL과 anon 키를 채우고 `npm run admin`. 로그인 화면은 나오지만 데이터는 여전히 이 PC의 파일에서 읽는다. Supabase 조회까지 시험하려면 `npm run admin:build` 후 `npx wrangler pages dev apps/admin/dist`.

## 알려진 한계

- `functions/api`는 요청마다 `legacy_*` 전체를 읽어 계산한다(같은 사용자는 1분 캐시). 샘플 규모용이다. 실제 데이터(학생 5천 명대)를 올리기 전에 정규화 테이블과 조건 조회로 바꾼다.
- 권한은 지금 '직원이면 전부 읽기' 하나다. 역할별 권한(기획안의 역할 9개)은 다음 단계.
