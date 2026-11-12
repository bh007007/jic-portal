import { t, type MsgKey } from './i18n';

/**
 * 에이전시 포털 메뉴(CL-037 내용, CL-078 보여 주는 방식 11/12).
 * 사이드바에는 1단계만: 홈 · 상담 시작 · JIC Play · 상담 자료 · 캠퍼스 · JIC 소개 · 코스 · 학생 생활 · 견적 · 기숙사 공실 · 비용·등록 · 학교와 소통 · My Students(2차).
 * 2단계는 그 페이지 안의 탭(tabs, 시제품 V74 방식). 묶음 제목(상담·소개·코스·생활·비용·등록)은 시제품처럼 작은 글씨로만 둔다.
 * ready: 화면이 있음. 없으면 '준비 중' 화면(원칙 C8). phase2: 2차(학생 데이터가 걸리는 화면).
 * 캠프는 '코스·생활' 메뉴에서 빠지고 캠퍼스 목록의 '캠프' 카드로 들어간다(CL-077). 학비표는 관리자 포털 가격표에서 읽는다(CL-038).
 */
export interface MenuItem {
  to: string;
  key: MsgKey;
  ready?: boolean;
  phase2?: boolean;
}
export interface MenuEntry extends MenuItem {
  /** 페이지 안 탭(2단계). 첫 탭이 이 메뉴의 주소다 */
  tabs?: MenuItem[];
  /** 탭 말고도 이 메뉴에 속하는 주소의 앞부분(상세 화면: /campuses/premium, /courses/a, /notices/12) */
  prefixes?: string[];
}
export interface MenuGroup {
  /** 묶음 제목(없으면 제목 없이 간격만) */
  key?: MsgKey;
  items: MenuEntry[];
}

const tab = (to: string, key: MsgKey, extra: Partial<MenuItem> = {}): MenuItem => ({ to, key, ready: true, ...extra });

export const MENU: MenuGroup[] = [
  { items: [{ to: '/', key: 'menu.home', ready: true }] },
  {
    key: 'menu.consult',
    items: [
      { to: '/consult', key: 'menu.consultStart', ready: true },
      { to: '/play', key: 'menu.play', ready: true },
      {
        to: '/resources', key: 'menu.consultMaterials', ready: true,
        tabs: [tab('/resources', 'menu.downloads'), tab('/evidence', 'menu.evidence'), tab('/playbook', 'menu.playbook'), tab('/faq', 'menu.faq')],
      },
    ],
  },
  {
    key: 'menu.about',
    items: [
      {
        to: '/campuses', key: 'menu.campuses', ready: true,
        tabs: [tab('/campuses', 'menu.campusList'), tab('/campuses/compare', 'menu.campusCompare')],
        prefixes: ['/campuses/'],
      },
      {
        to: '/about/baguio', key: 'menu.aboutJic', ready: true,
        tabs: [tab('/about/baguio', 'menu.baguio'), tab('/about/why-jic', 'menu.whyJic'), tab('/about/teachers', 'menu.teachers'), tab('/about/school', 'menu.school')],
      },
    ],
  },
  {
    key: 'menu.coursesLife',
    items: [
      { to: '/courses', key: 'menu.coursesTop', ready: true, tabs: [tab('/courses', 'menu.courses'), tab('/day', 'menu.day')], prefixes: ['/courses/'] },
      { to: '/life/calendar', key: 'menu.studentLife', ready: true, tabs: [tab('/life/calendar', 'menu.calendar'), tab('/life/activities', 'menu.activities')] },
    ],
  },
  {
    key: 'menu.costs',
    items: [
      { to: '/quote', key: 'menu.quote', ready: true },
      { to: '/vacancy', key: 'menu.vacancy', ready: true },
      {
        to: '/tuition', key: 'menu.costsRegister', ready: true,
        tabs: [tab('/tuition', 'menu.tuition'), tab('/register', 'menu.register'), tab('/invoices', 'menu.invoices', { ready: false, phase2: true })],
      },
    ],
  },
  {
    items: [
      {
        to: '/notices', key: 'menu.contact', ready: true,
        tabs: [tab('/notices', 'menu.notices'), tab('/newsletter', 'menu.newsletter'), tab('/visit', 'menu.visit'), tab('/contacts', 'menu.contacts')],
        prefixes: ['/notices/'],
      },
      { to: '/students', key: 'menu.students', phase2: true, prefixes: ['/students/'] },
    ],
  },
];

