# 학생 앱 (`apps/student`)

학생이 휴대폰으로 쓰는 화면이다. 디자인은 `docs/design/StudentPortal.dc.html`(05, 390×844)을 따른다. 로컬 개발 서버로 개발하고, 배포는 Cloudflare Workers 하나로 한다(아래 '배포', 서버 코드 준비 11/8, Cloudflare 설정 전).

## 실행

```powershell
npm install
npm run student
```

브라우저에서 http://127.0.0.1:5176 을 연다(관리자 앱은 5173). 휴대폰 폭으로 보려면 개발자 도구의 기기 모드를 쓴다. 샘플 데이터로 실행하면 로그인 화면 아래에 시험용 학생번호·생년월일이 나온다. Supabase 학생 계정으로 로그인을 시험하려면 아래 '학생 계정과 로그인'.

## 화면

| 경로 | 화면 | 데이터 |
| --- | --- | --- |
| `/` | 홈: 학생증, 출입 QR 버튼, 바로가기, 결석 신청 내역(최근 3건), 학교 여행(다가오는 것 3건, 있을 때만), 졸업 전 확인 | 학생·연수(재학 중 → 입학 예정 → 최근 순), 방 정리·포인트 정리 여부 |
| `/requests` | 신청: 결석·외박 신청·생활 요청·학교 여행 버튼, 결석·외박 신청과 생활 요청 내역 | 결석·외박 신청, 생활 요청 |
| `/requests/absence/new` | 결석 신청: 날짜, 종류(병결·공결·개인 사유), 교시(종일 또는 1~8), 사유(500자) | |
| `/requests/:id` | 결석 신청 상세(담당자 메모 포함), 대기 중이면 취소 | |
| `/requests/overnight/new` | 외박·여행 신청: 출발일(내일부터), 복귀일(박 수 표시, 최대 14박), 행선지, 숙소(선택), 비상 연락처, 같이 가는 학생(학생번호, 선택), 사유(일정, 500자), 18세 미만이면 '보호자 동의를 받았습니다' 표시 | |
| `/requests/overnight/:id` | 외박·여행 신청 상세(여행 정보, 담당자 메모), 대기 중이면 취소 | |
| `/requests/life/new` | 생활 요청: 종류(시설 수리·방 변경·ID 카드 재발급·서류 발급·기타), 내용(위치와 필요한 것, 500자) | |
| `/requests/life/:id` | 생활 요청 상세(상태·담당자 답변), 접수 상태면 취소 | |
| `/keycard` | 출입 QR: 1분마다 바뀌는 QR, 이름·학생번호, 남은 초. 가드 태블릿 카메라(또는 스캐너)가 읽는다. 화면이 꺼지지 않게 한다(지원하는 기기) | 서버가 서명한 값 |
| `/trips` | 학교 여행·액티비티: 다가오는 여행(내 캠퍼스·전체 캠퍼스, 상태: 신청 가능·신청함·정원 마감·신청 마감·명단 제외·여행 취소)과 내가 신청했던 지난 여행 | 학교 여행(직원이 올림), 내 참가 신청 |
| `/trips/:id` | 여행 상세: 일정·장소·집합·비용·신청 마감·자리·안내, 내 신청(명단에서 빠졌으면 사유), 참가 신청·신청 취소 | |
| `/me` | 내 정보: 학생 정보(이메일·연락처는 가림), 연수(귀국 항공편 포함), 연수 이력, 로그아웃 | |
| `/departure` | 귀국 항공편: 출발일, 출발 시각, 항공편명, 공항(마닐라·클락·기타), 공항 이동 차량 요청, 메모 | 귀국 항공편(학생 입력) |
| `/timetable` | 시간표: 강사 포털(LMS) 수업·출석을 주 단위로(읽기만, 11/9) | |

- 졸업 전 확인은 재학 중인 연수의 종료일이 기준일로부터 14일 이내일 때만 보인다(관리자 앱의 '졸업임박'과 같은 기준). 디자인의 세 번째 줄 '귀국 항공편 등록'은 추출본에 데이터가 없어 학생에게 받는다(아래 '귀국 항공편').
- 문구는 기획안 P7에 따라 업체와 같은 **6개 언어**(한국어, English, 日本語, 简体中文, 繁體中文, Tiếng Việt)다. 오른쪽 위 선택 목록으로 바꾸고, 고른 언어는 기기에 기억한다. 처음에는 브라우저 언어를 따른다(zh-TW·zh-HK·번체는 繁體中文, 그 밖의 중국어는 简体中文, 목록에 없는 언어는 English). 자세한 내용은 아래 '다국어'.

## 시간표 (강사 포털 수업·출석, 11/9)

