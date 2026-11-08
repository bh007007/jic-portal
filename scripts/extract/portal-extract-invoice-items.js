/*
 * JIC 업체 포털(jicportal.com) 인보이스 항목별 상세 추출 — 브라우저 콘솔용, 5~8분
 *
 * 받는 것: 출국일 기준 지난 1년 ~ 앞으로 1년 연수의 인보이스 한 건 화면(회계팀 > 현지 인보이스 납부 > 편집) 데이터
 *   invoice_info      연수마다 한 줄: 응답의 단일 값과 tr_info 안의 값
 *   inv_<목록 이름>   응답 안의 배열마다 표 하나(인보이스 항목 ic_*, 현지 비용 tc_*, 입금 id_*, 현지 납부 td_* 등). _tr_id 열로 연수와 잇는다.
 *   extra_meta        건수, 쓴 방식, 첫 응답의 모양(키·자료형). 학생 값은 담지 않는다.
 *
 * 부르는 주소 (이 밖의 주소는 부르지 않고 멈춘다)
 *   adm/tuition2/payment              목록 화면(GET, 검색 폼 기본값)
 *   adm/tuition2/payment_load/<쪽>    연수 목록(조회, 기간 최대 1년이라 두 번 나눠 부름)
 *   adm/tuition2/payment_select/<tr_id>  연수 한 건의 인보이스(편집 화면 doSearch 가 여는 조회). 폼 형식 { sel_tt_id }, 빈 값 = 최신
 *     응답 키: summary, tr_info, invoice_list, invoice_cost_st, invoice_cost_ag, invoice_deposit, etc, ca_list,
 *             list_pd_point, list_pu_point, rqp_list, rqr_list (2026-11-08 확인)
 *   adm/tuition2/payment_edit/<tr_id> 편집 화면(GET). 빈 sel_tt_id 가 안 될 때만 여기서 기본값을 읽는다.
 *   CLAUDE.md 의 '*_load 만' 원칙에 대한 예외로, 화면을 여는 조회 주소 둘(payment_select, payment_edit)을 레오가 허용했다(2026-11-08).
 *   저장·삭제 주소(payment_insert_*, payment_delete_*, payment_save_*)는 부르지 않는다.
 *
 * 사용법
 *   1. 업체 포털 관리자로 로그인한 Edge/Chrome에서 F12 → Console에 붙여 넣고 Enter.
 *   2. jic_portal_invoice_items_YYYY-MM-DD.json.gz가 내려받아지면 portal/data/raw/로 옮기고 Claude에게 알린다.
 *
 * 원칙: 비밀번호(*_pw)·세션 필드(token, debug_info, online_user_id)는 저장하지 않는다. 결과 파일에는 실제 개인정보가 있다. 밖으로 보내지 않는다.
 */
