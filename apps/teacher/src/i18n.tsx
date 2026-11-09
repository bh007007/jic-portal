import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

// 강사 포털 문구. 필리핀 강사가 쓰므로 영어를 함께 둔다(학생 앱처럼 한국어가 기준). 브라우저 언어가 한국어면 한국어, 아니면 영어로 시작하고 위쪽에서 바꾼다.
export type Lang = 'ko' | 'en';

const ko = {
  appName: '강사 포털',
  portalHome: 'JIC 포털 첫 화면',
  logout: '로그아웃',
  noRole: '역할 없음',
  loading: '불러오는 중…',
  loadFail: '불러오지 못했습니다',
  nav_home: '홈', nav_students: '학생', nav_scores: '성적', nav_materials: '자료실', nav_more: '더보기',
  role_teacher: '강사', role_checker: '체커', role_scheduler: '스케줄러', role_manager: '매니저', role_staff: '직원', role_office: '오피스', role_admin: '관리자',
  notConfigured: 'Supabase 주소가 설정되지 않았습니다(apps/teacher/.env.example 참고).',
  meFail: '계정 정보를 불러오지 못했습니다',
  notTeacher: '강사 포털 계정이 아닙니다. 강사·체커·스케줄러·매니저 역할이 있어야 합니다(관리자에게 요청).',
  email: '이메일', password: '비밀번호', login: '로그인', checking: '확인 중…',
  loginNote: '관리자 포털과 같은 로그인 체계입니다. 계정은 관리자가 발급합니다.',
  // 홈
  hello: '{name}님',
  todayClass: '오늘 수업 · 출석',
  noClassToday: '오늘 수업이 없습니다.', myClassesToday: '내 수업 {n}개', uncheckedN: '미체크 {n}명', openAttendance: '출석 체크',
  todayAbsences: '오늘 결석 신청', byDate: '날짜별 보기', noAbsenceToday: '오늘 결석 신청이 없습니다.',
  students: '학생', seeAll: '전체 보기', current: '재학', arriving30: '30일 안 입학',
  recentScores: '최근 입력한 성적', enterScores: '성적 입력', noScores: '아직 입력한 성적이 없습니다.',
  holidays14: '휴일 (2주 안)', hol_public: '공휴일', hol_school: '학원 휴일',
  // 학생
  people: '{n}명', searchStudent: '이름·학생번호·국적·코스', allCampuses: '전체 캠퍼스', noStudent: '조건에 맞는 학생이 없습니다.',
  notCurrent: '재학·입학 예정 학생이 아닙니다.', studentList: '학생 목록', list: '목록',
  enrollment: '연수', campus: '캠퍼스', course: '코스', dorm: '기숙사', period: '기간', batch: '배치',
  scoreRecords: '성적 기록', cefrNote: 'CEFR은 JIC 기준 추정 레벨', noRecords: '기록이 없습니다.',
  date: '날짜', section: '영역', score: '점수', by: '입력', total: '총점', delete: '삭제',
  confirmDeleteScore: '{name} {section} {value} ({date}) 기록을 지울까요?',
  // 성적 입력
  pickStudent: '학생 고르기', change: '바꾸기', searchNameNo: '이름 또는 학생번호', noMatch: '맞는 학생이 없습니다.',
  points: '점수', recent30: '최근 입력 30건', test: '시험', memo: '메모', optional: '선택', save: '저장', saving: '저장 중…',
  needOneScore: '점수를 하나 이상 넣으세요.', noTestTypes: "쓸 수 있는 시험 종류가 없습니다. 매니저가 '더보기 › 시험 종류'에서 만듭니다.",
  chartCaption: '{name} 총점 {n}회', chartRef: ' · 점선은 CEFR 하한(JIC 기준 추정)',
  manyAtOnce: '여러 명 입력', oneByOne: '한 명씩 입력', batchScores: '성적 여러 명 입력', batchSub: '같은 날 본 시험을 학생 목록에 바로 넣습니다',
  rangeNote: '{min}~{max}, 단위 {step}. 빈 칸은 저장하지 않습니다.', studentsOn: '{date} 재학 학생', alreadyIn: '이미 입력: {v}',
  memoAll: '모든 학생에 같은 메모(선택)', saveN: '{n}명 저장', savedN: '{n}명 저장했습니다.', badRows: '범위·단위가 맞지 않는 칸이 {n}개 있습니다(빨간 칸).',
  // 자료실
  materials: '수업 자료실', materialsSub: '파일은 회사 공유 드라이브, 여기는 목차와 링크', addMaterial: '자료 추가', close: '닫기',
  textbook: '교재', unit: '단원', kind: '종류', title: '제목', driveLink: '드라이브 링크', add: '추가',
  linkHttps: '링크는 https:// 로 시작해야 합니다(구글 드라이브 공유 링크).', searchMaterial: '코스·교재·단원·제목', allCourses: '전체 코스',
  noMaterialMatch: '조건에 맞는 자료가 없습니다.', noMaterialRead: '아직 등록된 자료가 없습니다.', noMaterial: "아직 등록된 자료가 없습니다. '자료 추가'로 드라이브 링크를 넣으세요.",
  confirmDeleteMaterial: "'{title}' 자료를 목차에서 지울까요? (드라이브 파일은 그대로)",
  kind_book: '교재', kind_worksheet: '워크시트', kind_slides: '슬라이드', kind_audio: '음성', kind_video: '영상', kind_test: '시험지', kind_answer: '정답지', kind_other: '기타',
  // 결석
  absences: '결석 신청', absencesSub: '학생 포털에서 낸 신청 · 처리는 인트라넷(직원·매니저)', processInIntranet: '처리하기 (인트라넷) ›', absencesSubDecide: '학생 포털에서 낸 신청 · 사유를 보고 승인·반려(인트라넷과 같은 처리)', openInIntranet: '인트라넷에서 보기 ›', pendingTab: '처리 전', noPendingAbsence: '처리할 결석 신청이 없습니다.', approve: '승인', reject: '반려', memoPlaceholder: '처리 메모 (선택, 학생 포털에 보임)', memoLabel: '처리 메모', reasonLabel: '사유', sentAt: '신청 {at}', sentSameDay: '결석일 당일 신청', sentAfter: '결석일 뒤 신청', approvedOne: '{name} 결석 신청을 승인했습니다.', rejectedOne: '{name} 결석 신청을 반려했습니다.', alreadyDecided: '이미 처리된 신청입니다.', today: '오늘', tomorrow: '내일', days7: '7일',
  noAbsence: '이 기간에 결석 신청이 없습니다.', allDay: '종일', periodsLabel: '{p}교시', absencesNear: '결석 신청 (지난 3주 ~ 다음 1주)',
  abs_sick: '병결', abs_official: '공결', abs_personal: '개인',
  st_pending: '처리 전', st_approved: '인정', st_rejected: '반려',
  // 더보기
  more: '더보기', manage: '관리 (매니저·직원)', testTypes: '시험 종류 · CEFR 대응', staffList: '강사 목록',
  classSection: '수업', attendanceMenu: '출석 체크 (날짜·수업별)', attSummaryMenu: '출석 확인 · 사유별 합계', unexcusedMenu: '무단결석 목록 (패널티 승인은 인트라넷)', absencesMenu: '결석 신청 (날짜별, 종류·처리 상태)', planned: '준비 중',
  p_appr: '결석 신청 승인', p_appr_why: '직원·매니저는 결석 신청 화면에서 바로 승인·반려한다(11/9). 인트라넷 처리와 같다',
  p_rep: '그로스 리포트 · Daily Recall · IELTS 기록', p_rep_why: '스피킹 리포트 사이트 연결 방식 결정 뒤',
  p_rec: '녹음', p_rec_why: '보관 기간 결정 뒤',
  p_chg: '수업 변경 · 옵션 클래스', p_chg_why: '스케줄러용. 업체 시간표 연결 뒤',
  notReady: '준비 중인 화면입니다.', noPage: '없는 화면', attendance: '출석 체크',
  // 출석
  mineOnly: '내 수업만', noSessions: '이 날 수업이 없습니다.', noMine: '이 날 내 수업이 없습니다.',
  att_AT: '출석', att_AB: '결석', att_TA: '지각', att_none: '미체크',
  checkedOf: '{c}/{n} 체크', absentN: '결석 {n}', lateN: '지각 {n}', kind_1: '1:1', kind_G: '그룹', minutesN: '{n}분',
  markAll: '남은 {n}명 모두 출석', lateMin: '지각 분', excused: '사유 인정', checkedBy: '{name} · {time}',
  closed: '마감', closeDay: '{campus} 마감', reopenDay: '{campus} 마감 되돌리기', closedBy: '{campus} 마감 · {name} {time}',
  confirmClose: '{day} {campus} 출석을 마감할까요? 마감하면 매니저가 되돌리기 전까지 고칠 수 없습니다.', confirmReopen: '{day} {campus} 마감을 되돌릴까요?',
  closedNote: '마감된 날입니다. 고치려면 매니저가 마감을 되돌립니다.', futureNote: '수업 날짜가 되면 입력합니다.',
  readOnlyNote: '이 수업의 강사·체커·매니저가 입력합니다.', noSession: '수업을 찾을 수 없습니다.', absenceReq: '결석 신청', backToList: '수업 목록',
  prevDay: '전날', nextDay: '다음 날', holidayOn: '휴일: {name}',
  attSummary: '출석 확인', range7: '최근 7일', range14: '최근 14일', rangeMonth: '이번 달', unexcusedOnly: '무단결석만',
  sumLine: '출석 {at} · 결석 {ab} · 지각 {ta}', unexcusedN: '무단 {n}', unexcusedWord: '무단', unexcusedTitle: '무단결석 목록', excusedN: '사유 인정 {n}', sickN: '병결 {n}', officialN: '공결 {n}', personalN: '개인 {n}', notCheckedN: '미체크 {n}', lateMinN: '{n}분 지각',
  noSummary: '이 기간에 출석 기록이 없습니다.', noUnexcused: '이 기간에 무단결석이 없습니다.', unexcusedDef: '무단: 사유 인정도, 그날 승인된 결석 신청도 없는 결석', penaltiesInIntranet: '패널티 승인 (인트라넷) ›',
  // 수업 관리
  classesOn: '{day} 수업', byClass: '수업으로 고르기', allStudentsOn: '그날 재학생 전체', scheduleMenu: '수업 관리 (만들기·복사)', classroomsMenu: '교실', manageClasses: '수업 관리 (스케줄러·매니저)', schedule: '수업 관리',
  addSession: '수업 추가', startTime: '시작', minutes: '분', kindLabel: '종류', subject: '과목', teacher: '강사', subTeacher: '보조 강사', classroom: '교실', none: '없음',
  pickStudents: '학생 ({n}명 선택)', noStudentsOn: '그날 재학생이 없습니다.', createSession: '수업 만들기', created: '수업을 만들었습니다.',
  copyDay: '이 날 수업 복사', copyNextDay: '다음 날', copyNextWeek: '다음 주 같은 요일', copyWeekdays: '다음 평일 {n}일', copyRun: '복사', copiedN: '수업 {n}개를 만들었습니다(휴일·마감된 날·이미 있는 수업은 건너뜀).',
  confirmDeleteSession: '{time} {room} 수업을 지울까요? 학생 출석 행도 같이 지워집니다.', deleteSession: '수업 지우기', addStudent: '학생 추가', removeStudent: '빼기', pickStudent2: '학생 고르기…',
  confirmRemoveStudent: '{name}을(를) 이 수업에서 뺄까요?', classroomList: '교실 목록', addClassroom: '교실 추가', roomNum: '교실 번호', building: '건물', floor: '층', capacity: '정원', inactive: '안 씀', activate: '다시 쓰기', deactivate: '안 쓰기', noClassrooms: '등록된 교실이 없습니다.',
  attendance4w: '출석 (최근 4주)', noAttendance: '출석 기록이 없습니다.', allPresent: '결석·지각 없음', seeSummary: '출석 확인',
  // 성적 읽기만·내부 공지
  scoresReadOnly: '성적 입력은 강사·매니저가 합니다.', notices: '내부 공지', noticesMenu: '내부 공지 (인트라넷과 같은 공지)', noNotices: '게시 중인 공지가 없습니다.', pinned: '고정',
  // 시험 종류
  testTypesSub: 'CEFR은 JIC 기준 추정 레벨. 대응 기준·시험 주기는 미결정',
  stopUse: '사용 중지', reuse: '다시 사용', stoppedNote: '사용 중지됨: 새 성적 입력에 나오지 않는다(기존 기록은 그대로).',
  sections: '영역', orAbove: '{lv} 이상', addTestType: '시험 종류 추가', codeEn: '코드(영문)', name: '이름', scale: '척도',
  courseOpt: '해당 코스(일부, 비우면 전체)', min: '최소', max: '최대', step: '단위', sectionsOpt: '영역(쉼표로, 비우면 총점만)',
  scale_band: '밴드', scale_score: '점수', scale_level: '레벨', scale_percent: '퍼센트',
  // 강사 목록
  working: '{n}명 근무', noStaff: '등록된 강사가 없습니다. 업체 포털 교사 목록을 옮겨 오거나 아래에서 추가합니다.',
  nickname: '부르는 이름', vendorNo: '업체 번호', loginAcct: '로그인', yes: '있음', no: '없음', all: '전체',
  retire: '퇴직', rehire: '복직', addTeacher: '강사 추가', vendorTeacherNo: '업체 포털 교사 번호',
  // 오류
  e_login: '이메일 또는 비밀번호가 맞지 않습니다.', e_net: '서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.',
  e_value: '점수가 시험 종류의 범위·단위를 벗어났습니다.', e_section: '이 시험 종류에 없는 영역입니다.', e_date: '오늘 이후 날짜는 넣을 수 없습니다.',
  e_type: '쓰지 않는 시험 종류입니다.', e_rls: '권한이 없습니다.', e_dup: '이미 있는 항목입니다.', e_check: '입력 형식이 맞지 않습니다.',
  e_closed: '마감된 날이라 고칠 수 없습니다.', e_future: '앞날은 입력할 수 없습니다.', e_manager: '매니저·직원만 바꿀 수 있습니다.', e_range: '날짜가 너무 많습니다(31일까지).',
};
export type Key = keyof typeof ko;

