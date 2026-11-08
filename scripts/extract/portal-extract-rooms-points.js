/*
 * JIC 업체 포털 추가 추출 2: 포인트 잔액(전체), 오늘 기숙사 입실자, 학생별 방·침대 배정. 브라우저 콘솔용, 2~4분.
 * portal-extract-extra.js 결과를 보고 검색 조건을 맞춘 버전이다(2026-11-08).
 *   - 포인트 잔액: 화면 기본값이 '마이너스 잔액만'(s_balance=minus)이라 비우고 받는다. 연수별 충전 합계(total_deposit)·사용 합계(total_usage).
 *   - 오늘 입실자: 체크인 화면 목록(checkin_v3_load), 캠퍼스별, 시작·끝 날짜 모두 오늘.
 *   - 방·침대: 체크인 화면의 학생별 조회(checkin_v3_student_rooms, st_id)를 입실자마다 부른다.
 * 필요한 열만 남긴다. 학생 연락처·여권, 에이전시·담당자 정보, 비밀번호·세션·SQL 문자열은 저장하지 않는다.
 *
 * 사용법: 업체 포털 관리자로 로그인한 Edge/Chrome에서 F12 → Console에 붙여 넣고 Enter.
 *   jic_portal_extra2_YYYY-MM-DD.json.gz 를 data/raw/ 로 옮긴 뒤
 *   powershell -ExecutionPolicy Bypass -File scripts/split-export.ps1 -Source data/raw/jic_portal_extra2_YYYY-MM-DD.json.gz
 * 읽기 전용 조회 주소만 부른다(주소에 save·delete·update 같은 말이 있으면 멈춘다).
 */
