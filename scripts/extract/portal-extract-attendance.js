/*
 * JIC 업체 포털 추가 추출 4: 정규 수업 출석. 브라우저 콘솔용, 기간 90일이면 5~15분.
 * 강사 포털 출석 화면(docs/teacher-portal.md '출석')의 테이블을 업체 기록으로 채우려고 받는다. 구조는 11/9 LMS 조사(portal-probe-lms.js).
 *
 * 받는 것 (열 허용 목록에 있는 열만 저장한다)
 *   campuses    출석 화면의 캠퍼스 선택지(번호, 이름)
 *   teachers    교사 등록(adm/teacher/regist_load): 번호·캠퍼스·이름·영어 이름·직함·입사·퇴사·사용 여부
 *               비밀번호(te_pw)·급여(te_salary_*)·연락처·생일·사진·메신저는 받지 않는다
 *   classrooms  교실(adm/classroom/classroom_v2_load, 상태 ALL): 번호·종류(1:1 '1', 그룹 'G')·건물·층·정원·담당 교사·옵션/셀프/주말·기간·상태
 *   days        날짜·캠퍼스별 시간대 수와 마감 여부(regular_sched_load)
 *   attendance  정규 출석(regular_load, 시간대마다): 날짜·시각·분·학생(st_id)·교사·보조 교사·교실·결과(AT 출석/AB 결석/TA 지각)·지각 분·종류(1/G)·사유 인정(Y/N)·과목
 *               학생 이름·연락처·메모 글(sta_memo·sta_notes)·교사 개인 열은 받지 않는다
 *   closings    출석 마감(closing_load, 달마다): 캠퍼스·날짜·종류·마감 여부
 *
 * 사용법: 업체 포털(jicportal.com) 관리자로 로그인한 Edge/Chrome에서 F12 → Console에 붙여 넣고 Enter.
 *   아래 FROM·TO로 기간을 바꿀 수 있다. 받은 jic_portal_attendance_YYYY-MM-DD.json.gz 는 data/raw/ 로 옮긴다(Git 제외, 외부로 보내지 않음).
 * 읽기 전용 조회 주소(_load)만 부른다. 주소에 save·delete·import·attend·change 같은 말이 있으면 멈춘다.
 */
