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
  expect('샘플: 변경 이력 세 탭 모두 있음', (() => { const c = db.changes(new URLSearchParams('')); return c.tabCounts.course > 0 && c.tabCounts.dorm > 0 && c.tabCounts.comeback > 0; })());
}

console.log(fails ? `\n${fails}건 실패` : '\n모두 통과');
if (fails) process.exit(1);