(async () => {
  const DELAY_MS = 200;
  const CAMPUSES = ['11', '12', '14']; // Challenger, Premium, MCO
  const UNSAFE = /save|delete|del_|remove|clear|update|insert|upload|proc|reset|modify|change|cancel|approve|send|sms|mail/i;
  const DROP = /^(token|debug_info|online_user_id|sql)$|_pw$/;
  const PERSONAL = /^(st_(?!id$)|ag_|am_|br_|tr_pass|tr_st_cell|tr_parent_tel|tr_kakao|tr_skype|tr_interview_tel)/;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const csrf = () => (document.cookie.match(/csrf_cookie_name=([^;]+)/) || [])[1];
  const log = (...a) => console.log('[JIC 추가 추출2]', ...a);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const keep = (row, cols) => Object.fromEntries(cols.filter((c) => c in row).map((c) => [c, row[c]]));
  const scrub = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !DROP.test(k) && !PERSONAL.test(k)));

  async function post(url, obj) {
    if (UNSAFE.test(url)) throw new Error('조회 주소가 아니라서 멈춥니다: ' + url);
    const fd = new FormData();
    for (const [k, v] of Object.entries(obj)) fd.append(k, v);
    fd.set('csrf_test_name', csrf());
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch('/appl/' + url, { method: 'POST', body: fd, credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        return JSON.parse(await r.text());
      } catch (e) { await sleep(1500); }
    }
    return { __err: 'failed' };
  }
  async function formOf(page) {
    const html = await (await fetch('/appl/' + page, { credentials: 'include' })).text();
    const f = new DOMParser().parseFromString(html, 'text/html').getElementById('frm_search');
    return f ? Object.fromEntries([...new FormData(f)].filter(([k]) => k !== 'csrf_test_name')) : {};
  }
  async function pages(name, url, base, perPage) {
    const rows = [];
    let total = null, error = null;
    for (let p = 1; p <= 500; p++) {
      const j = await post(url + '/' + p, { ...base, s_per_page: String(perPage) });
      if (j.__err || !Array.isArray(j.list)) { error = j.__err || 'list 없음'; break; }
      total = Number(j.total_size);
      rows.push(...j.list);
      if (j.list.length === 0 || rows.length >= total) break;
      await sleep(DELAY_MS);
    }
    log(name, rows.length + '건', error ? '(오류: ' + error + ')' : '');
    return { rows, total, error };
  }

  const D = {}, info = {};

  // 1) 포인트 잔액: 모든 연수
  const BAL = ['tr_id', 'tr_st_id', 'tr_sd_id', 'tr_cur_ca_id', 'tr_start_date', 'tr_finish_date', 'tr_state', 'tr_point_clear_yn', 'sd_name', 'total_deposit', 'total_usage', 'last_deposit_date', 'stay_state'];
  const bal = await formOf('adm/point/balance');
  const b = await pages('point_balance', 'adm/point/balance_load', { ...bal, s_balance: '', s_sd_departure: '' }, 100);
  D.point_balance = b.rows.map((r) => keep(r, BAL));
  info.point_balance = { url: 'adm/point/balance_load', params: 's_balance=(빈 값), s_sd_departure=(빈 값)', total: b.total, error: b.error };

  // 2) 오늘 기숙사 입실자 (체크인 화면)
  const CK = ['tr_id', 'tr_st_id', 'tr_start_date', 'tr_finish_date', 'tr_state', 'ic_id', 'ic_do_id', 'ic_departure_date', 'ic_return_date', 'ic_week', 'ic_cancel_yn', 'do_id', 'do_name', 'do_gender', 'ca_id', 'ca_code', 'total_days', 'tr_checkin_days', 'ic_total_days', 'cnt_bed_use', 'cnt_date', 'grp_tr_id', 'tt_id'];
  const ck = await formOf('adm/checkin/checkin_v3');
  D.checkin_today = [];
  info.checkin_today = { url: 'adm/checkin/checkin_v3_load', date: today, campuses: {} };
  for (const ca of CAMPUSES) {
    const r = await pages('checkin_today ' + ca, 'adm/checkin/checkin_v3_load', { ...ck, s_campus: ca, s_st_date_from: today, s_st_date_to: today }, 100);
    D.checkin_today.push(...r.rows.map((x) => ({ ...keep(x, CK), _campus_param: ca })));
    info.checkin_today.campuses[ca] = { total: r.total, error: r.error };
  }

  // 3) 학생별 방·침대 배정 (입실자마다 한 번)
  const ids = [...new Set(D.checkin_today.map((x) => String(x.tr_st_id)).filter(Boolean))];
  D.student_rooms = [];
  let fails = 0;
  for (const [i, st] of ids.entries()) {
    const j = await post('adm/checkin/checkin_v3_student_rooms', { st_id: st });
    if (j && Array.isArray(j.list)) D.student_rooms.push(...j.list.map((x) => ({ ...scrub(x), _st_id: st })));
    else fails++;
    if (i % 50 === 49) log('student_rooms', i + 1 + '/' + ids.length);
    await sleep(DELAY_MS);
  }
  info.student_rooms = { url: 'adm/checkin/checkin_v3_student_rooms', students: ids.length, rows: D.student_rooms.length, fails, columns: D.student_rooms[0] ? Object.keys(D.student_rooms[0]) : [] };
  log('student_rooms', D.student_rooms.length + '건', fails ? '(실패 ' + fails + ')' : '');

  const meta = { source: 'jicportal.com admin (read-only endpoints, 추가 추출2)', extracted_at: new Date().toISOString(), counts: Object.fromEntries(Object.entries(D).map(([k, v]) => [k, v.length])), discovery: info };
  const cs = new CompressionStream('gzip');
  const w = cs.writable.getWriter();
  const enc = new TextEncoder();
  const blobP = new Response(cs.readable).blob();
  await w.write(enc.encode('{"extra_meta":' + JSON.stringify(meta)));
  for (const k of Object.keys(D)) await w.write(enc.encode(',"' + k + '":' + JSON.stringify(D[k])));
  await w.write(enc.encode('}'));
  await w.close();
  const blob = await blobP;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'jic_portal_extra2_' + today + '.json.gz';
  document.body.appendChild(a);
  a.click();
  log('완료', (blob.size / 1048576).toFixed(2) + ' MB', JSON.stringify(meta.counts));
})();