(async () => {
  const DELAY_MS = 150;
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const shift = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const FROM = shift(today, -90), TO = today;

  const UNSAFE = /save|delete|del_|remove|clear|update|insert|upload|import|attend|proc|reset|modify|change|cancel|approve|send|sms|mail|print|excel|opened|closed/i;
  const KEEP = {
    teachers: ['te_id', 'te_ca_id', 'te_name', 'te_name_en', 'te_job_title', 'te_in_date', 'te_out_date', 'te_use_yn'],
    classrooms: ['cro_id', 'cro_ca_id', 'cro_num', 'cro_type', 'cro_building', 'cro_floor', 'cro_max', 'cro_te_id', 'cro_option_yn', 'cro_self_yn', 'cro_weekend_yn', 'cro_start_date', 'cro_finish_date', 'cro_status'],
    attendance: ['sta_id', 'sta_ca_id', 'sta_case', 'sta_key_id', 'sta_date', 'sta_time', 'sta_min', 'sta_st_id', 'sta_te_id', 'sta_sub_te_id', 'sta_cro_id', 'sta_result', 'sta_late_min', 'sta_type', 'sta_type2', 'sta_excused', 'sta_subject', 'sta_change_dt'],
    closings: ['sac_id', 'sac_ca_id', 'sac_case', 'sac_date', 'sac_close_yn', 'sac_change_dt'],
  };
  const pick = (cols) => (row) => Object.fromEntries(cols.filter((k) => k in row).map((k) => [k, row[k]]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const csrf = () => (document.cookie.match(/csrf_cookie_name=([^;]+)/) || [])[1];
  const log = (...a) => console.log('[JIC 출석 추출]', ...a);

  async function post(url, entries) {
    const name = url.split('/').filter((s) => !/^\d+$/.test(s)).pop() || '';
    if (!name.endsWith('_load') || UNSAFE.test(name.slice(0, -5))) throw new Error('조회 주소가 아니라서 멈춥니다: ' + url);
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
  async function pageOf(page) {
    const html = await (await fetch('/appl/' + page, { credentials: 'include' })).text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const f = doc.getElementById('frm_search');
    return { doc, form: f ? [...new FormData(f)].filter(([k]) => k !== 'csrf_test_name') : [] };
  }
  const withParams = (entries, patch) => [...entries.filter(([k]) => !(k in patch)), ...Object.entries(patch).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : [[k, v]]))];

  /** total_size 가 있는 목록. 같은 쪽이 되풀이되면(쪽 번호를 안 받는 주소) 멈춘다. */
  async function pages(name, url, entries, cols) {
    const rows = [];
    let total = null, error = null, firstKey = null;
    for (let p = 1; p <= 400; p++) {
      const j = await post(url + '/' + p, entries);
      if (j.__err || !Array.isArray(j.list)) { error = j.__err || 'list 없음 (' + Object.keys(j || {}).slice(0, 6).join(',') + ')'; break; }
      total = Number(j.total_size);
      const key = JSON.stringify(j.list[0] ?? null);
      if (p > 1 && key === firstKey) break;
      if (p === 1) firstKey = key;
      rows.push(...j.list.map(pick(cols)));
      if (j.list.length === 0 || !Number.isFinite(total) || rows.length >= total) break;
      await sleep(DELAY_MS);
    }
    log(name, rows.length + '건', total != null ? '(전체 ' + total + ')' : '', error ? '오류: ' + error : '');
    return { rows, total, error };
  }

  const D = { campuses: [], teachers: [], classrooms: [], days: [], attendance: [], closings: [] };
  const info = { from: FROM, to: TO, errors: [] };

  // 1) 캠퍼스: 정규 출석 화면의 s_sta_ca_id 선택지
  const reg = await pageOf('adm/attendance_v2/regular');
  const sel = reg.doc.querySelector('select[name="s_sta_ca_id"]');
  D.campuses = sel ? [...sel.options].filter((o) => o.value).map((o) => ({ ca_id: o.value, name: o.textContent.trim() })) : [];
  log('캠퍼스', D.campuses.map((c) => c.ca_id + ' ' + c.name).join(', '));
  if (!D.campuses.length) { log('캠퍼스 선택지를 찾지 못했습니다. 로그인 상태를 확인하세요.'); return; }

  // 2) 교사(퇴직 포함), 교실(상태 ALL, 캠퍼스마다)
  const tp = await pageOf('adm/teacher/regist');
  D.teachers = (await pages('teachers', 'adm/teacher/regist_load', withParams(tp.form, { s_campus: '', s_use_yn: '', s_name: '', s_start_date: '', s_finish_date: '', s_term_btn: 'All', s_per_page: '100' }), KEEP.teachers)).rows;
  const cp = await pageOf('adm/classroom/classroom');
  for (const c of D.campuses) {
    const r = await pages('classrooms ' + c.ca_id, 'adm/classroom/classroom_v2_load', withParams(cp.form, { s_campus: c.ca_id, s_status: 'ALL', s_per_page: '200' }), KEEP.classrooms);
    D.classrooms.push(...r.rows);
  }

  // 3) 출석 마감(달마다)
  const clp = await pageOf('adm/attendance_v2/closing');
  const months = [];
  for (let m = FROM.slice(0, 7); m <= TO.slice(0, 7); m = shift(m + '-28', 5).slice(0, 7)) months.push(m);
  for (const c of D.campuses) {
    for (const m of months) {
      const j = await post('adm/attendance_v2/closing_load', withParams(clp.form, { s_ca_id: c.ca_id, s_the_date: m + '-01' }));
      if (Array.isArray(j.list)) D.closings.push(...j.list.map(pick(KEEP.closings)));
      else info.errors.push('closing ' + c.ca_id + ' ' + m);
      await sleep(DELAY_MS);
    }
  }
  log('closings', D.closings.length + '건');

  // 4) 정규 출석: 날짜·캠퍼스마다 시간대 → 시간대마다 출석 행
  for (const c of D.campuses) {
    let n = 0;
    for (let d = FROM; d <= TO; d = shift(d, 1)) {
      const s = await post('adm/attendance_v2/regular_sched_load', withParams(reg.form, { s_the_date: d, s_sta_ca_id: c.ca_id, sel_time: '' }));
      await sleep(DELAY_MS);
      if (!Array.isArray(s.list)) { info.errors.push('sched ' + c.ca_id + ' ' + d); continue; }
      const slots = s.list.filter((x) => x.s_time && Number(x.cnt ?? 1) > 0).map((x) => x.s_time);
      D.days.push({ ca_id: c.ca_id, date: d, slots: slots.length, close_yn: s.close_yn ?? null });
      for (const t of slots) {
        const r = await post('adm/attendance_v2/regular_load', withParams(reg.form, { s_the_date: d, s_sta_ca_id: c.ca_id, sel_time: t }));
        await sleep(DELAY_MS);
        if (!Array.isArray(r.list)) { info.errors.push('regular ' + c.ca_id + ' ' + d + ' ' + t); continue; }
        const rows = r.list.map(pick(KEEP.attendance));
        D.attendance.push(...rows);
        n += rows.length;
      }
      if (d.endsWith('-01') || d === TO) log('출석', c.ca_id, d, '누적 ' + n + '건');
    }
  }

  const meta = { source: 'jicportal.com admin (read-only _load endpoints, 정규 출석 추출)', extracted_at: new Date().toISOString(), counts: Object.fromEntries(Object.entries(D).map(([k, v]) => [k, v.length])), columns: KEEP, ...info };
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
  a.download = 'jic_portal_attendance_' + today + '.json.gz';
  document.body.appendChild(a);
  a.click();
  log('완료', (blob.size / 1048576).toFixed(2) + ' MB', JSON.stringify(meta.counts), info.errors.length ? '오류 ' + info.errors.length + '건' : '');
})();
