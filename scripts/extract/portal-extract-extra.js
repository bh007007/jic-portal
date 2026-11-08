/*
 * JIC 업체 포털(jicportal.com) 추가 추출 스크립트 — 브라우저 콘솔용
 * portal-extract.js(전체 추출)에 없는 데이터만 받는다. 5~8분 걸린다.
 *
 * 받는 것 (아래 STEPS에서 고른다)
 *   rooms              기초코드관리 > 방관리 > 방·침대: 방과 침대 목록, 상태 '전체', 캠퍼스별
 *   bed_assignments    체크인 화면의 학생별 방·침대 배정(checkin_v3_student_rooms, 학생마다 st_id).
 *                      오늘부터 60일 안에 기숙사에 있는 학생만 묻는다(체크인 목록 checkin_v3_load에서 고름).
 *   point_balance      (기본 꺼짐) Point > Balance. 2026-11-08 실행 결과 1건뿐이었다.
 *   point_history_all  (기본 꺼짐) Point > History, 날짜 조건 비움. 첫 추출과 같은 14,439건이었다.
 *   extra_meta         건수와 화면 구조(검색 항목 이름, 화면이 부르는 조회 주소). 학생 값은 담지 않는다.
 *
 * 사용법
 *   1. portal-extract.js와 같이 업체 포털 관리자로 로그인한 Edge/Chrome에서 F12 → Console에 붙여 넣고 Enter.
 *   2. 끝나면 jic_portal_extra_YYYY-MM-DD.json.gz가 내려받아진다. portal/data/raw/로 옮긴다.
 *   3. powershell -ExecutionPolicy Bypass -File scripts/split-export.ps1
 *      → data/tables에 표가 추가되고 docs/data-dictionary-extra.md가 생긴다. 기존 표와 meta.json(기준일)은 그대로다.
 *
 * 원칙 (portal-extract.js와 같다)
 *   - 읽기 전용 조회 주소만 부른다. 주소에 save·delete·update 같은 말이 들어가면 부르지 않고 멈춘다.
 *   - 비밀번호(*_pw)와 세션 필드(token, debug_info, online_user_id)는 저장하지 않는다.
 *   - 결과 파일에는 실제 개인정보가 들어 있다. GitHub·클라우드·메신저에 올리지 않는다.
 */
