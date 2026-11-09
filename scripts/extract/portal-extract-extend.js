/*
 * JIC 업체 포털 추가 추출 3: 연장 기록과 신입·연장·복귀·변경 탭. 브라우저 콘솔용, 3~6분.
 * 관리자 포털 '연장 현황'·'변경 이력' 화면이 읽는다(docs/legacy-portal.md, 조사 결과는 docs/legacy-portal-probes.md).
 *
 * 받는 것
 *   extend          마케팅 > 연장현황(adm/train3/extend → extend_load): 연장 기간(tt_*: 등록일, 시작·끝, 주수, 메모)
 *   change_extend   재학생 > 신입·연장·복귀·변경 > 연장 탭(freshman_load_extend)
 *   change_comeback 〃 복귀 탭(freshman_load_comeback)
 *   change_course   〃 코스 변경 탭(freshman_load_course)
 *   change_dorm     〃 기숙사 변경 탭(freshman_load_dorm)
 * 기간은 2024-01-01 ~ 2027-12-31(연장 현황은 기간 '전체'). 학생·에이전시·담당자 개인 열(st_·ag_·am_·연락처·여권)은 저장하지 않고 tr_id 로 연수와 잇는다.
 *
 * 업체 화면의 버릇(2026-11-09 확인)
 *   - 복귀 탭은 total_size 가 늘 1이라 그 값으로 멈추면 20건만 받는다 → 빈 쪽(또는 새 행이 없는 쪽)까지 넘긴다.
 *   - 기숙사 변경 탭은 긴 기간을 한 번에 넣으면 500이다 → 전체 기간이 안 되면 한 달씩, 그 달도 안 되면 10일·하루씩 나눠 받는다.
 *     2024-04-21 하루는 하루만 넣어도 500이었다(업체 데이터 문제로 보임). 못 받은 날은 메타의 failed_days 에 남는다.
 *   - 탭별 s_per_page_* 는 무시되고 한 쪽에 20건씩 온다.
 *
 * 사용법: 업체 포털 관리자로 로그인한 Edge/Chrome에서 F12 → Console에 붙여 넣고 Enter.
 *   jic_portal_extend_YYYY-MM-DD.json.gz 를 data/raw/ 로 옮긴 뒤
 *   powershell -ExecutionPolicy Bypass -File scripts/split-export.ps1 -Source data/raw/jic_portal_extend_YYYY-MM-DD.json.gz -DictPath docs/data-dictionary-extend.md
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
  const ymd = (d) => d.toISOString().slice(0, 10);
  const today = ymd(new Date(Date.now() - new Date().getTimezoneOffset() * 60000));
  const addDays = (iso, n) => { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return ymd(t); };
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

  /**
   * 쪽 넘기기. 같은 행이 다시 오면 한 번만 담는다.
   * untilEmpty: total_size 를 믿지 않고 빈 쪽이나 새 행이 없는 쪽까지 넘긴다(복귀 탭).
   */
  async function pages(name, url, entries, { untilEmpty = false, quiet = false } = {}) {
    const rows = [];
    const seen = new Set();
    let total = null, error = null;
    for (let p = 1; p <= 800; p++) {
      const j = await post(url + '/' + p, entries);
      if (j.__err || !Array.isArray(j.list)) { error = j.__err || 'list 없음 (' + Object.keys(j || {}).slice(0, 6).join(',') + ')'; break; }
      total = Number(j.total_size);
      let fresh = 0;
      for (const r of j.list) {
        const s = scrub(r);
        const key = JSON.stringify(s);
        if (!seen.has(key)) { seen.add(key); rows.push(s); fresh++; }
      }
      if (!j.list.length || !fresh) break;
      if (!untilEmpty && rows.length >= total) break;
      await sleep(DELAY_MS);
    }
    if (!quiet) log(name, rows.length + '건', total != null && !untilEmpty ? '(전체 ' + total + ')' : '', error ? '오류: ' + error : '');
    return { rows, total, error };
  }

  /** [시작, 끝] 기간을 달마다 자른다. */
  const monthWindows = (from, to) => {
    const out = [];
    for (let d = from; d <= to; ) {
      const t = new Date(d + 'T00:00:00Z');
      const end = ymd(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)));
      out.push([d, end < to ? end : to]);
      d = addDays(end, 1);
    }
    return out;
  };
  /** 실패한 기간을 더 작게: 10일보다 길면 10일씩, 아니면 하루씩. 하루짜리는 더 못 나눈다(null). */
  const splitWindow = ([a, b]) => {
    const days = Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;
    if (days <= 1) return null;
    const step = days > 10 ? 10 : 1;
    const out = [];
    for (let d = a; d <= b; d = addDays(d, step)) { const e = addDays(d, step - 1); out.push([d, e < b ? e : b]); }
    return out;
  };

  /**
   * 신입·연장·복귀·변경 탭 하나를 FROM~TO 로 받는다. 전체 기간이 오류면 한 달씩, 그 기간도 오류면 더 잘게 나눈다.
   * 반환: rows(중복 없이), mode(whole|windows), failed(하루만 넣어도 오류인 날).
   */
  async function byWindows(name, url, entries, perPage, opts = {}) {
    const all = [];
    const seen = new Set();
    const failed = [];
    const add = (rows) => { for (const s of rows) { const key = JSON.stringify(s); if (!seen.has(key)) { seen.add(key); all.push(s); } } };
    const fetchWindow = (win) => pages(name, url, withParams(entries, { s_start_date: win[0], s_finish_date: win[1], [perPage]: '30' }), { ...opts, quiet: true });
    const run = async (win) => {
      const r = await fetchWindow(win);
      if (!r.error) return add(r.rows);
      const parts = splitWindow(win);
      if (!parts) return failed.push(win[0]);
      for (const w of parts) await run(w);
    };
    let mode = 'whole';
    const whole = await fetchWindow([FROM, TO]);
    if (whole.error) {
      mode = 'windows';
      for (const w of monthWindows(FROM, TO)) await run(w);
    } else add(whole.rows);
    log(name, all.length + '건', mode === 'windows' ? '(전체 기간이 안 돼 한 달씩)' : '', failed.length ? '못 받은 날: ' + failed.join(', ') : '');
    return { rows: all, mode, failed };
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
    ['change_extend', 'freshman_load_extend', 's_per_page_extended', {}],
    ['change_comeback', 'freshman_load_comeback', 's_per_page_comeback', { untilEmpty: true }],
    ['change_course', 'freshman_load_course', 's_per_page_course', {}],
    ['change_dorm', 'freshman_load_dorm', 's_per_page_dorm', {}],
  ];
  for (const [key, ep, perPage, opts] of tabs) {
    const r = await byWindows(key, 'adm/academic/' + ep, fr, perPage, opts);
    D[key] = r.rows;
    info[key] = {
      url: 'adm/academic/' + ep,
      params: 's_start_date=' + FROM + ', s_finish_date=' + TO + (r.mode === 'windows' ? ' (한 달씩)' : '') + (opts.untilEmpty ? ', 빈 쪽까지' : ''),
      total: r.rows.length,
      mode: r.mode,
      failed_days: r.failed,
      columns: r.rows[0] ? Object.keys(r.rows[0]) : [],
    };
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
  const missed = Object.entries(info).filter(([, v]) => v.failed_days && v.failed_days.length).map(([k, v]) => k + ' ' + v.failed_days.join(','));
  log('완료', (blob.size / 1048576).toFixed(2) + ' MB', JSON.stringify(meta.counts), missed.length ? '못 받은 날: ' + missed.join(' / ') : '');
})();