const en: Record<Key, string> = {
  appName: 'Teacher Portal',
  portalHome: 'JIC Portal home',
  logout: 'Log out',
  noRole: 'no role',
  loading: 'Loading…',
  loadFail: 'Could not load',
  nav_home: 'Home', nav_students: 'Students', nav_scores: 'Scores', nav_materials: 'Materials', nav_more: 'More',
  role_teacher: 'Teacher', role_checker: 'Checker', role_scheduler: 'Scheduler', role_manager: 'Manager', role_staff: 'Staff', role_office: 'Office', role_admin: 'Admin',
  notConfigured: 'Supabase address is not set (see apps/teacher/.env.example).',
  meFail: 'Could not load your account',
  notTeacher: 'This is not a Teacher Portal account. You need a teacher, checker, scheduler or manager role (ask the admin).',
  email: 'Email', password: 'Password', login: 'Log in', checking: 'Checking…',
  loginNote: 'Same login system as the admin portal. Accounts are issued by the admin.',
  hello: 'Hi, {name}',
  todayClass: "Today's classes · Attendance",
  noClassToday: 'No classes today.', myClassesToday: 'My classes: {n}', uncheckedN: '{n} not checked', openAttendance: 'Attendance check',
  todayAbsences: "Today's absence requests", byDate: 'By date', noAbsenceToday: 'No absence requests today.',
  students: 'Students', seeAll: 'See all', current: 'Current', arriving30: 'Arriving in 30 days',
  recentScores: 'Recently entered scores', enterScores: 'Enter scores', noScores: 'No scores entered yet.',
  holidays14: 'Holidays (next 2 weeks)', hol_public: 'Public holiday', hol_school: 'School holiday',
  people: '{n}', searchStudent: 'Name, student no., nationality, course', allCampuses: 'All campuses', noStudent: 'No matching students.',
  notCurrent: 'Not a current or upcoming student.', studentList: 'Student list', list: 'List',
  enrollment: 'Enrollment', campus: 'Campus', course: 'Course', dorm: 'Dorm', period: 'Period', batch: 'Batch',
  scoreRecords: 'Score records', cefrNote: 'CEFR is a JIC estimate', noRecords: 'No records.',
  date: 'Date', section: 'Section', score: 'Score', by: 'By', total: 'Overall', delete: 'Delete',
  confirmDeleteScore: 'Delete {name} {section} {value} ({date})?',
  pickStudent: 'Choose a student', change: 'Change', searchNameNo: 'Name or student no.', noMatch: 'No matching student.',
  points: 'Scores', recent30: 'Last 30 entries', test: 'Test', memo: 'Note', optional: 'optional', save: 'Save', saving: 'Saving…',
  needOneScore: 'Enter at least one score.', noTestTypes: "No test types available. A manager adds them in 'More › Test types'.",
  chartCaption: '{name} overall · {n} tests', chartRef: ' · dashed lines = CEFR minimum (JIC estimate)',
  manyAtOnce: 'Many at once', oneByOne: 'One by one', batchScores: 'Enter scores for many', batchSub: 'Enter one test for a list of students',
  rangeNote: '{min}–{max}, step {step}. Empty boxes are not saved.', studentsOn: 'Students on {date}', alreadyIn: 'Already entered: {v}',
  memoAll: 'Same note for everyone (optional)', saveN: 'Save {n}', savedN: 'Saved {n}.', badRows: '{n} boxes are outside the range or step (red).',
  materials: 'Class materials', materialsSub: 'Files stay on the shared Drive; this is the index with links', addMaterial: 'Add material', close: 'Close',
  textbook: 'Textbook', unit: 'Unit', kind: 'Type', title: 'Title', driveLink: 'Drive link', add: 'Add',
  linkHttps: 'The link must start with https:// (Google Drive share link).', searchMaterial: 'Course, textbook, unit, title', allCourses: 'All courses',
  noMaterialMatch: 'No matching materials.', noMaterialRead: 'No materials yet.', noMaterial: "No materials yet. Use 'Add material' to add a Drive link.",
  confirmDeleteMaterial: "Remove '{title}' from the index? (The Drive file stays.)",
  kind_book: 'Book', kind_worksheet: 'Worksheet', kind_slides: 'Slides', kind_audio: 'Audio', kind_video: 'Video', kind_test: 'Test paper', kind_answer: 'Answer key', kind_other: 'Other',
  absences: 'Absence requests', absencesSub: 'Sent from the student portal · processed in the intranet (staff, managers)', processInIntranet: 'Process in intranet ›', absencesSubDecide: 'Sent from the student portal · read the reason, then approve or reject (same as the intranet)', openInIntranet: 'Open in intranet ›', pendingTab: 'Pending', noPendingAbsence: 'No pending absence requests.', approve: 'Approve', reject: 'Reject', memoPlaceholder: 'Note (optional, shown to the student)', memoLabel: 'Note', reasonLabel: 'Reason', sentAt: 'Sent {at}', sentSameDay: 'sent on the day', sentAfter: 'sent after the day', approvedOne: 'Approved the request from {name}.', rejectedOne: 'Rejected the request from {name}.', alreadyDecided: 'This request was already processed.', today: 'Today', tomorrow: 'Tomorrow', days7: '7 days',
  noAbsence: 'No absence requests in this period.', allDay: 'All day', periodsLabel: 'Period {p}', absencesNear: 'Absence requests (last 3 weeks – next week)',
  abs_sick: 'Sick', abs_official: 'Official', abs_personal: 'Personal',
  st_pending: 'Pending', st_approved: 'Excused', st_rejected: 'Rejected',
  more: 'More', manage: 'Manage (manager · staff)', testTypes: 'Test types · CEFR mapping', staffList: 'Teachers',
  classSection: 'Classes', attendanceMenu: 'Attendance check (by day and class)', attSummaryMenu: 'Attendance view · totals by reason', unexcusedMenu: 'Unexcused absences (penalties are approved in the intranet)', absencesMenu: 'Absence requests (by date, type and status)', planned: 'Coming later',
  p_appr: 'Approve absence requests', p_appr_why: 'Staff and managers approve or reject on the Absence requests page (same as the intranet)',
  p_rep: 'Growth report · Daily Recall · IELTS records', p_rep_why: 'After deciding how to connect the speaking report site',
  p_rec: 'Recordings', p_rec_why: 'After deciding the retention period',
  p_chg: 'Class changes · option classes', p_chg_why: 'For schedulers. After the timetable is connected',
  notReady: 'This screen is not ready yet.', noPage: 'Page not found', attendance: 'Attendance check',
  mineOnly: 'My classes only', noSessions: 'No classes on this day.', noMine: 'You have no classes on this day.',
  att_AT: 'Present', att_AB: 'Absent', att_TA: 'Late', att_none: 'Not checked',
  checkedOf: '{c}/{n} checked', absentN: '{n} absent', lateN: '{n} late', kind_1: '1:1', kind_G: 'Group', minutesN: '{n} min',
  markAll: 'Mark the other {n} present', lateMin: 'Minutes late', excused: 'Excused', checkedBy: '{name} · {time}',
  closed: 'Closed', closeDay: 'Close {campus}', reopenDay: 'Reopen {campus}', closedBy: '{campus} closed · {name} {time}',
  confirmClose: 'Close attendance for {campus} on {day}? It cannot be changed until a manager reopens it.', confirmReopen: 'Reopen {campus} on {day}?',
  closedNote: 'This day is closed. A manager can reopen it.', futureNote: 'You can check attendance on the class day.',
  readOnlyNote: "This class's teacher, checkers and managers enter attendance.", noSession: 'Class not found.', absenceReq: 'Absence request', backToList: 'Class list',
  prevDay: 'Previous day', nextDay: 'Next day', holidayOn: 'Holiday: {name}',
  attSummary: 'Attendance view', range7: 'Last 7 days', range14: 'Last 14 days', rangeMonth: 'This month', unexcusedOnly: 'Unexcused only',
  sumLine: 'Present {at} · Absent {ab} · Late {ta}', unexcusedN: 'Unexcused {n}', unexcusedWord: 'Unexcused', unexcusedTitle: 'Unexcused absences', excusedN: 'Excused {n}', sickN: 'Sick {n}', officialN: 'Official {n}', personalN: 'Personal {n}', notCheckedN: 'Not checked {n}', lateMinN: '{n} min late',
  noSummary: 'No attendance in this period.', noUnexcused: 'No unexcused absences in this period.', unexcusedDef: 'Unexcused: absent with no excuse and no approved absence request that day', penaltiesInIntranet: 'Approve penalties (intranet) ›',
  classesOn: 'Classes on {day}', byClass: 'Pick by class', allStudentsOn: 'All students that day', scheduleMenu: 'Class schedule (create · copy)', classroomsMenu: 'Classrooms', manageClasses: 'Classes (scheduler · manager)', schedule: 'Class schedule',
  addSession: 'Add class', startTime: 'Start', minutes: 'Minutes', kindLabel: 'Type', subject: 'Subject', teacher: 'Teacher', subTeacher: 'Assistant teacher', classroom: 'Classroom', none: 'None',
  pickStudents: 'Students ({n} selected)', noStudentsOn: 'No students enrolled that day.', createSession: 'Create class', created: 'Class created.',
  copyDay: "Copy this day's classes", copyNextDay: 'Next day', copyNextWeek: 'Same day next week', copyWeekdays: 'Next {n} weekdays', copyRun: 'Copy', copiedN: 'Created {n} classes (skipped holidays, closed days and existing classes).',
  confirmDeleteSession: 'Delete the {time} {room} class? Its attendance rows are deleted too.', deleteSession: 'Delete class', addStudent: 'Add student', removeStudent: 'Remove', pickStudent2: 'Choose a student…',
  confirmRemoveStudent: 'Remove {name} from this class?', classroomList: 'Classrooms', addClassroom: 'Add classroom', roomNum: 'Room no.', building: 'Building', floor: 'Floor', capacity: 'Capacity', inactive: 'Not in use', activate: 'Use again', deactivate: 'Stop using', noClassrooms: 'No classrooms yet.',
  attendance4w: 'Attendance (last 4 weeks)', noAttendance: 'No attendance records.', allPresent: 'No absences or lates', seeSummary: 'Attendance view',
  scoresReadOnly: 'Scores are entered by teachers and managers.', notices: 'Internal notices', noticesMenu: 'Internal notices (same as the intranet)', noNotices: 'No notices posted.', pinned: 'Pinned',
  testTypesSub: 'CEFR is a JIC estimate. Mapping and test cycle are not decided yet',
  stopUse: 'Stop using', reuse: 'Use again', stoppedNote: 'Stopped: hidden from new score entry (existing records stay).',
  sections: 'Sections', orAbove: '{lv} from', addTestType: 'Add test type', codeEn: 'Code (English)', name: 'Name', scale: 'Scale',
  courseOpt: 'Course (part of name, blank = all)', min: 'Min', max: 'Max', step: 'Step', sectionsOpt: 'Sections (comma separated, blank = overall only)',
  scale_band: 'Band', scale_score: 'Score', scale_level: 'Level', scale_percent: 'Percent',
  working: '{n} active', noStaff: 'No teachers yet. Import from the old portal or add below.',
  nickname: 'Nickname', vendorNo: 'Old portal no.', loginAcct: 'Login', yes: 'Yes', no: 'No', all: 'All',
  retire: 'Leave', rehire: 'Rejoin', addTeacher: 'Add teacher', vendorTeacherNo: 'Old portal teacher no.',
  e_login: 'Wrong email or password.', e_net: 'Could not reach the server. Try again shortly.',
  e_value: 'The score is outside the range or step for this test type.', e_section: 'This test type has no such section.', e_date: 'Dates after today are not allowed.',
  e_type: 'This test type is not in use.', e_rls: 'You do not have permission.', e_dup: 'Already exists.', e_check: 'The input format is not valid.',
  e_closed: 'This day is closed and cannot be changed.', e_future: 'Future days cannot be entered.', e_manager: 'Only managers and staff can change this.', e_range: 'Too many days (31 at most).',
};

