/**
 * 관리자 앱 core 시험: 연장 종료일(finishOf), 연수 청구 합계(기본 + 연장 인보이스), 연장 현황·변경 이력 목록.
 * 실행: npm --workspace apps/admin run test (빌드할 때도 함께 돈다).
 * 규칙은 작은 가짜 입력으로 확인하고(샘플 데이터가 바뀌어도 흔들리지 않게), 끝에 샘플 데이터(data-sample)로 한 번 더 돌려 본다.
 */
import path from 'node:path';
import { createDb, handleApi, type DataInput, type Raw } from './core';
import { loadDir } from './localData';

let fails = 0;
const expect = (label: string, cond: boolean, extra?: unknown) => {
  if (!cond) fails++;
  console.log((cond ? 'ok  ' : 'FAIL') + ' ' + label + (cond ? '' : ' ' + JSON.stringify(extra)));
};

// 기준일 2026-11-07(업체 추출 시각). 연수 하나 = 학생 하나로 단순하게.
const REF = '2026-11-07T02:00:00Z';
const enrollment = (trId: string, start: string, finish: string, extra: Raw = {}): Raw => ({
  tr_id: trId, tr_st_id: 'S' + trId, st_name: 'TEST ' + trId, tr_start_date: start, tr_finish_date: finish, tr_total_week: '8',
  tr_state_name: '인보이스승인', tr_state: 'INVOICE', tr_deposit_name: '부분납', first_co_ca_code: 'PREMIUM', sd_name: '285_A', ag_name: 'Agency', ...extra,
});
const invoice = (trId: string, total: number, paid: number, currency = 'USD'): Raw => ({ tr_id: trId, tr_currency: currency, sum_ic_price: String(total), sum_id_amount: String(paid) });
const base = (over: Partial<DataInput> = {}): DataInput => ({
  meta: { extracted_at: REF }, enrollments: [], students: [], invoices: [], dorms: [], agencies: [], agents: [], ...over,
});

// ── 1. 연장 종료일: 업체는 연장해도 tr_finish_date 를 그대로 둔다 → 마지막 연장 종료일까지 재학.
{
  const ens = [enrollment('1', '2026-08-23', '2026-10-16'), enrollment('2', '2026-08-23', '2026-10-16')];
  const extensions = [
    { tr_id: '1', tt_id: 'T1', tt_start_date: '2026-10-18', tt_finish_date: '2026-11-13', tt_week: '4', tt_insert_dt: '2026-09-24 10:00:00', sum_price: '1120', sum_amount: '0', tr_currency: 'USD' },
  ];
  const db = createDb(base({ enrollments: ens, invoices: [invoice('1', 2240, 0), invoice('2', 2240, 0)], extensions }));
  const rows = db.listEnrollments(new URLSearchParams('tab=all&all=1')).rows;
  const r1 = rows.find((r) => r.trId === '1')!, r2 = rows.find((r) => r.trId === '2')!;
  expect('연장 연수: 원래 종료(10/16)가 지나도 재학, 종료일 = 마지막 연장 종료(11/13)', r1.status === 'current' && r1.end === '2026-11-13', r1);
  expect('연장 없는 연수: 그대로 졸업', r2.status === 'graduated' && r2.end === '2026-10-16', r2);
  expect('졸업임박 표시는 연장 종료일 기준(14일 안)', r1.note === '졸업임박', r1.note);
  const d = db.studentDetail('S1')!;
  expect('학생 상세: 원래 종료일 origEnd 와 연장 1건', d.enrollments[0].origEnd === '2026-10-16' && d.enrollments[0].extensions.length === 1 && d.enrollments[0].extensions[0].weeks === 4, d.enrollments[0]);
  const noExt = createDb(base({ enrollments: ens, invoices: [] }));
  expect('연장 표가 없으면(배포 전) 예전처럼 원래 종료일', noExt.listEnrollments(new URLSearchParams('tab=all&all=1')).rows.find((r) => r.trId === '1')!.status === 'graduated');
}

