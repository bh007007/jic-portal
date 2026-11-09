# 학원 공식 계정으로 옮기기 (계정 이전 계획)

레오님 개인 계정에 있는 JIC 포털을 학원 공식 계정으로 옮기고, 썸머 매니저가 주 개발을 맡는다. 레오님은 개인 계정으로 맡은 항목만 PR로 보낸다. (11/9 레오님 요청)

## 옮길 것과 방법

| 서비스 | 지금 | 옮기는 방법 | 주소·키가 바뀌나 |
| --- | --- | --- | --- |
| GitHub | 개인 `bh007007/jic-portal`(비공개) | 학원 계정으로 조직(예: `jic-academy`)을 만들고 저장소 **Transfer ownership**. PR·이력·이슈가 그대로 간다 | 주소가 바뀌지만 옛 주소는 자동으로 넘어간다 |
| Supabase | 개인 조직의 `jic-portal`(Singapore) | 학원 계정으로 조직을 만들고, 레오님을 두 조직의 Owner로 둔 뒤 **Project Settings → General → Transfer project**. 요금제(Pro, 결정 #9)는 학원 조직에서 | 프로젝트 주소·키 그대로. 옮긴 뒤 secret 키를 새로 만들고 옛 키를 끈다 |
| Cloudflare | 개인 계정의 Pages `jic-portal`, Workers `jic-student`·`jic-partner` | 계정 사이 이전 기능이 없어 학원 계정에서 **새로 만든다**: Pages·Workers를 GitHub 조직 저장소에 연결, 환경변수·Secret 다시 넣기, 빌드 명령 같게 | `*.pages.dev`·`*.workers.dev` 주소가 바뀐다. 회사 도메인(결정 #6)을 붙이면 다음부터는 바뀌지 않는다 |
| Claude | 개인 계정 | 학원 Claude 팀 요금제에 썸머 매니저 자리. 작업 맥락은 저장소 문서(`CLAUDE.md`, `HANDOFF.md`, `docs/collab.md`, `docs/leo-todo.md`)로 넘어간다 | 대화 기록·메모리는 옮겨지지 않는다(문서가 기준) |
| 업체 포털 추출본 `data/` | 레오님 PC | Git·클라우드에 올리지 않는 원칙 그대로. 학원 PC로 옮길지는 보안 점검과 같이 정한다 | - |

## 순서

1. 학원 공식 이메일로 GitHub·Supabase·Cloudflare·Claude 계정을 만든다(레오님).
2. GitHub 조직 만들기 → 저장소 이전 → 레오님 개인 계정·썸머 매니저를 조직 멤버로 초대.
3. `main` 보호 규칙: PR로만 머지, CI(build) 통과 필수. 머지 권한은 썸머 매니저(주 개발)와 레오님.
4. Supabase 프로젝트를 학원 조직으로 이전 → secret 키 새로 만들기 → 새 키를 Cloudflare Secret에 넣기.
5. Cloudflare 학원 계정에서 Pages(`jic-portal`)·Workers(`jic-student`·`jic-partner`)를 새로 만들고 조직 저장소에 연결. 환경변수(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), Secret(`SUPABASE_SERVICE_ROLE_KEY`), 빌드 명령(`npm run portal:build && npm run teacher:portal --if-present`)을 같게 넣는다.
6. 새 주소에서 첫 화면·관리자·인트라넷·학생·에이전시·강사 포털 로그인을 확인한다.
7. 문서의 주소·저장소 이름을 바꾼다(`HANDOFF.md` 0장, `docs/architecture.md`, `docs/setup-cloud.md`, `README.md`, `docs/leo-todo.md`).
8. 개인 계정의 옛 Cloudflare 프로젝트·`jic-intranet` Worker를 지운다(결정 #1, 되돌릴 수 없음).

## 일 나누기 (옮긴 뒤)

- **썸머 매니저(학원 계정)**: 주 개발. 저장소·Supabase·Cloudflare 관리, 머지, 마이그레이션 적용.
- **레오님(개인 계정)**: 조직 저장소의 멤버로 한 항목씩 브랜치 → PR을 보낸다. 썸머 매니저가 미리 보기 주소로 확인하고 머지한다.
- `docs/collab.md` 담당 표를 사람 기준으로 바꾼다: 주 개발 = 썸머 매니저, 보조(항목별) = 레오님 Claude.
