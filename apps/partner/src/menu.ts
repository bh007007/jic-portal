import type { MsgKey } from './i18n';

/**
 * 에이전시 포털 메뉴(CL-037, 11/10 결정). 에이전시가 하는 일(상담 → 입학 진행 → 소통) 순서.
 * ready: 화면이 있음. 없으면 '준비 중' 화면(원칙 C8: 운영 전 기능은 준비 중으로 표시). phase2: 2차(학생 데이터가 걸리는 화면).
 * 내용이 비어 있는 새 화면(JIC Play·근거 자료·플레이북·FAQ·JIC 소개·학생의 하루·주니어·가족 캠프·학생 생활·학비표·담당자 연락처)은
 * 시제품 V74를 받아 옮긴다(CL-030·039). 학비표는 관리자 포털 가격표에서 읽는다(CL-038).
 */
export interface MenuItem {
  to: string;
  key: MsgKey;
  ready?: boolean;
  phase2?: boolean;
}
export interface MenuGroup {
  key: MsgKey;
  /** 바로 가는 메뉴(홈·My Students) */
  to?: string;
  phase2?: boolean;
  /** 묶음 안의 메뉴. 소제목이 있는 묶음은 sub 로 */
  items?: (MenuItem | { key: MsgKey; sub: MenuItem[] })[];
}

export const MENU: MenuGroup[] = [
  { key: 'menu.home', to: '/' },
  {
    key: 'menu.consult',
    items: [
      { to: '/consult', key: 'menu.consultStart', ready: true },
      { to: '/play', key: 'menu.play' },
      {
        key: 'menu.consultMaterials',
        sub: [
          { to: '/resources', key: 'menu.downloads', ready: true },
          { to: '/evidence', key: 'menu.evidence' },
          { to: '/playbook', key: 'menu.playbook' },
          { to: '/faq', key: 'menu.faq' },
        ],
      },
    ],
  },
  {
    key: 'menu.about',
    items: [
      { to: '/campuses', key: 'menu.campuses', ready: true },
      {
        key: 'menu.aboutJic',
        sub: [
          { to: '/about/baguio', key: 'menu.baguio' },
          { to: '/about/why-jic', key: 'menu.whyJic' },
          { to: '/about/teachers', key: 'menu.teachers' },
          { to: '/about/school', key: 'menu.school' },
        ],
      },
    ],
  },
  {
    key: 'menu.coursesLife',
    items: [
      { to: '/courses', key: 'menu.courses', ready: true },
      { to: '/day', key: 'menu.day' },
      { to: '/camps', key: 'menu.camps' },
      {
        key: 'menu.studentLife',
        sub: [
          { to: '/life/calendar', key: 'menu.calendar' },
          { to: '/life/activities', key: 'menu.activities' },
        ],
      },
    ],
  },
  {
    key: 'menu.costs',
    items: [
      { to: '/quote', key: 'menu.quote', ready: true },
      { to: '/tuition', key: 'menu.tuition', ready: true },
      { to: '/vacancy', key: 'menu.vacancy', ready: true },
      { to: '/register', key: 'menu.register', ready: true },
      { to: '/invoices', key: 'menu.invoices', phase2: true },
    ],
  },
  {
    key: 'menu.contact',
    items: [
      { to: '/notices', key: 'menu.notices', ready: true },
      { to: '/newsletter', key: 'menu.newsletter', ready: true },
      { to: '/visit', key: 'menu.visit', ready: true },
      { to: '/contacts', key: 'menu.contacts' },
    ],
  },
  { key: 'menu.students', to: '/students', phase2: true },
];

/** '준비 중'·'2차' 화면 주소와 제목(App 의 경로로 쓴다) */
export const PENDING_ROUTES: MenuItem[] = MENU.flatMap((g) => [
  ...(g.items ?? []).flatMap((it) => ('sub' in it ? it.sub : [it])),
]).filter((it) => !it.ready);

/**
 * 지점 직원 아이디가 볼 수 있는 화면(CL-032, 11/10 레오님 결정 '적힌 그대로': 상담·자료·공지, 1차).
 * 소개·코스·생활·비용·등록·방문 신청·My Students·직원 관리는 지점 대표만. 학비표·방문 신청은 DB에서도 막는다(20261110193000_agency_staff.sql).
 * 상담 결과에서 여는 코스 상세(/courses/:id)는 상담의 일부라 연다(코스 목록 메뉴는 대표만).
 */
export const STAFF_PATHS = ['/consult', '/play', '/resources', '/evidence', '/playbook', '/faq', '/notices', '/newsletter', '/account'];
export const staffCanSee = (path: string) =>
  path === '/' || STAFF_PATHS.some((p) => path === p || path.startsWith(p + '/')) || /^\/courses\/[^/]+$/.test(path);

/** 지점 직원이면 볼 수 있는 메뉴만 남긴다(빈 묶음·소제목은 뺀다) */
export function menuFor(agencyStaff: boolean): MenuGroup[] {
  if (!agencyStaff) return MENU;
  const keep = (it: MenuItem) => staffCanSee(it.to) && !/^\/courses\/?$/.test(it.to);
  type Entry = NonNullable<MenuGroup['items']>[number];
  return MENU.flatMap<MenuGroup>((g) => {
    if (g.to) return staffCanSee(g.to) ? [g] : [];
    const items = (g.items ?? []).flatMap<Entry>((it) => {
      if (!('sub' in it)) return keep(it) ? [it] : [];
      const sub = it.sub.filter(keep);
      return sub.length ? [{ ...it, sub }] : [];
    });
    return items.length ? [{ ...g, items }] : [];
  });
}
