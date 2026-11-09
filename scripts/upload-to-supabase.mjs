// 데이터 폴더(*.ndjson)를 Supabase legacy_* 테이블에 올린다. 기본은 가짜 샘플 데이터.
//
//   $env:SUPABASE_URL = "https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "서비스 키 (Supabase > Project Settings > API)"
//   node scripts/upload-to-supabase.mjs                 # data-sample/tables 업로드
//   node scripts/upload-to-supabase.mjs --replace       # 기존 행을 지우고 다시 업로드
//
// 실제 추출본(data/tables)은 보안 점검 전까지 올리지 않는다. 꼭 필요하면 --dir data/tables --allow-real.
// 서비스 키는 모든 권한을 가진 키다. 코드·GitHub·메신저에 붙여 넣지 말고 이 터미널에서만 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => args.includes(name);
const dirArg = args[args.indexOf('--dir') + 1];
const dir = path.resolve(root, args.includes('--dir') && dirArg ? dirArg : 'data-sample/tables');

const url = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !key) {
  console.error('SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 환경변수를 먼저 설정하세요.');
  process.exit(1);
}
if (path.relative(root, dir).replace(/\\/g, '/').startsWith('data/') && !opt('--allow-real')) {
  console.error('실제 추출본은 보안 점검 전까지 올리지 않습니다. 필요하면 --allow-real 을 붙이세요.');
  process.exit(1);
}

const read = (name) => {
  const f = path.join(dir, name);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)) : [];
};
// 연장·변경 표에 올릴 열: apps/admin/server/core.ts 의 EXTENSION_COLUMNS·CHANGE_COLUMNS 와 같게 둔다(바꾸면 함께 바꾼다).
const EXTENSION_COLUMNS = ['tr_id', 'tt_id', 'tt_start_date', 'tt_finish_date', 'tt_week', 'tt_memo', 'tt_insert_dt', 'sum_price', 'sum_amount', 'tr_currency'];
// 청구 합계 표에 올릴 열: core.ts 의 INVOICE_SUMMARY_COLUMNS·BALANCE_COLUMNS 와 같게 둔다.
const INVOICE_SUMMARY_COLUMNS = ['_tr_id', 'tt_id', 'tt_insert_dt', 'week', 'start_date', 'finish_date', 'tr_currency', 'sum_ic_price', 'sum_id_amount', 'sum_tc_price', 'sum_td_amount'];
const BALANCE_COLUMNS = ['tr_id', 'tr_currency', 'tr_deposit_state', 'extend_count', 'cost', 'payment'];
// 가격표 표 8개에 올릴 열: core.ts 의 PRICE_COLUMNS 와 같게 둔다. 표 하나(legacy_prices)에 data._table 로 나눠 담는다.
const PRICE_COLUMNS = {
  price_course: ['cc_co_id', 'cc_week', 'cc_won', 'cc_usd', 'cc_yen', 'cc_peso', 'cc_start_date', 'cc_finish_date'],
  price_dorm: ['dc_do_id', 'dc_won', 'dc_usd', 'dc_yen', 'dc_peso', 'dc_start_date', 'dc_finish_date'],
  price_setting: ['cs_id', 'cs_br_id', 'cs_1w', 'cs_2w', 'cs_3w', 'cs_4w', 'cs_5w', 'cs_6w', 'cs_7w', 'cs_8w', 'cs_1w_more', 'cs_start_date', 'cs_finish_date', 'cs_use_yn'],
  promo: ['prm_id', 'prm_kind', 'prm_type', 'prm_name', 'prm_name_en', 'prm_note', 'prm_country', 'prm_currency', 'prm_campus', 'prm_target', 'prm_target_id', 'prm_target_weeks_yn', 'prm_show_start_date', 'prm_show_finish_date', 'prm_reg_start_date', 'prm_reg_finish_date', 'prm_allow_stacking_yn', 'prm_priority', 'prm_use_yn', 'campus_code', 'conditions'],
  course_code: ['co_id', 'co_ca_id', 'co_name', 'co_name_short', 'co_type', 'co_week_only', 'co_country_only', 'co_order', 'co_use_yn', 'co_start_date', 'co_finish_date', 'ca_code'],
  dorm_code: ['do_id', 'do_ca_id', 'do_name', 'do_name_short', 'do_type', 'do_gender', 'do_max', 'do_include', 'do_order', 'do_use_yn', 'do_start_date', 'do_finish_date', 'ca_code'],
  price_etc: ['ec_id', 'ec_br_id', 'ec_name', 'ec_type', 'ec_won', 'ec_usd', 'ec_yen', 'ec_peso', 'ec_start_date', 'ec_finish_date', 'ec_use_yn', 'ec_point_flag', 'ec_order', 'ec_memo'],
  comm_rule: ['acr_id', 'acr_level', 'acr_type', 'acr_ag_id', 'ag_name', 'acr_country', 'country_name', 'acr_min_week', 'acr_max_week', 'acr_start_date', 'acr_finish_date', 'acr_rate', 'acr_memo', 'is_now'],
};
const CHANGE_COLUMNS = ['tr_id', 'ic_id', 'prev_chg_course', 'chg_course', 'chg_course_date', 'prev_chg_dorm', 'chg_dorm', 'chg_dorm_date', 'rqp_cnt'];
const PLAN = [
  ['legacy_students', 'students.ndjson', (r) => r.st_id],
  ['legacy_enrollments', 'enrollments.ndjson', (r) => r.tr_id],
  ['legacy_invoices', 'invoices.ndjson', (r) => r.tr_id],
  ['legacy_dorm_assignments', 'dorm_assignments.ndjson', (r) => r.tr_id],
  ['legacy_agencies', 'agencies.ndjson', (r) => r.ag_id],
  ['legacy_agents', 'agents.ndjson', (r) => r.am_id],
  ['legacy_deposits', 'deposits.ndjson', (r) => r.dp_id],
  ['legacy_rooms', 'rooms.ndjson', (r) => r.roo_id],
  // 포인트 내역은 고유 번호가 없어 연수·시각·구분·순번으로 만든다. 화면에 쓰는 열만 올린다(apps/admin/server/core.ts POINT_HISTORY_COLUMNS).
  ['legacy_point_history', 'point_history.ndjson', (r, i) => `${r.tr_id}-${r.dt}-${r.type}-${i}`,
    ['tr_id', 'type', 'dt', 'point', 'php', 'ec_name', 'nickname', 'memo', 'campus']],
  // 연장·변경(20261109030000_legacy_extend.sql). 화면에 쓰는 열만 올린다(core.ts EXTENSION_COLUMNS·CHANGE_COLUMNS, 입금 은행명·연락처는 빼고).
  // 표가 아직 없으면(마이그레이션 적용 전) 건너뛴다.
  ['legacy_extensions', 'extend.ndjson', (r) => r.tt_id, EXTENSION_COLUMNS, { optional: true }],
  ['legacy_course_changes', 'change_course.ndjson', (r) => r.ic_id, CHANGE_COLUMNS, { optional: true }],
  ['legacy_dorm_changes', 'change_dorm.ndjson', (r) => r.ic_id, CHANGE_COLUMNS, { optional: true }],
  ['legacy_comebacks', 'change_comeback.ndjson', (r) => r.ic_id, CHANGE_COLUMNS, { optional: true }],
  // 청구 합계(20261109060000_legacy_invoice_summary.sql): 인보이스별 합계(기본 + 연장), 업체 Check Balance. 표가 없으면 건너뛴다.
  ['legacy_invoice_summary', 'inv_summary.ndjson', (r) => (r._tr_id && r.tt_id ? `${r._tr_id}-${r.tt_id}` : null), INVOICE_SUMMARY_COLUMNS, { optional: true }],
  ['legacy_balances', 'balance.ndjson', (r) => r.tr_id, BALANCE_COLUMNS, { optional: true }],
];
// 예전 형식 service_role 키(eyJ…)는 Authorization 에도 넣고, 새 형식(sb_secret_…)은 apikey 헤더만 쓴다.
const headers = { apikey: key, 'Content-Type': 'application/json', ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };

