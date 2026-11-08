/*
 * JIC 업체 포털 추가 추출 3: 연장 기록과 신입·연장·복귀·변경 탭. 브라우저 콘솔용, 2~5분.
 * 관리자 포털 '연장 현황'·'변경 이력' 화면을 만들려고 받는다(docs/legacy-portal.md '통계·마케팅 화면과 새 관리자 앱 대조').
 *
 * 받는 것
 *   extend          마케팅 > 연장현황(adm/train3/extend → extend_load): 연장 기간(tt_*: 등록일, 시작·끝, 주수, 메모)
 *   change_extend   재학생 > 신입·연장·복귀·변경 > 연장 탭(freshman_load_extend)
 *   change_comeback 〃 복귀 탭(freshman_load_comeback)
 *   change_course   〃 코스 변경 탭(freshman_load_course)
 *   change_dorm     〃 기숙사 변경 탭(freshman_load_dorm)
 * 기간은 2024-01-01 ~ 2027-12-31(연장 현황은 기간 '전체'). 학생·에이전시·담당자 개인 열(st_·ag_·am_·연락처·여권)은 저장하지 않고 tr_id 로 연수와 잇는다.
 *
 * 사용법: 업체 포털 관리자로 로그인한 Edge/Chrome에서 F12 → Console에 붙여 넣고 Enter.
 *   jic_portal_extend_YYYY-MM-DD.json.gz 를 data/raw/ 로 옮긴 뒤
 *   powershell -ExecutionPolicy Bypass -File scripts/split-export.ps1 -Source data/raw/jic_portal_extend_YYYY-MM-DD.json.gz
 * 읽기 전용 조회 주소만 부른다(주소에 save·delete·update 같은 말이 있으면 멈춘다). 비밀번호·세션·SQL 문자열은 저장하지 않는다.
 */
(async () => {
  const DELAY_MS = 200;
  const FROM = '2024-01-01', TO = '2027-12-31';
  const UNSAFE = /save|delete|del_|remove|clear|update|insert|upload|proc|reset|modify|change_|cancel|approve|send|sms|mail|print|excel/i;
  const DROP = /^(token|debug_info|online_user_id|sql)$|_pw$/;
  const PERSONAL = /^(st_(?!id$)|ag_|am_|br_|tr_pass|tr_st_cell|tr_parent_tel|tr_kakao|tr_skype|tr_interview_tel|tr_st_memo)/;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const csrf = () => (document.cookie.match(/csrf_cookie_name=([^;]+)/) || [])[1];
  const log = (...a) => console.log('[JIC 연장·변경 추출]', ...a);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const scrub = (row) => Object.fromEntries(Object.entries(row).filter(([k]) => !DROP.test(k) && !PERSONAL.test(k)));

  async function post(url, entries) {
    if (UNSAFE.test(url)) throw new Error('조회 주소가 아니라서 멈춥니다: ' + url);
    const fd = new FormData();
    for (const [k, v] of entries) fd.append(k, v);
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
    return f ? [...new FormData(f)].filter(([k]) => k !== 'csrf_test_name') : [];
  }
  /** 검색 폼 값에서 일부만 바꾼다(같은 이름이 여러 번이면 모두 지우고 새 값). */
  const withParams = (entries, patch) => [...entries.filter(([k]) => !(k in patch)), ...Object.entries(patch).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]))];

  async function pages(name, url, entries) {
    const rows = [];
    let total = null, error = null;
    for (let p = 1; p <= 800; p++) {
      const j = await post(url + '/' + p, entries);
      if (j.__err || !Array.isArray(j.list)) { error = j.__err || 'list 없음 (' + Object.keys(j || {}).slice(0, 6).join(',') + ')'; break; }
      total = Number(j.total_size);
      rows.push(...j.list.map(scrub));
      if (j.list.length === 0 || rows.length >= total) break;
      await sleep(DELAY_MS);
    }
    log(name, rows.length + '건', total != null ? '(전체 ' + total + ')' : '', error ? '오류: ' + error : '');
    return { rows, total, error };
  }

  const D = {}, info = {};

  // 1) 연장현황: 기간 '전체'
  const ext = await formOf('adm/train3/extend');
  const r1 = await pages('extend', 'adm/train3/extend_load', withParams(ext, { s_term_btn: 'All', s_start_date: '', s_finish_date: '', s_per_page: '100' }));
  D.extend = r1.rows;
  info.extend = { url: 'adm/train3/extend_load', params: 's_term_btn=All, 날짜 비움', total: r1.total, error: r1.error, columns: r1.rows[0] ? Object.keys(r1.rows[0]) : [] };

  // 2) 신입·연장·복귀·변경 탭: 기간 FROM ~ TO
  const fr = await formOf('adm/academic/freshman');
  const tabs = [
    ['change_extend', 'freshman_load_extend', 's_per_page_extended'],
    ['change_comeback', 'freshman_load_comeback', 's_per_page_comeback'],
    ['change_course', 'freshman_load_course', 's_per_page_course'],
    ['change_dorm', 'freshman_load_dorm', 's_per_page_dorm'],
  ];
  for (const [key, ep, perPage] of tabs) {
    const r = await pages(key, 'adm/academic/' + ep, withParams(fr, { s_start_date: FROM, s_finish_date: TO, [perPage]: '30' }));
    D[key] = r.rows;
    info[key] = { url: 'adm/academic/' + ep, params: 's_start_date=' + FROM + ', s_finish_date=' + TO, total: r.total, error: r.error, columns: r.rows[0] ? Object.keys(r.rows[0]) : [] };
  }

  const meta = { source: 'jicportal.com admin (read-only endpoints, 연장·변경 추출)', extracted_at: new Date().toISOString(), counts: Object.fromEntries(Object.entries(D).map(([k, v]) => [k, v.length])), discovery: info };
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
  a.download = 'jic_portal_extend_' + today + '.json.gz';
  document.body.appendChild(a);
  a.click();
  log('완료', (blob.size / 1048576).toFixed(2) + ' MB', JSON.stringify(meta.counts));
})();
