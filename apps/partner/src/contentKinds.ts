/**
 * 파트너 포털 화면 콘텐츠 종류와 칸(CL-045 관리 메뉴, 화면 명세 4장 docs/partner-spec.md).
 * 표는 partner_content_items(20261111140000) 하나이고, 종류마다 다른 칸은 data(jsonb)에 둔다. 관리자 포털 입력 화면과 에이전시 포털 화면이 같이 쓴다.
 * 모든 종류에 공통 칸(명세 4.0): 노출 국가·국가별 순서·언어별 문구·공개 상태·최종 업데이트일·다음 업데이트 예정·수정 기록.
 * 글에는 가격 숫자를 넣지 않는다(CL-055): 그 자리에 '학비표 보기' 링크.
 */
export type ContentKind =
  | 'about' | 'teacher' | 'day' | 'activity' | 'camp'
  | 'playbook' | 'evidence' | 'event' | 'campus_status' | 'school_stat' | 'contact' | 'newsletter' | 'video' | 'photo';

/** pdf: 비공개 저장소 partner-media 에 올리고 경로를 칸에 담는다(캠프 브로슈어, 20261111180000) */
export type FieldType = 'text' | 'textarea' | 'date' | 'url' | 'select' | 'check' | 'pdf';
export interface KindField { key: string; label: string; type: FieldType; options?: string[]; required?: boolean; hint?: string }
export interface KindDef {
  kind: ContentKind;
  label: string;
  /** 제목 칸 이름(제목이 곧 이름·질문인 종류가 있다) */
  title: string;
  /** 본문 칸 이름. 없으면 본문을 쓰지 않는다 */
  body?: string;
  /** 캠퍼스 칸: none = 안 씀, optional = 고를 수 있음, required = 꼭 고름 */
  campus: 'none' | 'optional' | 'required';
  campuses?: string[];
  fields: KindField[];
  /** 에이전시 포털에서 보이는 곳(설명용) */
  where: string;
}

export const CAMPUS_LABEL: Record<string, string> = { '': '공통', premium: 'Premium', challenger: 'Challenger', new: 'New Campus', mco: 'MCO(한국 주니어캠프)' };
export const STATUS_LABEL: Record<string, string> = { draft: '초안', published: '게시', hidden: '숨김' };