const DICT: Record<Lang, Record<Key, string>> = { ko, en };
const KEY = 'jic-teacher-lang';

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ko' || saved === 'en') return saved;
  } catch { /* 저장소를 못 쓰면 브라우저 언어로 */ }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ko') ? 'ko' : 'en';
}

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'ko', setLang: () => {} });

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, set] = useState<Lang>(initial);
  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = lang === 'ko' ? 'JIC 강사 포털' : 'JIC Teacher Portal';
  }, [lang]);
  const setLang = (l: Lang) => {
    set(l);
    try { localStorage.setItem(KEY, l); } catch { /* 무시 */ }
  };
  return <Ctx.Provider value={{ lang, setLang }}>{children}</Ctx.Provider>;
}

/** t('key', { n: 3 }) → 문구. 현재 언어에 없으면 한국어. */
export function useT() {
  const { lang, setLang } = useContext(Ctx);
  const t = (k: Key, vars?: Record<string, string | number>) => {
    let s = DICT[lang][k] ?? ko[k] ?? k;
    if (vars) for (const [n, v] of Object.entries(vars)) s = s.replace(`{${n}}`, String(v));
    return s;
  };
  return { t, lang, setLang };
}

/** 컴포넌트 밖(오류 문구 변환 등)에서 쓸 때: 지금 저장된 언어로. */
export function tNow(k: Key): string {
  return DICT[initial()][k] ?? ko[k];
}