- 강사 포털이 만든 수업(`class_sessions`)과 출석(`attendance`) 중 **학생 본인이 든 수업**을 월~일 한 주씩 보여 준다. 이전·다음 주로 옮기고, 다른 주에서는 '이번 주로'를 누른다. 학생 앱은 읽기만 한다(원칙 L1).
- 한 줄: 시작~끝 시각, 과목(없으면 '수업'), 강사 부르는 이름·교실·1:1/그룹, 결과. 결과는 출석·지각 N분·결석·사유 인정(강사 포털 매니저가 정함)·체크 전(오늘까지)·예정(앞날)이다.
- 주 합계(수업·출석·지각·결석, 사유 인정은 따로)를 위에 보이고, 결석·지각이 있으면 "다르면 담당 선생님께 말하거나 결석 신청"을 안내한다.
- 강사 메모(`attendance.note`)와 체크한 사람은 내보내지 않는다.
- 배포: DB 함수 `student_timetable(시작, 끝)`(`20261109140000_student_timetable.sql`, 학생 본인만, 31일 안). 로컬: 강사 포털에 로컬 실행이 없어 `.local-db/student/timetable-<source>.ndjson`(한 줄 = `{"stId", "id", "day", "time", "minutes", "kind", "subject", "teacher", "room", "result", "lateMin", "excused"}`)을 넣었을 때만 수업이 보인다.
- 규칙은 `server/timetable.ts`(주 계산·합계, 파일·네트워크 의존 없음).

## 외박·여행 신청

업체 포털의 'Outing > Travel'(기획안 'Travel → 여행 신청과 외박 허용')에 맞춰 외박 신청에 여행 정보를 더했다(11/8). 승인하면 지금처럼 그 밤들이 인트라넷 통금 확인에서 빠지고 가드 태블릿에 '외박 허용'으로 보인다. 학교가 여는 여행·액티비티는 아래 '학교 여행·액티비티'.

- 행선지(100자)와 비상 연락처(숫자와 + - ( ), 6~30자)는 필수, 숙소(100자)는 선택이다.
- 같이 가는 학생은 학생번호로 적는다(쉼표·공백 구분, 10명까지, 본인 번호와 중복은 뺀다, 없는 번호면 거절). 각자 자기 신청을 내야 외박이 허용된다. 인트라넷은 같이 가는 학생이 같은 기간에 신청했는지 보여 준다.
- 11/8 전에 낸 신청에는 여행 정보가 없다(빈 값으로 보인다).

## 출입 QR (카드키 QR)

기획안 I6 '카드키 QR 외출·귀가'(11/8 결정: 1분마다 바뀌는 QR). 홈의 **출입 QR**을 누르면 큰 QR이 보이고, 외출·귀가할 때 가드 태블릿 카메라에 비춘다. 규칙은 `server/keycard.ts` 한 곳(인트라넷과 같이 씀).

- QR 값은 `JIC1.<학생번호>.<1분 창 번호>.<서명>`이다. 서명은 학생번호와 1분 단위 시각을 서버만 아는 비밀 값으로 만든 HMAC-SHA256(16진 20자). 캡처한 QR을 다른 사람에게 보내 대신 찍는 것을 막는다.
- 가드 태블릿은 지금 창과 직전 창(최대 약 2분)의 QR만 받는다. 학생 앱은 끝나기 3초 전에 새 QR을 받는다. 기기 시계가 달라도 남은 초는 서버 시각으로 맞춘다.
- 비밀 값: 로컬은 `.local-db/student/keycard-secret.txt`(처음 쓸 때 만들고 학생 앱·인트라넷이 같이 읽음), 배포는 Supabase `keycard_secret` 한 행(서비스 키로만 읽음). 바꾸면 그때 보이던 QR은 바로 못 쓴다.
- 재학 중이거나 입학 예정인 학생만 받는다. 휴대폰이 없으면 가드가 학생번호를 직접 입력한다(기록에 '번호 입력'으로 남는다).

## 학교 여행·액티비티

업체 포털 'Outing > Travel'의 두 번째 쓰임(업체 표 `tra` 여행 / `trt` 신청자)이다(11/8 결정: 개인 여행 신고와 학교 여행 둘 다). 직원이 인트라넷 '학교 여행'에서 여행을 올리고, 학생이 앱에서 참가 신청한다. 규칙은 `server/trips.ts` 한 곳(인트라넷과 같이 씀).

- 보이는 여행: 재학 중·입학 예정 연수의 캠퍼스 여행과 전체 캠퍼스 여행 중 돌아오는 날이 오늘 이후이고 취소되지 않은 것. 내가 신청했던 여행은 지나거나 취소되어도 남는다.
- 신청: 신청 받는 중이고, 신청 마감일(필리핀 날짜, 그날까지) 전이고, 자리가 있고, 여행 날짜(출발일~돌아오는 날)가 모두 들어가는 연수가 있을 때. 같은 여행에는 한 번만(취소·제외 뒤 다시 신청은 된다). 신청은 그 연수에 붙는다.
- 취소: 신청 마감일까지만. 그 뒤에는 담당 직원에게 말한다(직원이 명단에서 뺀다).
- **1박 이상 여행은 참가 신청이 외박 허용이다**: 출발일 밤부터 돌아오는 날 전날 밤까지 인트라넷 통금 확인에서 빠지고 가드 태블릿에 '외박 허용 (학교 여행)'으로 보인다. 따로 외박 신청을 내지 않는다. 학생이 취소하거나, 직원이 명단에서 빼거나, 여행을 취소하면 바로 빠진다.
- 직원이 명단에서 빼면 사유가 학생 상세에 보인다. 올린 직원·뺀 직원 이름은 학생에게 내보내지 않는다.
- 비용은 PHP로 보이기만 한다. 납부는 지금처럼 오피스에서 받는다(포인트 결제 연결은 하지 않았다).