// ── 2. 연수 청구 합계: ① inv_summary 합 ② Check Balance ③ invoices(최근 인보이스 하나)
{
  const ens = ['10', '11', '12', '13', '14'].map((id) => enrollment(id, '2026-09-20', '2026-12-11'));
  ens[4].tr_deposit_name = '완납';
  const invoices = [invoice('10', 150, 50), invoice('11', 300, 100), invoice('12', 150, 0), invoice('13', 400, 100), invoice('14', 400, 380)];
  const invoiceSummary = [
    { _tr_id: '10', tt_id: '0', tt_insert_dt: null, week: '8', start_date: '2026-09-20', finish_date: '2026-11-13', tr_currency: 'USD', sum_ic_price: '300', sum_id_amount: '100', sum_tc_price: '6500', sum_td_amount: '6500' },
    { _tr_id: '10', tt_id: 'T10', tt_insert_dt: '2026-10-01 10:00:00', week: '4', start_date: '2026-11-15', finish_date: '2026-12-11', tr_currency: 'USD', sum_ic_price: '150', sum_id_amount: '50', sum_tc_price: '0', sum_td_amount: '0' },
  ];
  const balances = [{ tr_id: '11', tr_currency: 'USD', tr_deposit_state: 'PART', extend_count: '1', cost: '450', payment: '150' }];
  const extensions = [
    { tr_id: '10', tt_id: 'T10', tt_start_date: '2026-11-15', tt_finish_date: '2026-12-11', tt_week: '4', sum_price: '150', sum_amount: '50', tr_currency: 'USD' },
    { tr_id: '11', tt_id: 'T11', tt_start_date: '2026-11-15', tt_finish_date: '2026-12-11', tt_week: '4', sum_price: '150', sum_amount: '50', tr_currency: 'USD' },
    { tr_id: '12', tt_id: 'T12', tt_start_date: '2026-11-15', tt_finish_date: '2026-12-11', tt_week: '4', sum_price: '150', sum_amount: '0', tr_currency: 'USD' },
  ];
  const db = createDb(base({ enrollments: ens, invoices, invoiceSummary, balances, extensions }));
  const rows = new Map(db.listInvoices(new URLSearchParams('tab=all&all=1')).rows.map((r) => [r.trId, r]));
  const r10 = rows.get('10')!, r11 = rows.get('11')!, r12 = rows.get('12')!, r13 = rows.get('13')!, r14 = rows.get('14')!;
  expect('① 인보이스별 합계: 기본 300 + 연장 150 = 450, 입금 150, 미입금 300', r10.total === 450 && r10.paid === 150 && r10.remaining === 300 && r10.extensionInvoices === 1 && !r10.totalPartial, r10);
  expect('① 현지 청구도 인보이스별 합(6,500)', r10.localBilled === 6500, r10.localBilled);
  expect('② 인보이스별 합계가 없으면 Check Balance cost·payment', r11.total === 450 && r11.paid === 150 && r11.extensionInvoices === 1 && !r11.totalPartial, r11);
  expect('③ 둘 다 없고 연장이 있으면 최근 인보이스 하나 + totalPartial', r12.total === 150 && r12.totalPartial && r12.extensionInvoices === 1, r12);
  expect('연장 없는 연수는 invoices 값 그대로', r13.total === 400 && r13.paid === 100 && r13.remaining === 300 && r13.extensionInvoices === 0 && !r13.totalPartial, r13);
  expect('완납은 미입금 0(업체 판정대로)', r14.remaining === 0, r14);
  const d = db.studentDetail('S10')!;
  const inv = d.enrollments[0].invoice!;
  expect('학생 상세: 기본·연장 1 두 줄, 합 = 총액', inv.parts.length === 2 && inv.parts[0].label === '기본' && inv.parts[1].label === '연장 1' && inv.parts.reduce((s, p) => s + p.total, 0) === inv.total, inv.parts);
  const unpaid = db.listUnpaid(new URLSearchParams('scope=all&all=1'));
  expect('미납 목록 미입금 합계도 같은 계산(300 + 300 + 150 + 300)', unpaid.totals.remainingByCurrency.find((c) => c.currency === 'USD')?.amount === 1050, unpaid.totals.remainingByCurrency);
}