/** 메뉴와 탭의 모든 화면(주소가 같은 것은 한 번) */
export function allScreens(menu: MenuGroup[] = MENU): MenuItem[] {
  const seen = new Set<string>();
  return menu.flatMap((g) => g.items.flatMap((e) => [e, ...(e.tabs ?? [])])).filter((it) => !seen.has(it.to) && !!seen.add(it.to));
}

/** '준비 중'·'2차' 화면 주소와 제목(App 의 경로로 쓴다). My Students 는 2차 예시 화면이 따로 있다 */
export const PENDING_ROUTES: MenuItem[] = allScreens().filter((it) => !it.ready && it.to !== '/students');

/** 지금 주소가 속한 사이드바 메뉴(탭 주소 그대로, 또는 상세 화면 앞부분). 없으면 null */
export function entryOf(path: string, menu: MenuGroup[] = MENU): MenuEntry | null {
  const p = path.split(/[?#]/)[0];
  const entries = menu.flatMap((g) => g.items);
  return (
    entries.find((e) => e.to === p || (e.tabs ?? []).some((x) => x.to === p)) ??
    entries.find((e) => (e.prefixes ?? []).some((pre) => p.startsWith(pre))) ??
    null
  );
}

/**
 * 지점 직원 아이디가 볼 수 있는 화면(CL-032, 11/10 레오님 결정 '적힌 그대로': 상담·자료·공지, 1차).
 * 소개·코스·생활·비용·등록·방문 신청·My Students·직원 관리는 지점 대표만. 학비표·방문 신청은 DB에서도 막는다(20261110193000_agency_staff.sql).
 * 상담 결과에서 여는 코스 상세(/courses/:id)는 상담의 일부라 연다(코스 목록 메뉴는 대표만).
 */
export const STAFF_PATHS = ['/consult', '/play', '/resources', '/evidence', '/playbook', '/faq', '/notices', '/newsletter', '/account'];
export const staffCanSee = (path: string) =>
  path === '/' || STAFF_PATHS.some((p) => path === p || path.startsWith(p + '/')) || /^\/courses\/[^/]+$/.test(path);

/** 지점 직원이면 볼 수 있는 메뉴·탭만 남긴다. 첫 탭이 막히면 볼 수 있는 첫 탭으로 간다. 빈 메뉴·묶음은 뺀다 */
export function menuFor(agencyStaff: boolean): MenuGroup[] {
  if (!agencyStaff) return MENU;
  const keep = (to: string) => staffCanSee(to) && !/^\/courses\/?$/.test(to);
  return MENU.flatMap<MenuGroup>((g) => {
    const items = g.items.flatMap<MenuEntry>((e) => {
      if (!e.tabs) return keep(e.to) ? [e] : [];
      const tabs = e.tabs.filter((x) => keep(x.to));
      return tabs.length ? [{ ...e, to: tabs[0].to, tabs }] : [];
    });
    return items.length ? [{ ...g, items }] : [];
  });
}

/** 포털 안 주소 → 메뉴 이름(예: /about/baguio → 왜 바기오·주변). 메뉴에 없으면 주소 그대로(플레이북 '보여 줄 화면', FAQ '관련 화면') */
export function screenTitle(path: string): string {
  const p = path.split(/[?#]/)[0];
  const tabHit = MENU.flatMap((g) => g.items.flatMap((e) => e.tabs ?? [])).find((it) => it.to === p);
  const hit = tabHit ?? allScreens().find((it) => it.to === p);
  return hit ? t(hit.key) : path;
}