## 생활 요청

업체 포털의 '요청사항(학생)'(`adm/request/request`)과 'ID 카드 교체'(`adm/academic/exchange`)를 옮긴 것이다(기획안 `nonacademic_requests`, '유지' 항목). 학생이 학업 외 요청을 내고, 인트라넷 '생활 요청'에서 직원이 처리해 답한다. 규칙은 `server/lifeRequests.ts` 한 곳(인트라넷과 같이 씀).

- 종류: 시설 수리, 방 변경, ID 카드 재발급, 서류 발급, 기타. 내용은 500자까지, 위치(방 번호 등)를 적게 안내한다. 방·침대 번호는 추출본에 없어 학생이 적는다.
- 상태: 접수 → 처리 중 → 완료·반려. 학생은 접수 상태일 때만 취소한다. 반려는 직원이 사유를 적어야 하고, 직원 답변은 학생 상세에 '담당자 답변'으로 보인다. 처리한 직원 이름은 학생에게 보이지 않는다.
- 재학 중이거나 입학 예정인 연수가 있어야 요청할 수 있고(요청은 그 연수에 붙는다), 처리되지 않은 요청(접수·처리 중)은 5건까지 둘 수 있다(같은 요청을 여러 번 내는 것을 막음).
- 학생 공지 게시판은 기획안에서 '삭제 후보'(학생 공지는 메신저, C7)라 옮기지 않았다.

## 귀국 항공편

- 디자인 05 '졸업 전 확인'의 '귀국 항공편 등록'. 업체 추출본에는 귀국 항공편이 없어 학생이 등록한다. 인트라넷 '귀국 일정'이 공항 이동 배차에 쓴다.
- 이번 연수(재학 중, 없으면 가장 가까운 입학 예정)마다 하나. 다시 저장하면 고친다. 출발일이 지나면 고칠 수 없다.
- 출발일은 오늘 이후, 연수 종료일로부터 30일 안(연수 뒤 여행하는 학생을 위한 **임시 기준**, `server/departures.ts` 의 `DEP_AFTER_END_DAYS`).
- 공항은 업체 데이터의 픽업 장소 값(`tr_pick_place`: MANILA, CLARK)과 기타. 기타면 메모에 공항 이름을 적는다. 항공편명은 대문자로 정리해 저장한다(`pr 468` → `PR 468`).
- '공항 이동 차량 요청'을 하면 인트라넷 '귀국 일정'에서 직원이 배차를 확정하거나(기숙사 출발 일시, 차량·집합 장소) 불가(사유)로 처리한다. 학생 화면에는 '요청됨 · 오피스 확인 전 / 확정 · 기숙사 출발 11.13 23:30 / 배차 불가'와 메모가 보인다(처리한 직원 이름은 내보내지 않음).
- 처리 뒤 학생이 출발일·시각을 바꾸면 '항공편이 바뀌어 오피스가 다시 확인합니다'로 바뀌고, 인트라넷에는 '재확인 필요'로 보인다. 배차 기록은 직원이, 항공편은 학생이 쓴다(기획안 C2: 데이터마다 쓰는 곳은 한 곳). 둘 다 `server/departures.ts`.

## 다국어

- 사전은 `src/i18n/` 에 언어별 파일이 있다: `ko.ts`(키 목록 기준), `en.ts`, `jp.ts`, `ch.ts`(간체), `tw.ts`(번체, 대만식), `vi.ts`. 언어 목록·요일·`html lang`은 `src/i18n/langs.ts`.
- **jp·ch·tw·vi 는 Claude가 만든 초안이다. 원어민(현지 직원·에이전시) 검토를 받은 뒤 학생에게 연다.** 고칠 때는 그 언어 파일의 값만 바꾸면 된다.
- 문구를 더할 때는 `ko.ts`에 키를 넣으면, 다른 언어 파일에 빠진 키가 타입 검사(`npm run student:build`)에서 걸린다. `server/i18n.test.ts`가 언어마다 빈 문구가 없는지, `{n}`·`{t}` 같은 자리 표시가 한국어와 같은지 확인한다.
- 용어(초안 기준): 결석 신청 = 欠席申請 / 请假申请 / 請假申請 / Xin nghỉ học, 외박 = 外泊 / 外宿 / Ngủ ngoài, 교시 = 3限 / 第3节 / 第3節 / Tiết 3, 병결·공결·개인 사유 = 病欠·公欠·私用 / 病假·公假·事假 / Ốm·Việc chính thức·Việc cá nhân.
- 글꼴: 일본어·중국어는 한자를 한국식 글자꼴로 그리지 않도록 기기의 일본어·중국어 글꼴(Hiragino, PingFang, Microsoft YaHei 등)을 먼저 쓴다. 따로 내려받는 글꼴은 없다.
- 국적·코스명·기숙사 타입처럼 업체 데이터에서 오는 값은 번역하지 않는다. 국적은 지금 한국어(업체 `st_country_cd_name`)로 보인다. 업체 기준 코드에 6개 언어 이름이 있으므로(기획안 '기존 포털 분석'), 코드표를 추출하면 그 이름으로 바꾼다.

