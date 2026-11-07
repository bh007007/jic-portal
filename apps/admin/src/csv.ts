import { authHeaders } from './supabase';

/** [머리글, 값 꺼내기] */
export type Column<T> = [string, (row: T) => string | number | boolean];

const cell = (v: string | number | boolean) => {
  let s = typeof v === 'boolean' ? (v ? 'Y' : 'N') : String(v ?? '');
  // 엑셀이 수식으로 실행하지 않도록 =,+,-,@ 로 시작하는 글자는 앞에 ' 를 붙인다.
  if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** UTF-8 BOM 이 붙은 CSV. 엑셀에서 바로 열면 한글이 깨지지 않는다. */
export function toCsv<T>(columns: Column<T>[], rows: T[]) {
  const lines = [columns.map(([h]) => cell(h)).join(','), ...rows.map((r) => columns.map(([, get]) => cell(get(r))).join(','))];
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function saveCsv<T>(filename: string, columns: Column<T>[], rows: T[]) {
  const url = URL.createObjectURL(new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 화면과 같은 조건으로 전체 행(all=1)을 받아 CSV 로 저장한다. */
export async function downloadList<T>(apiUrl: string, filename: string, columns: Column<T>[]) {
  const sep = apiUrl.includes('?') ? '&' : '?';
  const r = await fetch(`${apiUrl}${sep}all=1`, { headers: await authHeaders() });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw new Error(body?.error ?? r.statusText);
  saveCsv(filename, columns, body.rows as T[]);
}
