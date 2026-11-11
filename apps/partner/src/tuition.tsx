import { Box } from './ui';

/**
 * 학비표 표(CL-038): 관리자 포털 가격표(공용 DB)를 partner_tuition()으로 읽은 줄. '비용·등록 › 학비표'와 상담 ⑤ 비용(CL-049)이 같이 쓴다.
 * 지금 적용 중인 코스·기숙사·기타 비용만, 커미션·프로모션·환율은 없다. 기간별 금액·할인은 견적에서 계산한다.
 */
export interface TuitionRow {
  section: 'course' | 'dorm' | 'etc';
  campus: string;
  name: string;
  kind: string;
  weeks: number | null;
  krw: number | null;
  usd: number | null;
  jpy: number | null;
  php: number | null;
  sample: boolean;
}

export type Cur = 'krw' | 'jpy' | 'usd';
export const CUR_LABEL: Record<Cur, string> = { krw: '원(KRW)', jpy: '엔(JPY)', usd: '달러(USD)' };
// 지점 국가의 기본 통화: 한국 원, 일본 엔, 그 밖은 달러(견적 프로그램 KR·JP·USD 화면과 같은 나눔)
export const curOf = (country?: string | null): Cur => (country === '한국' ? 'krw' : country === '일본' ? 'jpy' : 'usd');
const fmt = (n: number | null) => (n === null || n === undefined || Number(n) === 0 ? '-' : Number(n).toLocaleString('ko-KR'));

/** campus 를 주면(상담 ⑤) 그 캠퍼스의 코스·기숙사만 보인다(기타 비용은 공통) */
export function TuitionTables({ rows, cur, campus }: { rows: TuitionRow[]; cur: Cur; campus?: string }) {
  const mine = (r: TuitionRow) => !campus || r.campus.toLowerCase() === campus.toLowerCase();
  const courses = rows.filter((r) => r.section === 'course' && mine(r));
  const dorms = rows.filter((r) => r.section === 'dorm' && mine(r));
  const etc = rows.filter((r) => r.section === 'etc');
  return (
    <>
      <Box title="코스">
        <div className="box-body scroll">
          <table className="tbl center">
            <thead><tr><th>캠퍼스</th><th className="left">코스</th><th>기준 주 수</th><th className="num">{CUR_LABEL[cur]}</th></tr></thead>
            <tbody>
              {courses.map((r, i) => (
                <tr key={i}>
                  <td>{r.campus}</td>
                  <td className="left strong">{r.name}{r.kind && <span className="muted" style={{ fontWeight: 400 }}> · {r.kind}</span>}</td>
                  <td>{r.weeks ? `${r.weeks}주` : '-'}</td>
                  <td className="num">{fmt(r[cur])}</td>
                </tr>
              ))}
              {courses.length === 0 && <tr className="empty"><td colSpan={4}>코스 가격이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </Box>
      <Box title="기숙사">
        <div className="box-body scroll">
          <table className="tbl center">
            <thead><tr><th>캠퍼스</th><th className="left">기숙사</th><th className="num">{CUR_LABEL[cur]}</th></tr></thead>
            <tbody>
              {dorms.map((r, i) => (
                <tr key={i}><td>{r.campus}</td><td className="left strong">{r.name}</td><td className="num">{fmt(r[cur])}</td></tr>
              ))}
              {dorms.length === 0 && <tr className="empty"><td colSpan={3}>기숙사 가격이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </Box>
      <Box title="기타 비용 (현지 비용 포함)">
        <div className="box-body scroll">
          <table className="tbl center">
            <thead><tr><th>구분</th><th className="left">이름</th><th className="num">{CUR_LABEL[cur]}</th><th className="num">페소(PHP)</th></tr></thead>
            <tbody>
              {etc.map((r, i) => (
                <tr key={i}><td className="muted">{r.kind}</td><td className="left">{r.name}</td><td className="num">{fmt(r[cur])}</td><td className="num">{fmt(r.php)}</td></tr>
              ))}
              {etc.length === 0 && <tr className="empty"><td colSpan={4}>기타 비용이 없습니다.</td></tr>}
            </tbody>
          </table>
        </div>
      </Box>
    </>
  );
}
