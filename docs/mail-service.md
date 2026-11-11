# 메일 발송 서비스 제안 (R-008)

기획 요청 R-008: 메일 발송 서비스를 하나로 정해 제안한다. 아래 세 용도를 한 서비스로 보내는 것이 목표다.

1. **가입 인증·비밀번호 재설정**: 에이전시 포털 가입(Supabase Auth)에 필요하다. 지금 막혀 있는 일이다.
2. **인보이스·서류 발송**: CL-033, 2차. 근거는 `docs/invoice-documents.md`.
3. **뉴스레터·공문**: CL-034. 노션에서 만든 확정본을 국가별로 각 유학원에 보낸다.

**결정(2026-11-10, Leo): A안, Resend 하나로 세 용도를 모두 보낸다.** 설정 순서는 6장에 있다. 남은 결정은 R8-2~4(보내는 주소·도메인, DNS 관리, 지금 뉴스레터 도구)다.
가입 인증은 Supabase 대시보드 설정만으로 끝나고 코드를 고치지 않는다. 인보이스 발송(CL-033)과 뉴스레터 발송(CL-034)은 각 기능의 순서가 오면 만든다.

## 1. 지금 상태

- Supabase 기본 메일은 **프로젝트 팀원 주소로만 보내고**, 시간당 몇 통으로 막혀 있다. 그래서 에이전시는 가입 인증 메일을 받지 못한다(`docs/leo-todo.md` 5).
- 운영에서 가입을 받으려면 Supabase에 **외부 SMTP를 연결**해야 한다(Authentication → Emails → SMTP Settings).
- 인보이스 발송과 뉴스레터 발송 기능은 아직 없다. 뉴스레터는 지금 링크만 둔다(CL-034).

## 2. 보낼 양(추정, 11/10 건수 기준)

| 용도 | 근거 | 한 달 |
| --- | --- | --- |
| 가입 인증·비밀번호 재설정 | 에이전시 651곳, 가입·재설정은 드물다 | 100통 안팎 |
| 인보이스·픽업 확인서 | 최근 12개월 등록 1,866건(한 달 약 155건) + 연장 | 300~500통 |
| 뉴스레터·공문 | 매주, 에이전시 651곳(국가별) | 최대 약 2,800통. **보내는 날 하루 650통 이상** |

합계는 한 달 4,000통 이하다. 다만 뉴스레터 보내는 날에는 하루 수백 통이 한꺼번에 나간다.

## 3. 후보 비교

가격은 2026년 중반 제3자 정리 기준이다. 결정 전에 각 서비스의 공식 가격 페이지에서 다시 확인한다.

| 서비스 | 가입 인증(Supabase SMTP) | 서버(Workers)에서 발송 | 뉴스레터(대량·수신 거부 관리) | 비용(참고) | 걸리는 점 |
| --- | --- | --- | --- | --- | --- |
| **Resend** | 됨. Supabase 문서의 SMTP 안내 목록에 있다 | HTTP API 하나로 됨 | 됨. Broadcasts에 주소록·수신 거부 링크가 있다 | 무료 월 3,000통(**하루 100통 제한**), Pro 월 20달러(5만 통) | 뉴스레터 날에는 하루 100통을 넘어 Pro가 필요하다. 마케팅 주소록 한도는 따로 확인 |
| Cloudflare Email Service | 됨(SMTP 베타, `smtp.mx.cloudflare.net:465`) | Workers 연결로 바로 됨 | **안 됨: 거래 메일만 허용**(공식 FAQ). 마케팅 메일 금지 | Workers Paid(월 5달러)에 월 3,000통 포함, 넘으면 1,000통당 0.35달러 | 보내는 도메인이 Cloudflare DNS를 써야 한다. 뉴스레터는 다른 서비스가 필요하다 |
| Amazon SES | 됨 | 됨(AWS 서명 필요) | 보낼 수는 있으나 주소록·수신 거부를 직접 만들어야 한다 | 1,000통당 약 0.10달러(가장 쌈) | AWS 계정, 처음 '샌드박스' 해제 심사가 필요하다. 설정할 것이 많다 |
| Google Workspace SMTP 릴레이 | 학원이 Workspace를 쓰면 됨 | 됨(SMTP) | 대량 발송용이 아니다 | Workspace 요금에 포함 | 하루 발송 한도, 뉴스레터에는 맞지 않음 |
| 뉴스레터 전용 도구(예: 스티비) | 안 됨 | 제한적 | 됨 | 도구별 | 가입 인증·인보이스는 못 보낸다 |

## 4. 제안

**A안(추천): Resend 하나로 세 용도를 보낸다.**