## 구조

```
apps/student/
├─ server/core.ts        /api/* 계산 (파일·네트워크 의존 없음)
├─ server/requests.ts    결석·외박 신청의 모양과 규칙 (인트라넷이 승인·반려에 같이 씀)
├─ server/departures.ts  귀국 항공편 (인트라넷 '귀국 일정'이 같이 씀)
├─ server/accounts.ts    학생 계정 규칙: 대상 학생, 가짜 이메일, 첫 비밀번호, 새 비밀번호 규칙 (스크립트와 화면이 같이 씀)
├─ server/supabaseAuth.ts  Supabase 토큰 → 학생 번호 (로컬 개발 서버, 배포 서버가 같이 씀)
├─ server/supabaseData.ts  배포: 업체 원본에서 그 학생 행만 읽어 createDb (서비스 키)
├─ server/supabaseStores.ts 배포: 신청·귀국 항공편·배차 저장소 (Supabase 테이블, 학생 토큰)
├─ worker/index.ts       배포 서버 (Cloudflare Workers: 정적 파일 + /api), 설정 wrangler.jsonc
├─ server/core.test.ts   core 시험 (가짜 시계·메모리 저장소). 빌드할 때 함께 돈다
├─ server/i18n.test.ts   문구 시험 (6개 언어 키·자리 표시, 브라우저 언어)
├─ server/localData.ts   로컬: Vite 플러그인, 신청 파일 저장 (인트라넷도 같은 파일을 연다)
├─ scripts/accounts.ts   학생 계정 만들기·비밀번호 초기화 (서비스 키, npm run student:accounts)
└─ src/                  화면 (React + Vite + TypeScript), 로그인 src/auth.ts, 문구 src/i18n/
```

- 학생·연수 정보는 관리자 앱의 `apps/admin/server/core.ts`(`createDb` → `studentDetail`)와 `localData.ts`(`loadDir`)를 그대로 가져다 쓴다. 상태 분류(재학/입학 예정/졸업)가 관리자 앱과 같게 유지된다. 관리자 쪽에서 이 함수의 응답 모양을 바꾸면 `npm run student:build`가 타입 오류로 알려 준다.
- 학생에게는 필요한 항목만 골라 내보낸다. 메모(에이전시·회계·취소 등), 입금액·포인트 금액, 에이전시·납부 방법은 내보내지 않는다. 학생 앱의 `/api`에는 관리자 API가 없다.

### API

| 메서드·경로 | 내용 |
| --- | --- |
| `GET /api/meta` | 데이터 종류(샘플/추출본), 기준일. 샘플일 때만 시험용 학생 |
| `POST /api/login` | 로컬 전용. `{ stId, birthday: 'YYYYMMDD' }` 확인 |
| `GET /api/me` | 학생 정보, 대표 연수, 연수 이력, 졸업 전 확인 |
| `GET /api/absences` | 내 결석 신청(줄마다 진단서 필요 `documentRequired`·있음 `hasDocument`), 신청 가능 기간, 교시 수 |
| `POST /api/absences` | 결석 신청 `{ date, kind, periods, reason }` |
| `POST /api/absences/:id/document` | 진단서 사진 올리기 `{ image: data URL }`(대기 중인 내 신청, JPG·PNG·WebP 1MB, 다시 올리면 바꿈) |
| `GET /api/absences/:id/document` | 내가 올린 진단서 사진 `{ image }` |
| `POST /api/absences/:id/cancel` | 대기 중인 내 신청 취소 |
| `GET /api/overnights` | 내 외박 신청(박 수 포함), 신청 가능 기간, 출발일 하한 `minDate`·최대 박 수 `maxNights`·미성년 여부 `minor` |
| `POST /api/overnights` | 외박 신청 `{ from, until, reason, destination, accommodation, contact, companions, guardianConsent }` |
| `POST /api/overnights/:id/cancel` | 대기 중인 내 외박 신청 취소 |
| `GET /api/life-requests` | 내 생활 요청(최근 순), 종류 목록, 요청 가능 여부(재학·입학 예정 연수) |
| `POST /api/life-requests` | 생활 요청 `{ category, content }` |
| `POST /api/life-requests/:id/cancel` | 접수 상태인 내 생활 요청 취소 |
| `GET /api/keycard` | 출입 QR 값 `{ code, expiresAt, period, now }`(재학·입학 예정만) |
| `GET /api/trips` | 학교 여행(내 캠퍼스·전체, 다가오는 것 + 내가 신청했던 것), 줄마다 박 수·남은 자리·내 신청·신청 가능 여부(`canApply`, 안 되면 `why`)·취소 가능 여부, 오늘 날짜 |
| `GET /api/trips/:id` | 여행 하나(같은 모양 + 오늘 날짜) |
| `POST /api/trips/:id/signup` | 참가 신청 |
| `POST /api/trips/:id/cancel` | 내 참가 신청 취소(마감일까지) |
| `GET /api/departure` | 이번 연수의 귀국 항공편, 출발일 범위, 공항 목록, 공항 이동 배차 상태 |
| `PUT /api/departure` | 귀국 항공편 등록·수정 `{ date, time, flight, airport, needsRide, note }` |