async function call(method, table, query, body, extra = {}) {
  const r = await fetch(`${url}/rest/v1/${table}${query}`, { method, headers: { ...headers, ...extra }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${table} ${method} ${r.status}: ${await r.text()}`);
}

async function upload(table, rows, { optional = false } = {}) {
  if (optional) {
    try {
      await call('GET', table, '?select=id&limit=1');
    } catch (e) {
      if (/ 404: |PGRST205|does not exist/.test(String(e.message))) return console.log(`${table}: 표 없음(마이그레이션 적용 전), 건너뜀`);
      throw e;
    }
  }
  if (opt('--replace')) await call('DELETE', table, '?id=not.is.null');
  for (let i = 0; i < rows.length; i += 500) {
    await call('POST', table, '', rows.slice(i, i + 500), { Prefer: 'resolution=merge-duplicates,return=minimal' });
  }
  console.log(`${table}: ${rows.length}건`);
}

console.log('업로드 대상 폴더:', path.relative(root, dir));
for (const [table, file, idOf, cols, how] of PLAN) {
  const byId = new Map();
  read(file).forEach((r, i) => {
    const id = idOf(r, i);
    if (id == null) return;
    // 계좌 정보(bk_*, *_acct_bank/num/owner)는 올리지 않는다. (tr_acct_memo 같은 회계 메모는 올린다)
    const entries = cols ? cols.map((c) => [c, r[c] ?? null]) : Object.entries(r);
    const data = Object.fromEntries(entries.filter(([k]) => !/^bk_|_acct_(bank|num|owner)$/.test(k)));
    byId.set(String(id), { id: String(id), data });
  });
  await upload(table, [...byId.values()], how);
}
// 가격표(20261109110000_legacy_prices.sql): 표 8개를 합쳐 한 번에 올린다(표가 없으면 건너뜀).
const priceRows = Object.entries(PRICE_COLUMNS).flatMap(([t, cols]) =>
  read(t + '.ndjson').map((r, i) => ({ id: `${t}:${i}`, data: { _table: t, ...Object.fromEntries(cols.map((c) => [c, r[c] ?? null])) } })),
);
await upload('legacy_prices', priceRows, { optional: true });
const metaFile = path.join(dir, 'meta.json');
if (fs.existsSync(metaFile)) await upload('legacy_meta', [{ id: 'current', data: JSON.parse(fs.readFileSync(metaFile, 'utf8')) }]);
console.log('완료');
