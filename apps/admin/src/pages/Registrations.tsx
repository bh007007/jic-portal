import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fmt, useApi, type Registrations as Data, type RegistrationStudent } from '../api';
import { saveCsv, type Column } from '../csv';
import { DownloadButton, Loading, PageTitle, Panel } from '../components/ui';

const BASIS = { invoice: '첫 인보이스 발행일', departure: '입국일' } as const;

const LIST_COLUMNS: Column<RegistrationStudent>[] = [
  ['기준일', (r) => r.basisDate],
  ['학생번호', (r) => r.stId],
  ['이름', (r) => r.name],
  ['인보이스 국적', (r) => r.nation],
  ['성별', (r) => r.gender],
  ['캠퍼스', (r) => r.campus],
  ['코스', (r) => r.course],
  ['기숙사', (r) => r.dorm],
  ['입국일', (r) => r.depart],
  ['주', (r) => r.weeks],
  ['배치', (r) => r.batch],
  ['에이전시', (r) => r.agency],
  ['상태', (r) => r.state],
];

type Form = { basis: string; unit: string; agency: string; cancel: boolean; trainCancel: boolean; compare: boolean };
const readForm = (p: URLSearchParams): Form => ({
  basis: p.get('basis') ?? 'invoice',
  unit: p.get('unit') ?? 'batch',
  agency: p.get('agency') ?? '',
  cancel: p.get('cancel') === '1',
  trainCancel: p.get('trainCancel') !== '0',
  compare: p.get('compare') === '1',
});

const short = (d: string) => `${Number(d.slice(5, 7))}/${d.slice(8)}`;

