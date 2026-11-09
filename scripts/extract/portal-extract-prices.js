/*
 * JIC 업체 포털 가격표 추출. 브라우저 콘솔용, 1분 안쪽. 관리자 포털 기초관리 '가격표'가 읽는다.
 *
 * 받는 것(개인정보 없음, 업체가 정한 가격·규칙)
 *   price_course   코스 가격(cc_*: 코스·주 수별 원·달러·엔·페소, 적용 기간)      ← 마케팅 > 통계 > 예상 금액 화면 코드
 *   price_dorm     기숙사 가격(dc_*: 기숙사별 4개 통화, 적용 기간)              ← 〃
 *   price_setting  기간별 값(cs_1w ~ cs_8w, cs_1w_more, 적용 기간)              ← 〃(기초코드 > 코스비용과 같다)
 *   promo          프로모션(prm_*: 대상·통화·기간·조건)                          ← 〃
 *   course_code    코스 목록(co_*: 캠퍼스, 이름, 종류, 사용 여부)               ← 기초코드 > 코스 course_load(사용 안 함 포함)
 *   dorm_code      기숙사 목록(do_*: 캠퍼스, 이름, 성별, 정원, 사용 여부)       ← 기초코드 > 기숙사 dorm_load(〃)
 *                  예상 금액 화면의 목록은 지금 고를 수 있는 코스(39개)뿐이라, 지난 코스 가격의 이름을 찾으려고 전체 목록을 받는다.
 *   price_etc      기타비용(ec_*: SSP·비자 같은 현지 비용 4개 통화)             ← 기초코드 > 기타비용 etc_cost_load
 *   comm_rule      에이전시 커미션 규칙(acr_*: 학원·국가·에이전시 단위, 비율)    ← 유학원관리 > Commission acr_load
 * 예상 금액 화면은 서버를 부르지 않고 화면 코드(GET)에 가격표를 넣어 둔다. 그 목록을 읽고, 나머지는 읽기 전용 *_load 만 부른다.
 *
 * 사용법: 업체 포털 관리자로 로그인한 Edge/Chrome에서 F12 → Console에 붙여 넣고 Enter.
 *   jic_portal_prices_YYYY-MM-DD.json.gz 를 data/raw/ 로 옮긴 뒤
 *   powershell -ExecutionPolicy Bypass -File scripts/split-export.ps1 -Source data/raw/jic_portal_prices_YYYY-MM-DD.json.gz -DictPath docs/data-dictionary-prices.md
 */
