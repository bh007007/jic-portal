/**
 * 생활 요청(기획안 nonacademic_requests, 업체 '요청사항(학생)' adm/request/request·'ID 카드 교체' adm/academic/exchange).
 * 학생이 시설 수리·방 변경·ID 카드 재발급·서류 발급 같은 학업 외 요청을 내고, 인트라넷에서 직원이 처리하고 답한다.
 * 학생 앱과 인트라넷이 같이 쓴다(쓰기는 나뉜다: 요청·취소는 학생, 처리·답변은 직원. 기획안 C2). 파일·네트워크 의존 없음.
 */
import type { Db } from '../../admin/server/core';
import type { Outcome } from './requests';

export const LIFE_CATEGORIES = ['facility', 'room_change', 'id_card', 'document', 'other'] as const;
export type LifeCategory = (typeof LIFE_CATEGORIES)[number];
/** received 접수(처리 전) · in_progress 처리 중 · done 완료 · rejected 반려 · cancelled 학생이 취소 */
export type LifeStatus = 'received' | 'in_progress' | 'done' | 'rejected' | 'cancelled';
export const LIFE_STATUSES: LifeStatus[] = ['received', 'in_progress', 'done', 'rejected', 'cancelled'];
export const LIFE_CONTENT_MAX = 500;
export const LIFE_REPLY_MAX = 500;
/** 한 학생이 동시에 열어 둘 수 있는 요청 수(접수·처리 중). 같은 요청을 여러 번 내는 것을 막는다. */
export const LIFE_OPEN_MAX = 5;

export interface LifeRequest {
  id: string;
  stId: string;
  trId: string; // 요청할 때의 연수(재학 중, 없으면 가장 가까운 입학 예정)
  category: LifeCategory;
  content: string;
  status: LifeStatus;
  submittedAt: string;
  updatedAt: string;
  handledAt: string | null; // 직원이 마지막으로 상태를 바꾼 시각
  handledBy: string | null; // 처리한 직원(학생 화면에는 내보내지 않는다)
  reply: string | null; // 직원 답변. 학생에게 보인다
}

export interface LifeRequestStore {
  listAll(): Promise<LifeRequest[]>;
  listByStudent(stId: string): Promise<LifeRequest[]>;
  get(id: string): Promise<LifeRequest | null>;
  put(x: LifeRequest): Promise<void>;
}

const done = <T>(value: T, status = 200): Outcome<T> => ({ ok: true, status, value });
const fail = <T>(status: number, error: string): Outcome<T> => ({ ok: false, status, error });
export const isOpen = (s: LifeStatus) => s === 'received' || s === 'in_progress';

/** 요청을 붙일 연수: 재학 중인 연수, 없으면 가장 가까운 입학 예정 연수. 둘 다 없으면 요청할 수 없다. */
export function lifeEnrollment(db: Db, stId: string) {
  const d = db.studentDetail(stId);
  if (!d) return null;
  return (
    d.enrollments.find((e) => e.status === 'current') ??
    d.enrollments.filter((e) => e.status === 'upcoming').sort((a, b) => a.start.localeCompare(b.start))[0] ??
    null
  );
}

export interface LifeInput {
  category?: unknown;
  content?: unknown;
}

export function newLifeRequest(ctx: { db: Db; stId: string; now: () => Date; newId: () => string }, mine: LifeRequest[], input: LifeInput): Outcome<LifeRequest> {
  const category = input.category as LifeCategory;
  const content = typeof input.content === 'string' ? input.content.trim() : '';
  if (!LIFE_CATEGORIES.includes(category)) return fail(400, 'invalid_category');
  if (!content) return fail(400, 'content_required');
  if (content.length > LIFE_CONTENT_MAX) return fail(400, 'content_too_long');
  const e = lifeEnrollment(ctx.db, ctx.stId);
  if (!e) return fail(400, 'no_enrollment');
  if (mine.filter((r) => isOpen(r.status)).length >= LIFE_OPEN_MAX) return fail(409, 'too_many_open');
  const now = ctx.now().toISOString();
  return done(
    { id: ctx.newId(), stId: ctx.stId, trId: e.trId, category, content, status: 'received', submittedAt: now, updatedAt: now, handledAt: null, handledBy: null, reply: null },
    201,
  );
}

/** 학생 취소: 직원이 손대기 전(접수)인 자기 요청만. */
export function cancelLifeRequest(cur: LifeRequest | null, stId: string, now: Date): Outcome<LifeRequest> {
  if (!cur || cur.stId !== stId) return fail(404, 'not_found');
  if (cur.status !== 'received') return fail(409, 'not_pending');
  return done({ ...cur, status: 'cancelled', updatedAt: now.toISOString() });
}

/**
 * 직원 처리: 접수 → 처리 중·완료·반려, 처리 중 → 완료·반려. 끝난 요청(완료·반려·취소)은 바꾸지 않는다.
 * 반려는 사유(답변)가 있어야 한다. 답변은 학생에게 보인다. 처리자(actor)는 로컬에서 이름을 안 넣었으면 null
 * (배포는 DB 함수가 로그인한 직원으로 남긴다).
 */
export function handleLifeRequest(cur: LifeRequest | null, input: { status?: unknown; reply?: unknown }, actor: string | null, now: Date): Outcome<LifeRequest> {
  if (!cur) return fail(404, 'not_found');
  const status = input.status as LifeStatus;
  if (status !== 'in_progress' && status !== 'done' && status !== 'rejected') return fail(400, 'invalid_status');
  if (!isOpen(cur.status)) return fail(409, 'already_closed');
  if (status === 'in_progress' && cur.status === 'in_progress') return fail(409, 'already_in_progress');
  const reply = typeof input.reply === 'string' ? input.reply.trim() : '';
  if (reply.length > LIFE_REPLY_MAX) return fail(400, 'reply_too_long');
  if (status === 'rejected' && !reply) return fail(400, 'reply_required');
  const at = now.toISOString();
  return done({ ...cur, status, reply: reply || cur.reply, handledAt: at, handledBy: actor, updatedAt: at });
}