export default function Registrations() {
  const [params, setParams] = useSearchParams();
  const query = params.toString();
  const { data, error } = useApi<Data>('/api/stats/registrations' + (query ? '?' + query : ''));
  const [form, setForm] = useState<Form>(() => readForm(params));
  useEffect(() => setForm(readForm(new URLSearchParams(query))), [query]);

  const apply = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next);
  };
  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    apply({
      basis: form.basis === 'invoice' ? '' : form.basis,
      unit: form.unit === 'batch' ? '' : form.unit,
      agency: form.agency.trim(),
      cancel: form.cancel ? '1' : '',
      trainCancel: form.trainCancel ? '' : '0',
      compare: form.compare ? '1' : '',
      end: form.unit !== (params.get('unit') ?? 'batch') ? '' : params.get('end') ?? '',
      p: '', nation: '', campus: '',
    });
  };
  const openCell = (p: number, nation = '', campus = '') => apply({ p: String(p), nation, campus });

  const label = (i: number) => (data!.unit === 'month' ? data!.periods[i].label : short(data!.periods[i].from));
  const range = (i: number) => `${data!.periods[i].from} ~ ${data!.periods[i].to}`;
  const sel = data?.list;
  const selP = params.get('p');
  const selNation = params.get('nation') ?? '';
  const selCampus = params.get('campus') ?? '';
  const isSel = (i: number, nation: string, campus: string) => selP === String(i) && selNation === nation && selCampus === campus;

  const saveMatrix = () => {
    if (!data) return;
    type Line = { name: string; counts: number[]; total: number; prev?: number };
    const lines: Line[] = [
      ...data.rows.map((r) => ({ name: r.nation, counts: r.counts, total: r.total, prev: r.prevTotal })),
      { name: '합계', counts: data.totals, total: data.totals.reduce((s, v) => s + v, 0), prev: data.prevTotals?.reduce((s, v) => s + v, 0) },
      ...data.campuses.map((c) => ({ name: c, counts: data.byCampus[c], total: data.byCampus[c].reduce((s, v) => s + v, 0) })),
    ];
    const cols: Column<Line>[] = [
      ['국적', (l) => l.name],
      ...data.periods.map((p, i): Column<Line> => [data.unit === 'month' ? p.label : `${p.from}~${p.to}`, (l) => l.counts[i]]),
      ['합계', (l) => l.total],
      ...(data.compare ? [['작년 같은 기간', (l: Line) => l.prev ?? ''] as Column<Line>] : []),
    ];
    saveCsv(`등록현황_${BASIS[data.basis]}${data.agency ? '_' + data.agency : ''}_${data.periods[0].from}_${data.periods[data.periods.length - 1].to}.csv`, cols, lines);
  };

  return (
    <>
      <PageTitle title="등록 현황" path="홈 > 통계 > 등록 현황" />

      <form className="search" aria-label="검색 조건" onSubmit={onSearch}>
        <div className="search-grid">
          <div className="field" role="radiogroup" aria-label="기준">
            <span>기준</span>
            {(['invoice', 'departure'] as const).map((v) => (
              <label key={v}>
                <input type="radio" name="basis" value={v} checked={form.basis === v} onChange={() => setForm((f) => ({ ...f, basis: v }))} />
                {BASIS[v]}
              </label>
            ))}
          </div>
          <div className="field" role="radiogroup" aria-label="열 단위">
            <span>열 단위</span>
            {([['batch', '배치(2주)'], ['month', '월']] as const).map(([v, l]) => (
              <label key={v}>
                <input type="radio" name="unit" value={v} checked={form.unit === v} onChange={() => setForm((f) => ({ ...f, unit: v }))} />
                {l}
              </label>
            ))}
          </div>
          <label className="field">
            <span>에이전시</span>
            <input type="text" placeholder="이름 일부(한글·영문)" value={form.agency} onChange={(e) => setForm((f) => ({ ...f, agency: e.target.value }))} />
          </label>
          <div className="field" role="group" aria-label="포함 조건">
            <span>포함</span>
            <label><input type="checkbox" checked={form.trainCancel} onChange={(e) => setForm((f) => ({ ...f, trainCancel: e.target.checked }))} />연수 중 취소·퇴교</label>
            <label><input type="checkbox" checked={form.cancel} onChange={(e) => setForm((f) => ({ ...f, cancel: e.target.checked }))} />캔슬</label>
            <label><input type="checkbox" checked={form.compare} onChange={(e) => setForm((f) => ({ ...f, compare: e.target.checked }))} />작년 비교</label>
          </div>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={() => setParams({})}>초기화</button>
          <button type="submit" className="btn btn-primary btn-lg">조회</button>
        </div>
      </form>

      {!data ? (
        <Loading error={error} />
      ) : (
        <>
          <div className="toolbar">
            <span className="cal-nav">
              <button type="button" className="btn" aria-label="이전 기간" onClick={() => apply({ end: data.prevEnd, p: '', nation: '', campus: '' })}>‹</button>
              <strong>{data.periods[0].from} ~ {data.periods[data.periods.length - 1].to}</strong>
              <button type="button" className="btn" aria-label="다음 기간" onClick={() => apply({ end: data.nextEnd, p: '', nation: '', campus: '' })}>›</button>
              {params.get('end') && <button type="button" className="btn btn-xs" onClick={() => apply({ end: '', p: '', nation: '', campus: '' })}>오늘 기준</button>}
              <span className="muted">
                {BASIS[data.basis]} 기준 · 인보이스 국적 · 첫 코스 캠퍼스{data.agency ? ` · 에이전시 '${data.agency}'` : ''}{data.withTrainCancel ? '' : ' · 연수 중 취소·퇴교 제외'}{data.withCancel ? ' · 캔슬 포함' : ''}
              </span>
            </span>
            <span className="toolbar-right">
              <DownloadButton run={saveMatrix} />
            </span>
          </div>

          <div className="grid-box">
            <table className="tbl center big matrix" style={{ minWidth: 300 + data.periods.length * 64 }}>
              <thead>
                <tr>
                  <th className="left">국적</th>
                  {data.periods.map((p, i) => (
                    <th key={p.from} title={range(i)} className={p.from <= data.refDate && data.refDate <= p.to ? 'now' : ''}>{label(i)}</th>
                  ))}
                  <th>합계</th>
                  {data.compare && <th title="작년 같은 기간 합계">작년</th>}
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty"><td colSpan={data.periods.length + 2 + (data.compare ? 1 : 0)}>이 기간에 등록이 없습니다.</td></tr>
                )}
                {data.rows.map((r) => (
                  <tr key={r.code}>
                    <td className="left strong">{r.nation}</td>
                    {r.counts.map((n, i) => (
                      <td key={i} className={isSel(i, r.code, '') ? 'on' : ''}>
                        {n ? <button type="button" className="cell-link" title={`${r.nation} · ${range(i)}`} onClick={() => openCell(i, r.code)}>{n}</button> : <span className="muted">·</span>}
                      </td>
                    ))}
                    <td className="strong">{fmt(r.total)}</td>
                    {data.compare && <td className="muted">{fmt(r.prevTotal)}</td>}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th className="left">합계</th>
                  {data.totals.map((n, i) => (
                    <th key={i} className={isSel(i, '', '') ? 'on' : ''}>
                      {n ? <button type="button" className="cell-link strong" onClick={() => openCell(i)}>{n}</button> : 0}
                    </th>
                  ))}
                  <th>{fmt(data.totals.reduce((s, v) => s + v, 0))}</th>
                  {data.compare && <th className="muted">{fmt((data.prevTotals ?? []).reduce((s, v) => s + v, 0))}</th>}
                </tr>
                {data.campuses.map((c) => (
                  <tr key={c}>
                    <td className="left muted">{c}</td>
                    {data.byCampus[c].map((n, i) => (
                      <td key={i} className={isSel(i, '', c) ? 'on' : 'muted'}>
                        {n ? <button type="button" className="cell-link" onClick={() => openCell(i, '', c)}>{n}</button> : '·'}
                      </td>
                    ))}
                    <td className="muted">{fmt(data.byCampus[c].reduce((s, v) => s + v, 0))}</td>
                    {data.compare && <td />}
                  </tr>
                ))}
                {data.compare && data.prevTotals && (
                  <tr>
                    <td className="left muted">작년 같은 기간</td>
                    {data.prevTotals.map((n, i) => {
                      const diff = data.totals[i] - n;
                      return (
                        <td key={i} className="muted" title={`작년 ${n}명, 차이 ${diff > 0 ? '+' : ''}${diff}`}>
                          {n}
                          {n > 0 && <div className={diff >= 0 ? 'text-blue' : 'text-red'} style={{ fontSize: 11 }}>{diff > 0 ? '+' : ''}{diff}</div>}
                        </td>
                      );
                    })}
                    <td className="muted">{fmt(data.prevTotals.reduce((s, v) => s + v, 0))}</td>
                    <td />
                  </tr>
                )}
              </tfoot>
            </table>
          </div>

          {sel && (
            <Panel
              title={<>{sel.period.from} ~ {sel.period.to}{sel.nation ? ` · ${sel.nation}` : ''}{sel.campus ? ` · ${sel.campus}` : ''} <small>{fmt(sel.rows.length)}명</small></>}
              extra={
                <span className="toolbar-right">
                  <DownloadButton run={() => saveCsv(`등록현황_${sel.period.from}${sel.nation ? '_' + sel.nation : ''}${sel.campus ? '_' + sel.campus : ''}.csv`, LIST_COLUMNS, sel.rows)} />
                  <button type="button" className="btn" onClick={() => apply({ p: '', nation: '', campus: '' })}>닫기</button>
                </span>
              }
            >
              <table className="tbl center" style={{ minWidth: 1100 }}>
                <thead>
                  <tr>
                    <th style={{ width: 52 }}>No</th>
                    <th>{data.basis === 'invoice' ? '인보이스 발행일' : '입국일'}</th>
                    <th>학생번호</th>
                    <th className="left">이름</th>
                    <th>인보이스 국적</th>
                    <th>캠퍼스</th>
                    <th className="left">코스</th>
                    <th>입국일</th>
                    <th>주</th>
                    <th className="left">에이전시</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {sel.rows.map((r, i) => (
                    <tr key={r.trId}>
                      <td className="muted">{i + 1}</td>
                      <td className="nowrap">{r.basisDate}</td>
                      <td>{r.stId}</td>
                      <td className="left"><Link to={`/students/${r.stId}`} style={{ textDecoration: 'none', fontWeight: 500 }}>{r.name}</Link></td>
                      <td>{r.nation}</td>
                      <td>{r.campus}</td>
                      <td className="left">{r.course}</td>
                      <td className="nowrap">{r.depart}</td>
                      <td>{r.weeks}</td>
                      <td className="left">{r.agency}</td>
                      <td className={r.status === 'cancelled' ? 'text-red' : ''}>{r.state}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          )}
        </>
      )}
    </>
  );
}