(async () => {
  const STEPS = ['rooms', 'bed_assignments']; // 'point_balance', 'point_history_all' 도 넣을 수 있다
  const AHEAD_DAYS = 60; // 배정을 물을 학생: 오늘 ~ 60일 뒤 사이에 기숙사에 있는 학생
  const DELAY_MS = 250;
  const FALLBACK_CAMPUSES = ['11', '12', '14']; // Challenger, Premium, MCO

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const csrf = () => (document.cookie.match(/csrf_cookie_name=([^;]+)/) || [])[1];
  const DROP = /^(token|debug_info|online_user_id)$|_pw$/;
  const UNSAFE = /save|delete|del_|remove|clear|update|insert|upload|proc|reset|modify|change|cancel|approve|send|sms|mail/i;
  const clean = (v) =>
    Array.isArray(v) ? v.map(clean)
    : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.test(k)).map(([k, x]) => [k, clean(x)]))
    : v;
  const log = (...a) => console.log('[JIC 추가 추출]', ...a);
  const localToday = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const today = localToday();

  // 날짜 항목: 기본값이 날짜 모양이거나 이름에 date·_from·_to가 든 입력칸. s_dt_type 같은 구분 항목은 건드리지 않는다.
  const isDateField = (f) =>
    f.type !== 'select' && !/type|kind|gubun|sort|order|page/i.test(f.name) && (f.type === 'date' || f.dateLike || /date|_from$|_to$/i.test(f.name));
  const isCampusField = (f) => f.type === 'select' && /campus|ca_id/i.test(f.name);

  /** 화면 HTML에서 검색 폼, 검색 항목 이름, 화면 스크립트가 부르는 adm/... 주소를 찾는다. */
  async function inspect(page, keyword) {
    const html = await (await fetch('/appl/' + page, { credentials: 'include' })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const form = doc.getElementById('frm_search') || doc.querySelector('form');
    const fields = form
      ? [...form.elements].filter((e) => e.name && e.name !== 'csrf_test_name').map((e) => ({
          name: e.name,
          type: e.tagName === 'SELECT' ? 'select' : (e.type || e.tagName).toLowerCase(),
          dateLike: /^\d{4}-\d{2}-\d{2}/.test(e.value || ''), // 값은 저장하지 않고 날짜 모양인지만 남긴다
          options: e.tagName === 'SELECT' ? [...e.options].map((o) => o.value).slice(0, 40) : undefined,
        }))
      : [];
    // 화면 안 스크립트 + 같은 사이트의 화면 전용 스크립트(이름에 keyword가 든 것)를 함께 본다.
    let code = [...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent).join('\n');
    const srcs = [...doc.querySelectorAll('script[src]')]
      .map((s) => s.getAttribute('src'))
      .filter((s) => s && (s.startsWith('/') || s.startsWith(location.origin)) && s.toLowerCase().includes(keyword))
      .slice(0, 6);
    for (const s of srcs) {
      try { code += '\n' + (await (await fetch(s, { credentials: 'include' })).text()); } catch (e) { /* 없으면 넘어간다 */ }
      await sleep(100);
    }
    const endpoints = [...new Set((code.match(/adm\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+/g) || []))].filter((u) => !UNSAFE.test(u)).sort();
    return { page, form, fields, endpoints, scripts: srcs, code };
  }

  /** 조회 주소 주변 코드(최대 2곳, 700자). 다음에 검색 조건을 맞출 때 참고한다. */
  const snippets = (code, needle) => {
    const out = [];
    for (let i = code.indexOf(needle); i >= 0 && out.length < 2; i = code.indexOf(needle, i + needle.length)) out.push(code.slice(Math.max(0, i - 200), i + 500));
    return out;
  };

  const pick = (endpoints, re, prefer) => {
    const hits = endpoints.filter((u) => re.test(u));
    return hits.find((u) => prefer && prefer.test(u)) || hits[0] || null;
  };

  async function post(url, fd) {
    if (UNSAFE.test(url)) throw new Error('조회 주소가 아니라서 멈춥니다: ' + url);
    fd.set('csrf_test_name', csrf());
    let last = 'failed';
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await fetch(url, { method: 'POST', body: fd, credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
        const text = await r.text();
        let j;
        try { j = JSON.parse(text); } catch (e) { last = 'JSON 아님 (HTTP ' + r.status + ')'; }
        if (j !== undefined) return j && typeof j === 'object' ? j : { __err: '빈 응답 (권한 없음일 수 있음)' };
      } catch (e) { last = String(e.message || e); }
      await sleep(1500);
    }
    return { __err: last };
  }

  const copy = (fd) => { const n = new FormData(); for (const [k, v] of fd.entries()) n.append(k, v); return n; };
  const formData = (form) => (form ? new FormData(form) : new FormData());

  /** <url>/<페이지> 형식 목록을 끝까지 받는다. */
  async function pullPages(name, url, base, perPage = 300) {
    const rows = [];
    let total = null, error = null;
    for (let p = 1; p <= 1000; p++) {
      const fd = copy(base);
      fd.set('s_per_page', String(perPage));
      const j = await post('/appl/' + url + '/' + p, fd);
      if (j.__err || j.code || (j.message && !j.list)) { error = String(j.__err || j.code || j.message); break; }
      if (!Array.isArray(j.list)) { error = 'list 없음, 응답 키: ' + Object.keys(j).slice(0, 15).join(','); break; }
      total = Number(j.total_size);
      rows.push(...clean(j.list));
      if (j.list.length === 0 || !Number.isFinite(total) || rows.length >= total) break;
      await sleep(DELAY_MS);
    }
    log(name, rows.length + '건', error ? '(오류: ' + error + ')' : '');
    return { rows, total, error };
  }

  /** 캠퍼스 선택이 있으면: 기본값으로 받고, 기본값이 특정 캠퍼스이거나 결과가 없으면 캠퍼스마다 받는다. */
  async function pullByCampus(name, url, base, fields, perPage) {
    const camp = fields.find(isCampusField);
    const values = camp ? camp.options.filter(Boolean) : [];
    if (camp && !base.get(camp.name)) {
      const all = await pullPages(name, url, base, perPage);
      if (all.rows.length || !values.length) return { ...all, campusParam: null };
    }
    if (!camp || !values.length) return { ...(await pullPages(name, url, base, perPage)), campusParam: null };
    const out = { rows: [], total: 0, error: null, campusParam: camp.name, campuses: values };
    for (const v of values) {
      const b = copy(base);
      b.set(camp.name, v);
      const r = await pullPages(name + ' ' + v, url, b, perPage);
      out.rows.push(...r.rows.map((x) => ({ ...x, _campus_param: v })));
      out.total += r.total || 0;
      out.error = out.error || r.error;
    }
    return out;
  }

  const D = {};
  const info = {};
  const describe = (ins, url, res, extra) => ({
    page: ins.page, url, fields: ins.fields, endpoints: ins.endpoints, scripts: ins.scripts,
    total: res ? res.total : null, rows: res ? res.rows.length : 0, error: res ? res.error : null, ...extra,
  });

  const addDays = (iso, n) => { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  const campusList = (fields) => {
    const camp = fields.find(isCampusField);
    const values = camp ? camp.options.filter(Boolean) : [];
    return { name: camp ? camp.name : 's_campus', values: values.length ? values : FALLBACK_CAMPUSES };
  };
  const countByCampus = (rows) => rows.reduce((m, r) => ((m[r._campus_param] = (m[r._campus_param] || 0) + 1), m), {});

  // 방·침대 목록: 상태 '전체'(ALL)가 있으면 그것으로, 캠퍼스마다.
  if (STEPS.includes('rooms')) {
    try {
      const ins = await inspect('adm/room/room_bed', 'room');
      const url = pick(ins.endpoints, /^adm\/room\/room_bed\w*_load$/, /v2/) || 'adm/room/room_bed_v2_load';
      const base = formData(ins.form);
      const status = ins.fields.find((f) => f.type === 'select' && f.name === 's_status');
      if (status && status.options.includes('ALL')) base.set('s_status', 'ALL');
      const res = await pullByCampus('rooms', url, base, ins.fields, 200);
      D.rooms = res.rows;
      info.rooms = describe(ins, url, res, { campusParam: res.campusParam, status: base.get('s_status'), byCampus: countByCampus(res.rows), snippets: snippets(ins.code, url.split('/').pop()) });
    } catch (e) { info.rooms = { error: String(e.message || e) }; log('rooms 실패', e); }
  }

  // 학생별 방·침대 배정: 체크인 목록(checkin_v3_load)에서 오늘~AHEAD_DAYS 사이 기숙사 학생을 모아
  // 화면의 '방 이력' 창과 같은 checkin_v3_student_rooms { st_id } 를 학생마다 부른다.
  if (STEPS.includes('bed_assignments')) {
    try {
      const ins = await inspect('adm/checkin/checkin_v3', 'checkin');
      const listUrl = pick(ins.endpoints, /^adm\/checkin\/checkin_v3_load$/) || 'adm/checkin/checkin_v3_load';
      const url = pick(ins.endpoints, /student_rooms/) || 'adm/checkin/checkin_v3_student_rooms';
      const until = addDays(today, AHEAD_DAYS);
      const base = formData(ins.form);
      for (const f of ins.fields.filter(isDateField)) base.set(f.name, /to$|finish|end/i.test(f.name) ? until : today);
      const camps = campusList(ins.fields);
      const students = new Map(); // st_id → 캠퍼스
      const listCounts = {};
      for (const ca of camps.values) {
        const b = copy(base);
        b.set(camps.name, ca);
        const r = await pullPages('체크인 목록 ' + ca, listUrl, b, 300);
        listCounts[ca] = { rows: r.rows.length, error: r.error };
        for (const x of r.rows) {
          const id = String(x.tr_st_id || x.st_id || '');
          if (id && id !== '0' && !students.has(id)) students.set(id, ca);
        }
      }
      D.bed_assignments = [];
      let asked = 0, withRows = 0, errors = 0;
      for (const [stId, ca] of students) {
        const fd = new FormData();
        fd.set('st_id', stId);
        const j = await post('/appl/' + url, fd);
        asked++;
        if (j.__err || !Array.isArray(j.list)) errors++;
        else {
          if (j.list.length) withRows++;
          D.bed_assignments.push(...clean(j.list).map((x) => ({ ...x, _st_id_param: stId, _campus_param: ca })));
        }
        if (asked % 50 === 0) log('bed_assignments', asked + '/' + students.size + '명');
        await sleep(200);
      }
      log('bed_assignments', D.bed_assignments.length + '건', '학생 ' + students.size + '명, 배정 있음 ' + withRows + ', 오류 ' + errors);
      info.bed_assignments = {
        page: ins.page, listUrl, url, from: today, to: until, campusParam: camps.name, listCounts,
        students: students.size, asked, withRows, errors, rows: D.bed_assignments.length,
        fields: ins.fields, endpoints: ins.endpoints, snippets: snippets(ins.code, url.split('/').pop()),
      };
    } catch (e) { info.bed_assignments = { error: String(e.message || e) }; log('bed_assignments 실패', e); }
  }

  // 포인트 잔액 (기본 꺼짐)
  if (STEPS.includes('point_balance')) {
    try {
      const ins = await inspect('adm/point/balance', 'point');
      const url = pick(ins.endpoints, /^adm\/point\/balance\w*_load$/) || 'adm/point/balance_load';
      const base = formData(ins.form);
      let res = await pullByCampus('point_balance', url, base, ins.fields);
      const dates = ins.fields.filter(isDateField);
      let datesCleared = false;
      if (dates.length) {
        const b2 = copy(base);
        dates.forEach((f) => b2.set(f.name, ''));
        const r2 = await pullByCampus('point_balance (날짜 비움)', url, b2, ins.fields);
        if (r2.rows.length > res.rows.length) { res = r2; datesCleared = true; }
      }
      D.point_balance = res.rows;
      info.point_balance = describe(ins, url, res, { datesCleared, campusParam: res.campusParam, snippets: snippets(ins.code, url.split('/').pop()) });
    } catch (e) { info.point_balance = { error: String(e.message || e) }; log('point_balance 실패', e); }
  }

  // 포인트 이력, 날짜 항목 비움 (기본 꺼짐)
  if (STEPS.includes('point_history_all')) {
    try {
      const ins = await inspect('adm/point/history', 'point');
      const url = pick(ins.endpoints, /^adm\/point\/history\w*_load$/) || 'adm/point/history_load';
      const base = formData(ins.form);
      ins.fields.filter(isDateField).forEach((f) => base.set(f.name, ''));
      const res = await pullByCampus('point_history_all', url, base, ins.fields, 500);
      D.point_history_all = res.rows;
      info.point_history_all = describe(ins, url, res, { clearedFields: ins.fields.filter(isDateField).map((f) => f.name), campusParam: res.campusParam });
    } catch (e) { info.point_history_all = { error: String(e.message || e) }; log('point_history_all 실패', e); }
  }

  const check = (v) => {
    if (Array.isArray(v)) return v.forEach(check);
    if (v && typeof v === 'object') for (const k of Object.keys(v)) { if (DROP.test(k)) throw new Error('제외 대상 필드가 남아 있음: ' + k); check(v[k]); }
  };
  check(D);

  const meta = {
    source: 'jicportal.com admin (read-only endpoints, 추가 추출)',
    extracted_at: new Date().toISOString(),
    counts: Object.fromEntries(Object.entries(D).map(([k, v]) => [k, v.length])),
    excluded_fields: ['token', 'debug_info', 'online_user_id', '*_pw'],
    discovery: info,
  };
  const cs = new CompressionStream('gzip');
  const w = cs.writable.getWriter();
  const enc = new TextEncoder();
  const blobP = new Response(cs.readable).blob();
  // 첫 키를 meta가 아닌 extra_meta로 둔다: split-export.ps1이 기존 meta.json(기준일)을 덮어쓰지 않는다.
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
  a.download = 'jic_portal_extra_' + today + '.json.gz';
  document.body.appendChild(a);
  a.click();
  log('완료', (blob.size / 1048576).toFixed(1) + ' MB', JSON.stringify(meta.counts));
  const failed = Object.entries(info).filter(([, v]) => v && v.error).map(([k, v]) => k + ': ' + v.error);
  if (failed.length) console.warn('[JIC 추가 추출] 일부 단계가 비었습니다. 파일은 그대로 data/raw에 두고 Claude에게 알려 주세요.', failed);
})();
