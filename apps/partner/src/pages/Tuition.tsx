import { useState } from 'react';
import { useAuth } from '../auth';
import { useLoad } from '../data';
import { t } from '../i18n';
import { must, supabase } from '../supabase';
import { Box, Loading, Msg, PageHead } from '../ui';

interface Row {
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

type Cur = 'krw' | 'jpy' | 'usd';
const CUR_LABEL: Record<Cur, string> = { krw: '원(KRW)', jpy: '엔(JPY)', usd: '달러(USD)' };
// 지점 국가의 기본 통화: 한국 원, 일본 엔, 그 밖은 달러(견적 프로그램 KR·JP·USD 화면과 같은 나눔)
const curOf = (country?: string | null): Cur => (country === '한국' ? 'krw' : country === '일본' ? 'jpy' : 'usd');
const fmt = (n: number | null) => (n === null || n === undefined || Number(n) === 0 ? '-' : Number(n).toLocaleString('ko-KR'));

/**
 * 비용·등록 > 학비표·환불(CL-037·CL-038). 관리자 포털 가격표(공용 DB)가 원본이고 여기서는 읽기만 한다(포털에서 가격 입력 안 함).
 * 지금 적용 중인 코스·기숙사·기타 비용만 보인다(partner_tuition()). 기간별 금액·할인은 견적에서 계산한다.
 * 가격표가 아직 가짜 샘플이면 지점에게는 보이지 않고(원칙 C8), 직원에게만 '샘플' 표시와 함께 보인다.
 */
export default function Tuition() {
  const { member, staff } = useAuth();
  const { data, error } = useLoad(() => must<Row[]>(supabase.rpc('partner_tuition')));
  const [cur, setCur] = useState<Cur>(curOf(member?.country));
  if (!data) return <Loading error={error} />;
  const sample = data.some((r) => r.sample);
  const courses = data.filter((r) => r.section === 'course');
  const dorms = data.filter((r) => r.section === 'dorm');
  const etc = data.filter((r) => r.section === 'etc');

  return (
    <>
      <PageHead
        title={t('menu.tuition')}
        side={
          data.length > 0 ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              통화
              <select value={cur} onChange={(e) => setCur(e.target.value as Cur)}>
                {(Object.keys(CUR_LABEL) as Cur[]).map((c) => <option key={c} value={c}>{CUR_LABEL[c]}</option>)}
              </select>
            </label>
          ) : undefined
        }
      />
      {sample && <Msg kind="warn">샘플 가격입니다(실제 가격이 아닙니다). 실제 가격표를 올리기 전이라 에이전시에게는 보이지 않고 직원에게만 보입니다.</Msg>}
      {data.length === 0 ? (
        <div className="state">학비표를 준비하고 있습니다. 실제 가격표를 올린 뒤 보입니다. 지금은 견적에서 금액을 확인하세요.</div>
      ) : (
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
          <p className="muted" style={{ fontSize: 12 }}>
            가격은 JIC 관리자 포털 가격표에서 읽습니다(CL-038). 업체 가격표의 기준 주 수(대부분 4주) 금액이고, 기간별 금액·할인·프로모션은 견적에서 계산합니다.
            {staff && !member ? ' 직원 화면: 커미션은 이 화면에 나오지 않습니다.' : ''}
          </p>
        </>
      )}
      <Box title="환불 규정">
        <p className="empty">{t('common.preparing')}</p>
      </Box>
    </>
  );
}