(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const csrf = () => (document.cookie.match(/csrf_cookie_name=([^;]+)/) || [])[1];
  const log = (...a) => console.log('[JIC 가격표]', ...a);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const ALLOW_POST = /^adm\/(basic\/(etc_cost_load|course_load|dorm_load)|agency\/acr_load)\/\d+$/;
  // 남길 열. 다국어 이름·설명, 입력자, 첨부 파일 목록은 빼고 화면에 쓰는 것만.
  const KEEP = {
    price_course: ['cc_co_id', 'cc_week', 'cc_won', 'cc_usd', 'cc_yen', 'cc_peso', 'cc_start_date', 'cc_finish_date'],
    price_dorm: ['dc_do_id', 'dc_won', 'dc_usd', 'dc_yen', 'dc_peso', 'dc_start_date', 'dc_finish_date'],
    price_setting: ['cs_id', 'cs_br_id', 'cs_1w', 'cs_2w', 'cs_3w', 'cs_4w', 'cs_5w', 'cs_6w', 'cs_7w', 'cs_8w', 'cs_1w_more', 'cs_start_date', 'cs_finish_date', 'cs_use_yn'],
    promo: ['prm_id', 'prm_kind', 'prm_type', 'prm_name', 'prm_name_en', 'prm_note', 'prm_country', 'prm_currency', 'prm_campus', 'prm_target', 'prm_target_id', 'prm_target_weeks_yn', 'prm_show_start_date', 'prm_show_finish_date', 'prm_reg_start_date', 'prm_reg_finish_date', 'prm_allow_stacking_yn', 'prm_priority', 'prm_use_yn', 'campus_code', 'conditions'],
    course_code: ['co_id', 'co_ca_id', 'co_name', 'co_name_short', 'co_type', 'co_week_only', 'co_country_only', 'co_order', 'co_use_yn', 'co_start_date', 'co_finish_date', 'ca_code'],
    dorm_code: ['do_id', 'do_ca_id', 'do_name', 'do_name_short', 'do_type', 'do_gender', 'do_max', 'do_include', 'do_order', 'do_use_yn', 'do_start_date', 'do_finish_date', 'ca_code'],
    price_etc: ['ec_id', 'ec_br_id', 'ec_name', 'ec_type', 'ec_won', 'ec_usd', 'ec_yen', 'ec_peso', 'ec_start_date', 'ec_finish_date', 'ec_use_yn', 'ec_point_flag', 'ec_order', 'ec_memo'],
    comm_rule: ['acr_id', 'acr_level', 'acr_type', 'acr_ag_id', 'ag_name', 'acr_country', 'country_name', 'acr_min_week', 'acr_max_week', 'acr_start_date', 'acr_finish_date', 'acr_rate', 'acr_memo', 'is_now'],
  };
  const pick = (name, rows) => rows.map((r) => Object.fromEntries(KEEP[name].map((k) => [k, k === 'conditions' && r[k] != null && typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k] ?? null])));

  // 1) 예상 금액 화면 코드의 목록: "var 이름 = [...]" 를 괄호 짝을 맞춰 잘라 JSON 으로 읽는다.
  const html = await (await fetch('/appl/adm/simul/estimate', { credentials: 'include' })).text();
  const code = [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('script:not([src])')].map((s) => s.textContent).join('\n');
  const grab = (name) => {
    const m = code.match(new RegExp('(?:var|let|const)\\s+' + name + '\\s*=\\s*'));
    if (!m) return { error: '없음' };
    const i = m.index + m[0].length;
    const open = code[i], close = open === '[' ? ']' : open === '{' ? '}' : null;
    if (!close) return { error: '목록 아님' };
    let depth = 0, inStr = null;
    for (let j = i; j < code.length; j++) {
      const ch = code[j];
      if (inStr) { if (ch === '\\') { j++; continue; } if (ch === inStr) inStr = null; continue; }
      if (ch === '"' || ch === "'") { inStr = ch; continue; }
      if (ch === open) depth++;
      else if (ch === close && --depth === 0) { try { return { value: JSON.parse(code.slice(i, j + 1)) }; } catch (e) { return { error: 'JSON 아님' }; } }
    }
    return { error: '괄호가 닫히지 않음' };
  };
  const D = {}, info = {};
  const FROM_PAGE = { price_course: 'course_cost_list', price_dorm: 'dorm_cost_list', price_setting: 'course_cost_setting_list', promo: 'promo_list' };
  for (const [table, name] of Object.entries(FROM_PAGE)) {
    const g = grab(name);
    const rows = Array.isArray(g.value) ? g.value : [];
    D[table] = pick(table, rows);
    info[table] = { url: 'adm/simul/estimate (화면 코드 ' + name + ')', total: rows.length, error: g.error || (Array.isArray(g.value) ? null : '배열 아님'), columns: KEEP[table] };
    log(table, rows.length + '건', g.error ? '오류: ' + g.error : '');
  }

  // 2) 코스·기숙사·기타비용·커미션 목록(읽기 전용 *_load). patch: 검색 폼에서 바꿀 값(사용 안 함까지 받기).
  async function list(url, page, form, patch = {}) {
    const rows = [];
    let total = null, error = null;
    const html2 = await (await fetch('/appl/' + page, { credentials: 'include' })).text();
    const f = new DOMParser().parseFromString(html2, 'text/html').getElementById(form);
    for (let p = 1; p <= 50; p++) {
      const path = url + '/' + p;
      if (!ALLOW_POST.test(path)) throw new Error('허용하지 않은 주소라 멈춥니다: ' + path);
      const fd = f ? new FormData(f) : new FormData();
      fd.set('s_per_page', '100');
      for (const [k, v] of Object.entries(patch)) fd.set(k, v);
      fd.set('csrf_test_name', csrf());
      const r = await fetch('/appl/' + path, { method: 'POST', body: fd, credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      let j = null;
      try { j = JSON.parse(await r.text()); } catch (e) { /* 아래에서 멈춘다 */ }
      if (!j || !Array.isArray(j.list)) { error = 'HTTP ' + r.status; break; }
      total = Number(j.total_size);
      rows.push(...j.list);
      if (!j.list.length || rows.length >= total) break;
      await sleep(200);
    }
    return { rows, total, error };
  }
  const LISTS = [
    ['course_code', 'adm/basic/course_load', 'adm/basic/course', 'frm_search', { s_co_use_yn: '' }],
    ['dorm_code', 'adm/basic/dorm_load', 'adm/basic/dorm', 'frm_search', { s_do_use_yn: '', s_do_show_reg_yn: '' }],
    ['price_etc', 'adm/basic/etc_cost_load', 'adm/basic/etc_cost', 'frm_search', {}],
    ['comm_rule', 'adm/agency/acr_load', 'adm/agency/comm', 'frm_search', {}],
  ];
  for (const [table, url, page, form, patch] of LISTS) {
    const r = await list(url, page, form, patch);
    D[table] = pick(table, r.rows);
    info[table] = { url, total: r.total, error: r.error, columns: KEEP[table] };
    log(table, r.rows.length + '건', r.total != null ? '(전체 ' + r.total + ')' : '', r.error ? '오류: ' + r.error : '');
  }

  const meta = { source: 'jicportal.com admin (가격표: 예상 금액 화면 코드, course_load, dorm_load, etc_cost_load, acr_load)', extracted_at: new Date().toISOString(), counts: Object.fromEntries(Object.entries(D).map(([k, v]) => [k, v.length])), discovery: info };
  const json = '{"extra_meta":' + JSON.stringify(meta) + Object.keys(D).map((k) => ',"' + k + '":' + JSON.stringify(D[k])).join('') + '}';
  const blob = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'jic_portal_prices_' + today + '.json.gz';
  document.body.appendChild(a);
  a.click();
  log('완료', (blob.size / 1024).toFixed(0) + ' KB', JSON.stringify(meta.counts));
})();