// ── 3. 연장 현황(/api/extensions)
{
  const ens = [enrollment('20', '2026-06-01', '2026-08-28'), enrollment('21', '2026-08-23', '2026-10-16'), enrollment('22', '2026-09-20', '2026-11-13')];
  const extensions = [
    { tr_id: '20', tt_id: 'A', tt_start_date: '2026-08-30', tt_finish_date: '2026-09-25', tt_week: '4', tt_insert_dt: '2026-08-01 10:00:00', sum_price: '1120', sum_amount: '1120', tr_currency: 'USD', tt_memo: '레벨 테스트 후' },
    { tr_id: '21', tt_id: 'B', tt_start_date: '2026-10-18', tt_finish_date: '2026-11-13', tt_week: '4', tt_insert_dt: '2026-09-24 10:00:00', sum_price: '152000', sum_amount: '0', tr_currency: 'JPY' },
    { tr_id: '22', tt_id: 'C', tt_start_date: '2026-11-15', tt_finish_date: '2026-12-11', tt_week: '4', tt_insert_dt: '2026-10-20 10:00:00', sum_price: '1120', sum_amount: '0', tr_currency: 'USD' },
    { tr_id: '22', tt_id: 'D', tt_start_date: '2026-12-13', tt_finish_date: '2027-01-08', tt_week: '4', tt_insert_dt: '2026-11-01 10:00:00', sum_price: '1120', sum_amount: '0', tr_currency: 'USD' },
    { tr_id: '99', tt_id: 'E', tt_start_date: '2026-12-13', tt_finish_date: '2027-01-08', tt_week: '4', sum_price: '1', sum_amount: '0', tr_currency: 'USD' },
  ];
  const db = createDb(base({ enrollments: ens, extensions }));
  const all = db.extensions(new URLSearchParams(''));
  expect('연장 현황: 연수 없는 연장(99)은 빼고 4건, 탭 건수(끝남 1·연장 중 1·예정 2)', all.total === 4 && all.tabCounts.done === 1 && all.tabCounts.active === 1 && all.tabCounts.upcoming === 2, all.tabCounts);
  expect('전체 탭은 등록일 최근 순', all.rows.map((r) => r.ttId).join() === 'D,C,B,A', all.rows.map((r) => r.ttId));
  const up = db.extensions(new URLSearchParams('tab=upcoming'));
  expect('예정 탭은 연장 시작 순, 같은 연수의 차수 1/2·2/2', up.rows.map((r) => `${r.ttId}${r.order}/${r.count}`).join() === 'C1/2,D2/2', up.rows.map((r) => [r.ttId, r.order, r.count]));
  expect('통화별 연장 금액 합계(JPY 152,000 · USD 3,360)', JSON.stringify(all.totals.priceByCurrency) === JSON.stringify([{ currency: 'JPY', amount: 152000 }, { currency: 'USD', amount: 3360 }]), all.totals.priceByCurrency);
  expect('메모 검색', db.extensions(new URLSearchParams('field=memo&q=레벨')).rows.map((r) => r.ttId).join() === 'A');
  expect('연장 표가 없으면 hasData false', createDb(base({ enrollments: ens })).extensions(new URLSearchParams('')).hasData === false);
}