결석 신청 규칙(서버에서 확인):

- 날짜는 재학 중이거나 입학 예정인 연수 기간 안. 연장으로 연수가 여러 개면 그중 하나에 들어가면 되고, 신청에는 그 연수 번호(`trId`)가 붙는다.
- (11/10 결정 I10) 지난 날짜는 오늘(필리핀 날짜)부터 3일 전까지만 받는다(`too_old`).
- (11/10 결정 I10) **진단서 사진**: 대기·승인 중인 병결이 앞뒤 날과 이어져 연속 2일 이상이면 그 병결들에 '진단서 필요'가 붙는다(`requests.ts` `needsMedicalDoc`). 신청은 막지 않고, 학생이 신청 상세에서 사진을 올린다(휴대폰에서 긴 변 1600px JPEG로 줄여 보냄, `src/components/image.ts`). 서버는 종류(파일 머리까지)·크기(1MB)를 보고 `<학생번호>/<신청 번호>.<확장자>`에 둔다(`server/files.ts`). 배포는 Supabase Storage 비공개 버킷 `absence-docs`(학생 토큰, 자기 폴더만 쓰고 봄)와 붙이기 함수 `absence_attach_document`(`20261110150000_absence_documents.sql`), 로컬은 `.local-db/student/absence-docs-<source>/`. 실제 학생 진단서는 보안 점검 뒤에만 받는다(지금 Supabase에는 가짜 샘플만).
- 같은 날짜에 대기·승인 상태인 신청과 교시가 겹치면 거절한다(종일은 모든 교시와 겹친다). 취소·반려된 신청은 다시 낼 수 있다.
- 학생은 대기 중인 자기 신청만 취소할 수 있다. 승인·반려는 인트라넷 '신청 처리'에서 하고(`docs/intranet.md`), 담당자 메모가 신청 상세에 보인다. 결석 승인은 LMS가 생기면 그쪽으로 옮길 수 있다(같은 `requests.ts`를 쓰면 된다).

외박 신청 규칙(서버에서 확인):

- 출발일 밤부터 복귀일 전날 밤까지가 외박이다(11/8 출발, 11/10 복귀 = 2박). 복귀일은 출발일보다 뒤여야 한다.
- 출발일과 마지막 밤이 한 연수 기간 안에 들어가야 한다.
- (11/10 결정 I11) 떠나는 날 하루 전까지 신청한다: 출발일은 내일(필리핀 날짜)부터(`too_late`). 한 번에 최대 14박(`too_many_nights`).
- (11/10 결정 I11) 출발일에 18세 미만(필리핀 성년 기준, 생년월일로 계산)이면 '보호자 동의를 받았습니다'에 표시해야 한다(`guardian_consent_required`). 표시는 `overnight_permissions.guardian_consent`에 남고(`20261110113000_overnight_rules.sql`), 인트라넷 외박 처리 화면에 '미성년 · 보호자 동의 받음(학생 표시)'로 보인다. 생년월일이 없으면 성년으로 본다.
- 대기·승인 상태인 다른 외박과 밤이 겹치면 거절한다(복귀일 밤부터 새 외박은 겹치지 않는다).
- 승인된 외박의 밤은 인트라넷 통금 확인에서 빠지고, 가드 태블릿에 '외박 허용 ~복귀일'로 보인다.

### 로컬 저장과 로그인

- 결석·외박 신청은 저장소 루트 `.local-db/student/absences-sample.ndjson`, `overnights-sample.ndjson`(실제 추출본으로 실행하면 `-extract`)에 쓴다. 귀국 항공편은 `departures-<source>.ndjson`, 공항 이동 배차(직원이 씀)는 `rides-<source>.ndjson`. 인트라넷 개발 서버도 같은 파일을 열어 승인·반려하고 귀국 일정을 읽는다. `.local-db/`는 Git에서 빠진다. 실제 데이터로 실행하면 학생 번호와 사유가 들어가므로 `data/`와 같이 다룬다.
- 승인·반려 화면을 보고 싶으면 이 파일에서 `status`를 `approved`/`rejected`로, `decidedAt`·`comment`를 채우면 된다(읽을 때마다 파일을 다시 읽는다).
- 로그인(`src/auth.ts`)은 두 방식이다. `apps/student/.env.local`에 Supabase 주소가 없으면 학생번호 + 생년월일(기획안 V4의 초기 비밀번호)을 개발 서버에서 확인하고, 학생 번호를 이 탭(sessionStorage)에 두고 `X-Student-Id` 헤더로 보낸다. **127.0.0.1에서만 열리는 개발 서버용 방식이다.** 주소가 있으면 Supabase 학생 계정으로 로그인한다(아래).

