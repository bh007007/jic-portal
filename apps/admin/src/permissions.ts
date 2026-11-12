/**
 * 권한표 화면의 규칙(순수 함수). DB 는 20261112110000_permissions_foundation.sql, 설계는 docs/permissions.md(11/12 결정 6가지).
 * 막는 것은 DB 정책이고, 여기 규칙은 화면이 고칠 수 없는 칸·단추를 미리 끄는 데만 쓴다.
 */

/** 표의 열 순서(원칙 C5 역할 + 11/12 센터장) */
export const PERM_ROLES = ['teacher', 'checker', 'scheduler', 'manager', 'office', 'director', 'admin'] as const;
export type PermRole = (typeof PERM_ROLES)[number];
export const ROLE_LABEL: Record<string, string> = {
  teacher: '강사',
  checker: '체커',
  scheduler: '스케줄러',
  manager: '매니저',
  office: '오피스',
  director: '센터장',
  admin: '관리자',
};
/** 맡은 캠퍼스 값(user_roles.campus 와 같은 표기, 비교는 대소문자 무시). '' = 모든 캠퍼스 */
export const CAMPUSES = ['', 'Challenger', 'Premium', 'MCO'];
export const campusLabel = (c: string) => c || '모든 캠퍼스';

export interface RolePermission { menu_group: string; role: string; can_view: boolean; can_input: boolean; campus_scoped: boolean; updated_at?: string; updated_by?: string | null }
export interface ApprovalDefault { kind: string; role: string; campus_scoped: boolean }
export interface ApprovalGrant { id: string; user_id: string; kind: string; campus: string; allow: boolean; created_at: string; granted_by: string | null }

/** 메뉴 권한 칸: '' 없음, V 보기, I 입력(보기 포함), 끝에 c 가 붙으면 맡은 캠퍼스만 */
export type MenuCell = '' | 'V' | 'Vc' | 'I' | 'Ic';
export const MENU_CELLS: [MenuCell, string][] = [
  ['', '-'],
  ['V', '보기'],
  ['Vc', '보기 · 캠퍼스'],
  ['I', '입력'],
  ['Ic', '입력 · 캠퍼스'],
];
export function menuCell(p?: Pick<RolePermission, 'can_view' | 'can_input' | 'campus_scoped'> | null): MenuCell {
  if (!p || !p.can_view) return '';
  return `${p.can_input ? 'I' : 'V'}${p.campus_scoped ? 'c' : ''}` as MenuCell;
}
/** 칸 값 → 저장할 값. '' 이면 null(줄을 지운다) */
export function menuRow(cell: MenuCell): Pick<RolePermission, 'can_view' | 'can_input' | 'campus_scoped'> | null {
  if (!cell) return null;
  return { can_view: true, can_input: cell[0] === 'I', campus_scoped: cell.endsWith('c') };
}

/** 승인 기본값 칸: '' 없음, all 모든 캠퍼스, campus 맡은 캠퍼스만 */
export type ApprovalCell = '' | 'all' | 'campus';
export const APPROVAL_CELLS: [ApprovalCell, string][] = [
  ['', '-'],
  ['all', '모두'],
  ['campus', '캠퍼스'],
];
export const approvalCell = (d?: Pick<ApprovalDefault, 'campus_scoped'> | null): ApprovalCell => (!d ? '' : d.campus_scoped ? 'campus' : 'all');

/** 관리자가 스스로 잠기지 않게 고정하는 칸: 관리자의 사용자·권한 입력과 역할·승인 권한 주기 */
export const LOCKED_MENU = new Set(['base_admin:admin']);
export const LOCKED_APPROVAL = new Set(['grant_roles:admin']);

/** 지금 사용자(화면 판단용). directorCampuses 는 소문자 */
export interface Me { id: string; admin: boolean; directorCampuses: string[] }

/** 사람별 승인을 줄 수 있는 캠퍼스: 관리자는 모두, 센터장은 자기 캠퍼스만(모든 캠퍼스 줄은 못 만든다) */
export function grantCampuses(me: Me): string[] {
  if (me.admin) return CAMPUSES;
  return CAMPUSES.filter((c) => c && me.directorCampuses.includes(c.toLowerCase()));
}
/** 줄 수 있는 승인 종류: 센터장은 '역할·승인 권한 주기'를 뺀다 */
export const grantKinds = <T extends { kind: string }>(kinds: T[], me: Me) => (me.admin ? kinds : kinds.filter((k) => k.kind !== 'grant_roles'));

/** 사람별 승인 줄을 이 사용자가 만들거나 회수할 수 있는가(DB 정책 approval_grants_insert·delete 와 같은 규칙) */
export function canManageGrant(g: Pick<ApprovalGrant, 'user_id' | 'kind' | 'campus'>, me: Me): boolean {
  if (me.admin) return true;
  return g.kind !== 'grant_roles' && g.user_id !== me.id && g.campus !== '' && me.directorCampuses.includes(g.campus.toLowerCase());
}