// ── 4. 변경 이력(/api/changes)
{
  const ens = [enrollment('30', '2026-09-20', '2026-12-11'), enrollment('31', '2026-10-18', '2027-01-08')];
  const courseChanges = [
    { tr_id: '30', ic_id: 'c1', prev_chg_course: 'ESL-Standard', chg_course: 'ESL-Standard,IELTS-Standard', chg_course_date: '2026-10-18', rqp_cnt: '1' },
    { tr_id: '31', ic_id: 'c2', prev_chg_course: 'Speaking Starter', chg_course: 'Speaking Master', chg_course_date: '2026-11-15', rqp_cnt: '0' },
    { tr_id: '99', ic_id: 'c3', prev_chg_course: 'A', chg_course: 'B', chg_course_date: '2026-11-01' },
  ];
  const dormChanges = [{ tr_id: '30', ic_id: 'd1', prev_chg_dorm: 'R4(P)', chg_dorm: 'R2 (Bal)(P)', chg_dorm_date: '2026-11-01' }];
  const comebacks = [{ tr_id: '31', ic_id: 'b1', chg_course: 'Speaking Master', chg_dorm: 'R4(P)', chg_course_date: '2026-10-18' }];
  const db = createDb(base({ enrollments: ens, courseChanges, dormChanges, comebacks }));
  const c = db.changes(new URLSearchParams(''));
  expect('코스 변경: 연수 없는 행은 빼고 2건, 날짜 최근 순', c.total === 2 && c.rows[0].trId === '31' && c.tabCounts.dorm === 1 && c.tabCounts.comeback === 1, c.rows.map((r) => r.trId));
  expect('여러 코스는 ", " 로 잇고 이전 값을 함께', c.rows[1].next === 'ESL-Standard, IELTS-Standard' && c.rows[1].prev === 'ESL-Standard' && c.rows[1].requests === 1, c.rows[1]);
  const dorm = db.changes(new URLSearchParams('tab=dorm'));
  expect('기숙사 변경: 날짜는 chg_dorm_date, 이전·변경 후 기숙사', dorm.rows[0].date === '2026-11-01' && dorm.rows[0].prev === 'R4(P)' && dorm.rows[0].next === 'R2 (Bal)(P)', dorm.rows[0]);
  const back = db.changes(new URLSearchParams('tab=comeback'));
  expect('복귀: 코스와 기숙사(이전 값 없음)', back.rows[0].next === 'Speaking Master' && back.rows[0].nextDorm === 'R4(P)' && back.rows[0].prev === '', back.rows[0]);
  expect('코스·기숙사 이름 검색', db.changes(new URLSearchParams('field=item&q=IELTS')).rows.map((r) => r.trId).join() === '30');
}

// ── 5. 라우트
{
  const db = createDb(base({ enrollments: [enrollment('40', '2026-09-20', '2026-12-11')] }));
  expect('/api/extensions·/api/changes 200, 모르는 주소 404', handleApi(db, '/api/extensions', new URLSearchParams()).status === 200 && handleApi(db, '/api/changes', new URLSearchParams('tab=dorm')).status === 200 && handleApi(db, '/api/nope', new URLSearchParams()).status === 404);
}

// ── 6. 샘플 데이터로 한 번 더
{
  const db = loadDir(path.resolve(process.cwd(), '../../data-sample/tables'));
  const inv = db.listInvoices(new URLSearchParams('tab=all&all=1')).rows;
  expect('샘플: 인보이스 금액에 NaN 없음', inv.every((r) => [r.total, r.paid, r.remaining].every(Number.isFinite)), inv.find((r) => ![r.total, r.paid, r.remaining].every(Number.isFinite)));
  expect('샘플: 연장 있는 연수가 있고 모두 인보이스별 합계로 계산(최근 인보이스만인 연수 없음)', inv.some((r) => r.extensionInvoices > 0) && !inv.some((r) => r.totalPartial));
  const ext = db.extensions(new URLSearchParams('all=1'));
  const extTr = new Set(ext.rows.map((r) => r.trId));
  const ended = db.listEnrollments(new URLSearchParams('tab=all&all=1')).rows.filter((r) => extTr.has(r.trId));
  expect('샘플: 연장 연수의 종료일 = 마지막 연장 종료일', ended.every((r) => r.end === ext.rows.filter((x) => x.trId === r.trId).reduce((m, x) => (x.extEnd > m ? x.extEnd : m), '')), ended.slice(0, 3));
  const allTr = db.listEnrollments(new URLSearchParams('tab=all&all=1')).rows.map((r) => r.trId);
  const pickTr = [allTr[0], allTr[allTr.length - 1], 'tr_none'];
  const byTr = db.listEnrollments(new URLSearchParams(`tab=all&all=1&tr=${pickTr.join(',')}`)).rows;
  expect('샘플: 연수 번호로 찾기(tr=a,b, 없는 번호는 빠짐, 변경 요청 목록용)', byTr.length === 2 && byTr.every((r) => pickTr.includes(r.trId)), byTr.map((r) => r.trId));
  expect('샘플: 변경 이력 세 탭 모두 있음', (() => { const c = db.changes(new URLSearchParams('')); return c.tabCounts.course > 0 && c.tabCounts.dorm > 0 && c.tabCounts.comeback > 0; })());
  const pr = db.prices(new URLSearchParams(''));
  expect('샘플: 가격표 코스·기숙사·기타비용·커미션이 있고 가격 없는 코스 1개(TOEIC)', pr.hasData && pr.tabCounts.course > 0 && pr.tabCounts.dorm > 0 && pr.tabCounts.etc > 0 && pr.tabCounts.comm === 3 && pr.coursesWithoutPrice === 1, { counts: pr.tabCounts, without: pr.coursesWithoutPrice });
  expect('샘플: 환율은 통화쌍 3개가 지금 적용(기준일 뒤 USDKRW 는 아직 아님), 전체 8줄', pr.tabCounts.exchange === 3 && db.prices(new URLSearchParams('tab=exchange&current=0')).total === 8, pr.tabCounts);
}

