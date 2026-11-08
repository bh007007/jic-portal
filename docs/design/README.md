# 화면 디자인 원본

Claude 디자인 캔버스([JIC 포털 디자인](https://claude.ai/artifact/DwJHLUNE9SShZPfehF9QAj), 소유자만 열림 · 공유 필요)의 2026-11-07 사본이다. 화면을 만들 때 이 파일들의 구조·문구·색을 기준으로 삼는다.

| 파일 | 화면 | 코드 구현 |
| --- | --- | --- |
| Main.dc.html | 01 관리자 대시보드 | `apps/admin/src/pages/Dashboard.tsx` |
| Students.dc.html | 02 재학생 현황 | `apps/admin/src/pages/Students.tsx` |
| StudentFile.dc.html | 03 학생 상세 | `apps/admin/src/pages/StudentDetail.tsx` |
| Dorm.dc.html | 04 기숙사 배정 현황 (방·침대 보드) | `apps/admin/src/pages/Dorm.tsx` (타입별 현황만, 방·침대 데이터 없음) |
| StudentPortal.dc.html | 05 학생 앱 홈 (모바일 390×844) | `apps/student/src/pages/Home.tsx` (귀국 항공편 줄은 데이터 없음) |
| PartnerHome.dc.html | P1 파트너 포털 홈 | 미구현 |
| PartnerConsult.dc.html | P2 상담 · 추천 결과 | 미구현 |
| IntranetPenalty.dc.html | I1 인트라넷 패널티 승인 | `apps/intranet/src/pages/Penalties.tsx` (통금 위반 자동 후보, 점수는 점수표 화면) |
| GuardTablet.dc.html | I2 외출·귀가 가드 태블릿 (1180×820) | `apps/intranet/src/pages/Guard.tsx` (외박 허용은 데이터 없음) |

- `.dc.html`은 캔버스 전용 형식(`<x-dc>`, `<sc-for>`, `{{값}}`)이라 브라우저로 바로 열면 깨진다. 텍스트로 읽어 레이아웃과 스타일 값을 가져다 쓴다.
- 디자인 기준: Noto Sans KR, 본문 13px, 주색 `#24427A`(네이비), 로고 `#D52B1E`, 모서리 3–4px, 표 위쪽 진한 선(`#3A3F47`), 회색 검색 조건 박스 + 초기화/조회 버튼.
- 화면 속 이름·번호·금액은 예시다. 숫자(재학생 281명 등)는 2026-11-07 추출본 집계다.
