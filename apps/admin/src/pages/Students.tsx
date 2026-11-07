import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { fmt, useApi, type EnrollmentList } from '../api';
import { Loading, PageTitle, Pagination, PayText } from '../components/ui';

const TABS = [
  ['current', '재학생', '재학생 현황'],
  ['upcoming', '입학 예정', '입학 예정'],
  ['graduated', '졸업생', '졸업생'],
  ['all', '전체 연수', '전체 연수'],
] as const;

const FORM_KEYS = ['campus', 'batch', 'nation', 'pay', 'field', 'q'] as const;
type Form = Record<(typeof FORM_KEYS)[number], string>;

const readForm = (p: URLSearchParams): Form =>
  Object.fromEntries(FORM_KEYS.map((k) => [k, p.get(k) ?? (k === 'field' ? 'name' : '')])) as Form;

export default function Students() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') ?? 'current';
  const query = params.toString();
  const { data, error } = useApi<EnrollmentList>('/api/enrollments?' + (query || 'tab=current'));
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
    apply({ ...form, page: '' });
  };

  const title = TABS.find(([key]) => key === tab)?.[2] ?? '학생';
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <>
      <PageTitle title={title} path={`홈 > 학생관리 > ${title}`} />

      <div role="tablist" aria-label="학생 구분" className="tabs">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParams({ tab: key })}>
            {label} {data ? `(${fmt(data.tabCounts[key])})` : ''}
          </button>
        ))}
        <div className="fill" />
      </div>

      <form className="search" aria-label="검색 조건" onSubmit={onSearch}>
        <div className="search-grid">
          <label className="field">
            <span>캠퍼스</span>
            <select value={form.campus} onChange={set('campus')}>
              <option value="">전체</option>
              {data?.facets.campuses.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field">
            <span>입학 배치</span>
            <select value={form.batch} onChange={set('batch')}>
              <option value="">전체</option>
              {data?.facets.batches.map((b) => <option key={b}>{b}</option>)}
            </select>
          </label>
          <label className="field">
            <span>국적</span>
            <select value={form.nation} onChange={set('nation')}>
              <option value="">전체</option>
              {data?.facets.nations.map((n) => <option key={n}>{n}</option>)}
            </select>
          </label>
          <div className="field" role="radiogroup" aria-label="납부 상태">
            <span>납부 상태</span>
            {['', '미납', '부분납', '완납'].map((v) => (
              <label key={v || 'all'}>
                <input type="radio" name="pay" value={v} checked={form.pay === v} onChange={set('pay')} />
                {v || '전체'}
              </label>
            ))}
          </div>
          <div className="field">
            <span>검색어</span>
            <select className="narrow" aria-label="검색 항목" value={form.field} onChange={set('field')}>
              <option value="name">이름</option>
              <option value="no">학생번호</option>
              <option value="agency">에이전시</option>
              <option value="memo">메모</option>
            </select>
            <input type="text" aria-label="검색어 입력" value={form.q} onChange={set('q')} />
          </div>
        </div>
        <div className="search-actions">
          <button type="button" className="btn btn-lg" onClick={() => setParams({ tab })}>초기화</button>
          <button type="submit" className="btn btn-primary btn-lg">조회</button>
        </div>
      </form>

      {!data ? (
        <Loading error={error} />
      ) : (
        <>
          <div className="toolbar">
            <span>총 <strong style={{ color: 'var(--primary)' }}>{fmt(data.total)}</strong>건</span>
            <select aria-label="페이지당 개수" value={String(data.size)} onChange={(e) => apply({ size: e.target.value, page: '' })}>
              <option value="20">20개씩</option>
              <option value="50">50개씩</option>
              <option value="100">100개씩</option>
            </select>
          </div>

          <div className="grid-box">
            <table className="tbl center big" style={{ minWidth: 1120 }}>
              <thead>
                <tr>
                  <th style={{ width: 52 }}>No</th>
                  <th>학생번호</th>
                  <th className="left">이름</th>
                  <th>국적</th>
                  <th>캠퍼스</th>
                  <th className="left">코스</th>
                  <th className="left">기숙사</th>
                  <th>입학일</th>
                  <th>졸업일</th>
                  <th>주</th>
                  <th className="left">에이전시</th>
                  <th>납부</th>
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 && (
                  <tr className="empty"><td colSpan={13}>조건에 맞는 학생이 없습니다.</td></tr>
                )}
                {data.rows.map((r, i) => (
                  <tr key={r.trId}>
                    <td className="muted">{data.total - ((data.page - 1) * data.size + i)}</td>
                    <td>{r.stId}</td>
                    <td className="left"><Link to={`/students/${r.stId}`} style={{ textDecoration: 'none', fontWeight: 500 }}>{r.name}</Link></td>
                    <td>{r.nation}</td>
                    <td>{r.campus}</td>
                    <td className="left">{r.course}</td>
                    <td className="left">{r.dorm}</td>
                    <td>{r.start}</td>
                    <td>{r.end}</td>
                    <td>{r.weeks}</td>
                    <td className="left">{r.agency}{r.branch ? ` (${r.branch})` : ''}</td>
                    <td><PayText pay={r.pay} /></td>
                    <td className="text-red" style={{ fontSize: 12 }}>{r.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination page={data.page} pages={data.pages} onPage={(p) => apply({ page: String(p) })} />
        </>
      )}
    </>
  );
}