- '하나로'라는 요청을 그대로 맞춘다. 서비스 계정, 도메인 인증, 키 관리를 각각 한 번만 하면 된다.
- 가입 인증: Supabase SMTP 설정에 Resend SMTP를 넣는다. 코드 수정은 없다.
- 인보이스·서류: Workers에서 HTTP API로 보낸다(2차, 발행 위치가 정해진 뒤).
- 뉴스레터: Broadcasts에 국가별 주소록을 두고 보낸다. 수신 거부도 Resend가 처리한다(CL-034, 노션 확정본을 받아 보냄).
- 비용: 처음에는 무료로 가입 인증과 인보이스를 보낸다. 뉴스레터 발송을 시작하면 Pro(월 20달러 수준)로 올린다.

**B안: Cloudflare Email Service(가입 인증·인보이스) + 뉴스레터 도구 따로.**

- 이미 쓰는 Cloudflare 안에서 끝나고, 거래 메일은 가장 단순하다.
- 하지만 뉴스레터를 보낼 수 없어 서비스가 둘이 된다. '하나로'에 맞지 않는다.
- 보내는 도메인을 Cloudflare DNS로 옮겨야 할 수 있다.
- 지금 뉴스레터를 다른 도구(스티비 등)로 보내고 있고 그대로 두고 싶다면 B안이 맞다.

## 5. 결정할 것

| 번호 | 질문 | 누구 |
| --- | --- | --- |
| R8-1 | ~~A안(Resend 하나) / B안(Cloudflare + 뉴스레터 도구)~~ → **11/10 A안 결정** | Leo |
| R8-2 | 보내는 주소와 도메인(예: noreply@학원 도메인), 답장 받을 주소 | Leo·기획 |
| R8-3 | 그 도메인의 DNS를 누가 관리하는지(SPF·DKIM·DMARC 기록을 넣어야 함) | Leo |
| R8-4 | 지금 뉴스레터를 보내는 도구가 있는지, 옮길지 | 기획 |

## 6. 설정 순서 (A안 Resend, 레오님이 직접)

계정 만들기·키 입력은 레오님이 한다. 키는 채팅·저장소에 붙이지 않고 Supabase 화면에 바로 넣는다.

