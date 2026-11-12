// 메뉴 시험: CL-078 사이드바 1단계 + 페이지 탭(11/12), 지점 직원 아이디 제한(CL-032 '적힌 그대로': 상담·자료·공지만). npm run test 에서 돈다.
import { MENU, PENDING_ROUTES, entryOf, menuFor, screenTitle, staffCanSee, type MenuGroup } from './menu';

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = '') => (cond ? pass++ : fails.push(`${name} ${detail}`));
const entries = (menu: MenuGroup[]) => menu.flatMap((g) => g.items);
const paths = (menu: MenuGroup[]) => entries(menu).flatMap((e) => [e.to, ...(e.tabs ?? []).map((x) => x.to)]);

// 1) CL-078: 사이드바 1단계 순서
ok(
  '사이드바 1단계 13개(CL-078 순서)',
  entries(MENU).map((e) => e.key).join(',') ===
    'menu.home,menu.consultStart,menu.play,menu.consultMaterials,menu.campuses,menu.aboutJic,menu.coursesTop,menu.studentLife,menu.quote,menu.vacancy,menu.costsRegister,menu.contact,menu.students',
  entries(MENU).map((e) => e.key).join(','),
);
ok('메뉴 주소는 첫 탭 주소', entries(MENU).every((e) => !e.tabs || e.tabs[0].to === e.to));
ok('캠프 메뉴 삭제(CL-077)', !paths(MENU).includes('/camps'));
ok('캠퍼스 탭: 캠퍼스 · 캠퍼스 한눈에 보기(CL-079)', MENU.flatMap((g) => g.items).find((e) => e.key === 'menu.campuses')?.tabs?.map((x) => x.to).join() === '/campuses,/campuses/compare');
ok('상담 자료 탭 4개', entryOf('/resources')?.tabs?.length === 4);

// 2) 주소 → 사이드바 메뉴(탭·상세 화면)
const at = (p: string) => entryOf(p)?.key ?? 'null';
for (const [p, key] of [
  ['/', 'menu.home'], ['/evidence', 'menu.consultMaterials'], ['/faq', 'menu.consultMaterials'], ['/campuses/premium', 'menu.campuses'],
  ['/campuses/compare', 'menu.campuses'], ['/campuses/camp', 'menu.campuses'], ['/about/teachers', 'menu.aboutJic'], ['/courses/premium-tep', 'menu.coursesTop'],
  ['/day', 'menu.coursesTop'], ['/life/activities', 'menu.studentLife'], ['/register', 'menu.costsRegister'], ['/notices/12', 'menu.contact'],
  ['/visit', 'menu.contact'], ['/students/abc', 'menu.students'], ['/quote?c=1', 'menu.quote'], ['/nowhere', 'null'],
] as const) ok(`메뉴 찾기 ${p}`, at(p) === key, at(p));

// 3) 준비 중·2차 화면과 메뉴 이름
ok('준비 중 경로는 인보이스만', PENDING_ROUTES.map((x) => x.to).join() === '/invoices', PENDING_ROUTES.map((x) => x.to).join());
ok('화면 이름(탭 이름 우선)', screenTitle('/about/baguio') === '왜 바기오·주변' && screenTitle('/resources') === '다운로드 센터' && screenTitle('/campuses/compare') === '캠퍼스 한눈에 보기' && screenTitle('/x') === '/x');

// 4) 직원이 여는 주소
for (const p of ['/', '/consult', '/play', '/resources', '/evidence', '/playbook', '/faq', '/notices', '/notices/12', '/newsletter', '/account', '/courses/premium-tep'])
  ok(`직원 열림 ${p}`, staffCanSee(p));
for (const p of ['/courses', '/campuses', '/campuses/premium', '/campuses/compare', '/campuses/camp', '/about/baguio', '/day', '/camps', '/life/calendar', '/quote', '/tuition', '/vacancy', '/register', '/invoices', '/visit', '/contacts', '/students', '/consultation', '/courses/a/b'])
  ok(`직원 막힘 ${p}`, !staffCanSee(p));

// 5) 대표·JIC 직원은 메뉴 그대로
ok('대표 메뉴 = 전체', menuFor(false) === MENU);

// 6) 직원 메뉴
const staffMenu = menuFor(true);
const sp = paths(staffMenu);
ok('직원 메뉴: 모두 열리는 주소', sp.every(staffCanSee), sp.join(','));
for (const p of ['/', '/consult', '/resources', '/faq', '/notices', '/newsletter']) ok(`직원 메뉴에 ${p}`, sp.includes(p));
for (const p of ['/courses', '/day', '/campuses', '/tuition', '/quote', '/vacancy', '/visit', '/contacts', '/students']) ok(`직원 메뉴에 없음 ${p}`, !sp.includes(p));
ok('직원 메뉴: 빈 묶음·빈 탭 없음', staffMenu.every((g) => g.items.length > 0) && entries(staffMenu).every((e) => !e.tabs || e.tabs.length > 0));
ok('직원 메뉴: 홈·상담 시작·JIC Play·상담 자료·학교와 소통', entries(staffMenu).map((e) => e.key).join(',') === 'menu.home,menu.consultStart,menu.play,menu.consultMaterials,menu.contact', entries(staffMenu).map((e) => e.key).join(','));
ok('직원 학교와 소통 탭: 공지·뉴스레터만', entries(staffMenu).find((e) => e.key === 'menu.contact')?.tabs?.map((x) => x.to).join() === '/notices,/newsletter');
ok('대표 메뉴는 그대로(직원 메뉴를 만들어도 원본이 바뀌지 않음)', paths(MENU).includes('/tuition') && paths(MENU).includes('/visit') && entryOf('/notices')?.tabs?.length === 4);

console.log(`메뉴 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
if (fails.length) process.exit(1);