export const KINDS: Record<ContentKind, KindDef> = {
  about: {
    kind: 'about', label: 'JIC 소개', title: '제목', body: '본문', campus: 'none', where: '소개 › JIC 소개',
    fields: [{ key: 'section', label: '섹션', type: 'select', options: ['왜 바기오·주변', '왜 JIC'], required: true }],
  },
  teacher: {
    kind: 'teacher', label: '선생님', title: '이름', campus: 'required', campuses: ['premium', 'challenger'], where: '소개 › JIC 소개 › 선생님',
    fields: [
      { key: 'subject', label: '담당 수업', type: 'text' },
      { key: 'intro', label: '한 줄 소개', type: 'text' },
    ],
  },
  day: {
    kind: 'day', label: '학생의 하루', title: '활동', body: '설명', campus: 'required', campuses: ['premium', 'challenger'], where: '코스·생활 › 학생의 하루, 상담 ③ (화면에 \'예시 학생\' 표시, CL-030)',
    fields: [
      { key: 'course', label: '코스', type: 'text', hint: '조건표 V2.1 코스 이름(CL-056)' },
      { key: 'time', label: '시간', type: 'text', required: true, hint: '예: 07:30' },
    ],
  },
  activity: {
    kind: 'activity', label: '액티비티', title: '이름', body: '설명', campus: 'optional', campuses: ['premium', 'challenger'], where: '코스·생활 › 학생 생활 › 액티비티, 상담 ③',
    fields: [{ key: 'schedule', label: '요일·주기', type: 'text', hint: '예: 매주 수요일' }],
  },
  camp: {
    kind: 'camp', label: '캠프', title: '캠프 이름', campus: 'required', campuses: ['premium', 'mco'], where: '코스·생활 › 캠프 (CL-053, 상담 추천에는 안 나옴)',
    fields: [
      { key: 'type', label: '캠프 종류', type: 'select', options: ['패밀리캠프·가족연수', '주니어캠프(Premium)', '한국 주니어캠프(MCO)'], required: true },
      { key: 'season', label: '시즌', type: 'text', required: true, hint: '예: 2027 겨울' },
      { key: 'period', label: '기간', type: 'text', required: true, hint: '예: 2027-01-03 ~ 2027-02-13 (2·4·6주)' },
      { key: 'start_dates', label: '입학 가능일', type: 'text' },
      { key: 'target', label: '대상', type: 'text', hint: '예: 초등 3학년~중학 3학년' },
      { key: 'summary', label: '한 줄 소개', type: 'text' },
      { key: 'points', label: '핵심 3가지', type: 'textarea', hint: '한 줄에 하나씩' },
      { key: 'state', label: '상태', type: 'select', options: ['모집 중', '마감', '지난 시즌'], required: true },
      { key: 'brochure_path', label: '브로슈어 PDF', type: 'pdf', hint: '가격은 브로슈어 안에만(CL-053). 올린 PDF가 있으면 아래 주소보다 먼저 씁니다' },
      { key: 'brochure_url', label: '브로슈어 주소(드라이브 등)', type: 'url', hint: 'PDF를 올리지 않을 때만' },
      { key: 'version', label: '버전', type: 'text', required: true, hint: '노션 최종 파일과 대조용' },
    ],
  },
  playbook: {
    kind: 'playbook', label: '플레이북', title: '질문', campus: 'none', where: '상담 자료 › 플레이북 (상담원 전용, 상담 모드에는 없음, CL-052)',
    fields: [
      { key: 'area', label: '분야', type: 'text', required: true },
      { key: 'answer', label: '답변 요점', type: 'textarea', required: true },
      { key: 'show', label: '보여 줄 화면·증거', type: 'text' },
      { key: 'avoid', label: '피할 말', type: 'textarea' },
    ],
  },
  evidence: {
    kind: 'evidence', label: '근거 자료', title: '제목', body: '설명', campus: 'optional', campuses: ['premium', 'challenger'], where: '상담 자료 › 근거 자료, 추천 이유 증거(CL-050)',
    fields: [
      { key: 'file_url', label: '이미지·PDF 주소', type: 'url' },
      { key: 'course', label: '코스', type: 'text' },
    ],
  },
  event: {
    kind: 'event', label: '행사 일정', title: '행사 이름', body: '설명', campus: 'optional', campuses: ['premium', 'challenger', 'new'], where: '코스·생활 › 학생 생활 › 활동 달력',
    fields: [
      { key: 'date', label: '날짜', type: 'date', required: true },
      { key: 'type', label: '종류', type: 'select', options: ['입학', '픽업', '시험', '휴일', '이벤트'], required: true },
    ],
  },
  campus_status: {
    kind: 'campus_status', label: '캠퍼스 상태', title: '한 줄 안내', campus: 'required', campuses: ['premium', 'challenger', 'new'], where: '홈 › 캠퍼스 상태 (갱신일 = 최종 업데이트일)',
    fields: [],
  },
  school_stat: {
    kind: 'school_stat', label: '학교 현황 통계', title: '항목', campus: 'optional', campuses: ['premium', 'challenger'], where: '소개 › JIC 소개 › 학교 현황 (확인된 값만 게시)',
    fields: [
      { key: 'as_of', label: '기준일', type: 'date', required: true },
      { key: 'value', label: '값', type: 'text', required: true, hint: '예: 한국 35% · 일본 20% · 대만 15%' },
    ],
  },
  contact: {
    kind: 'contact', label: '담당자 연락처', title: '이름', campus: 'optional', campuses: ['premium', 'challenger'], where: '학교와 소통 › 담당자 연락처',
    fields: [
      { key: 'countries_covered', label: '담당 국가', type: 'text' },
      { key: 'role', label: '역할', type: 'text' },
      { key: 'channels', label: '연락 수단', type: 'textarea', hint: '이메일·카카오톡·라인 등' },
    ],
  },
  newsletter: {
    kind: 'newsletter', label: '뉴스레터', title: '호 제목', campus: 'none', where: '학교와 소통 › 뉴스레터 (직접 발송은 해야 할 일 T-08)',
    fields: [
      { key: 'issued_on', label: '발행일', type: 'date', required: true },
      { key: 'url', label: '링크', type: 'url', required: true },
    ],
  },
  video: {
    kind: 'video', label: 'JIC Play 영상', title: '제목', body: '설명', campus: 'optional', campuses: ['premium', 'challenger'], where: '상담 › JIC Play, 홈 새 영상, 상담 ③ (영상 파일은 올리지 않음, CL-047)',
    fields: [
      { key: 'youtube', label: '유튜브 주소', type: 'url', required: true, hint: '일부 공개(링크가 있는 사람만)' },
      { key: 'drive', label: '원본 드라이브 링크', type: 'url' },
      { key: 'length', label: '길이', type: 'text', hint: '예: 1:05' },
      { key: 'type', label: '유형', type: 'select', options: ['행사', '수업', '생활', '시설', '인터뷰'] },
      { key: 'consult', label: '상담 ③에 나옴', type: 'check' },
    ],
  },
  photo: {
    kind: 'photo', label: '사진', title: '설명', campus: 'optional', campuses: ['premium', 'challenger', 'new', 'mco'], where: '화면 위치에 따라(사진 보관함, CL-047)',
    fields: [
      { key: 'placement', label: '화면 위치', type: 'select', required: true },
      { key: 'course', label: '코스', type: 'text' },
    ],
  },
};

