// 지점 직원 아이디 메뉴 제한 시험(CL-032, 11/10 레오님 결정 '적힌 그대로': 상담·자료·공지만). npm run test 에서 돈다.
import { MENU, menuFor, staffCanSee, type MenuGroup } from './menu';

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, detail = '') => (cond ? pass++ : fails.push(`${name} ${detail}`));
const paths = (menu: MenuGroup[]) =>
  menu.flatMap((g) => (g.to ? [g.to] : (g.items ?? []).flatMap((it) => ('sub' in it ? it.sub.map((x) => x.to) : [it.to]))));

// 1) 직원이 여는 주소
for (const p of ['/', '/consult', '/play', '/resources', '/evidence', '/playbook', '/faq', '/notices', '/notices/12', '/newsletter', '/account', '/courses/premium-tep'])
  ok(`직원 열림 ${p}`, staffCanSee(p));
for (const p of ['/courses', '/campuses', '/campuses/premium', '/about/baguio', '/day', '/camps', '/life/calendar', '/quote', '/tuition', '/vacancy', '/register', '/invoices', '/visit', '/contacts', '/students', '/consultation', '/courses/a/b'])
  ok(`직원 막힘 ${p}`, !staffCanSee(p));

// 2) 대표·JIC 직원은 메뉴 그대로
ok('대표 메뉴 = 전체', menuFor(false) === MENU);

// 3) 직원 메뉴
const staffMenu = menuFor(true);
const sp = paths(staffMenu);
ok('직원 메뉴: 모두 열리는 주소', sp.every(staffCanSee), sp.join(','));
for (const p of ['/', '/consult', '/resources', '/notices', '/newsletter']) ok(`직원 메뉴에 ${p}`, sp.includes(p));
for (const p of ['/courses', '/campuses', '/tuition', '/quote', '/vacancy', '/visit', '/students']) ok(`직원 메뉴에 없음 ${p}`, !sp.includes(p));
ok('직원 메뉴: 빈 묶음 없음', staffMenu.every((g) => g.to || (g.items ?? []).length > 0) && staffMenu.every((g) => (g.items ?? []).every((it) => !('sub' in it) || it.sub.length > 0)));
ok('직원 메뉴 묶음: 홈·상담·학교와 소통', staffMenu.map((g) => g.key).join(',') === 'menu.home,menu.consult,menu.contact', staffMenu.map((g) => g.key).join(','));
ok('대표 메뉴는 그대로(직원 메뉴를 만들어도 원본이 바뀌지 않음)', paths(MENU).includes('/tuition') && paths(MENU).includes('/courses'));

console.log(`직원 메뉴 시험: 통과 ${pass}, 실패 ${fails.length}`);
for (const f of fails) console.log('  실패:', f);
if (fails.length) process.exit(1);
