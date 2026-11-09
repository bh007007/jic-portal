# 학원 공식 계정으로 옮기기 (소유·권한·일 나누기)

레오님 개인 계정에 있는 JIC 포털을 JIC 어학원 소유로 옮긴다. 11/9 레오님 결정:
- **소유**: JIC 어학원. 레오님은 어학원을 대표해 소유자(Owner)가 된다.
- **주 개발자**: 썸머 매니저.
- **보조 개발자**: 레오님. 개인 계정으로 한 항목씩 PR을 보낸다.

## 1. 원칙

- 서비스마다 **어학원이 관리하는 공용 이메일**(예: 어학원 도메인의 `it@`·`dev@`)로 최상위 계정을 만든다. 썸머 매니저 개인 이메일로 만들지 않는다.
- 공용 계정은 2단계 인증을 켜고, 비밀번호는 어학원 비밀번호 관리자(또는 금고)에 둔다.
- 서비스마다 **Owner는 두 명 이상**이다: 어학원 공용 계정 + 레오님. 대표님까지 두면 더 안전하다. 한 사람이 빠지거나 계정이 막혀도 서비스가 어학원에 남는다.
- 레오님 개인 계정과 개인 Claude는 **운영 키와 실제 학생 데이터에 손대지 않는다**. 보조 개발은 개발용 DB와 샘플 데이터로 한다.

## 2. 서비스별 권한

