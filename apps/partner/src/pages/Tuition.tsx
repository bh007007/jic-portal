import { useState } from 'react';
import { useAuth } from '../auth';
import { useLoad } from '../data';
import { t } from '../i18n';
import { must, supabase } from '../supabase';
import { CUR_LABEL, curOf, TuitionTables, type Cur, type TuitionRow } from '../tuition';
import { Box, Loading, Msg, PageHead } from '../ui';

/**
 * 비용·등록 > 학비표·환불(CL-037·CL-038). 관리자 포털 가격표(공용 DB)가 원본이고 여기서는 읽기만 한다(포털에서 가격 입력 안 함).
 * 지금 적용 중인 코스·기숙사·기타 비용만 보인다(partner_tuition()). 기간별 금액·할인은 견적에서 계산한다.
 * 가격표가 아직 가짜 샘플이면 지점에게는 보이지 않고(원칙 C8), 직원에게만 '샘플' 표시와 함께 보인다.
 */
export default function Tuition() {
  const { member, staff } = useAuth();
  const { data, error } = useLoad(() => must<TuitionRow[]>(supabase.rpc('partner_tuition')));
  const [cur, setCur] = useState<Cur>(curOf(member?.country));
  if (!data) return <Loading error={error} />;
  const sample = data.some((r) => r.sample);

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
          <TuitionTables rows={data} cur={cur} />
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
