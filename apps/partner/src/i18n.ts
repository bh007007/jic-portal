/**
 * 화면 문구 사전(원칙 P7: 번역 파일 분리). 1차는 한국어만 쓰고, 언어를 더할 때 같은 키로 사전을 추가한다.
 * 메뉴·버튼·공통 문구부터 옮겨 두었고, 화면별 긴 안내 문구는 다국어 작업(12.8) 때 옮긴다.
 */
const ko = {
  'brand.name': 'Partner Portal',
  'brand.slogan': 'Less Explaining. More Consulting.',
  'nav.consult': '상담',
  'nav.campuses': '캠퍼스·코스',
  'nav.quote': '견적',
  'nav.vacancy': '공실',
  'nav.register': '등록 안내',
  'nav.resources': '자료실',
  'nav.notices': '공지·프로모션',
  'nav.visit': '방문 신청',
  'nav.students': 'My Students',
  'nav.admin': '관리자',
  'top.lang': '언어',
  'top.account': '내 계정',
  'top.logout': '로그아웃',
  'top.login': '로그인',
  'top.signup': '등록 신청',
  'common.preparing': '준비 중',
  'common.loading': '불러오는 중…',
  'common.save': '저장',
  'common.saved': '저장했습니다.',
  'common.cancel': '취소',
  'common.empty': '내용 입력 전',
  'common.notSaved': '학생 정보는 저장되지 않습니다',
  'footer.org': 'JIC International Academy · Baguio, Philippines',
} as const;

export type MsgKey = keyof typeof ko;

export const LANGS: { code: string; label: string; ready: boolean }[] = [
  { code: 'ko', label: '한국어', ready: true },
  { code: 'en', label: 'English', ready: false },
  { code: 'ja', label: '日本語', ready: false },
  { code: 'zh-TW', label: '繁體中文', ready: false },
  { code: 'zh-CN', label: '简体中文', ready: false },
  { code: 'vi', label: 'Tiếng Việt', ready: false },
];

export const CURRENCIES = ['KRW', 'JPY', 'USD', 'TWD', 'CNY', 'VND'];

export function t(key: MsgKey): string {
  return ko[key];
}