/**
 * 사진 화면 위치(명세 4.4, CL-047). 시제품 '00_파일_안내.xlsx'의 분류(캠퍼스 대표·가이드·아카데믹·지도·바기오·액티비티·상담 ③ 등)를
 * 지금 에이전시 포털 화면에 맞춘 14개로, 11/12 레오님이 그대로 확정했다. 키는 DB data.placement 에 들어가니 바꾸지 말고 더하기만 한다.
 */
export const PLACEMENTS: { key: string; label: string; where: string }[] = [
  { key: 'campus_card', label: '캠퍼스 카드', where: '홈·캠퍼스 목록의 캠퍼스 카드(첫 장)' },
  { key: 'campus_hero', label: '캠퍼스 대표', where: '캠퍼스 화면 맨 위' },
  { key: 'campus_gallery', label: '캠퍼스 시설', where: '캠퍼스 화면 사진' },
  { key: 'academic', label: '아카데믹(수업·교실)', where: '캠퍼스 화면 사진' },
  { key: 'dorm', label: '기숙사', where: '캠퍼스 화면 사진, 상담 ③' },
  { key: 'meals', label: '식사', where: '캠퍼스 화면 사진, 상담 ③' },
  { key: 'map', label: '지도', where: '캠퍼스 화면 사진' },
  { key: 'baguio', label: '바기오', where: '소개 › 왜 바기오·주변' },
  { key: 'why_jic', label: '왜 JIC', where: '소개 › 왜 JIC' },
  { key: 'day', label: '학생의 하루', where: '코스·생활 › 학생의 하루' },
  { key: 'activity', label: '액티비티', where: '학생 생활 › 액티비티, 상담 ③' },
  { key: 'event', label: '행사', where: '학생 생활 › 활동 달력' },
  { key: 'camp', label: '캠프', where: '코스·생활 › 캠프' },
  { key: 'consult', label: '상담 ③', where: '상담 ③ 생활 맨 위' },
];
export const placementLabel = (key: string) => PLACEMENTS.find((p) => p.key === key)?.label ?? key;

/** 사진 보관함 저장소(비공개). 에이전시는 게시된 사진·캠프가 가리키는 파일만 서명 주소로 연다 */
export const MEDIA_BUCKET = 'partner-media';
/** 올릴 때 가로를 이 폭까지 줄인다(명세 4.4) */
export const PHOTO_MAX_WIDTH = 1600;

/** 언어별 문구(P7): 한국어가 기본이고 번역이 없으면 한국어로 보인다 */
export const I18N_LANGS: [string, string][] = [['en', 'English'], ['ja', '日本語'], ['zh-TW', '繁體中文'], ['zh-CN', '简体中文'], ['vi', 'Tiếng Việt']];

/** CL-055: 글 속 가격 숫자 찾기(경고용). 원·엔·달러·페소 기호나 통화 이름 옆 숫자 */
export const PRICE_IN_TEXT = /(₩|￦|\$|₱|¥|PHP|KRW|USD|JPY)\s?\d|\d[\d,]*\s?(원|만원|페소|달러|엔)(?![가-힣])/;

export interface ContentItem {
  id: string;
  kind: ContentKind;
  campus: string;
  title: string;
  body: string;
  data: Record<string, string | boolean | number | number[] | undefined>;
  i18n: Record<string, { title?: string; body?: string }>;
  countries: string[];
  country_order: Record<string, number>;
  status: 'draft' | 'published' | 'hidden';
  sort: number;
  updated_on: string | null;
  next_update: string | null;
  updated_at: string;
}

/** 파트너 화면의 '기준일 · 다음 업데이트 예정'(CL-054) */
export const updateText = (it: Pick<ContentItem, 'updated_on' | 'next_update'>) =>
  [it.updated_on ? `${it.updated_on} 기준` : '', it.next_update ? `다음 업데이트 ${it.next_update} 예정` : ''].filter(Boolean).join(' · ');