| 서비스 | 소유(Owner) | 썸머 매니저(주 개발) | 레오님 개인 계정(보조) |
| --- | --- | --- | --- |
| GitHub 조직(예: `jic-academy`) | 어학원 공용 계정 + 레오님 | 저장소 **Maintain**: PR 머지·브랜치·이슈 관리(저장소 삭제·조직 설정 불가) | 저장소 **Write**: 브랜치 → PR |
| Supabase 조직 | 어학원 공용 계정 + 레오님 | **Developer**: 마이그레이션·DB 작업(요금·프로젝트 삭제 불가) | 개발용 프로젝트만(3장) |
| Cloudflare | 어학원 공용 계정 + 레오님(Super Administrator) | **Administrator**: Pages·Workers·환경변수 | 없음(PR 미리 보기 주소로 확인) |
| Claude | 어학원 팀 요금제 | 팀 자리 | 개인 요금제 그대로 |
| 회사 도메인(결정 #6) | 어학원 | DNS 관리 위임 가능 | - |

## 3. 개발용·운영용 DB 나누기 (실제 데이터를 올리기 전에)

지금은 Supabase 프로젝트가 하나라서 마이그레이션이 바로 운영에 들어간다. 둘로 나눈다.

| 프로젝트 | 데이터 | 누가 | 누가 쓰나 |
| --- | --- | --- | --- |
| `jic-portal-dev`(새로 만듦) | 가짜 샘플만(`scripts/upload-sample.ps1`) | 썸머 매니저·레오님이 마음껏 시험 | Cloudflare **Preview** 환경(PR 미리 보기 주소) |
| `jic-portal`(지금 것, 운영) | 지금은 샘플, 보안 점검 뒤 실제 데이터 | 마이그레이션은 개발용에서 확인한 뒤 썸머 매니저(또는 레오님)만 적용 | Cloudflare **Production** 환경(운영 주소) |

- Cloudflare Pages는 환경변수를 Production·Preview로 따로 넣을 수 있다. Preview의 `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY`(와 Secret `SUPABASE_SERVICE_ROLE_KEY`)를 개발용 프로젝트 값으로 넣으면, PR 미리 보기는 개발용 DB를 보고 운영 주소만 운영 DB를 본다.
- Workers(`jic-student`·`jic-partner`)도 미리 보기 버전용 변수를 개발용 값으로 둔다.
- 마이그레이션 순서: PR에 새 파일 → 개발용에 적용·미리 보기에서 확인 → 머지 → 운영에 적용.

## 4. 옮기는 방법

| 서비스 | 방법 | 주소·키가 바뀌나 |
| --- | --- | --- |
| GitHub | 학원 공용 계정으로 조직을 만들고 저장소 **Settings → Transfer ownership**. PR·이력·이슈가 그대로 간다 | 주소가 바뀌지만 옛 주소는 자동으로 넘어간다 |
| Supabase | 학원 공용 계정으로 조직을 만들고, 레오님을 두 조직의 Owner로 둔 뒤 **Project Settings → General → Transfer project**. 요금제(Pro, 결정 #9)는 학원 조직에서 | 프로젝트 주소·키 그대로. 옮긴 뒤 secret 키를 새로 만들고 옛 키를 끈다 |
| Cloudflare | 계정 사이 이전 기능이 없어 학원 계정에서 **새로 만든다**. Pages·Workers를 GitHub 조직 저장소에 연결하고, 환경변수·Secret·빌드 명령을 다시 넣는다 | `*.pages.dev`·`*.workers.dev` 주소가 바뀐다. 회사 도메인을 붙이면 그 뒤로는 바뀌지 않는다 |
| Claude | 학원 팀 요금제에 썸머 매니저 자리. 작업 맥락은 저장소 문서(`CLAUDE.md`, `HANDOFF.md`, `docs/collab.md`, `docs/leo-todo.md`)로 넘어간다 | 대화 기록·메모리는 옮겨지지 않는다(문서가 기준) |
| 업체 포털 추출본 `data/` | Git·클라우드에 올리지 않는 원칙 그대로. 어학원 PC로 옮기고, 누가 다룰지는 보안 점검과 같이 정한다 | - |

## 5. 순서

1. 어학원 공용 이메일로 GitHub·Supabase·Cloudflare·Claude 계정을 만들고 2단계 인증을 켠다(레오님).
2. GitHub 조직을 만들고 저장소를 이전한다. 레오님 개인 계정(Owner)과 썸머 매니저(Maintain)를 초대한다.
3. `main` 보호 규칙: PR로만 머지, CI(build) 통과 필수. 리뷰 필수는 처음엔 두지 않고, 마이그레이션이 든 PR만 서로 본다.
4. Supabase 조직을 만들고 운영 프로젝트를 이전한다. secret 키를 새로 만든다. 썸머 매니저를 Developer로 초대한다.
5. 개발용 프로젝트 `jic-portal-dev`를 만들고, 마이그레이션을 모두 적용한 뒤 샘플 데이터를 올린다.
6. Cloudflare 학원 계정에서 Pages(`jic-portal`)·Workers(`jic-student`·`jic-partner`)를 새로 만들어 조직 저장소에 연결한다.
   - Production 변수는 운영 프로젝트 값, Preview 변수는 개발용 프로젝트 값으로 넣는다.
   - 빌드 명령은 `npm run portal:build && npm run teacher:portal --if-present`.
   - 썸머 매니저를 Administrator로 초대한다.
7. 새 주소에서 첫 화면·관리자·인트라넷·학생·에이전시·강사 포털 로그인을 확인한다. 썸머 매니저 직원 계정은 `HANDOFF.md` 0장대로 만든다.
8. 문서의 주소·저장소 이름을 바꾼다: `HANDOFF.md` 0장, `docs/architecture.md`, `docs/setup-cloud.md`, `README.md`, `docs/leo-todo.md`.
9. 학원 계정에도 `jic-intranet` Worker(인트라넷 자동 확인 크론, `apps/intranet/wrangler.jsonc`, 변수 `SUPABASE_URL`·`SUPABASE_SERVICE_ROLE_KEY`)를 만든 뒤, 개인 계정의 옛 Cloudflare 프로젝트와 `jic-intranet` Worker를 지운다(되돌릴 수 없다).

## 6. 일하는 방식 (옮긴 뒤)

1. 레오님이 GitHub 이슈로 할 일을 올린다. 썸머 매니저 담당은 `주 개발`, 레오님 담당은 `보조` 라벨.
2. 각자 브랜치에서 작업 → PR → CI(빌드·권한 시험)와 미리 보기 주소(개발용 DB)가 자동으로 생긴다.
3. **머지는 썸머 매니저가 한다.** 레오님 PR도 썸머 매니저가 미리 보기로 확인하고 머지해, 주 개발자가 전체를 알고 있게 한다.
4. 운영 마이그레이션 적용과 Cloudflare 설정 변경은 썸머 매니저(또는 레오님)가 한다.
5. `docs/collab.md` 담당 표는 사람 기준이다: 주 개발 = 썸머 매니저(앱 전부), 보조 = 레오님(이슈로 맡은 항목). 여러 Claude 세션이 함께 일해도 `CLAUDE.md`·`HANDOFF.md`·`docs/collab.md`가 규칙을 넘겨준다.

## 7. 넘기지 않는 것

- 업체 포털 추출본(`data/`)
- 운영 Supabase secret 키(Cloudflare Secret에만 넣는다)
- 업체 포털 관리자 비밀번호
