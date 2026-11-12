-- 에이전시 포털 FAQ(CL-030·037 메뉴 '상담 › 상담 자료 › FAQ', 11/12 레오님 결정: 입력은 관리자 포털 '파트너 포털 관리 › 화면 콘텐츠'). 여러 번 실행해도 된다.
-- 화면 콘텐츠 표(partner_content_items, 20261111140000)에 종류 'faq'만 더한다. 질문 = 제목, 답변 = 본문, 분야·관련 화면 = data.
-- 권한(직원 쓰기, 에이전시는 게시된 것 중 자기 나라 것만 읽기)·노출 국가·언어별 문구는 다른 종류와 같다.
-- 20261111180000_partner_media.sql 이 같은 제약을 정의하므로, 그 파일을 다시 실행하면 이 파일도 이어서 다시 실행한다.
alter table public.partner_content_items drop constraint if exists partner_content_items_kind_check;
alter table public.partner_content_items add constraint partner_content_items_kind_check
  check (kind in ('about', 'teacher', 'day', 'activity', 'camp', 'playbook', 'evidence', 'event', 'campus_status', 'school_stat', 'contact', 'newsletter', 'video', 'photo', 'faq'));
