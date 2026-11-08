/**
 * 화면 문구. 기획안 P7에 따라 업체와 같은 6개 언어(ko, en, jp, ch, tw, vi)로 늘린다. 지금은 ko, en.
 * 학생 이름·국적·코스명처럼 데이터에서 오는 값은 번역하지 않는다.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const ko = {
  'app.name': 'Student',
  'lang.label': 'KOR',
  'lang.change': '언어 변경',
  'data.sample': '샘플 데이터',
  'common.loading': '불러오는 중…',
  'common.back': '뒤로',
  'common.error': '불러오지 못했습니다.',
  'common.retry': '다시 시도',
  'nav.home': '홈',
  'nav.requests': '신청',
  'nav.me': '내 정보',
  'nav.main': '하단 메뉴',
  'short.label': '바로가기',
  'short.timetable': '시간표',
  'short.absence': '결석 신청',
  'short.history': '신청 내역',
  'short.me': '내 정보',
  'card.label': '학생증',
  'card.photo': '사진',
  'home.absences': '결석 신청 내역',
  'home.viewAll': '전체보기 >',
  'home.noAbsences': '신청 내역이 없습니다.',
  'home.checkout': '졸업 전 확인',
  'home.roomClear': '방 정리 확인',
  'home.pointClear': '포인트 잔액 환불',
  'home.done': '완료',
  'home.notDone': '미완료',
  'enroll.current': '재학',
  'enroll.upcoming': '입학 예정',
  'enroll.graduated': '졸업',
  'enroll.other': '기타',
  'enroll.cancelled': '취소',
  'kind.sick': '병결',
  'kind.official': '공결',
  'kind.personal': '개인 사유',
  'status.pending': '대기',
  'status.approved': '승인',
  'status.rejected': '반려',
  'status.cancelled': '취소',
  'abs.submitted': '{t} 제출',
  'abs.allDay': '종일',
  'abs.periods': '{p}교시',
  'req.title': '신청',
  'req.history': '신청 내역',
  'req.newAbsence': '결석 신청',
  'req.newOvernight': '외박 신청',
  'req.absences': '결석 신청 내역',
  'req.overnights': '외박 신청 내역',
  'ov.title': '외박 신청',
  'ov.from': '출발일',
  'ov.until': '복귀일',
  'ov.nights': '{n}박',
  'ov.reasonPh': '행선지와 사유',
  'ov.period': '기간',
  'ov.detail': '외박 신청 상세',
  'ov.confirmCancel': '이 외박 신청을 취소할까요?',
  'ov.noWindow': '재학 중이거나 입학 예정인 연수가 없어 외박 신청을 할 수 없습니다.',
  'form.title': '결석 신청',
  'form.date': '날짜',
  'form.kind': '종류',
  'form.periods': '교시',
  'form.reason': '사유',
  'form.submit': '제출',
  'form.submitting': '제출 중…',
  'form.window': '신청 가능 기간 {from} ~ {to}',
  'form.noWindow': '재학 중이거나 입학 예정인 연수가 없어 결석 신청을 할 수 없습니다.',
  'detail.title': '신청 상세',
  'detail.status': '상태',
  'detail.date': '날짜',
  'detail.kind': '종류',
  'detail.periods': '교시',
  'detail.reason': '사유',
  'detail.submittedAt': '제출',
  'detail.decidedAt': '처리',
  'detail.comment': '담당자 메모',
  'detail.cancel': '신청 취소',
  'detail.confirmCancel': '이 신청을 취소할까요?',
  'detail.notFound': '신청을 찾을 수 없습니다.',
  'me.title': '내 정보',
  'me.student': '학생 정보',
  'me.stId': '학생번호',
  'me.name': '이름',
  'me.birthday': '생년월일',
  'me.gender': '성별',
  'me.nation': '국적',
  'me.email': '이메일',
  'me.cell': '연락처',
  'me.enrollment': '연수',
  'me.course': '코스',
  'me.campus': '캠퍼스',
  'me.dorm': '기숙사',
  'me.period': '기간',
  'me.weeks': '{n}주',
  'me.batch': '입학 배치',
  'me.history': '연수 이력',
  'me.logout': '로그아웃',
  'gender.F': '여',
  'gender.M': '남',
  'tt.notReady': '시간표는 준비 중입니다.',
  'login.title': '학생 로그인',
  'login.stId': '학생번호',
  'login.birthday': '생년월일 (8자리, 예: 19990131)',
  'login.submit': '로그인',
  'login.checking': '확인 중…',
  'login.local': '로컬 개발용 로그인입니다. 배포 주소에서는 학생 계정으로 로그인합니다.',
  'login.sampleHint': '샘플 학생: {stId} / {birthday}',
  'err.network': '서버에 연결하지 못했습니다.',
  'err.login_failed': '학생번호 또는 생년월일이 맞지 않습니다.',
  'err.invalid_date': '날짜를 고르세요.',
  'err.invalid_kind': '종류를 고르세요.',
  'err.invalid_periods': '교시를 다시 고르세요.',
  'err.reason_required': '사유를 입력하세요.',
  'err.reason_too_long': '사유는 {n}자까지 쓸 수 있습니다.',
  'err.date_out_of_range': '신청 가능 기간 안의 날짜를 고르세요.',
  'err.duplicate': '같은 날짜·교시에 이미 신청한 내역이 있습니다.',
  'err.overnight_duplicate': '기간이 겹치는 외박 신청이 있습니다.',
  'err.invalid_range': '복귀일은 출발일보다 뒤여야 합니다.',
  'err.not_pending': '대기 중인 신청만 취소할 수 있습니다.',
  'err.not_found': '신청을 찾을 수 없습니다.',
  'err.unknown': '처리하지 못했습니다.',
};

export type MsgKey = keyof typeof ko;

const en: Record<MsgKey, string> = {
  'app.name': 'Student',
  'lang.label': 'ENG',
  'lang.change': 'Change language',
  'data.sample': 'Sample data',
  'common.loading': 'Loading…',
  'common.back': 'Back',
  'common.error': 'Could not load.',
  'common.retry': 'Retry',
  'nav.home': 'Home',
  'nav.requests': 'Requests',
  'nav.me': 'My Info',
  'nav.main': 'Main menu',
  'short.label': 'Shortcuts',
  'short.timetable': 'Timetable',
  'short.absence': 'Absence',
  'short.history': 'History',
  'short.me': 'My Info',
  'card.label': 'Student card',
  'card.photo': 'Photo',
  'home.absences': 'Absence requests',
  'home.viewAll': 'View all >',
  'home.noAbsences': 'No requests yet.',
  'home.checkout': 'Before you leave',
  'home.roomClear': 'Room check-out',
  'home.pointClear': 'Point balance refund',
  'home.done': 'Done',
  'home.notDone': 'Not done',
  'enroll.current': 'Enrolled',
  'enroll.upcoming': 'Upcoming',
  'enroll.graduated': 'Completed',
  'enroll.other': 'Other',
  'enroll.cancelled': 'Cancelled',
  'kind.sick': 'Sick',
  'kind.official': 'Official',
  'kind.personal': 'Personal',
  'status.pending': 'Pending',
  'status.approved': 'Approved',
  'status.rejected': 'Rejected',
  'status.cancelled': 'Cancelled',
  'abs.submitted': 'Submitted {t}',
  'abs.allDay': 'All day',
  'abs.periods': 'Period {p}',
  'req.title': 'Requests',
  'req.history': 'History',
  'req.newAbsence': 'Request absence',
  'req.newOvernight': 'Request overnight stay',
  'req.absences': 'Absence requests',
  'req.overnights': 'Overnight requests',
  'ov.title': 'Overnight stay',
  'ov.from': 'Leave on',
  'ov.until': 'Return on',
  'ov.nights': '{n} night(s)',
  'ov.reasonPh': 'Destination and reason',
  'ov.period': 'Period',
  'ov.detail': 'Overnight request',
  'ov.confirmCancel': 'Cancel this overnight request?',
  'ov.noWindow': 'You have no current or upcoming enrollment, so you cannot request an overnight stay.',
  'form.title': 'Request absence',
  'form.date': 'Date',
  'form.kind': 'Type',
  'form.periods': 'Periods',
  'form.reason': 'Reason',
  'form.submit': 'Submit',
  'form.submitting': 'Submitting…',
  'form.window': 'Available {from} – {to}',
  'form.noWindow': 'You have no current or upcoming enrollment, so you cannot request an absence.',
  'detail.title': 'Request',
  'detail.status': 'Status',
  'detail.date': 'Date',
  'detail.kind': 'Type',
  'detail.periods': 'Periods',
  'detail.reason': 'Reason',
  'detail.submittedAt': 'Submitted',
  'detail.decidedAt': 'Processed',
  'detail.comment': 'Staff note',
  'detail.cancel': 'Cancel request',
  'detail.confirmCancel': 'Cancel this request?',
  'detail.notFound': 'Request not found.',
  'me.title': 'My Info',
  'me.student': 'Student',
  'me.stId': 'Student No.',
  'me.name': 'Name',
  'me.birthday': 'Date of birth',
  'me.gender': 'Gender',
  'me.nation': 'Nationality',
  'me.email': 'Email',
  'me.cell': 'Phone',
  'me.enrollment': 'Enrollment',
  'me.course': 'Course',
  'me.campus': 'Campus',
  'me.dorm': 'Dormitory',
  'me.period': 'Period',
  'me.weeks': '{n} wk',
  'me.batch': 'Intake',
  'me.history': 'Enrollment history',
  'me.logout': 'Log out',
  'gender.F': 'Female',
  'gender.M': 'Male',
  'tt.notReady': 'The timetable is not available yet.',
  'login.title': 'Student login',
  'login.stId': 'Student No.',
  'login.birthday': 'Date of birth (YYYYMMDD)',
  'login.submit': 'Log in',
  'login.checking': 'Checking…',
  'login.local': 'Local development login. The deployed app uses student accounts.',
  'login.sampleHint': 'Sample student: {stId} / {birthday}',
  'err.network': 'Could not reach the server.',
  'err.login_failed': 'Student No. or date of birth is incorrect.',
  'err.invalid_date': 'Choose a date.',
  'err.invalid_kind': 'Choose a type.',
  'err.invalid_periods': 'Choose the periods again.',
  'err.reason_required': 'Enter a reason.',
  'err.reason_too_long': 'The reason can be up to {n} characters.',
  'err.date_out_of_range': 'Choose a date within the available period.',
  'err.duplicate': 'You already have a request for that date and period.',
  'err.overnight_duplicate': 'You already have an overnight request for those nights.',
  'err.invalid_range': 'The return date must be after the leave date.',
  'err.not_pending': 'Only pending requests can be cancelled.',
  'err.not_found': 'Request not found.',
  'err.unknown': 'Something went wrong.',
};

const DICTS = { ko, en } as const;
export type Lang = keyof typeof DICTS;
const LANGS = Object.keys(DICTS) as Lang[];
const WEEKDAYS: Record<Lang, string[]> = {
  ko: ['일', '월', '화', '수', '목', '금', '토'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

const STORAGE_KEY = 'jic-student-lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in DICTS) return saved as Lang;
  } catch {
    // 저장소를 못 쓰면 기본 언어
  }
  return navigator.language?.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

export type T = (key: MsgKey, vars?: Record<string, string | number>) => string;

interface I18n {
  lang: Lang;
  t: T;
  weekday: (n: number) => string;
  nextLang: () => void;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo<I18n>(() => {
    const dict = DICTS[lang];
    return {
      lang,
      t: (key, vars) => dict[key].replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k] ?? '')),
      weekday: (n) => WEEKDAYS[lang][n],
      nextLang: () => {
        const next = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // 무시
        }
        setLang(next);
      },
    };
  }, [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const v = useContext(Ctx);
  if (!v) throw new Error('I18nProvider 가 없습니다.');
  return v;
}

/** 서버 오류 코드 → 화면 문구 */
export function errorText(t: T, code: string, vars?: Record<string, string | number>) {
  const key = ('err.' + code) as MsgKey;
  return key in ko ? t(key, vars) : t('err.unknown');
}
