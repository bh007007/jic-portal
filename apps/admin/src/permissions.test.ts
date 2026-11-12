/** 권한표 화면 규칙 시험(src/permissions.ts). 실행: npm --workspace apps/admin run test (빌드할 때도 함께 돈다) */
import { approvalCell, canManageGrant, grantCampuses, grantKinds, menuCell, menuRow, MENU_CELLS, type Me } from './permissions';

let pass = 0;
const fails: string[] = [];
const expect = (name: string, cond: boolean, detail?: unknown) => (cond ? pass++ : fails.push(`${name} ${detail === undefined ? '' : JSON.stringify(detail)}`));

// 메뉴 칸: 저장 값과 오가도 같다
for (const [cell] of MENU_CELLS) expect(`메뉴 칸 왕복 ${cell || '-'}`, menuCell(menuRow(cell)) === cell, menuRow(cell));
expect('입력은 보기를 포함', menuRow('Ic')?.can_view === true && menuRow('Ic')?.can_input === true && menuRow('Ic')?.campus_scoped === true);
expect('보기 없이 입력만인 줄은 없음 칸', menuCell({ can_view: false, can_input: true, campus_scoped: false }) === '');
expect('승인 칸', approvalCell(null) === '' && approvalCell({ campus_scoped: true }) === 'campus' && approvalCell({ campus_scoped: false }) === 'all');

const admin: Me = { id: 'a', admin: true, directorCampuses: [] };
const dir: Me = { id: 'd', admin: false, directorCampuses: ['premium'] };
const office: Me = { id: 'o', admin: false, directorCampuses: [] };
expect('관리자: 모든 캠퍼스 포함', grantCampuses(admin).join() === ',Challenger,Premium,MCO');
expect('센터장: 자기 캠퍼스만', grantCampuses(dir).join() === 'Premium');
expect('오피스: 줄 캠퍼스 없음', grantCampuses(office).length === 0);
const kinds = [{ kind: 'nonacademic' }, { kind: 'grant_roles' }];
expect('센터장: 역할 주기 빠짐', grantKinds(kinds, dir).map((k) => k.kind).join() === 'nonacademic');
expect('관리자: 역할 주기 포함', grantKinds(kinds, admin).length === 2);

const g = (user_id: string, kind: string, campus: string) => ({ user_id, kind, campus });
expect('관리자: 아무 줄이나', canManageGrant(g('x', 'grant_roles', ''), admin));
expect('센터장: 자기 캠퍼스 남의 줄', canManageGrant(g('x', 'nonacademic', 'Premium'), dir));
expect('센터장: 다른 캠퍼스 불가', !canManageGrant(g('x', 'nonacademic', 'Challenger'), dir));
expect('센터장: 모든 캠퍼스 줄 불가', !canManageGrant(g('x', 'nonacademic', ''), dir));
expect('센터장: 자기 줄 불가', !canManageGrant(g('d', 'nonacademic', 'Premium'), dir));
expect('센터장: 역할 주기 불가', !canManageGrant(g('x', 'grant_roles', 'Premium'), dir));
expect('오피스: 불가', !canManageGrant(g('x', 'nonacademic', 'Premium'), office));

if (fails.length) {
  for (const f of fails) console.log('✗', f);
  console.log(`권한표 화면 규칙: 통과 ${pass}, 실패 ${fails.length}`);
  process.exit(1);
}
console.log(`권한표 화면 규칙: 통과 ${pass}, 실패 0`);
