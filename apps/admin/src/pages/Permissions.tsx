import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../supabase';
import { Loading, PageTitle, Panel } from '../components/ui';
import {
  APPROVAL_CELLS, approvalCell, CAMPUSES, campusLabel, canManageGrant, canManageRole, grantCampuses, grantKinds, LMS_ROLE_KEYS, LOCKED_APPROVAL, LOCKED_MENU, MENU_CELLS,
  menuCell, menuRow, PERM_ROLES, ROLE_LABEL, type ApprovalCell, type ApprovalDefault, type ApprovalGrant, type Me, type MenuCell, type RolePermission, type RoleRow,
} from '../permissions';

interface MenuGroup { key: string; label: string; sort: number }
interface ApprovalKind { kind: string; label: string; sort: number }
interface Person { user_id: string; label: string }
interface Data {
  groups: MenuGroup[];
  perms: RolePermission[];
  kinds: ApprovalKind[];
  defaults: ApprovalDefault[];
  grants: ApprovalGrant[];
  people: Person[];
  roles: RoleRow[];
}

const TABS = [
  ['menu', '메뉴 권한'],
  ['approval', '승인 기본값'],
  ['grants', '사람별 승인'],
  ['roles', '강사 포털 역할'],
] as const;
type Tab = (typeof TABS)[number][0];
const day = (s?: string | null) => (s ? s.slice(0, 10) : '');

/** 내 아이디·관리자 여부·센터장 캠퍼스(화면 판단용, 막는 것은 DB) */
async function loadMe(): Promise<Me> {
  const { data: s } = await supabase!.auth.getSession();
  const id = s.session?.user.id ?? '';
  const [a, r] = await Promise.all([
    supabase!.rpc('is_admin'),
    supabase!.from('user_roles').select('campus').eq('user_id', id).eq('role', 'director'),
  ]);
  return { id, admin: a.data === true, directorCampuses: ((r.data as { campus: string }[]) ?? []).map((x) => x.campus.toLowerCase()).filter(Boolean) };
}

/** 사람 목록: 직원(staff_directory) + 강사 목록에 계정이 연결된 사람 + 역할이 있는 사람. 역할을 같이 적는다 */
async function loadPeople(): Promise<{ people: Person[]; roles: RoleRow[] }> {
  const [d, t, r] = await Promise.all([
    supabase!.rpc('staff_directory'),
    supabase!.from('staff').select('user_id, name').not('user_id', 'is', null),
    supabase!.from('user_roles').select('user_id, role, campus'),
  ]);
  const name = new Map<string, string>();
  for (const x of (t.data as { user_id: string; name: string }[]) ?? []) name.set(x.user_id, x.name);
  for (const x of (d.data as { user_id: string; name: string }[]) ?? []) name.set(x.user_id, x.name);
  const roles = new Map<string, string[]>();
  for (const x of (r.data as { user_id: string; role: string; campus: string }[]) ?? []) {
    roles.set(x.user_id, [...(roles.get(x.user_id) ?? []), `${ROLE_LABEL[x.role] ?? x.role}${x.campus ? ` ${x.campus}` : ''}`]);
  }
  const staff = new Set(((d.data as { user_id: string }[]) ?? []).map((x) => x.user_id));
  const ids = new Set([...staff, ...name.keys(), ...roles.keys()]);
  const people = [...ids]
    .map((id) => {
      const rs = roles.get(id) ?? (staff.has(id) ? ['관리자'] : ['역할 없음']);
      return { user_id: id, label: `${name.get(id) ?? id.slice(0, 8)} (${rs.join(', ')})` };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'ko'));
  return { people, roles: (r.data as RoleRow[]) ?? [] };
}

/**
 * 권한표(CL-025, 11/12 레오님 결정 ①②⑥, docs/permissions.md). 관리자 포털 '기초관리 › 권한표'.
 * 메뉴 권한·승인 기본값은 관리자가 고치고 직원은 읽는다. 사람별 승인은 관리자, 또는 센터장이 자기 캠퍼스로 다른 사람에게 준다.
 * 1단계라 화면·DB 규칙은 아직 이 표를 따르지 않는다(2단계 메뉴 숨기기, 3단계 승인 함수).
 */