## 학생 계정과 로그인

11/8 결정(기획안 V4): 학생번호 + 생년월일로 계정을 미리 만들고, 첫 로그인 때 비밀번호를 바꿔야 앱을 쓸 수 있다.

### 계정 만들기 (`scripts/accounts.ts`, 서비스 키)

```powershell
$env:SUPABASE_URL = "https://xxxx.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "서비스 키 (Supabase > Project Settings > API)"
npm run student:accounts                    # 미리보기: 건수만 보여 주고 아무것도 바꾸지 않는다
npm run student:accounts -- --apply         # 만든다. 이미 있는 계정은 건너뛰어 여러 번 실행해도 된다
npm run student:accounts -- --reset 30095 --apply   # 비밀번호를 잊은 학생: 생년월일로 되돌리고 다시 바꾸게 한다
```

- 대상은 재학·입학 예정 연수가 있는 학생이다(`server/accounts.ts`의 `planAccounts`). 생년월일이 없거나 날짜가 아니면 건너뛰고 건수로 알린다.
- Supabase Auth는 이메일로 로그인하므로 `학생번호@students.jic.internal` 가짜 주소를 쓴다(메일은 보내지 않음, `email_confirm`). 도메인을 바꾸면 `STUDENT_EMAIL_DOMAIN`과 학생 앱의 `VITE_STUDENT_EMAIL_DOMAIN`을 같이 바꾼다. 메타데이터는 `portal='student'`(파트너 가입 트리거는 `'partner'`만 처리).
- 데이터는 기본이 `data-sample/tables`이다. 실제 추출본은 보안 점검 전까지 쓰지 않는다(2026-11-07 결정, 꼭 필요하면 `--dir data/tables --allow-real`).
- 화면에는 건수만 나온다. 학생별 실패는 `.local-db/student/accounts-failed-*.json`(Git 제외)에 남는다. 계정만 만들어지고 연결이 끊긴 학생은 다시 실행하면 연결만 한다.
- Supabase 비밀번호 정책을 '영문+숫자'처럼 강하게 바꾸면 생년월일(숫자 8자리) 계정이 만들어지지 않는다. 기본(6자 이상)으로 둔다. 새 비밀번호 규칙은 앱이 확인한다.
- 졸업생 계정 정리(로그인 막기·삭제)는 아직 없다. 운영 전에 기준을 정한다.

### 로그인과 비밀번호 변경

- 로그인 화면: 학생번호 + 비밀번호. 처음에는 생년월일 8자리라고 안내한다.
- 첫 로그인(`must_change_password` 참)이면 비밀번호 변경 화면만 보인다. 서버도 `/api/meta` 말고는 `403 password_change_required`로 막는다.
- 비밀번호 변경: 지금 비밀번호를 다시 확인하고(로그인으로 확인), 새 비밀번호를 정한 뒤 `student_password_changed()`를 부른다. 규칙은 8~72자, 영문과 숫자를 함께, 지금 비밀번호와 다르게(`checkNewPassword`). 내 정보 화면에서도 바꿀 수 있다.
- 학생이 아닌 계정(직원·에이전시)으로 로그인하면 '학생 계정이 아닙니다'로 돌려보낸다. 토큰이 만료·폐기되면 조용히 로그인 화면으로 간다.
- 변경 필요 표시는 학생 본인이 끌 수 있는 값이다(`student_password_changed()`). 생년월일 비밀번호로 계속 쓰려는 학생 본인만 위험해지므로 서버 확인은 이 정도로 둔다.
- 서버는 토큰으로 학생을 찾는다(`server/supabaseAuth.ts`: 토큰의 사용자 id로 `student_users` 한 행을 그 토큰으로 읽음, 30초 기억). 배포 서버(Workers)도 같은 함수를 쓴다.

### 로그인 시험 (로컬)

1. 테스트 프로젝트(샘플 데이터만)에 `20261108100000_student_intranet.sql`을 적용한다.
2. 위 스크립트로 샘플 학생 계정을 만든다.
3. `apps/student/.env.example`을 `apps/student/.env.local`로 복사하고 `npm run student`.

이때 로그인만 Supabase이고 학생·연수 데이터와 신청 파일은 로컬 그대로다(테스트 계정과 맞추려고 데이터는 샘플로 고정). 샘플 학생의 생년월일은 `.env.local` 없이 실행했을 때 로그인 화면 아래 안내나 `data-sample/tables/students.ndjson`에서 본다.

## 배포 (Cloudflare Workers)

학생 앱은 **Workers 한 개**로 올린다(정적 파일 + `/api` 서버 코드, 설정 `apps/student/wrangler.jsonc`, 서버 `apps/student/worker/index.ts`). Cloudflare가 같은 저장소로 Pages 프로젝트를 하나 더 만들지 못하게 해서 파트너 포털과 같은 방식을 쓴다(`docs/setup-cloud.md`).

