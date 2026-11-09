// 시험용 Supabase 흉내: Auth(메모리, auth.users 와 맞춤) + REST(PGlite 위 실제 마이그레이션, 역할·RLS 그대로). 데이터는 가짜 샘플만.
// 학생 앱·인트라넷 코드가 쓰는 REST 형식만 SQL 로 옮긴다: GET 필터(col=eq.v, data->>k=eq.v)·select·order·limit·offset,
// POST(insert), PATCH(update, return=representation), 행 지우기, rpc/함수(값 하나 또는 표). 서비스 키 'service-key', anon 키 'anon-key'.
//
// 직접 띄우기(화면 시험용): node supabase/tests/pg-supabase.mjs 54321
// 시험 코드에서: const sb = await startPgSupabase(); … sb.url, sb.sql(), sb.addUser(), sb.close()
// PGlite 는 의존성에 넣지 않는다: npm i --no-save @electric-sql/pglite@0.3 (또는 PGLITE=<.../dist/index.js>)
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const MIGRATIONS = ['20261107000000_legacy_tables.sql', '20261107020000_legacy_deposits.sql', '20261108000000_legacy_point_history.sql', '20261108010000_legacy_rooms.sql', '20261108100000_student_intranet.sql', '20261108120000_student_request_ids.sql', '20261108130000_intranet_deploy.sql', '20261108140000_nonacademic_requests.sql', '20261108150000_overnight_travel.sql', '20261108160000_school_trips.sql', '20261108170000_keycard_qr.sql', '20261108180000_student_account_admin.sql', '20261108190000_guard_account_admin.sql', '20261108200000_teacher_portal.sql', '20261108220000_lms_absences.sql', '20261108230000_holidays.sql', '20261109000000_attendance.sql', '20261109010000_roles.sql', '20261109040000_lms_students_extend.sql', '20261109050000_absence_penalties.sql', '20261109070000_intranet_roles.sql', '20261109080000_attendance_summary.sql', '20261109090000_schedule_copy.sql', '20261109100000_intranet_manager.sql', '20261109130000_student_timetable.sql'];

