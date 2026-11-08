import { useState } from 'react';
import { api, ApiError, errorText, useApi } from '../api';
import { Loading, PageTitle, StudentLink, Tabs } from '../components/ui';
import { ymdhm } from '../format';
import { useSearchForm } from '../useSearchForm';
import type { AccountList } from '../../server/studentAccounts';

// 학생 앱 계정(아이디 = 학생번호, 첫 비밀번호 = 생년월일, 첫 로그인 때 변경). 재학·입학 예정 학생이 대상이다.
// 배포(서비스 키가 있는 서버)에서만 만들고 되돌린다. 만들기·비밀번호 초기화는 접근 기록에 남는다.
const KEYS = ['campus', 'q'] as const;
const STATUS: Record<string, string> = { none: '계정 없음', pending: '첫 비밀번호 변경 전', active: '사용 중', no_birthday: '생년월일 없음' };
const STATUS_CLASS: Record<string, string> = { none: 'text-amber', pending: 'muted', active: 'text-blue', no_birthday: 'text-red' };
const ENROLL: Record<string, string> = { current: '재학', upcoming: '입학 예정' };
const REASON: Record<string, string> = {
  local: '로컬 개발 서버에는 학생 계정이 없습니다. 학생 앱은 학생번호와 생년월일로 로그인합니다. 계정 관리는 배포 주소(포털 안 인트라넷)에서 씁니다.',
  server_config: '서버에 서비스 키(SUPABASE_SERVICE_ROLE_KEY)가 없어 학생 계정을 관리할 수 없습니다. Cloudflare Pages 설정에 비밀 변수로 넣어 주세요.',
};

type Created = { created: number; linked: number; failed: { stId: string; error: string }[]; remaining: number; noBirthday: number };

export default function StudentAccounts() {
  const f = useSearchForm(KEYS);
  const status = f.params.get('status') || '';
  const { data, error, reload } = useApi<AccountList>('/api/accounts?' + f.query);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  async function createAll() {
    if (!data?.counts.none || !window.confirm(`계정이 없는 학생 ${data.counts.none}명의 계정을 만들까요? 첫 비밀번호는 각자의 생년월일(8자리)입니다.`)) return;
    setBusy(true);
    setMessage(null);
    let created = 0;
    let failed = 0;
    try {
      // 서버가 한 번에 몇 명씩만 만든다(요청당 외부 호출 한도). 남은 수가 0이 될 때까지 이어서 부른다.
      for (let round = 0; round < 100; round++) {
        const r = await api<Created>('/api/accounts/create', { method: 'POST', body: {} });
        created += r.linked; // 새로 만든 계정 + 계정만 있던 것을 이은 수
        failed += r.failed.length;
        setMessage({ text: `계정을 만드는 중… ${created}명`, ok: true });
        if (!r.remaining || (r.failed.length && r.linked === 0)) break;
      }
      setMessage({ text: `계정 ${created}명을 만들었습니다.${failed ? ` 실패 ${failed}명은 다시 누르면 이어서 만듭니다.` : ''}`, ok: !failed });
    } catch (e) {
      setMessage({ text: errorText((e as ApiError).code), ok: false });
    }
    setBusy(false);
    reload();
  }

  async function reset(stId: string, name: string) {
    if (!window.confirm(`${name}(${stId})의 비밀번호를 생년월일(8자리)로 되돌릴까요? 다음 로그인 때 새 비밀번호를 정하게 됩니다.`)) return;
    setBusy(true);
    setMessage(null);
    try {
      await api(`/api/accounts/${encodeURIComponent(stId)}/reset`, { method: 'POST', body: {} });
      setMessage({ text: `${name}(${stId})의 비밀번호를 생년월일로 되돌렸습니다. 아이디는 학생번호입니다.`, ok: true });
      reload();
    } catch (e) {
      setMessage({ text: errorText((e as ApiError).code), ok: false });
    }
    setBusy(false);
  }

  return (
    <>
      <PageTitle
        title="학생 계정"
        path="홈 > 학생 생활 > 학생 계정"
        actions={
          data?.available && data.counts.none > 0 ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void createAll()}>
              계정 없는 학생 {data.counts.none}명 계정 만들기
            </button>
          ) : null
        }
      />
      {data && !data.available ? (
        <div className="state-msg">{REASON[data.reason] ?? REASON.local}</div>
      ) : (
        <>
          <Tabs
            label="계정 상태"
            value={status}
            onChange={(k) => f.apply({ status: k })}
            items={[
              { key: '', label: `전체 (${data ? data.counts.none + data.counts.pending + data.counts.active + data.counts.no_birthday : 0})` },
              ...(['none', 'pending', 'active', 'no_birthday'] as const).map((k) => ({ key: k, label: `${STATUS[k]} (${data?.counts[k] ?? 0})` })),
            ]}
          />
          <form className="search" onSubmit={f.submit} aria-label="검색 조건">
            <div className="search-grid">
              <label className="field">
                <span>캠퍼스</span>
                <select value={f.form.campus} onChange={f.set('campus')}>
                  <option value="">전체</option>
                  {data?.campuses.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>검색</span>
                <input type="text" placeholder="이름, 학생번호" value={f.form.q} onChange={f.set('q')} />
              </label>
            </div>
            <div className="search-actions">
              <button type="button" className="btn btn-lg" onClick={() => f.reset()}>
                초기화
              </button>
              <button type="submit" className="btn btn-primary btn-lg">
                조회
              </button>
            </div>
          </form>
          {!data ? (
            <Loading error={error} onRetry={reload} />
          ) : (
            <>
              <div className="toolbar">
                <span>
                  총 <strong className="text-primary">{data.rows.length}</strong>명
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
                      <th className="left">학생</th>
                      <th>학생번호(아이디)</th>
                      <th>캠퍼스</th>
                      <th>연수</th>
                      <th>계정</th>
                      <th>마지막 로그인</th>
                      <th>비밀번호</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 ? (
                      <tr className="empty">
                        <td colSpan={7}>학생이 없습니다.</td>
                      </tr>
                    ) : (
                      data.rows.map((r) => (
                        <tr key={r.stId}>
                          <td className="left">
                            <StudentLink stId={r.stId} name={r.name} />
                          </td>
                          <td>{r.stId}</td>
                          <td>{r.campus}</td>
                          <td className="nowrap">
                            {ENROLL[r.enroll]} <span className="muted small">~{r.end}</span>
                          </td>
                          <td className={STATUS_CLASS[r.status]}>{STATUS[r.status]}</td>
                          <td className="nowrap">{r.lastSignIn ? ymdhm(r.lastSignIn) : <span className="muted">-</span>}</td>
                          <td>
                            {r.status === 'pending' || r.status === 'active' ? (
                              <button type="button" className="btn btn-xs" disabled={busy} onClick={() => void reset(r.stId, r.name)}>
                                생년월일로 초기화
                              </button>
                            ) : (
                              <span className="muted">-</span>
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
      )}
    </>
  );
}