- **로그인**: 화면이 Supabase 학생 계정 토큰을 보내고, 서버가 토큰으로 학생을 찾는다(`server/supabaseAuth.ts`). 첫 비밀번호를 안 바꿨으면 403.
- **학생·연수**: 업체 원본(`legacy_*`)에서 그 학생 행만 서비스 키로 읽어 관리자 core의 `createDb`에 넣는다(`server/supabaseData.ts`: 메타, 학생, 연수, 기숙사 배정. 인보이스·입금·포인트·에이전시는 읽지 않음). `legacy_*`의 RLS(직원만)는 넓히지 않는다. 학생 번호는 토큰으로 확인한 값만 쓴다. 정규화 스키마(HANDOFF 6-3)로 옮기면 이 파일만 바꾼다.
- **신청·귀국 항공편·배차**: Supabase 테이블을 학생 토큰으로 읽고 쓴다(`server/supabaseStores.ts`, RLS가 본인 행만 연다). 신청 등록·취소, 항공편 등록·수정, 배차 읽기만 한다. 신청 기간·중복 같은 규칙은 로컬과 같은 core(`requests.ts`, `departures.ts`)가 확인하고, DB는 본인·본인 연수·대기 상태·출발일 같은 최소 조건만 막는다.
- 같은 Worker 안에서 토큰 결과는 30초, 학생 데이터는 60초 기억한다(학생별이라 섞이지 않음).

### 설정 순서 (레오 PC의 Claude, 테스트 프로젝트는 샘플 데이터만)

1. Supabase에 마이그레이션 `20261108100000_student_intranet.sql`, `20261108120000_student_request_ids.sql`, `20261108140000_nonacademic_requests.sql`(생활 요청), `20261108150000_overnight_travel.sql`(외박·여행 정보), `20261108160000_school_trips.sql`(학교 여행), `20261108170000_keycard_qr.sql`(출입 QR), `20261108180000_student_account_admin.sql`(인트라넷 학생 계정 관리), `20261108190000_guard_account_admin.sql`(인트라넷 가드 계정 관리)을 차례로 적용한다.
2. 샘플 업체 원본을 올린다(`scripts/upload-to-supabase.mjs`, 이미 올라가 있으면 건너뜀).
3. 학생 계정을 만든다: 인트라넷 **학생 계정** 화면의 '계정 없는 학생 계정 만들기'(배포, 서비스 키 필요) 또는 `npm run student:accounts -- --apply`(위 '학생 계정과 로그인').
4. **Workers & Pages → Create → Workers → Import a repository** → `jic-portal`

   | 항목 | 값 |
   | --- | --- |
   | Project name | `jic-student` |
   | Root directory | `/` (비워 둠) |
   | Build command | `npm run student:build` |
   | Deploy command | `npx wrangler deploy --config apps/student/wrangler.jsonc` |
   | Build variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`(화면의 로그인), `NODE_VERSION=22` |

5. 배포된 Worker의 **Settings → Variables and Secrets**에 실행 변수를 넣는다: `SUPABASE_URL`, `SUPABASE_ANON_KEY`(빌드 변수와 같은 값), **Secret**으로 `SUPABASE_SERVICE_ROLE_KEY`. `keep_vars`를 켜 두어 다시 배포해도 지워지지 않는다. 없으면 `/api`가 `500 server_config`를 돌려준다.
6. 주소(`https://jic-student.<계정>.workers.dev`)에서 샘플 학생으로 로그인 → 비밀번호 변경 → 홈이 보이면 된다.

서비스 키는 모든 권한을 가진 키다. 이 Worker에서는 업체 원본에서 그 학생 행을 읽는 데만 쓰고, 신청 쓰기는 학생 토큰으로 한다. 보안 점검 때 이 범위를 확인한다.

### 배포 시험

- `supabase/tests/student_worker_api.mjs`: 실제 마이그레이션을 올린 PGlite(`supabase/tests/pg-supabase.mjs`, Supabase Auth·REST 흉내)에 계정 생성 스크립트로 샘플 계정을 만들고, Worker를 묶어 학생 흐름 전체를 확인한다. 비밀번호 변경 전 403, 결석·외박 등록·취소, 직원 승인을 학생이 봄, 항공편·배차·재확인, 생활 요청, 다른 학생과 분리, 학교 여행 신청·취소·정원·명단 제외, 본문 검사.
- CI가 권한 시험과 함께 돌린다(`.github/workflows/ci.yml`). 직접 돌리려면 `npm i --no-save @electric-sql/pglite@0.3` 후 `node supabase/tests/student_worker_api.mjs`.
- 화면까지 보려면: `node supabase/tests/pg-supabase.mjs 54321`로 시험 서버를 띄우고, 계정을 만든 뒤(`SUPABASE_URL=http://127.0.0.1:54321`, `SUPABASE_SERVICE_ROLE_KEY=service-key`), `VITE_SUPABASE_URL=http://127.0.0.1:54321 VITE_SUPABASE_ANON_KEY=anon-key npm run student:build` → `npx wrangler dev --config apps/student/wrangler.jsonc --var SUPABASE_URL:http://127.0.0.1:54321 --var SUPABASE_ANON_KEY:anon-key --var SUPABASE_SERVICE_ROLE_KEY:service-key`. 11/8에 이 방식으로 로그인·비밀번호 변경·신청·귀국 항공편 화면을 확인했다.

