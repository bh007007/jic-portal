/*
 * JIC 업체 포털 회계 > Check Balance 추출. 브라우저 콘솔용, 1분 안쪽.
 *
 * 받는 것
 *   balance   adm/tuition2/balance_load(읽기 전용 목록). 연수마다 청구 합계 cost, 납부 payment, 연장 수 extend_count.
 *             cost·payment 는 기본 인보이스 + 연장 인보이스의 합이다(2026-11-09 확인, inv_summary 2,052건 일치).
 *             업체 인보이스 목록(sum_ic_price)은 최근 인보이스 하나의 금액이라, 연장한 연수의 청구 합계는 이 값으로 본다.
 * 연수 번호·통화·납부 상태·연수 상태와 금액 세 열만 남기고 학생·에이전시 열은 저장하지 않는다.
 *
 * 사용법: 업체 포털 관리자로 로그인한 Edge/Chrome에서 F12 → Console에 붙여 넣고 Enter.
 *   jic_portal_balance_YYYY-MM-DD.json.gz 를 data/raw/ 로 옮긴 뒤
 *   powershell -ExecutionPolicy Bypass -File scripts/split-export.ps1 -Source data/raw/jic_portal_balance_YYYY-MM-DD.json.gz -DictPath docs/data-dictionary-balance.md
 */
(async () => {
  const KEEP = ['tr_id', 'tr_currency', 'tr_deposit_state', 'tr_state', 'extend_count', 'cost', 'payment'];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const csrf = () => (document.cookie.match(/csrf_cookie_name=([^;]+)/) || [])[1];
  const log = (...a) => console.log('[JIC Check Balance]', ...a);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

  const html = await (await fetch('/appl/adm/tuition2/balance', { credentials: 'include' })).text();
  const form = new DOMParser().parseFromString(html, 'text/html').getElementById('frm_search');
  if (!form) throw new Error('검색 폼을 찾지 못했습니다. 로그인 상태를 확인하세요.');

  // 재학생만이 기본값이라 '전체'(빈 값)로 바꿔 모든 연수를 받는다.
  const rows = [];
  let total = null, error = null;
  for (let p = 1; p <= 300; p++) {
    const fd = new FormData(form);
    fd.set('s_current_student', '');
    fd.set('s_per_page', '100');
    fd.set('csrf_test_name', csrf());
    const r = await fetch('/appl/adm/tuition2/balance_load/' + p, { method: 'POST', body: fd, credentials: 'include', headers: { 'X-Requested-With': 'XMLHttpRequest' } });
    let j = null;
    try { j = JSON.parse(await r.text()); } catch (e) { /* 아래에서 멈춘다 */ }
    if (!j || !Array.isArray(j.list)) { error = 'HTTP ' + r.status + ' (' + p + '쪽)'; break; }
    total = Number(j.total_size);
    for (const x of j.list) rows.push(Object.fromEntries(KEEP.map((k) => [k, x[k] ?? null])));
    if (!j.list.length || rows.length >= total) break;
    await sleep(200);
  }
  log('balance', rows.length + '건', total != null ? '(전체 ' + total + ')' : '', error ? '오류: ' + error : '');

  const meta = {
    source: 'jicportal.com admin adm/tuition2/balance_load (Check Balance, 읽기 전용)',
    extracted_at: new Date().toISOString(),
    counts: { balance: rows.length },
    discovery: { balance: { url: 'adm/tuition2/balance_load', params: 's_current_student=(전체)', total, error, columns: KEEP } },
  };
  const json = '{"extra_meta":' + JSON.stringify(meta) + ',"balance":' + JSON.stringify(rows) + '}';
  const blob = await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'jic_portal_balance_' + today + '.json.gz';
  document.body.appendChild(a);
  a.click();
  log('완료', (blob.size / 1024).toFixed(0) + ' KB');
})();