1. **Resend 계정**: https://resend.com 에서 **어학원 공용 이메일**로 가입한다(`docs/accounts.md`, 학원 계정 이전과 같이). 개인 계정으로 만들지 않는다. 무료 요금제로 시작한다(월 3,000통·하루 100통, 도메인 1개).
2. **보내는 도메인 추가**: Domains → Add Domain.
   - 어학원 도메인(`docs/accounts.md` 결정 #6)의 하위 도메인을 권장한다. 예: `mail.학원도메인`. 하위 도메인을 쓰면 학원 대표 메일의 평판과 나뉜다.
   - 지역(Region)을 고를 수 있으면 받는 사람과 가까운 도쿄를 고른다.
3. **DNS 기록 넣기**: Resend가 보여 주는 기록을 도메인 DNS에 그대로 넣는다. 반송용 MX, SPF용 TXT, DKIM용 TXT(`resend._domainkey`), 권장 DMARC(`_dmarc`)다.
   - DNS를 관리하는 사람(R8-3)이 넣는다.
   - 넣은 뒤 Resend에서 Verify를 누르고 'Verified'가 되는지 본다. 보통 몇 분, 길면 하루 걸린다.
4. **API 키 만들기**: API Keys → Create API Key.
   - 이름은 `supabase-smtp`, 권한은 **Sending access**(보내기만), 도메인은 2번 도메인으로 제한한다.
   - 키는 한 번만 보인다. 바로 5번 화면에 붙여 넣는다.
5. **Supabase SMTP**: Supabase 대시보드 → Authentication → Emails → SMTP Settings → Enable custom SMTP.

   | 칸 | 값 |
   | --- | --- |
   | Sender email | 2번 도메인의 주소(예: `noreply@mail.학원도메인`, R8-2) |
   | Sender name | `JIC` |
   | Host | `smtp.resend.com` |
   | Port | `465` |
   | Username | `resend`(고정 값) |
   | Password | 4번 API 키(`re_`로 시작) |

   - 다른 방법: Supabase의 Resend 연동(Integrations)으로 연결하면 SMTP 값이 자동으로 들어간다. Resend 계정 권한을 Supabase에 주는 방식이라 레오님이 고른다.
6. **보내기 한도**: Authentication → Rate Limits의 메일 보내기 한도(외부 SMTP를 켜면 시간당 30통이 기본)를 시간당 100통 정도로 올린다.
7. **가입 허용·시험**: `docs/leo-todo.md` '직접 해 주셔야 하는 일' 6의 ①②(가입 허용, Redirect URL)를 확인한다. 그다음 시험 지점으로 가입 → 인증 메일 받기 → 관리자 포털 '파트너 포털 관리 › 지점 계정'에서 승인까지 해 본다.
   - 이 프로젝트의 모든 인증 메일(직원 초대·비밀번호 재설정 포함)이 이제 Resend로 나간다.
   - 기본 메일 문구는 영어다. 9장의 한국어·영어 초안을 Authentication → Emails → Templates에 붙여 넣는다.

## 7. 그다음 (기능 순서가 오면)

1. **인보이스 발송**(CL-033 2차): 인보이스 발송용 API 키를 따로 만들어 Workers 비밀 값으로 넣고 발송 기능을 만든다. 발행 위치(R7-1)가 정해진 뒤에 한다.
2. **뉴스레터 발송**(CL-034): 국가별 주소록은 승인된 지점의 연락 이메일(`agency_members`)로 만든다.
   - 수신 거부한 지점은 뺀다.
   - 광고성 내용이면 제목 표시·수신 거부 안내 규정을 지킨다.
   - 발송을 시작하면 하루 100통을 넘으므로 Pro 요금제로 올린다.

## 8. 보안 점검에 넣을 것

- 메일 서비스에는 **에이전시 이메일**이 들어간다(주소록, 발송 기록). 학생 이메일은 보내지 않는다(원칙 P3, CL-035).
- 인보이스 메일에는 학생 이름과 금액이 들어간다. 첨부 대신 **로그인해서 보는 링크**를 보내면 메일 서비스에 남는 개인정보가 줄어든다(제안).
- 서비스 키는 Supabase 대시보드와 Workers 비밀 값에만 둔다. 저장소와 채팅에는 두지 않는다.

## 9. 인증 메일 문구 초안 (6장 7번에서 붙여 넣기)

Supabase 기본 인증 메일은 영어이고 JIC 이름이 없다. 아래는 **초안**이다. 기획이 문구를 확인한 뒤 레오님이 Authentication → Emails → Templates에 붙여 넣는다.
- 한국어를 먼저 쓰고 영어를 아래에 둔다. 에이전시 포털 화면이 한국어 먼저라서다(다른 언어는 준비 중).
- `{{ .ConfirmationURL }}`·`{{ .Email }}`은 Supabase가 채우는 값이라 그대로 둔다.
- 링크는 한 번만 쓸 수 있고 시간이 지나면 끝난다(만료 시간은 Authentication → Providers → Email 설정에서 본다).
- 대표 등록 신청과 직원 가입은 같은 'Confirm signup' 메일을 쓴다. 그래서 문구는 둘 다에 맞게 썼다.

**Confirm signup (가입 인증)**

제목: `[JIC] 이메일 인증 / Confirm your email`

```html
<p>JIC 에이전시 포털에 가입해 주셔서 감사합니다.</p>
<p>아래 링크를 눌러 이메일({{ .Email }})을 인증해 주세요.</p>
<p><a href="{{ .ConfirmationURL }}">이메일 인증하기</a></p>
<p>지점 대표 아이디는 인증 뒤 JIC 담당자가 승인하면 쓸 수 있습니다. 지점 직원 아이디는 인증 뒤 로그인하면 바로 열립니다.<br>
가입한 적이 없다면 이 메일은 무시하셔도 됩니다.</p>
<hr>
<p>Thank you for signing up for the JIC Agency Portal.</p>
<p>Please confirm your email ({{ .Email }}) by clicking the link below.</p>
<p><a href="{{ .ConfirmationURL }}">Confirm email</a></p>
<p>Branch owner accounts can be used after JIC approves them. Branch staff accounts open as soon as you log in.<br>
If you did not sign up, you can ignore this email.</p>
<p>JIC English Academy</p>
```

**Reset password (비밀번호 재설정)**

제목: `[JIC] 비밀번호 재설정 / Reset your password`

```html
<p>JIC 포털 비밀번호 재설정을 요청하셨습니다.</p>
<p><a href="{{ .ConfirmationURL }}">새 비밀번호 정하기</a></p>
<p>요청하지 않았다면 이 메일은 무시하셔도 됩니다. 비밀번호는 바뀌지 않습니다.</p>
<hr>
<p>You asked to reset your JIC Portal password.</p>
<p><a href="{{ .ConfirmationURL }}">Set a new password</a></p>
<p>If you did not ask for this, you can ignore this email. Your password will not change.</p>
<p>JIC English Academy</p>
```

**Change email address (이메일 변경)**: 지금 에이전시 포털에는 이메일을 바꾸는 화면이 없다(아이디 이메일은 JIC 담당자가 바꾼다). 기본 문구 그대로 둔다.

**Invite user (초대)**: 관리자 포털이 직원 계정을 만들 때 쓰는 경우에만 나간다. 에이전시 직원 아이디는 초대 메일을 쓰지 않는다(대표가 이메일을 등록하고 직원이 직접 가입, CL-032). 기본 문구 그대로 둔다.
