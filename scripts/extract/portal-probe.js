/*
 * JIC 업체 포털(jicportal.com) 화면 구조 조사 스크립트 — 브라우저 콘솔용, 30초 안쪽
 *
 * 화면마다 검색 항목 이름, 화면 코드가 부르는 조회 주소와 넘기는 값의 이름, 응답 모양(키 이름과 자료형)만 기록한다.
 * 학생 이름·금액 같은 값은 파일에 담지 않는다. 다음 추출 스크립트의 검색 조건을 정확히 맞추는 데 쓴다.
 *
 * 지금 조사하는 화면 (PAGES): 회계팀 > 현지 인보이스 납부, Check Balance, Payment Report
 *   → 인보이스 상세 금액(총액·항목별 금액)을 주는 주소를 찾는다.
 *
 * 사용법
 *   1. portal-extract.js와 같이 업체 포털 관리자로 로그인한 Edge/Chrome에서 F12 → Console에 붙여 넣고 Enter.
 *   2. jic_portal_probe_YYYY-MM-DD.json이 내려받아진다(작은 파일). portal/data/raw/로 옮기고 Claude에게 알린다.
 *
 * 원칙
 *   - 조회처럼 보이는 주소(load·list·detail·view·info·get·history·search)만, 주소마다 한 번씩만 부른다.
 *     save·delete·update·confirm 같은 말이 들어간 주소는 부르지 않는다.
 *   - 응답 값은 메모리에서만 다음 조회의 입력(예: tr_id)으로 쓰고 버린다. 파일에는 키 이름·자료형·건수만 남긴다.
 */
