/*
 * JIC 업체 포털(jicportal.com) 데이터 추출 스크립트 — 브라우저 콘솔용
 *
 * 사용법
 *   1. Edge 또는 Chrome에서 https://jicportal.com/appl/adm/dashboard/recent 에 관리자로 로그인한다.
 *   2. F12 → Console 탭에 이 파일 전체를 붙여 넣고 Enter.
 *   3. 진행 상황이 콘솔에 찍히고, 끝나면 jic_portal_export_YYYY-MM-DD.json.gz 가 다운로드된다.
 *   4. 파일을 portal/data/raw/ 로 옮기고 scripts/split-export.ps1 을 실행한다.
 *
 * 원칙
 *   - 읽기 전용 목록 API(*_load)만 호출한다. 저장·삭제·초기화 주소는 호출하지 않는다.
 *   - 비밀번호(*_pw)와 세션 필드(token, debug_info, online_user_id)는 저장하지 않는다.
 *   - 요청 사이에 간격을 둬 업체 서버에 부담을 주지 않는다. 전체 실행에 약 15~20분 걸린다.
 *   - 결과 파일에는 실제 개인정보가 들어 있다. GitHub·클라우드에 올리지 않는다.
 */
(async () => {
  const YEARS = [2008, new Date().getFullYear() + 3];
  const CAMPUSES = ['11', '12', '14']; // Challenger, Premium, MCO
  const DELAY_MS = 250;

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const csrf = () => (document.cookie.match(/csrf_cookie_name=([^;]+)/) || [])[1];
  const DROP = /^(token|debug_info|online_user_id)$|_pw$/;
  const clean = rec => Object.fromEntries(Object.entries(rec).filter(([k]) => !DROP.test(k)));
  const log = (...a) => console.log('[JIC 추출]', ...a);

  async function searchForm(page) {
    const html = await (await fetch('/appl/' + page, { credentials: 'include' })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const form = doc.getElementById('frm_search') || doc.querySelector('form');
    return form ? new FormData(form) : new FormData();
  }

  async function post(url, fd) {
    fd.set('csrf_test_name', csrf());
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url, { method: 'POST', body: fd, credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        return JSON.parse(await r.text());
      } catch (e) { await sleep(1500); }
    }
    return { __err: 'failed' };
  }

  async function pullAll(name, page, url, tweak, perPage = 300) {
    const base = await searchForm(page);
    if (tweak) tweak(base);
    const rows = [];
    for (let p = 1; ; p++) {
      const fd = new FormData();
      for (const [k, v] of base.entries()) fd.append(k, v);
      fd.set('s_per_page', String(perPage));
      const j = await post('/appl/' + url + '/' + p, fd);
      if (j.__err || j.code || (j.message && !j.list)) { console.warn('[JIC 추출]', name, 'p' + p, j.__err || j.code || j.message); break; }
      const list = j.list || [];
      rows.push(...list.map(clean));
      if (list.length === 0 || rows.length >= Number(j.total_size)) break;
      await sleep(DELAY_MS);
    }
    return rows;
  }

  const byYear = async (name, page, url, from, to, extra) => {
    const map = new Map();
    for (let y = YEARS[0]; y <= YEARS[1]; y++) {
      const rows = await pullAll(name + ' ' + y, page, url, fd => { fd.set(from, y + '-01-01'); fd.set(to, y + '-12-31'); if (extra) extra(fd); });
      rows.forEach(r => map.set(r.tr_id + '|' + (r.the_id || ''), r));
    }
    return [...map.values()];
  };

  const D = {};
  const noDates = fd => { fd.set('s_start_date', ''); fd.set('s_finish_date', ''); };

  D.students = await pullAll('students', 'adm/student/regist', 'adm/student/regist_load'); log('students', D.students.length);
  D.enrollments = await pullAll('enrollments', 'adm/register/regist', 'adm/register/regist_load', fd => { fd.delete('s_tr_state[]'); noDates(fd); }); log('enrollments', D.enrollments.length);
  D.invoices = await byYear('invoices', 'adm/tuition2/payment', 'adm/tuition2/payment_load', 's_start_date', 's_finish_date'); log('invoices', D.invoices.length);
  D.deposits = await pullAll('deposits', 'adm/tuition/matching', 'adm/tuition/matching_deposit_load', noDates); log('deposits', D.deposits.length);
  D.point_history = await pullAll('point_history', 'adm/point/history', 'adm/point/history_load', noDates, 500); log('point_history', D.point_history.length);
  D.dorm_assignments = [];
  for (const ca of CAMPUSES) D.dorm_assignments.push(...await byYear('checkin ' + ca, 'adm/checkin/checkin_v3', 'adm/checkin/checkin_v3_load', 's_st_date_from', 's_st_date_to', fd => fd.set('s_campus', ca)));
  log('dorm_assignments', D.dorm_assignments.length);
  D.memos = await pullAll('memos', 'adm/train2/checking_memo', 'adm/train2/checking_memo_load'); log('memos', D.memos.length);
  D.agencies = await pullAll('agencies', 'adm/agency/agency', 'adm/agency/agency_load'); log('agencies', D.agencies.length);
  D.agents = [];
  for (const [i, ag] of D.agencies.entries()) {
    const fd = new FormData(); fd.set('ag_id', ag.ag_id); fd.set('s_per_page', '200');
    const j = await post('/appl/adm/agency/agent_load/1', fd);
    (j.list || []).forEach(a => D.agents.push(clean(a)));
    if (i % 50 === 0) log('agents', D.agents.length, '/', i + 1, 'agencies');
    await sleep(200);
  }
  log('agents', D.agents.length);

  // 연수 메모 이력: 신입·연장 목록의 tm_cnt > 0 인 연수만 조회 (2026-11-07 기준 0건)
  const fresh = await pullAll('freshman', 'adm/academic/freshman', 'adm/academic/freshman_load', noDates, 500);
  D.memo_history = [];
  for (const t of fresh.filter(x => Number(x.tm_cnt) > 0)) {
    const fd = new FormData(); fd.set('dlg_train_memo_tr_id', t.tr_id); fd.set('dlg_train_memo_s_memo', ''); fd.set('s_per_page', '100');
    const j = await post('/appl/com/dialog/dlg_train_memo_load/1', fd);
    (j.list || []).forEach(m => D.memo_history.push({ tr_id_ref: t.tr_id, ...clean(m) }));
    await sleep(150);
  }
  log('memo_history', D.memo_history.length);

  for (const k in D) for (const r of D[k]) for (const f in r) if (DROP.test(f)) throw new Error('제외 대상 필드가 남아 있음: ' + f);

  const today = new Date().toISOString().slice(0, 10);
  const meta = {
    source: 'jicportal.com admin (read-only *_load endpoints)',
    extracted_at: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(D).map(([k, v]) => [k, v.length])),
    excluded_fields: ['token', 'debug_info', 'online_user_id', '*_pw'],
  };
  const cs = new CompressionStream('gzip');
  const w = cs.writable.getWriter();
  const enc = new TextEncoder();
  const blobP = new Response(cs.readable).blob();
  await w.write(enc.encode('{"meta":' + JSON.stringify(meta)));
  for (const k of Object.keys(D)) {
    await w.write(enc.encode(',"' + k + '":['));
    for (let i = 0; i < D[k].length; i += 500) await w.write(enc.encode((i ? ',' : '') + D[k].slice(i, i + 500).map(r => JSON.stringify(r)).join(',')));
    await w.write(enc.encode(']'));
  }
  await w.write(enc.encode('}'));
  await w.close();
  const blob = await blobP;
  const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'jic_portal_export_' + today + '.json.gz';
  document.body.appendChild(a);
  a.click();
  log('완료', (blob.size / 1048576).toFixed(1) + ' MB', 'sha256', sha, meta.counts);
})();