(async () => {
  const DELAY_MS = 250;
  const BASE = 'adm/tuition2/';
  const ALLOW = /^adm\/tuition2\/(payment|payment_load\/\d+|payment_select\/[\w-]+|payment_edit\/[\w-]+)$/;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const csrf = () => (document.cookie.match(/csrf_cookie_name=([^;]+)/) || [])[1];
  const DROP = /^(token|debug_info|online_user_id)$|_pw$/;
  const clean = (v) =>
    Array.isArray(v) ? v.map(clean)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.test(k)).map(([k, x]) => [k, clean(x)]))
    : v;
  const log = (...a) => console.log('[JIC 인보이스 항목]', ...a);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const addDays = (iso, n) => { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const isFieldKey = (k) => /^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(k);
  const shape = (v, d = 0) =>
    Array.isArray(v) ? { array: v.length, item: v.length && d < 3 ? shape(v[0], d + 1) : null }
    : v && typeof v === 'object' ? (d >= 3 ? 'object' : Object.fromEntries(Object.keys(v).filter(isFieldKey).slice(0, 300).map((k) => [k, shape(v[k], d + 1)])))
    : v == null ? 'null' : typeof v;

  const guard = (path) => { if (!ALLOW.test(path)) throw new Error('허용하지 않은 주소라 멈춥니다: ' + path); };
  async function get(path) {
    guard(path);
    return (await fetch('/appl/' + path, { credentials: 'include' })).text();
  }
  // 화면의 jAjax 와 같이 폼 형식(x-www-form-urlencoded)으로 보낸다. 목록 검색은 FormData 그대로.
  async function post(path, data) {
    guard(path);
    let body, headers = { 'X-Requested-With': 'XMLHttpRequest' };
    if (data instanceof FormData) { data.set('csrf_test_name', csrf()); body = data; }
    else { body = new URLSearchParams({ ...data, csrf_test_name: csrf() }); headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'; }
    let last = 'failed';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch('/appl/' + path, { method: 'POST', body, credentials: 'include', headers });
        const text = await r.text();
        let j;
        try { j = JSON.parse(text); } catch (e) { last = 'JSON 아님 (HTTP ' + r.status + ')'; }
        if (j !== undefined) return j && typeof j === 'object' ? j : { __err: '빈 응답' };
      } catch (e) { last = String(e.message || e); }
      await sleep(1500);
    }
    return { __err: last };
  }

  // 1) 연수 목록: 출국일 기준 [1년 전, 오늘], [내일, 1년 뒤] 두 기간
  const doc0 = new DOMParser().parseFromString(await get(BASE + 'payment'), 'text/html');
  const form = doc0.getElementById('frm_search') || doc0.querySelector('form');
  if (!form) throw new Error('목록 화면의 검색 폼을 찾지 못했습니다. 로그인 상태를 확인하세요.');
  const targets = new Map();
  const windows = [[addDays(today, -365), today], [addDays(today, 1), addDays(today, 365)]];
  const listInfo = [];
  for (const [from, to] of windows) {
    let got = 0, total = null, error = null;
    for (let p = 1; p <= 200; p++) {
      const fd = new FormData(form);
      fd.set('s_term_key', 'departure');
      fd.set('s_start_date', from);
      fd.set('s_finish_date', to);
      fd.set('s_per_page', '300');
      const j = await post(BASE + 'payment_load/' + p, fd);
      if (j.__err || !Array.isArray(j.list)) { error = String(j.__err || j.message || '목록 없음'); break; }
      total = Number(j.total_size);
      for (const r of j.list) if (r.tr_id && !targets.has(String(r.tr_id))) targets.set(String(r.tr_id), r);
      got += j.list.length;
      if (!j.list.length || !Number.isFinite(total) || got >= total) break;
      await sleep(DELAY_MS);
    }
    listInfo.push({ from, to, rows: got, total, error });
    log('목록', from + '~' + to, got + '건', error ? '(오류: ' + error + ')' : '');
  }
  if (!targets.size) throw new Error('연수 목록이 비었습니다: ' + JSON.stringify(listInfo));

  // 2) 방식 고르기: tt_id 없이 되는지, 편집 화면에서 tt_id 를 읽어야 하는지
  const rootOf = (j) => (j && j.data && typeof j.data === 'object' && !Array.isArray(j.data) ? j.data : j);
  const usable = (j) => j && !j.__err && !(j.message && Object.keys(j).length <= 2) && Object.values(rootOf(j)).some((v) => Array.isArray(v) || (v && typeof v === 'object'));
  async function ttOf(trId) {
    const doc = new DOMParser().parseFromString(await get(BASE + 'payment_edit/' + trId), 'text/html');
    const sel = doc.getElementById('sel_tt_id');
    return sel ? sel.value || (sel.options[0] && sel.options[0].value) || '' : '';
  }
  // 편집 화면의 doSearch: jAjax(page_base_url + "payment_select/" + tr_id, { sel_tt_id }) — 빈 sel_tt_id 는 최신 인보이스.
  const select = (trId, tt) => post(BASE + 'payment_select/' + trId, { sel_tt_id: tt });
  const first = [...targets.keys()][0];
  let mode = 'no_tt';
  let firstTt = '';
  let firstResp = await select(first, '');
  if (!usable(firstResp)) {
    firstTt = await ttOf(first);
    firstResp = await select(first, firstTt);
    mode = 'with_tt';
    if (!usable(firstResp)) throw new Error('payment_select 응답을 쓸 수 없습니다. 응답 키: ' + Object.keys(firstResp || {}).join(','));
  }
  log('방식', mode === 'no_tt' ? 'tt_id 없이' : '편집 화면에서 tt_id를 읽어서', '연수 ' + targets.size + '건');

  // 3) 연수마다 받기: 배열은 표로, 나머지 단일 값은 invoice_info 한 줄로
  const D = { invoice_info: [] };
  let done = 0, errors = 0;
  const add = (trId, tt, resp) => {
    const root = clean(rootOf(resp));
    const info = { _tr_id: trId, _tt_id: tt };
    for (const [k, v] of Object.entries(root)) {
      if (!isFieldKey(k)) continue;
      if (Array.isArray(v)) {
        const name = 'inv_' + k;
        (D[name] ??= []).push(...v.map((x) => (x && typeof x === 'object' ? { _tr_id: trId, ...x } : { _tr_id: trId, value: x })));
      } else if (v && typeof v === 'object') {
        for (const [k2, v2] of Object.entries(v)) {
          if (!isFieldKey(k2)) continue;
          if (Array.isArray(v2)) (D['inv_' + k + '_' + k2] ??= []).push(...v2.map((x) => (x && typeof x === 'object' ? { _tr_id: trId, ...x } : { _tr_id: trId, value: x })));
          else if (!(v2 && typeof v2 === 'object') && !(k2 in info)) info[k2] = v2;
        }
      } else if (!(k in info)) info[k] = v;
    }
    D.invoice_info.push(info);
  };
  add(first, firstTt, firstResp);
  for (const trId of [...targets.keys()].slice(1)) {
    const tt = mode === 'with_tt' ? await ttOf(trId) : '';
    const j = await select(trId, tt);
    if (usable(j)) add(trId, tt, j); else errors++;
    done++;
    if (done % 50 === 0) log(done + '/' + (targets.size - 1) + '건', '오류 ' + errors);
    await sleep(DELAY_MS);
  }

  const check = (v) => {
    if (Array.isArray(v)) return v.forEach(check);
    if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (DROP.test(k)) throw new Error('제외 대상 필드가 남아 있음: ' + k); check(v[k]); }
  };
  check(D);

  const meta = {
    source: 'jicportal.com admin (payment_load, payment_select, payment_edit — 인보이스 항목별 상세)',
    extracted_at: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(D).map(([k, v]) => [k, v.length])),
    excluded_fields: ['token', 'debug_info', 'online_user_id', '*_pw'],
    discovery: { mode, targets: targets.size, errors, lists: listInfo, firstShape: shape(clean(rootOf(firstResp))) },
  };
  const cs = new CompressionStream('gzip');
  const w = cs.writable.getWriter();
  const enc = new TextEncoder();
  const blobP = new Response(cs.readable).blob();
  // 첫 키를 extra_meta 로 둔다: split-export.ps1 이 기존 meta.json(기준일)을 덮어쓰지 않는다.
  await w.write(enc.encode('{"extra_meta":' + JSON.stringify(meta)));
  for (const k of Object.keys(D)) {
    await w.write(enc.encode(',"' + k + '":['));
    for (let i = 0; i < D[k].length; i += 500) await w.write(enc.encode((i ? ',' : '') + D[k].slice(i, i + 500).map((r) => JSON.stringify(r)).join(',')));
    await w.write(enc.encode(']'));
  }
  await w.write(enc.encode('}'));
  await w.close();
  const blob = await blobP;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'jic_portal_invoice_items_' + today + '.json.gz';
  document.body.appendChild(a);
  a.click();
  log('완료', (blob.size / 1048576).toFixed(1) + ' MB', JSON.stringify(meta.counts), '오류 ' + errors + '건 → data/raw/로 옮기고 Claude에게 알려 주세요.');
})();