(async () => {
  const PAGES = [
    { page: 'adm/tuition2/payment', keyword: 'tuition', title: '현지 인보이스 납부' },
    { page: 'adm/tuition2/balance', keyword: 'tuition', title: 'Check Balance' },
    { page: 'adm/tuition2/report', keyword: 'tuition', title: 'Payment Report' },
  ];
  const KEYWORDS = ['detail', 'invoice', 'dlg_', 'ic_price', 'total', 'balance'];
  const DELAY_MS = 300;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const csrf = () => (document.cookie.match(/csrf_cookie_name=([^;]+)/) || [])[1];
  const UNSAFE = /save|delete|del_|remove|clear|update|insert|upload|proc|reset|modify|change|cancel|approve|confirm|send|sms|mail|excel|pdf|print|down/i;
  const READISH = /load|list|detail|view|info|get|history|search|rooms|items?$/i;
  const log = (...a) => console.log('[JIC 조사]', ...a);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  // 열 이름처럼 생긴 키만 그대로 남긴다. 방 번호·이름처럼 값이 키로 쓰인 객체는 키를 가리고 개수만 남긴다.
  const isFieldKey = (k) => /^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(k);
  /** 값 없이 모양만: 객체는 키별 자료형, 배열은 길이와 첫 원소의 모양. */
  const shape = (v, depth = 0) => {
    if (Array.isArray(v)) return { array: v.length, item: v.length && depth < 3 ? shape(v[0], depth + 1) : null };
    if (v && typeof v === 'object') {
      if (depth >= 3) return 'object';
      const keys = Object.keys(v);
      const odd = keys.filter((k) => !isFieldKey(k));
      const out = Object.fromEntries(keys.filter(isFieldKey).slice(0, 400).map((k) => [k, shape(v[k], depth + 1)]));
      if (odd.length) out['(값이 키인 항목)'] = { count: odd.length, item: shape(v[odd[0]], depth + 1) };
      return out;
    }
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return v === '' ? 'empty' : /^-?[\d,]+(\.\d+)?$/.test(v) ? 'numeric-string' : /^\d{4}-\d{2}-\d{2}/.test(v) ? 'date-string' : 'string';
    return typeof v;
  };
  /** 목록 원소 여러 개에서 키마다 값이 채워진 건수만 센다. */
  const filled = (list) => {
    const m = {};
    for (const r of list) for (const [k, v] of Object.entries(r || {})) if (isFieldKey(k)) m[k] = (m[k] || 0) + (v !== null && v !== '' && v !== undefined ? 1 : 0);
    return m;
  };
  // 코드 조각 안의 문자열 중 한글·공백·@가 든 것(화면 문구, 로그인한 직원 이름 등)은 가린다. 주소·키 이름은 그대로 남는다.
  const redact = (s) => s.replace(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g, (m, q, body) => (/[^\x20-\x7E]|@|\s/.test(body) ? q + '…' + q : m));

  async function post(url, fd) {
    if (UNSAFE.test(url)) throw new Error('조회 주소가 아니라서 부르지 않습니다: ' + url);
    fd.set('csrf_test_name', csrf());
    try {
      const r = await fetch(url, { method: 'POST', body: fd, credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
      const text = await r.text();
      try { return { status: r.status, json: JSON.parse(text) }; } catch (e) { return { status: r.status, error: 'JSON 아님', length: text.length }; }
    } catch (e) { return { error: String(e.message || e) }; }
  }

  const snippets = (code, needle, max = 3) => {
    const out = [];
    for (let i = code.indexOf(needle); i >= 0 && out.length < max; i = code.indexOf(needle, i + needle.length)) out.push(redact(code.slice(Math.max(0, i - 250), i + 450)));
    return out;
  };

  async function probe({ page, keyword, title }) {
    const res = { page, title };
    const html = await (await fetch('/appl/' + page, { credentials: 'include' })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const form = doc.getElementById('frm_search') || doc.querySelector('form');
    res.fields = form
      ? [...form.elements].filter((e) => e.name && e.name !== 'csrf_test_name').map((e) => ({
          name: e.name,
          type: e.tagName === 'SELECT' ? 'select' : (e.type || e.tagName).toLowerCase(),
          dateLike: /^\d{4}-\d{2}-\d{2}/.test(e.value || ''),
          checked: e.type === 'checkbox' || e.type === 'radio' ? !!e.checked : undefined,
          options: e.tagName === 'SELECT' ? [...e.options].map((o) => o.value).slice(0, 40) : undefined,
        }))
      : [];
    let code = [...doc.querySelectorAll('script:not([src])')].map((s) => s.textContent).join('\n');
    res.scripts = [...doc.querySelectorAll('script[src]')]
      .map((s) => s.getAttribute('src'))
      .filter((s) => s && (s.startsWith('/') || s.startsWith(location.origin)) && s.toLowerCase().includes(keyword))
      .slice(0, 6);
    for (const s of res.scripts) {
      try { code += '\n' + (await (await fetch(s, { credentials: 'include' })).text()); } catch (e) { /* 넘어간다 */ }
      await sleep(100);
    }

    // 화면 코드가 부르는 주소: page_base_url + "이름", 그리고 adm/… com/… 문자열
    const baseDecl = (code.match(/page_base_url\s*=\s*["']([^"']+)["']/) || [])[1];
    const base = (baseDecl || '/appl/' + page.replace(/[^/]+$/, '')).replace(/^\/appl\//, '').replace(/^\//, '');
    res.pageBase = base;
    const rel = [...code.matchAll(/page_base_url\s*\+\s*["']([\w\/]+?)\/?["']/g)].map((m) => base + m[1]);
    const abs = [...code.matchAll(/(?:\/appl\/)?((?:adm|com)\/[A-Za-z0-9_]+\/[A-Za-z0-9_]+)/g)].map((m) => m[1]);
    res.endpoints = [...new Set([...rel, ...abs])].sort();

    // 값을 넘기는 호출: jAjax(주소, { 이름: … }) 의 이름들
    res.calls = [];
    for (const m of code.matchAll(/(jAjax|jAjaxForm|\$\.post|\$\.ajax|\$\.getJSON)\s*\(\s*([^,]{1,120}?)\s*,\s*(\{[^{}]{0,400}\}|["'][^"']*["'])/g)) {
      const urlExpr = m[2].trim();
      const name = (urlExpr.match(/["']([\w\/]+?)\/?["']/) || [])[1] || '';
      const url = /page_base_url/.test(urlExpr) ? base + name : name.replace(/^\/?appl\//, '');
      const params = m[3].startsWith('{') ? [...m[3].matchAll(/([A-Za-z_][\w]*)\s*:/g)].map((x) => x[1]) : ['(form ' + m[3].replace(/["']/g, '') + ')'];
      res.calls.push({ fn: m[1], url, params });
    }
    res.snippets = Object.fromEntries(KEYWORDS.map((k) => [k, snippets(code, k)]).filter(([, v]) => v.length));

    // 목록 주소(…_load)를 화면 기본 조건으로 한 번 불러 응답 모양을 본다. 값은 다음 조회 입력으로만 쓴다.
    const lists = res.endpoints.filter((u) => u.startsWith(base) && /_load$/.test(u) && !UNSAFE.test(u));
    res.samples = {};
    let sampleRow = null;
    for (const u of lists.slice(0, 3)) {
      const fd = form ? new FormData(form) : new FormData();
      fd.set('s_per_page', '5');
      const r = await post('/appl/' + u + '/1', fd);
      const j = r.json;
      res.samples[u] = j
        ? { status: r.status, top: Object.keys(j), total_size: j.total_size != null ? Number(j.total_size) : null, item: Array.isArray(j.list) && j.list.length ? shape(j.list[0]) : null, filled: Array.isArray(j.list) ? filled(j.list) : null, extra: Object.fromEntries(Object.keys(j).filter((k) => !['list', 'total_size', 'cur_page'].includes(k)).map((k) => [k, shape(j[k])])) }
        : { status: r.status, error: r.error };
      if (!sampleRow && j && Array.isArray(j.list) && j.list.length) sampleRow = j.list[0];
      await sleep(DELAY_MS);
    }

    // 값을 넘기는 조회 호출을 표본 행 값으로 한 번씩 불러 응답 모양을 본다.
    res.callSamples = {};
    for (const c of res.calls) {
      if (!c.url || res.callSamples[c.url] || UNSAFE.test(c.url) || !READISH.test(c.url) || c.params.some((p) => p.startsWith('(form'))) continue;
      const fd = new FormData();
      const missing = [];
      for (const p of c.params) {
        const v = sampleRow ? sampleRow[p] ?? sampleRow['tr_' + p] ?? sampleRow[p.replace(/^dlg_\w+?_/, '')] : undefined;
        if (v === undefined || v === null) missing.push(p); else fd.set(p, v);
      }
      if (missing.length) { res.callSamples[c.url] = { skipped: '표본 행에 없는 값: ' + missing.join(',') }; continue; }
      const r = await post('/appl/' + c.url, fd);
      res.callSamples[c.url] = r.json ? { status: r.status, params: c.params, shape: shape(r.json), filled: Array.isArray(r.json.list) ? filled(r.json.list) : undefined } : { status: r.status, params: c.params, error: r.error };
      await sleep(DELAY_MS);
    }
    return res;
  }

  const out = { probed_at: new Date().toISOString(), note: '화면 구조만 담았다. 값 없음.', pages: {} };
  for (const p of PAGES) {
    try {
      out.pages[p.page] = await probe(p);
      const r = out.pages[p.page];
      log(p.title, '검색 항목 ' + r.fields.length + ', 주소 ' + r.endpoints.length + ', 호출 ' + r.calls.length, '표본', JSON.stringify(Object.fromEntries(Object.entries(r.samples).map(([k, v]) => [k, v.total_size ?? v.error]))));
    } catch (e) {
      out.pages[p.page] = { error: String(e.message || e) };
      log(p.title, '실패', e);
    }
  }

  const blob = new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'jic_portal_probe_' + today + '.json';
  document.body.appendChild(a);
  a.click();
  log('완료', (blob.size / 1024).toFixed(0) + ' KB → data/raw/로 옮기고 Claude에게 알려 주세요.');
})();
