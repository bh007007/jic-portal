# 견적 미리 채우기 (에이전시 포털 상담 → 견적 프로그램)

에이전시 포털 상담(2.5 견적)에서 견적 사이트를 열 때, 상담 결과(캠퍼스·코스·희망 기간)를 주소에 담아 견적 화면을 미리 채운다. 11/10 레오님 결정: 견적 사이트는 JIC 견적 프로그램 https://quote.baguiojic.workers.dev/ 이고(업체 포털 견적 계산기가 아님), 가격은 계속 견적 프로그램이 기준이다(원칙 Q1).

## 견적 프로그램

첫 화면에서 나라를 고르면 네 화면으로 간다. 에이전시 포털 설정 '링크·안내 설정'의 견적 사이트 칸 네 개와 같다.

| 설정 키 | 주소 | 통화 |
| --- | --- | --- |
| `quote_kr` | https://quote.baguiojic.workers.dev/kr | KRW, PHP |
| `quote_jp` | https://quote.baguiojic.workers.dev/jp | JPY, PHP |
| `quote_usd` | https://quote.baguiojic.workers.dev/usd | USD, PHP(대만·중국·사우디) |
| `quote_usd_new` | https://quote.baguiojic.workers.dev/usd-new | USD, PHP(베트남·태국·말레이시아·프랑스 등, 프로모션만) |

- 네 화면 모두 같은 구조다: 캠퍼스(챌린저·프리미엄·혼합), 학생 정보, 시작일(일요일), 총 기간, 코스·기숙사 줄, 공항 픽업, 할인, 인쇄·카카오톡·이메일.
- 11/10 확인: 지금은 주소의 값을 읽지 않는다. 그래서 아래 코드를 견적 프로그램에 넣어야 미리 채워진다. 견적 프로그램은 baguiojic Cloudflare 계정에 있어 JIC 포털 저장소에서는 고칠 수 없다.

## 주소 형식

`<견적 화면 주소>?campus=premium&course=ESL+TEP+9&weeks=12&agency=...`

| 값 | 뜻 | 예 | 없거나 모르는 값이면 |
| --- | --- | --- | --- |
| `campus` | 캠퍼스(견적 프로그램 `DATA` 키) | `challenger`, `premium`, `mixed` | 첫 캠퍼스 그대로 |
| `course` | 코스 이름(견적 화면 코스 목록과 글자까지 같게) | `ESL TEP 9`, `Speaking Pro` | 첫 코스 그대로 |
| `weeks` | 총 기간(주, 1~52). 버튼에 없으면 '직접 입력' | `12`, `10` | 기본 기간 그대로 |
| `start` | 시작일(일요일만) | `2026-11-15` | 기본 날짜 그대로 |
| `dorm` | 기숙사 이름(목록과 같게) | `Room for 2 Balcony` | 첫 기숙사 그대로 |
| `agency` | 유학원/담당자 칸 | `샘플유학 서울` | 비움 |

학생 이름·생년월일은 담지 않는다(원칙 P3). 에이전시 포털은 지금 `campus`·`course`·`weeks`·`agency`를 넘긴다(상담에서 시작일·기숙사는 정하지 않는다).

## 견적 프로그램에 넣을 코드

네 화면(`/kr`·`/jp`·`/usd`·`/usd-new`) 스크립트 맨 끝, 처음 화면을 그리는 `initW()`·`resetUI()` 다음에 넣는다. 11/10 `/kr`·`/jp` 화면에서 이 코드를 그대로 실행해 확인했다(캠퍼스·코스·기간·유학원 칸이 채워지고 금액·종료일이 다시 계산됨). 사이트에 넣지는 않았다.

```js
// JIC 포털 에이전시 포털에서 열 때 주소의 값으로 견적을 미리 채운다(JIC 포털 docs/quote-prefill.md).
(function prefillFromUrl() {
  const q = new URLSearchParams(location.search);
  if (![...q.keys()].length) return;
  const campus = q.get('campus');
  if (campus && DATA[campus]) setCampus(campus);
  const start = q.get('start') || '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(start) && new Date(start + 'T00:00:00').getDay() === 0) selectDate(start);
  const weeks = parseInt(q.get('weeks') || '', 10);
  if (weeks > 0 && weeks <= 52) {
    if (document.querySelector('#week-btns button[onclick="setW(' + weeks + ')"]')) setW(weeks);
    else { document.getElementById('customWeeks').value = String(weeks); setCustomWeeks(weeks); }
  }
  const pick = (sel, value) => { if (sel && value && [...sel.options].some((o) => o.value === value)) sel.value = value; };
  pick(document.querySelector('.sel-course'), q.get('course'));
  pick(document.querySelector('.sel-dorm'), q.get('dorm'));
  const agency = q.get('agency');
  if (agency && document.getElementById('agency')) document.getElementById('agency').value = agency.slice(0, 80);
  update();
})();
```

## 코스 짝 (에이전시 포털 → 견적 프로그램)

`apps/partner/src/consult/quoteLink.ts`의 `quoteCourse`. 11/10 레오님 결정.

| 에이전시 포털 코스·단계 | 견적 프로그램 코스 |
| --- | --- |
| 프리미엄 TEP 8·9·10 | ESL TEP 8·9·10 |
| 프리미엄 Speaking Course STARTER·PRO·MASTER | Speaking Starter·Pro·Master |
| 프리미엄 Senior 3·4 | Active Senior 5·6 |
| 프리미엄 Working Holiday | Working Holiday 8 |
| 프리미엄 TOEIC | TOEIC |
| 프리미엄 Business Master | Business Master 8 |
| 챌린저 IELTS Guarantee | IELTS Guarantee |
| 챌린저 ESL·IELTS(세미 스파르타·스파르타) | 비움: Flex·Lite·Core·Standard 는 견적 화면에서 고른다 |
| 프리미엄 ESL | 비움: 견적 프로그램 프리미엄에 ESL 이 없다 |

시험(`apps/partner/src/consult/engine.test.ts` '견적'): 조건표 v2.1의 모든 코스·단계가 견적 프로그램 같은 캠퍼스 목록의 이름으로 바뀌거나 결정대로 비는지 본다. 견적 프로그램 코스 이름이 바뀌면 시험의 목록과 짝을 같이 고친다.

## 남은 일

1. 견적 프로그램에 위 코드 넣기(견적 프로그램 담당, baguiojic 계정).
2. 에이전시 포털 관리자 화면 '링크·안내 설정'에 견적 사이트 주소 네 개 넣기(위 표). 지금 운영 DB에는 네 칸이 비어 있어 상담 화면에 '주소 입력 전'으로 보인다.
3. 1번 전에도 에이전시 포털은 값을 붙인 주소로 연다. 견적 프로그램은 모르는 값을 무시하므로 빈 견적 화면이 열린다.