export default function Permissions() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get('tab'))?.[0] ?? 'menu') as Tab;
  const [me, setMe] = useState<Me | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [g, p, k, d, gr, dir] = await Promise.all([
      supabase.from('menu_groups').select('key, label, sort').order('sort'),
      supabase.from('role_permissions').select('menu_group, role, can_view, can_input, campus_scoped, updated_at, updated_by'),
      supabase.from('approval_kinds').select('kind, label, sort').order('sort'),
      supabase.from('approval_defaults').select('kind, role, campus_scoped'),
      supabase.from('approval_grants').select('id, user_id, kind, campus, allow, created_at, granted_by').order('created_at', { ascending: false }),
      loadPeople(),
    ]);
    const err = [g, p, k, d, gr].find((x) => x.error)?.error;
    if (err) return setError(err.message.includes('does not exist') ? '권한표가 아직 DB에 없습니다(마이그레이션 20261112110000 적용 전).' : err.message);
    setData({
      groups: ((g.data as MenuGroup[]) ?? []).sort((a, b) => a.sort - b.sort),
      perms: (p.data as RolePermission[]) ?? [],
      kinds: ((k.data as ApprovalKind[]) ?? []).sort((a, b) => a.sort - b.sort),
      defaults: (d.data as ApprovalDefault[]) ?? [],
      grants: ((gr.data as ApprovalGrant[]) ?? []).sort((a, b) => b.created_at.localeCompare(a.created_at)),
      people: dir.people,
      roles: dir.roles,
    });
  }, []);
  useEffect(() => {
    if (!supabase) return;
    loadMe().then(setMe);
    load();
  }, [load]);

  const nameOf = useMemo(() => {
    const m = new Map((data?.people ?? []).map((p) => [p.user_id, p.label.replace(/ \(.*\)$/, '')]));
    return (id?: string | null) => (id ? m.get(id) ?? id.slice(0, 8) : '');
  }, [data]);

  if (!supabase) {
    return (
      <>
        <PageTitle title="권한표" path="홈 > 기초관리 > 권한표" />
        <div className="state-msg">권한표는 Supabase에 있어 배포 주소(로그인한 직원)에서만 보입니다.</div>
      </>
    );
  }

  const run = async (label: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    setMsg('');
    const { error: err } = await fn();
    setBusy(false);
    setMsg(err ? `${label} 실패: ${err.message.includes('duplicate') ? '이미 같은 줄이 있습니다' : err.message.includes('row-level security') ? '권한이 없습니다' : err.message}` : `${label} 완료`);
    load();
  };

  const setMenu = (group: MenuGroup, role: string, cell: MenuCell) => {
    const row = menuRow(cell);
    const label = `${group.label} · ${ROLE_LABEL[role]} → ${MENU_CELLS.find(([c]) => c === cell)?.[1]}`;
    run(label, () =>
      row
        ? supabase!.from('role_permissions').upsert({ menu_group: group.key, role, ...row, updated_at: new Date().toISOString(), updated_by: me?.id || null }, { onConflict: 'menu_group,role' })
        : supabase!.from('role_permissions').delete().eq('menu_group', group.key).eq('role', role),
    );
  };
  const setApproval = (kind: ApprovalKind, role: string, cell: ApprovalCell) => {
    const label = `${kind.label} · ${ROLE_LABEL[role]} → ${APPROVAL_CELLS.find(([c]) => c === cell)?.[1]}`;
    run(label, () =>
      cell
        ? supabase!.from('approval_defaults').upsert({ kind: kind.kind, role, campus_scoped: cell === 'campus' }, { onConflict: 'kind,role' })
        : supabase!.from('approval_defaults').delete().eq('kind', kind.kind).eq('role', role),
    );
  };

  const admin = me?.admin === true;
  return (
    <>
      <PageTitle title="권한표" path="홈 > 기초관리 > 권한표" />
      <p className="muted" style={{ margin: '0 0 8px', fontSize: 12 }}>
        11/12 결정(권한 구조 1단계). 지금 규칙을 옮긴 표입니다. 화면과 DB 규칙은 아직 이 표를 따르지 않습니다(2단계 메뉴 숨기기, 3단계 승인부터).
        {!admin && ' 메뉴 권한·승인 기본값은 관리자가 고칩니다.'}
      </p>
      <div role="tablist" aria-label="권한표" className="tabs">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'menu' ? {} : { tab: k }, { replace: true })}>{label}</button>
        ))}
        <div className="fill" />
      </div>
      {msg && <div className={msg.includes('실패') ? 'text-red' : 'text-blue'} role="status" style={{ fontSize: 12, margin: '6px 0' }}>{msg}</div>}
      {!data || !me ? (
        <Loading error={error} />
      ) : tab === 'menu' ? (
        <div className="grid-box">
          <table className="tbl center perm-table">
            <thead>
              <tr><th className="left">메뉴 그룹</th>{PERM_ROLES.map((r) => <th key={r}>{ROLE_LABEL[r]}</th>)}</tr>
            </thead>
            <tbody>
              {data.groups.map((g) => {
                const [head, detail] = g.label.split(' · ');
                return (
                  <tr key={g.key}>
                    <td className="left"><strong>{head}</strong>{detail && <span className="muted"> · {detail}</span>}</td>
                    {PERM_ROLES.map((r) => {
                      const p = data.perms.find((x) => x.menu_group === g.key && x.role === r);
                      const cell = menuCell(p);
                      const locked = LOCKED_MENU.has(`${g.key}:${r}`);
                      const text = MENU_CELLS.find(([c]) => c === cell)?.[1] ?? '-';
                      const title = p?.updated_at ? `${day(p.updated_at)} ${nameOf(p.updated_by)}`.trim() : undefined;
                      return (
                        <td key={r} title={locked ? '관리자가 잠기지 않게 고정' : title} className={cell ? `perm-${cell[0]}` : ''}>
                          {admin && !locked ? (
                            <select aria-label={`${head} ${detail ?? ''} ${ROLE_LABEL[r]}`} value={cell} disabled={busy} onChange={(e) => setMenu(g, r, e.target.value as MenuCell)}>
                              {MENU_CELLS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                            </select>
                          ) : text}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>입력은 보기를 포함합니다. '캠퍼스'는 그 역할에 정한 캠퍼스만(역할의 캠퍼스가 빈칸이면 모든 캠퍼스). 칸에 마우스를 올리면 마지막으로 고친 날짜·사람이 보입니다.</p>
        </div>
      ) : tab === 'approval' ? (
        <div className="grid-box">
          <table className="tbl center perm-table">
            <thead>
              <tr><th className="left">승인 종류</th>{PERM_ROLES.map((r) => <th key={r}>{ROLE_LABEL[r]}</th>)}</tr>
            </thead>
            <tbody>
              {data.kinds.map((k) => (
                <tr key={k.kind}>
                  <td className="left"><strong>{k.label}</strong></td>
                  {PERM_ROLES.map((r) => {
                    const cell = approvalCell(data.defaults.find((x) => x.kind === k.kind && x.role === r));
                    const locked = LOCKED_APPROVAL.has(`${k.kind}:${r}`);
                    return (
                      <td key={r} title={locked ? '관리자가 잠기지 않게 고정' : undefined} className={cell ? 'perm-I' : ''}>
                        {admin && !locked ? (
                          <select aria-label={`${k.label} ${ROLE_LABEL[r]}`} value={cell} disabled={busy} onChange={(e) => setApproval(k, r, e.target.value as ApprovalCell)}>
                            {APPROVAL_CELLS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
                          </select>
                        ) : APPROVAL_CELLS.find(([c]) => c === cell)?.[1]}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
            '모두'는 모든 캠퍼스, '캠퍼스'는 그 역할에 정한 캠퍼스만(역할의 캠퍼스가 빈칸이면 모든 캠퍼스). 방문 신청 확정·반려는 3단계 전까지 '사용자·권한 › 방문 신청 처리자' 지정을 따릅니다.
          </p>
        </div>
      ) : tab === 'grants' ? (
        <Grants data={data} me={me} busy={busy} run={run} nameOf={nameOf} />
      ) : (
        <LmsRoles data={data} me={me} busy={busy} run={run} nameOf={nameOf} />
      )}
    </>
  );
}

/** 사람별 승인: 기본값에 더하거나 뺀다(빼기가 앞섬). 관리자는 모두, 센터장은 자기 캠퍼스로 다른 사람에게만 */
function Grants({ data, me, busy, run, nameOf }: {
  data: Data;
  me: Me;
  busy: boolean;
  run: (label: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => void;
  nameOf: (id?: string | null) => string;
}) {
  const campuses = grantCampuses(me);
  const kinds = grantKinds(data.kinds, me);
  const people = me.admin ? data.people : data.people.filter((p) => p.user_id !== me.id);
  const [form, setForm] = useState({ user_id: '', kind: kinds[0]?.kind ?? '', campus: campuses[0] ?? '', allow: true });
  const canGrant = campuses.length > 0;
  const kindLabel = (k: string) => data.kinds.find((x) => x.kind === k)?.label ?? k;

  const add = () => {
    if (!form.user_id || !form.kind) return;
    run(`${nameOf(form.user_id)} ${kindLabel(form.kind)}(${campusLabel(form.campus)}) ${form.allow ? '더하기' : '빼기'}`, () =>
      supabase!.from('approval_grants').insert({ user_id: form.user_id, kind: form.kind, campus: form.campus, allow: form.allow }),
    );
    setForm({ ...form, user_id: '' });
  };
  const remove = (g: ApprovalGrant) => {
    if (!window.confirm(`${nameOf(g.user_id)}의 '${kindLabel(g.kind)}(${campusLabel(g.campus)}) ${g.allow ? '더하기' : '빼기'}'를 회수할까요?`)) return;
    run(`${nameOf(g.user_id)} ${kindLabel(g.kind)} 회수`, () => supabase!.from('approval_grants').delete().eq('id', g.id));
  };

  return (
    <>
      {canGrant && (
        <Panel title="승인 권한 주기">
          <div className="nowrap" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <select aria-label="직원" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} style={{ height: 28, maxWidth: 320 }}>
              <option value="">직원 고르기</option>
              {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.label}</option>)}
            </select>
            <select aria-label="승인 종류" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })} style={{ height: 28 }}>
              {kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
            </select>
            <select aria-label="캠퍼스" value={form.campus} onChange={(e) => setForm({ ...form, campus: e.target.value })} style={{ height: 28 }}>
              {campuses.map((c) => <option key={c} value={c}>{campusLabel(c)}</option>)}
            </select>
            <select aria-label="더하기·빼기" value={form.allow ? 'allow' : 'deny'} onChange={(e) => setForm({ ...form, allow: e.target.value === 'allow' })} style={{ height: 28 }}>
              <option value="allow">더하기(기본값에 없어도 승인)</option>
              <option value="deny">빼기(기본값에 있어도 못 함)</option>
            </select>
            <button type="button" className="btn btn-xs" disabled={busy || !form.user_id || !form.kind} onClick={add}>주기</button>
          </div>
          {!me.admin && <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>센터장은 자기 캠퍼스({campuses.join(', ')})로, 다른 사람에게만 줍니다. '역할·승인 권한 주기'는 관리자만.</p>}
        </Panel>
      )}
      <div className="grid-box">
        <table className="tbl center">
          <thead>
            <tr><th className="left">직원</th><th className="left">승인 종류</th><th>캠퍼스</th><th>더하기·빼기</th><th>준 사람</th><th>날짜</th><th>회수</th></tr>
          </thead>
          <tbody>
            {data.grants.length === 0 && <tr className="empty"><td colSpan={7}>사람별 승인이 없습니다. 모두 역할 기본값을 따릅니다.</td></tr>}
            {data.grants.map((g) => (
              <tr key={g.id}>
                <td className="left">{nameOf(g.user_id)}</td>
                <td className="left">{kindLabel(g.kind)}</td>
                <td>{campusLabel(g.campus)}</td>
                <td className={g.allow ? 'text-blue' : 'text-red'}>{g.allow ? '더하기' : '빼기'}</td>
                <td>{nameOf(g.granted_by)}</td>
                <td className="nowrap">{day(g.created_at)}</td>
                <td>{canManageGrant(g, me) && <button type="button" className="btn btn-xs" disabled={busy} onClick={() => remove(g)} aria-label={`${nameOf(g.user_id)} ${kindLabel(g.kind)} 회수`}>회수</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * 강사 포털 역할(11/12 결정 ②): 센터장은 자기 캠퍼스의 강사·체커·스케줄러·매니저 역할을 다른 사람에게 주고 회수한다.
 * 관리자는 모두(오피스·센터장·관리자 역할은 '사용자·권한'에서). DB 정책 user_roles_write·delete(20261112110000)가 막는다.
 */
function LmsRoles({ data, me, busy, run, nameOf }: {
  data: Data;
  me: Me;
  busy: boolean;
  run: (label: string, fn: () => PromiseLike<{ error: { message: string } | null }>) => void;
  nameOf: (id?: string | null) => string;
}) {
  const campuses = grantCampuses(me);
  const people = me.admin ? data.people : data.people.filter((p) => p.user_id !== me.id);
  const [form, setForm] = useState({ user_id: '', role: 'teacher', campus: campuses[0] ?? '' });
  const [filter, setFilter] = useState(me.admin ? '*' : campuses[0] ?? '*');
  const canGrant = campuses.length > 0;
  const rows = data.roles
    .filter((r) => LMS_ROLE_KEYS.includes(r.role) && (filter === '*' || r.campus.toLowerCase() === filter.toLowerCase()))
    .sort((a, b) => a.campus.localeCompare(b.campus) || nameOf(a.user_id).localeCompare(nameOf(b.user_id), 'ko') || LMS_ROLE_KEYS.indexOf(a.role) - LMS_ROLE_KEYS.indexOf(b.role));
  const roleText = (r: RoleRow) => `${ROLE_LABEL[r.role] ?? r.role}(${campusLabel(r.campus)})`;

  const add = () => {
    if (!form.user_id) return;
    const row = { user_id: form.user_id, role: form.role, campus: form.campus };
    run(`${nameOf(form.user_id)} ${roleText(row)} 주기`, () => supabase!.from('user_roles').insert(row));
    setForm({ ...form, user_id: '' });
  };
  const remove = (r: RoleRow) => {
    if (!window.confirm(`${nameOf(r.user_id)}의 '${roleText(r)}' 역할을 회수할까요?`)) return;
    // 권한 밖 줄은 RLS 가 조용히 0줄로 막으므로 지운 줄 수로 확인한다
    run(`${nameOf(r.user_id)} ${roleText(r)} 회수`, async () => {
      const res = await supabase!.from('user_roles').delete().eq('user_id', r.user_id).eq('role', r.role).eq('campus', r.campus).select('user_id');
      return res.error ? res : { error: (res.data ?? []).length ? null : { message: 'row-level security' } };
    });
  };

  return (
    <>
      {canGrant && (
        <Panel title="강사 포털 역할 주기">
          <div className="nowrap" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <select aria-label="사람" value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })} style={{ height: 28, maxWidth: 320 }}>
              <option value="">사람 고르기</option>
              {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.label}</option>)}
            </select>
            <select aria-label="역할" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} style={{ height: 28 }}>
              {LMS_ROLE_KEYS.map((k) => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
            </select>
            <select aria-label="캠퍼스" value={form.campus} onChange={(e) => setForm({ ...form, campus: e.target.value })} style={{ height: 28 }}>
              {campuses.map((c) => <option key={c} value={c}>{campusLabel(c)}</option>)}
            </select>
            <button type="button" className="btn btn-xs" disabled={busy || !form.user_id} onClick={add}>주기</button>
          </div>
          <p className="muted" style={{ fontSize: 12, margin: '6px 0 0' }}>
            {me.admin ? "관리자는 모든 캠퍼스로 줍니다. 오피스·센터장·관리자 역할은 '사용자·권한'에서 줍니다." : `센터장은 자기 캠퍼스(${campuses.join(', ')})로, 다른 사람에게만 줍니다.`}
            {" 목록에 없는 새 강사 계정은 관리자가 '사용자·권한'에서 강사 목록에 연결하거나 역할을 먼저 줍니다."}
          </p>
        </Panel>
      )}
      <div className="toolbar">
        <span>역할 <strong style={{ color: 'var(--primary)' }}>{rows.length}</strong>줄</span>
        <span className="toolbar-right">
          <select aria-label="캠퍼스 거르기" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ height: 28 }}>
            <option value="*">전체</option>
            {CAMPUSES.map((c) => <option key={c} value={c}>{campusLabel(c)}</option>)}
          </select>
        </span>
      </div>
      <div className="grid-box">
        <table className="tbl center">
          <thead>
            <tr><th className="left">사람</th><th>역할</th><th>캠퍼스</th><th>회수</th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr className="empty"><td colSpan={4}>이 캠퍼스에 강사 포털 역할이 없습니다.</td></tr>}
            {rows.map((r) => (
              <tr key={`${r.user_id}:${r.role}:${r.campus}`}>
                <td className="left">{nameOf(r.user_id)}</td>
                <td>{ROLE_LABEL[r.role] ?? r.role}</td>
                <td>{campusLabel(r.campus)}</td>
                <td>{canManageRole(r, me) && <button type="button" className="btn btn-xs" disabled={busy} onClick={() => remove(r)} aria-label={`${nameOf(r.user_id)} ${roleText(r)} 회수`}>회수</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