### 남은 것

- 학생 계정 생성 담당·시점(HANDOFF 7), 졸업생 계정 정리 기준.
- 실제 학생 데이터는 보안 점검 뒤에만 올린다(2026-11-07 결정). 그 전까지 배포 주소는 샘플 데이터 시험용이다.
- 인트라넷 배포(직원·가드 계정, 같은 테이블을 직원 쪽에서 처리)는 별도 작업.

### 테이블과 권한

| 테이블 | 학생 | 직원 |
| --- | --- | --- |
| `absence_requests` | 자기 것 읽기, 자기 연수로 대기 상태 등록, 취소는 `cancel_absence_request(id)` | 모두 읽기, 승인·반려는 `decide_absence_requests(ids, 승인 여부, 메모)` |
| `overnight_permissions` | 같음(`cancel_overnight_permission`), 여행 정보 열(행선지·숙소·연락처·동행) 포함 | 같음(`decide_overnight_permissions`) |
| `departure_flights` | 자기 연수로 등록·수정, 출발일이 지나면 못 고침, 학생 번호·연수 번호는 못 바꿈 | 읽기 |
| `airport_rides` | 자기 것 읽기 | 등록·수정(처리자는 본인으로만) |
| `nonacademic_requests` | 자기 것 읽기, 자기 연수로 접수 상태 등록(열린 요청 5건까지), 취소는 `cancel_nonacademic_request(id)` | 모두 읽기, 처리·답변은 `handle_nonacademic_request(id, 상태, 답변)` |
| `trips` | 읽기(화면은 자기 캠퍼스·전체만) | 읽기, 넣을 수 있는 열만 등록·수정(출발일은 오늘 이후, 취소한 여행은 못 고침), 올린 직원 이름은 DB 기본값 |
| `trip_signups` | 자기 것 읽기, 신청은 `trip_sign_up(여행, 연수)`(여행 행을 잠가 정원을 넘지 않음, 마감·연수 기간·캠퍼스 확인), 취소는 `trip_cancel_signup(id)`(마감일까지) | 모두 읽기, 명단 제외는 `trip_remove_signup(id, 사유)`. 가드는 참가 신청(applied)만 읽음(외박 허용 판정) |
| `keycard_secret` | - (서버가 서비스 키로만 읽음) | - |
| `student_users` | 자기 행 읽기 | 읽기 |

- 코드와 열 이름: `stId` → `student_no`, `trId` → `enrollment_id`, `date` → `absence_date`, `from`/`until` → `leave_date`/`return_date`, `comment` → `staff_comment`, `submittedAt` → `created_at`. 처리자(`decidedBy`)는 DB에 사용자 id를 두고 화면에는 `staff_users.name`을 보여 준다.
- 학생이 넣을 수 있는 열만 열어 두었다(상태·처리 열은 학생이 쓸 수 없다). 신청 번호(`id`)는 서버 core가 정해 화면에 돌려주므로 `20261108120000_student_request_ids.sql`에서 열었다. 연수가 그 학생 것인지는 `enrollment_of_student()`가 `legacy_enrollments`의 `tr_st_id`로 확인한다(정규화 테이블로 옮기면 이 함수만 바꾼다).

## 확인이 필요한 것

- 교시 수(지금 1~8, `server/core.ts`의 `PERIOD_COUNT`)와 캠퍼스별 차이. 시간표(강사 포털 수업)는 11/9 붙였지만 교시 번호와 수업 시각을 잇는 업체 교시표가 아직 없어, 결석 신청은 교시 번호로 받는다(`docs/leo-todo.md` I2).
- 결석 종류(병결·공결·개인 사유)와 종류별 증빙(진단서 사진 등) 필요 여부.
- 신청 기한(지난 날짜를 며칠까지 받을지). 인트라넷 패널티 디자인에 '기한 후 신청 반려'가 있다. 지금은 연수 기간 안이면 모두 받는다.
- 결석 승인 담당: 지금은 인트라넷 '신청 처리'. LMS(교사)로 옮길지.
- 학생 사진: 업체 포털의 `photo_url`은 업체 서버 주소라 쓰지 않았다. 사진 이관 방식 결정 후 붙인다.
- 귀국 항공편: 출발일 범위(지금 연수 종료 30일 안, 임시), 공항 목록, 배차 확정을 학생에게 따로 알릴지(지금은 앱을 열어야 보인다).
- 학교 여행: 비용 납부를 포인트로 받을지, 대기자(정원이 찼을 때 순번)를 둘지, 보호자 동의서가 필요한 여행을 표시할지. 지금은 정원까지 먼저 신청한 순, 납부는 오피스.
- 외박: 며칠 전까지 신청해야 하는지, 최대 박 수, 보호자 동의·연락처가 필요한지. 지금은 연수 기간 안이면 받는다.