export async function startPgSupabase({ port = 0 } = {}) {
  const { PGlite } = await import(process.env.PGLITE ? pathToFileURL(process.env.PGLITE).href : '@electric-sql/pglite');
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
  `);
  for (const f of MIGRATIONS) await db.exec(fs.readFileSync(`${REPO}supabase/migrations/${f}`, 'utf8'));

  // 샘플 업체 원본(학생 앱이 읽는 것만)
  const nd = (f) => fs.readFileSync(`${REPO}data-sample/tables/${f}`, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const load = async (table, rows, idOf) => {
    for (const r of rows) await db.query(`insert into public.${table} (id, data) values ($1, $2::jsonb) on conflict do nothing`, [String(idOf(r)), JSON.stringify(r)]);
  };
  await load('legacy_students', nd('students.ndjson'), (r) => r.st_id);
  await load('legacy_enrollments', nd('enrollments.ndjson'), (r) => r.tr_id);
  await load('legacy_dorm_assignments', nd('dorm_assignments.ndjson'), (r) => r.tr_id);
  await db.query(`insert into public.legacy_meta (id, data) values ('current', $1::jsonb)`, [fs.readFileSync(`${REPO}data-sample/tables/meta.json`, 'utf8')]);

  // ── Auth (메모리)
  const users = new Map();
  const tokens = new Map();
  const refresh = new Map();
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const jwt = (sub) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.${crypto.randomBytes(8).toString('hex')}`;
  const userJson = (u) => ({ id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, user_metadata: u.user_metadata ?? {}, app_metadata: { provider: 'email' }, created_at: new Date().toISOString(), last_sign_in_at: u.lastSignIn ?? null });
  const session = (u) => {
    const access_token = jwt(u.id);
    tokens.set(access_token, u.id);
    const s = { access_token, token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: crypto.randomBytes(8).toString('hex'), user: userJson(u) };
    refresh.set(s.refresh_token, u.id);
    return s;
  };

  // ── 한 번에 한 요청(역할을 바꾸므로)
  let chain = Promise.resolve();
  const serial = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
  const addUser = (u) =>
    serial(async () => {
      users.set(u.id, { ...u, email: u.email.toLowerCase() });
      await db.query('insert into auth.users (id, email) values ($1, $2) on conflict do nothing', [u.id, u.email.toLowerCase()]);
    });
  /** SQL 을 역할로 실행(role: 'authenticated' + sub 면 그 사용자, 없으면 관리자) */
  const sql = (q, params = [], { role, sub } = {}) =>
    serial(async () => {
      await db.exec(`select set_config('request.jwt.claim.sub', '${sub ?? ''}', false); ${role ? `set role ${role};` : ''}`);
      try {
        return (await db.query(q, params)).rows;
      } finally {
        await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
      }
    });

  const ident = (s) => {
    if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error('bad identifier'), { http: 400 });
    return `"${s}"`;
  };
  function where(params, values) {
    const out = [];
    for (const [k, v] of params) {
      if (['select', 'order', 'limit', 'offset'].includes(k)) continue;
      // eq 외에 기간 조회용 비교(gte·lte 등). 같은 열에 두 번 걸어도 된다(day=gte.…&day=lte.…)
      const m = v.match(/^(eq|neq|gt|gte|lt|lte)\.(.*)$/s);
      if (!m) throw Object.assign(new Error(`unsupported filter ${k}`), { http: 400 });
      values.push(m[2]);
      const jm = k.match(/^([a-z_]+)->>([a-z_]+)$/);
      const op = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[m[1]];
      out.push(`${jm ? `${ident(jm[1])}->>'${jm[2]}'` : ident(k)} ${op} $${values.length}`);
    }
    return out.length ? ` where ${out.join(' and ')}` : '';
  }
  async function asRole(req, fn) {
    const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const service = req.headers.apikey === 'service-key';
    const uid = tokens.get(t);
    if (!service && t && t !== 'anon-key' && !uid) return { status: 401, body: { code: 'PGRST301', message: 'JWT expired' } };
    await db.exec(`select set_config('request.jwt.claim.sub', '${service ? '' : (uid ?? '')}', false); set role ${service ? 'service_role' : uid ? 'authenticated' : 'anon'};`);
    try {
      return await fn();
    } catch (e) {
      const msg = String(e.message);
      if (e.http) return { status: e.http, body: { message: msg } };
      if (/row-level security/.test(msg)) return { status: 403, body: { code: '42501', message: msg } };
      if (/permission denied/.test(msg)) return { status: uid || service ? 403 : 401, body: { code: '42501', message: msg } };
      if (/duplicate key/.test(msg)) return { status: 409, body: { code: '23505', message: msg } };
      if (/check constraint|violates/.test(msg)) return { status: 400, body: { code: '23514', message: msg } };
      return { status: 400, body: { code: 'P0001', message: msg } };
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    }
  }
  async function rest(req, path, params, body) {
    const prefer = req.headers.prefer || '';
    const rpc = path.match(/^rpc\/([a-z_]+)$/);
    if (rpc) {
      const keys = Object.keys(body ?? {});
      const call = `public.${ident(rpc[1])}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')})`;
      const values = keys.map((k) => body[k]);
      // 표를 돌려주는 함수(returns table / setof)는 PostgREST 처럼 행 배열로
      const set = (await db.query(`select p.proretset from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [rpc[1]])).rows[0]?.proretset;
      if (set) return { status: 200, body: (await db.query(`select coalesce(json_agg(x), '[]'::json) as j from ${call} x`, values)).rows[0].j };
      const v = (await db.query(`select ${call} as v`, values)).rows[0].v;
      return { status: 200, body: v === '' || v === undefined ? null : v };
    }
    const table = `public.${ident(path)}`;
    if (req.method === 'GET') {
      const values = [];
      const cols = (params.get('select') || '*') === '*' ? '*' : params.get('select').split(',').map(ident).join(', ');
      let q = `select ${cols} from ${table}${where(params, values)}`;
      const order = params.get('order');
      if (order) q += ` order by ${ident(order.split('.')[0])} ${order.endsWith('.desc') ? 'desc' : 'asc'}`;
      if (params.get('limit')) q += ` limit ${Number(params.get('limit'))}`;
      if (params.get('offset')) q += ` offset ${Number(params.get('offset'))}`;
      // PostgREST 와 같은 JSON 모양(날짜·시각·배열)
      return { status: 200, body: (await db.query(`select coalesce(json_agg(x), '[]'::json) as j from (${q}) x`, values)).rows[0].j };
    }
    if (req.method === 'DELETE') {
      const values = [];
      await db.query(`delete from ${table}${where(params, values)}`, values);
      return { status: 204, body: undefined };
    }
    // 여러 행 넣기(배열 본문)는 첫 행의 열 이름으로 json_populate_recordset 을 쓴다(강사 포털 성적 입력).
    const cols = Object.keys(Array.isArray(body) ? body[0] ?? {} : body).map(ident);
    if (req.method === 'POST') {
      const fn = Array.isArray(body) ? 'json_populate_recordset' : 'json_populate_record';
      const ins = `insert into ${table} (${cols.join(', ')}) select ${cols.join(', ')} from ${fn}(null::${table}, $1::json)`;
      // insert().select() 처럼 return=representation 이면 넣은 행을 돌려준다(PostgREST 와 같게)
      if (prefer.includes('return=representation')) {
        const rows = (await db.query(`with i as (${ins} returning *) select coalesce(json_agg(i), '[]'::json) as j from i`, [JSON.stringify(body)])).rows[0].j;
        return { status: 201, body: rows };
      }
      await db.query(ins, [JSON.stringify(body)]);
      return { status: 201, body: undefined };
    }
    if (req.method === 'PATCH') {
      const values = [JSON.stringify(body)];
      const upd = `update ${table} set (${cols.join(', ')}) = (select ${cols.join(', ')} from json_populate_record(null::${table}, $1::json))${where(params, values)} returning *`;
      const rows = (await db.query(`with u as (${upd}) select coalesce(json_agg(u), '[]'::json) as j from u`, values)).rows[0].j;
      return { status: 200, body: prefer.includes('return=representation') ? rows : undefined };
    }
    return { status: 405, body: { message: 'method' } };
  }

  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*' });
      return res.end();
    }
    let raw = '';
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : null;
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    const bearer = () => users.get(tokens.get((req.headers.authorization || '').replace(/^Bearer\s+/i, '')));
    try {
      if (p === '/__sql' && req.method === 'POST') return send(res, 200, await sql(body.sql, body.params, body));
      if (p === '/__user' && req.method === 'POST') return send(res, 200, await addUser(body));
      if (p === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password') {
        const x = [...users.values()].find((v) => v.email === String(body.email).toLowerCase() && v.password === body.password);
        if (x) x.lastSignIn = new Date().toISOString();
        return x ? send(res, 200, session(x)) : send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      }
      if (p === '/auth/v1/token' && u.searchParams.get('grant_type') === 'refresh_token') {
        const id = refresh.get(body.refresh_token);
        return id ? send(res, 200, session(users.get(id))) : send(res, 400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
      }
      if (p === '/auth/v1/user' && req.method === 'GET') return bearer() ? send(res, 200, userJson(bearer())) : send(res, 401, { error_code: 'bad_jwt', msg: 'invalid JWT' });
      if (p === '/auth/v1/user' && req.method === 'PUT') {
        const x = bearer();
        if (!x) return send(res, 401, { error_code: 'bad_jwt', msg: 'invalid JWT' });
        if (body.password === x.password) return send(res, 422, { error_code: 'same_password', msg: 'same' });
        x.password = body.password;
        return send(res, 200, userJson(x));
      }
      if (p === '/auth/v1/logout') {
        tokens.delete((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
        return send(res, 204);
      }
      if (p.startsWith('/auth/v1/admin/') && req.headers.apikey !== 'service-key') return send(res, 401, { msg: 'service key required' });
      if (p === '/auth/v1/admin/users' && req.method === 'GET') {
        const page = Number(u.searchParams.get('page') || 1), per = Number(u.searchParams.get('per_page') || 50);
        return send(res, 200, { users: [...users.values()].slice((page - 1) * per, page * per).map(userJson) });
      }
      if (p === '/auth/v1/admin/users' && req.method === 'POST') {
        if ([...users.values()].some((v) => v.email === String(body.email).toLowerCase())) return send(res, 422, { error_code: 'email_exists', msg: 'exists' });
        const x = { id: crypto.randomUUID(), email: String(body.email), password: body.password, user_metadata: body.user_metadata };
        await addUser(x);
        return send(res, 200, userJson(users.get(x.id)));
      }
      const am = p.match(/^\/auth\/v1\/admin\/users\/([0-9a-f-]+)$/);
      if (am && req.method === 'PUT') {
        const x = users.get(am[1]);
        if (!x) return send(res, 404, { msg: 'User not found' });
        if (body.password) x.password = body.password;
        return send(res, 200, userJson(x));
      }
      if (am && req.method === 'DELETE') {
        if (!users.has(am[1])) return send(res, 404, { msg: 'User not found' });
        users.delete(am[1]);
        for (const [t, id] of tokens) if (id === am[1]) tokens.delete(t);
        await serial(() => db.query('delete from auth.users where id = $1', [am[1]])); // 연결 표(on delete cascade)도 같이 지워진다
        return send(res, 200, {});
      }
      const rm = p.match(/^\/rest\/v1\/(.+)$/);
      if (rm) {
        const out = await serial(() => asRole(req, () => rest(req, rm[1], u.searchParams, body)));
        return send(res, out.status, out.body);
      }
      send(res, 404, { msg: `pg-supabase: ${req.method} ${p}` });
    } catch (e) {
      send(res, 500, { message: String(e.message) });
    }
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, sql, addUser, close: () => new Promise((resolve) => server.close(resolve)) };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const sb = await startPgSupabase({ port: Number(process.argv[2] || 54321) });
  console.log(`pg-supabase ${sb.url} (서비스 키 service-key, anon 키 anon-key)`);
}