// ── 7. 가격표(/api/prices)
{
  const prices: DataInput['prices'] = {
    course_code: [
      { co_id: '1', co_name: 'ESL-Core', co_type: 'REG', ca_code: 'PREMIUM', co_use_yn: 'Y' },
      { co_id: '2', co_name: 'Family 8W', co_type: 'FAMILY', co_week_only: '8', ca_code: 'CHALLENGER', co_use_yn: 'Y' },
      { co_id: '3', co_name: 'TOEIC', co_type: 'REG', ca_code: 'PREMIUM', co_use_yn: 'Y' },
    ],
    price_course: [
      { cc_co_id: '1', cc_week: '4', cc_won: '1512000', cc_usd: '1120', cc_yen: '168000', cc_peso: '0', cc_start_date: '2024-01-01', cc_finish_date: '2099-12-31' },
      { cc_co_id: '1', cc_week: '4', cc_won: '1430000', cc_usd: '1060', cc_yen: '159000', cc_peso: '0', cc_start_date: '2023-01-01', cc_finish_date: '2023-12-31' },
      { cc_co_id: '2', cc_week: '8', cc_won: '3000000', cc_usd: '2200', cc_yen: '0', cc_peso: '0', cc_start_date: '2024-01-01', cc_finish_date: '2099-12-31' },
    ],
    dorm_code: [{ do_id: '9', do_name: 'Stay Out(C)', do_type: 'NONROOM', ca_code: 'CHALLENGER', do_use_yn: 'Y' }],
    price_dorm: [{ dc_do_id: '9', dc_won: '0', dc_usd: '0', dc_yen: '0', dc_peso: '0', dc_start_date: '2024-01-01', dc_finish_date: '2099-12-31' }],
    price_setting: [{ cs_1w: '40', cs_2w: '65', cs_3w: '85', cs_4w: '100', cs_5w: '125', cs_6w: '150', cs_7w: '175', cs_8w: '200', cs_1w_more: '25', cs_start_date: '2020-01-01', cs_finish_date: '2099-12-31', cs_use_yn: 'Y' }],
    price_etc: [
      { ec_id: '1', ec_name: 'SSP', ec_type: 'SSP', ec_peso: '6500', ec_start_date: '2024-01-01', ec_finish_date: '2099-12-31', ec_use_yn: 'Y', ec_order: '1' },
      { ec_id: '2', ec_name: 'Old Book', ec_type: 'BOOK', ec_peso: '800', ec_start_date: '2023-01-01', ec_finish_date: '2024-12-31', ec_use_yn: 'Y', ec_order: '9' },
      { ec_id: '3', ec_name: 'Unused', ec_type: 'BOOK', ec_peso: '500', ec_use_yn: 'N' },
    ],
    promo: [{ prm_id: '1', prm_kind: 'DC', prm_name: 'Winter', prm_target: 'DORM', prm_currency: 'KRW', prm_reg_start_date: '2026-10-01', prm_reg_finish_date: '2026-12-31', prm_use_yn: 'Y', prm_allow_stacking_yn: 'N' }],
    comm_rule: [
      { acr_id: '3', acr_level: 'AGENCY', acr_type: 'BASE', ag_name: 'Agency A', acr_rate: '0.2500', is_now: '1' },
      { acr_id: '1', acr_level: 'ACADEMY', acr_type: 'BASE', acr_rate: '0.2800', is_now: '1' },
      { acr_id: '2', acr_level: 'ACADEMY', acr_type: 'EXTEND', acr_rate: '0.2000', is_now: '0' },
    ],
    // 기준일 2026-11-07. USDKRW: 7/8 적용 중, 12/1 은 아직. 같은 날 두 줄이면 번호가 큰 쪽.
    exchange_rate: [
      { er_id: '10', er_start_date: '2026-06-15', er_type: 'USDKRW', er_rate: '1513.2000' },
      { er_id: '12', er_start_date: '2026-12-01', er_type: 'USDKRW', er_rate: '1420.0000' },
      { er_id: '11', er_start_date: '2026-07-08', er_type: 'USDKRW', er_rate: '1508.2300' },
      { er_id: '5', er_start_date: '2024-01-23', er_type: 'PHPJPY', er_rate: '2.6300' },
      { er_id: '6', er_start_date: '2024-05-07', er_type: 'USDJPY', er_rate: '159.2300' },
      { er_id: '7', er_start_date: '2024-05-07', er_type: 'USDJPY', er_rate: '160.0000' },
    ],
  };
  const db = createDb(base({ prices }));
  const c = db.prices(new URLSearchParams(''));
  expect('코스: 지금 적용분만 2줄(지난 가격 빼고), 코스 이름·캠퍼스·종류 붙음', c.total === 2 && c.rows[0].name === 'Family 8W' && c.rows[0].campus === 'Challenger' && c.rows[0].kind === '가족' && c.rows[0].weekOnly === 8, c.rows);
  expect('코스: 4개 통화 값과 기준 주 수', c.rows[1].usd === 1120 && c.rows[1].krw === 1512000 && c.rows[1].jpy === 168000 && c.rows[1].php === 0 && c.rows[1].weeks === 4, c.rows[1]);
  expect('기간별 값(4주 = 100)과 8주 넘을 때 값', JSON.stringify(c.setting?.weeks) === '[40,65,85,100,125,150,175,200]' && c.setting?.more === 25, c.setting);
  expect('가격 없는 코스 1개(TOEIC)', c.coursesWithoutPrice === 1, c.coursesWithoutPrice);
  expect('전체 기간이면 지난 가격도 3줄', db.prices(new URLSearchParams('current=0')).total === 3);
  const e = db.prices(new URLSearchParams('tab=etc'));
  expect('기타비용: 끝난 항목·사용 안 함 빼고 SSP 1줄, 페소 6,500', e.total === 1 && e.rows[0].name === 'SSP' && e.rows[0].php === 6500, e.rows);
  expect('기숙사: 방 없음 표시', db.prices(new URLSearchParams('tab=dorm')).rows[0].kind === '방 없음');
  expect('프로모션: 등록 기간 안이면 적용', db.prices(new URLSearchParams('tab=promo')).total === 1);
  const m = db.prices(new URLSearchParams('tab=comm&current=0'));
  expect('커미션: 학원 전체가 먼저, 비율은 %(28·20·25)', m.rows.map((r) => `${r.level}-${r.kind}-${r.rate}`).join() === '학원 전체-기본-28,학원 전체-연장-20,에이전시-기본-25', m.rows.map((r) => [r.level, r.kind, r.rate]));
  expect('커미션: is_now=0 은 지금 적용분에서 빠짐', db.prices(new URLSearchParams('tab=comm')).total === 2);
  const x = db.prices(new URLSearchParams('tab=exchange'));
  expect('환율: 통화쌍마다 기준일에 적용되는 1줄(USD/KRW 1508.23, USD/JPY 같은 날이면 번호 큰 160, PHP/JPY)', x.total === 3 && x.rows.map((r) => `${r.name}=${r.rate}`).join() === 'USD/KRW=1508.23,USD/JPY=160,PHP/JPY=2.63', x.rows.map((r) => [r.name, r.rate]));
  const xa = db.prices(new URLSearchParams('tab=exchange&current=0&kind=USDKRW'));
  expect('환율: 끝 = 다음 시작일 전날, 마지막은 비어 있음, 최근 것부터', xa.rows.map((r) => `${r.start}~${r.end}`).join() === '2026-12-01~,2026-07-08~2026-11-30,2026-06-15~2026-07-07', xa.rows.map((r) => [r.start, r.end]));
  expect('환율: 통화쌍 목록(종류)', JSON.stringify([...x.facets.kinds].sort()) === '["PHPJPY","USDJPY","USDKRW"]', x.facets.kinds);
  expect('가격표가 없으면 hasData false', createDb(base()).prices(new URLSearchParams('')).hasData === false);
  expect('/api/prices 200', handleApi(db, '/api/prices', new URLSearchParams('tab=etc')).status === 200);
}

