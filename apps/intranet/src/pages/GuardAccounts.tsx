import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, errorText, useApi } from '../api';
import { Loading, PageTitle } from '../components/ui';
import { ymdhm } from '../format';
import type { GuardList } from '../../server/guardAccounts';

// 출입구 가드 공용 계정(11/8 결정: 출입구마다 하나, 기록에는 근무자 이름을 고른다). 배포(서비스 키가 있는 서버)에서만 관리한다.
// 경비실 태블릿에서 <포털 주소>/intranet/guard 를 열고 이 계정으로 로그인해 둔다. 만들기·비밀번호 바꾸기·지우기는 접근 기록에 남는다.
const REASON: Record<string, string> = {
  local: '로컬 개발 서버에는 가드 계정이 없습니다(가드 태블릿이 로그인 없이 열립니다). 가드 계정 관리는 배포 주소(포털 안 인트라넷)에서 씁니다.',
  server_config: '서버에 서비스 키(SUPABASE_SERVICE_ROLE_KEY)가 없어 가드 계정을 관리할 수 없습니다. Cloudflare Pages 설정에 비밀 변수로 넣어 주세요.',
};
const EMPTY = { label: '', campus: '', email: '', password: '', confirm: '' };

export default function GuardAccounts() {
  const { data, error, reload } = useApi<GuardList>('/api/guard-accounts');
  const [form, setForm] = useState(EMPTY);
  const [pw, setPw] = useState<{ id: string; password: string; confirm: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ text: done, ok: true });
      reload();
      return true;
    } catch (e) {
      setMessage({ text: errorText((e as ApiError).code), ok: false });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (await run(() => api('/api/guard-accounts', { method: 'POST', body: form }), `가드 계정 '${form.label}'을 만들었습니다. 경비실 태블릿에서 ${form.email} 로 로그인하세요.`)) setForm(EMPTY);
  }

  if (!data) return <Loading error={error} onRetry={reload} />;
  return (
    <>
      <PageTitle title="가드 계정" path="홈 > 직원 > 가드 계정" />
      {!data.available ? (
        <div className="state-msg">{REASON[data.reason] ?? REASON.local}</div>
      ) : (
        <>
          <form className="panel" onSubmit={create} aria-label="가드 계정 만들기">
            <div className="panel-head">
              <h2>가드 계정 만들기</h2>
              <Link to="/settings" className="more">
                근무자 목록 설정 &gt;
              </Link>
            </div>
            <div className="panel-body form-grid">
              <div className="form-row">
                <label className="narrow">
                  출입구 이름
                  <input required maxLength={data.labelMax} placeholder="예: Challenger 정문" value={form.label} onChange={set('label')} />
                </label>
                <label className="narrow">
                  캠퍼스
                  <select className="cell-input" required value={form.campus} onChange={set('campus')}>
                    <option value="">고르세요</option>
                    {data.campuses.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label className="narrow">
                  로그인 이메일
                  <input type="email" required autoComplete="off" placeholder="gate-challenger@…" value={form.email} onChange={set('email')} />
                </label>
              </div>
              <div className="form-row">
                <label className="narrow">
                  비밀번호
                  <input type="password" required autoComplete="new-password" value={form.password} onChange={set('password')} />
                </label>
                <label className="narrow">
                  비밀번호 확인
                  <input type="password" required autoComplete="new-password" value={form.confirm} onChange={set('confirm')} />
                </label>
              </div>
              <p className="muted small">비밀번호는 8자 이상, 영문과 숫자를 함께 씁니다. 이메일로 메일은 보내지 않습니다.</p>
              <div className="form-actions">
                <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>
                  만들기
                </button>
              </div>
            </div>
          </form>

          <div className="toolbar">
            <span>
              총 <strong className="text-primary">{data.rows.length}</strong>개
              {message && (
                <span className={'toolbar-msg' + (message.ok ? '' : ' text-red')} role="status">
                  {message.text}
                </span>
              )}
            </span>
          </div>
          <div className="grid-box">
            <table className="tbl center big">
              <thead>
                <tr>
                  <th className="left">출입구 이름</th>
                  <th>캠퍼스</th>
                  <th>로그인 이메일</th>
                  <th>마지막 로그인</th>
                  <th className="left">관리</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr className="empty">
                    <td colSpan={5}>가드 계정이 없습니다. 위에서 출입구마다 하나씩 만드세요.</td>
                  </tr>
                ) : (
                  data.rows.map((g) => (
                    <tr key={g.userId}>
                      <td className="left">{g.label}</td>
                      <td>{g.campus}</td>
                      <td>{g.email}</td>
                      <td className="nowrap">{g.lastSignIn ? ymdhm(g.lastSignIn) : <span className="muted">-</span>}</td>
                      <td className="left">
                        {pw?.id === g.userId ? (
                          <form
                            className="trip-remove"
                            onSubmit={(e) => {
                              e.preventDefault();
                              void run(() => api(`/api/guard-accounts/${encodeURIComponent(g.userId)}/password`, { method: 'POST', body: pw }), `'${g.label}' 비밀번호를 바꿨습니다.`).then((ok) => ok && setPw(null));
                            }}
                          >
                            <input type="password" className="cell-input" aria-label={`${g.label} 새 비밀번호`} placeholder="새 비밀번호" autoComplete="new-password" value={pw.password} onChange={(e) => setPw({ ...pw, password: e.target.value })} />
                            <input type="password" className="cell-input" aria-label={`${g.label} 새 비밀번호 확인`} placeholder="확인" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
                            <button type="submit" className="btn btn-xs btn-primary" disabled={busy}>
                              저장
                            </button>
                            <button type="button" className="btn btn-xs" onClick={() => setPw(null)}>
                              취소
                            </button>
                          </form>
                        ) : (
                          <div className="life-actions">
                            <button type="button" className="btn btn-xs" disabled={busy} onClick={() => setPw({ id: g.userId, password: '', confirm: '' })}>
                              비밀번호 바꾸기
                            </button>
                            <button
                              type="button"
                              className="btn btn-xs"
                              disabled={busy}
                              onClick={() => {
                                if (window.confirm(`가드 계정 '${g.label}'(${g.email})을 지울까요? 그 태블릿은 바로 로그아웃되고 다시 로그인할 수 없습니다. 지난 외출·귀가 기록은 남습니다.`))
                                  void run(() => api(`/api/guard-accounts/${encodeURIComponent(g.userId)}/delete`, { method: 'POST', body: {} }), `가드 계정 '${g.label}'을 지웠습니다.`);
                              }}
                            >
                              지우기
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
