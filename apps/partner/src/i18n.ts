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
  'common.phase2': '2차',
  // CL-037(11/10) 메뉴 구조: 홈 / 상담 / 소개 / 코스·생활 / 비용·등록 / 학교와 소통 / My Students(2차)
  'menu.home': '홈',
  'menu.consult': '상담',
  'menu.consultStart': '상담 시작',
  'menu.play': 'JIC Play',
  'menu.consultMaterials': '상담 자료',
  'menu.downloads': '다운로드 센터',
  'menu.evidence': '근거 자료',
  'menu.playbook': '플레이북',
  'menu.faq': 'FAQ',
  'menu.about': '소개',
  'menu.campuses': '캠퍼스',
  'menu.aboutJic': 'JIC 소개',
  'menu.baguio': '왜 바기오·주변',
  'menu.whyJic': '왜 JIC',
  'menu.teachers': '선생님',
  'menu.school': '학교 현황',
  'menu.coursesLife': '코스·생활',
  'menu.courses': '코스 안내',
  'menu.day': '학생의 하루',
  'menu.camps': '주니어·가족 캠프',
  'menu.studentLife': '학생 생활',
  'menu.calendar': '활동 달력',
  'menu.activities': '액티비티',
  'menu.costs': '비용·등록',
  'menu.quote': '견적',
  'menu.tuition': '학비표·환불',
  'menu.vacancy': '기숙사 공실',
  'menu.register': '등록 절차·서류',
  'menu.invoices': '인보이스·서류',
  'menu.contact': '학교와 소통',
  'menu.notices': '공지·프로모션',
  'menu.newsletter': '뉴스레터',
  'menu.visit': '방문 신청·내 방문 내역',
  'menu.contacts': '담당자 연락처',
  'menu.students': 'My Students',
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