// ── 8. 회계 목록: 인보이스·미납·입금 원장·포인트
{
  const ens = [
    enrollment('50', '2026-09-20', '2026-12-11', { tr_deposit_name: '미납', tr_currency: 'USD', ag_id: 'A1', tr_deposit_due_date: '2026-10-01' }), // 재학, 기한 지남
    enrollment('51', '2026-09-20', '2026-11-13', { tr_deposit_name: '부분납', ag_id: 'A2', tr_deposit_due_date: '2026-12-01' }), // 재학, 졸업 14일 안
    enrollment('52', '2026-11-15', '2027-01-08', { tr_deposit_name: '미납', ag_id: 'A1', tr_deposit_due_date: '0000-00-00' }), // 입학 예정, 기한 없음(업체 0000-00-00)
    enrollment('53', '2026-05-03', '2026-07-24', { tr_deposit_name: '완납', ag_id: 'A2' }), // 졸업
    enrollment('54', '2026-11-15', '2027-01-08', { tr_deposit_name: '미납', tr_state_name: '캔슬', tr_state: 'CANCEL' }), // 취소
  ];
  const invoices = [invoice('50', 1000, 0), invoice('51', 2000, 500, 'KRW'), invoice('52', 1500, 0), invoice('53', 900, 900), invoice('54', 700, 0)];
  const pointHistory = [
    { tr_id: '51', type: 'D', dt: '2026-09-21 09:00:00', point: '10000', php: '10000', ec_name: null },
    { tr_id: '51', type: 'U', dt: '2026-09-21 10:00:00', point: '6500', php: '6500', ec_name: 'SSP' },
    { tr_id: '53', type: 'D', dt: '2026-05-04 09:00:00', point: '8000', php: '8000', ec_name: null },
    { tr_id: '53', type: 'U', dt: '2026-05-04 10:00:00', point: '7000', php: '7000', ec_name: 'Visa' },
  ];
  const deposits = [
    { dp_id: '1', dp_deposit_dt: '2026-11-01 10:00:00', dp_name: 'AGENCY ONE', dp_currency: 'USD', dp_amount: '1000', dp_fee: '0', dp_amount_total: '1000', cnt: '0', sum_id_amount: '0', balance: '1000', dp_confirm_yn: 'N', bk_num: '123-456', bk_owner: 'SECRET' },
    { dp_id: '2', dp_deposit_dt: '2026-11-02 10:00:00', dp_name: 'AGENCY TWO', dp_currency: 'KRW', dp_amount: '500', dp_fee: '0', dp_amount_total: '500', cnt: '1', sum_id_amount: '500', balance: '0', dp_confirm_yn: 'Y' },
    { dp_id: '3', dp_deposit_dt: '2026-11-03 10:00:00', dp_name: 'AGENCY THREE', dp_currency: 'USD', dp_amount: '300', dp_fee: '0', dp_amount_total: '300', cnt: '1', sum_id_amount: '100', balance: '200', dp_confirm_yn: 'Y' },
    { dp_id: '4', dp_deposit_dt: '2026-11-04 10:00:00', dp_name: 'DELETED', dp_currency: 'USD', dp_amount: '1', dp_amount_total: '1', cnt: '0', balance: '1', dp_use_yn: 'N' },
  ];
  const db = createDb(base({ enrollments: ens, invoices, pointHistory, deposits }));
  const cur = db.listInvoices(new URLSearchParams(''));
  expect('인보이스: 기본 탭은 재학(50·51), 탭 건수 재학 2·예정 1(캔슬 54는 취소)·졸업 1·전체 5', cur.total === 2 && cur.tabCounts.current === 2 && cur.tabCounts.upcoming === 1 && cur.tabCounts.graduated === 1 && cur.tabCounts.all === 5, cur.tabCounts);
  expect('인보이스: 재학 탭은 종료일 순(51 → 50)', cur.rows.map((r) => r.trId).join() === '51,50', cur.rows.map((r) => r.trId));
  const all = db.listInvoices(new URLSearchParams('tab=all&all=1'));
  expect('인보이스: 통화별 총액·미입금(USD 미입금 = 1,000 + 1,500 + 700)', JSON.stringify(all.totals.totalByCurrency) === JSON.stringify([{ currency: 'KRW', amount: 2000 }, { currency: 'USD', amount: 4100 }]) && all.totals.remainingByCurrency.find((c) => c.currency === 'USD')?.amount === 3200, all.totals);
  expect('인보이스: 에이전시·납부 조건으로 거르기', db.listInvoices(new URLSearchParams('tab=all&agency=A2&pay=완납')).rows.map((r) => r.trId).join() === '53');
  const up = db.listUnpaid(new URLSearchParams(''));
  expect('미납: 기본은 입학 예정(52), 취소(54)·완납(53)은 빠짐', up.total === 1 && up.rows[0].trId === '52' && up.scopeCounts.all === 3, { rows: up.rows.map((r) => r.trId), counts: up.scopeCounts });
  const upAll = db.listUnpaid(new URLSearchParams('scope=all'));
  expect('미납 전체: 납부 기한 지난 연수 1건(50), 미납 2·부분납 1', upAll.totals.overdue === 1 && upAll.totals.byPay.map((p) => p.count).join() === '2,1', upAll.totals);
  expect('미납: 업체 기한 0000-00-00 은 빈 값(기한 지남으로 세지 않음)', upAll.rows.find((r) => r.trId === '52')?.dueDate === '', upAll.rows.find((r) => r.trId === '52'));
  const dep = db.listDeposits(new URLSearchParams(''));
  expect('입금 원장: 사용 안 함(4) 빼고 3건, 최근 날짜 순', dep.total === 3 && dep.rows.map((d) => d.dpId).join() === '3,2,1', dep.rows.map((d) => d.dpId));
  expect('입금 원장: 받는 계좌 열(bk_*)은 내보내지 않음', dep.rows.every((d) => !Object.keys(d).some((k) => /^bk_|owner|num$/.test(k))) && !JSON.stringify(dep.rows).includes('SECRET'), Object.keys(dep.rows[0]));
  expect('입금 원장: 매칭 상태(없음 1·남음 1·끝 1)', ['none', 'open', 'done'].map((m) => db.listDeposits(new URLSearchParams('match=' + m)).total).join() === '1,1,1');
  const pts = db.points(new URLSearchParams(''));
  expect('포인트: 재학생 잔액은 원장 합(충전 10,000 − 사용 6,500 = 3,500)', pts.rows.find((r) => r.trId === '51')?.pointBalance === 3500, pts.rows.map((r) => [r.trId, r.pointBalance]));
  const clear = db.points(new URLSearchParams('view=clear'));
  expect('포인트 정산: 14일 안 졸업 예정 중 미처리(51)', clear.rows.map((r) => r.trId).join() === '51', clear.rows.map((r) => r.trId));
  const left = db.points(new URLSearchParams('view=leftover'));
  expect('잔액 남은 졸업생(53, 1,000P)', left.rows.length === 1 && left.rows[0].trId === '53' && left.rows[0].pointBalance === 1000, left.rows.map((r) => [r.trId, r.pointBalance]));
  const d = db.studentDetail('S51')!;
  expect('학생 상세 포인트 내역: 충전·사용 순서와 항목', d.enrollments[0].points.map((p) => `${p.kind}:${p.item}:${p.amount}`).join() === '충전::10000,사용:SSP:6500', d.enrollments[0].points);
}

console.log(fails ? `\n${fails}건 실패` : '\n모두 통과');
if (fails) process.exit(1);
