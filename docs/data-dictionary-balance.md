# 데이터 사전 — 추가 추출

추가 추출 스크립트(`scripts/extract/`)로 받은 표의 열 이름과, 값이 채워진 레코드 수다. 값은 담지 않는다. 기본 추출본은 `docs/data-dictionary.md`.

- 추출 시각: 2026-11-08T23:49:49.113Z
- 출처: jicportal.com admin adm/tuition2/balance_load (Check Balance, 읽기 전용)
- 제외한 필드: 

| 테이블 | 레코드 | 열 |
| --- | ---: | ---: |
| balance | 5004 | 7 |

## balance

레코드 5004건, 열 7개. 접두어가 업체 원본 테이블을 가리킨다(st 학생, tr 연수, am 에이전트, ag 에이전시, sd 배치 등).

| 열 | 값 있음 |
| --- | ---: |
| `tr_id` | 5004 |
| `tr_currency` | 5003 |
| `tr_deposit_state` | 5004 |
| `tr_state` | 5004 |
| `extend_count` | 5004 |
| `cost` | 5004 |
| `payment` | 5004 |

## 화면 구조

| 항목 | 화면 | 조회 주소 | 결과 | 캠퍼스 항목 | 검색 항목 | 화면이 부르는 주소 |
| --- | --- | --- | --- | --- | --- | --- |
| balance |  | adm/tuition2/balance_load | - |  |  |  |
