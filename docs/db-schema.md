# 공용 DB 설계 (현재 저장소 기준)

이 파일은 `node scripts/db-schema-doc.mjs > docs/db-schema.md`로 만든다(마이그레이션 전체를 순서대로 적용한 DB에서 읽음). 손으로 고치지 않는다.

- **원본 관계**: 공동 작업 방식(11/10 안)에서 공용 DB 설계의 원본은 이 저장소다. 기획의 '공용 DB 설계표'(엑셀)와 다른 곳은 차이 목록으로 맞추고, 테이블 변경은 DB 관리자(지정 필요)가 승인한다(`docs/collab.md`).
- **정규화 표 계획**은 `docs/schema.md`, 권한(역할)은 `docs/roles.md`, 업체 원본 열 뜻은 `docs/data-dictionary*.md`.
- 마이그레이션 64개, 표 87개, 뷰 1개. 모든 표에 RLS 가 켜져 있는지는 CI 시험 `supabase/tests/security_lint.mjs`가 본다.

## 표 목록

| 영역 | 표 | 열 수 | RLS | 정책 | 처음 만든 마이그레이션 |
| --- | --- | --- | --- | --- | --- |
| 업체 원본(legacy) | `legacy_agencies` | 3 | 켜짐 | 1 | 20261107000000_legacy_tables |
| 업체 원본(legacy) | `legacy_agents` | 3 | 켜짐 | 1 | 20261107000000_legacy_tables |
| 업체 원본(legacy) | `legacy_balances` | 3 | 켜짐 | 1 | 20261109060000_legacy_invoice_summary |
| 업체 원본(legacy) | `legacy_comebacks` | 3 | 켜짐 | 1 | 20261109030000_legacy_extend |
| 업체 원본(legacy) | `legacy_course_changes` | 3 | 켜짐 | 1 | 20261109030000_legacy_extend |
| 업체 원본(legacy) | `legacy_deposits` | 3 | 켜짐 | 1 | 20261107020000_legacy_deposits |
| 업체 원본(legacy) | `legacy_dorm_assignments` | 3 | 켜짐 | 1 | 20261107000000_legacy_tables |
| 업체 원본(legacy) | `legacy_dorm_changes` | 3 | 켜짐 | 1 | 20261109030000_legacy_extend |
| 업체 원본(legacy) | `legacy_enrollments` | 3 | 켜짐 | 1 | 20261107000000_legacy_tables |
| 업체 원본(legacy) | `legacy_extensions` | 3 | 켜짐 | 1 | 20261109030000_legacy_extend |
| 업체 원본(legacy) | `legacy_invoice_items` | 3 | 켜짐 | 1 | 20261110090000_legacy_invoice_items |
| 업체 원본(legacy) | `legacy_invoice_summary` | 3 | 켜짐 | 1 | 20261109060000_legacy_invoice_summary |
| 업체 원본(legacy) | `legacy_invoices` | 3 | 켜짐 | 1 | 20261107000000_legacy_tables |
| 업체 원본(legacy) | `legacy_meta` | 3 | 켜짐 | 1 | 20261107000000_legacy_tables |
| 업체 원본(legacy) | `legacy_point_history` | 3 | 켜짐 | 1 | 20261108000000_legacy_point_history |
| 업체 원본(legacy) | `legacy_prices` | 3 | 켜짐 | 1 | 20261109130000_legacy_prices |
| 업체 원본(legacy) | `legacy_rooms` | 3 | 켜짐 | 1 | 20261108010000_legacy_rooms |
| 업체 원본(legacy) | `legacy_students` | 3 | 켜짐 | 1 | 20261107000000_legacy_tables |
| 관리자 앱 | `change_request_log` | 5 | 켜짐 | 1 | 20261110100000_change_requests |
| 관리자 앱 | `change_requests` | 20 | 켜짐 | 3 | 20261110100000_change_requests |
| 관리자 앱 | `staff_users` | 4 | 켜짐 | 1 | 20261107000000_legacy_tables |
| 에이전시(파트너) 포털 | `agency_members` | 18 | 켜짐 | 4 | 20261107010000_partner_portal |
| 에이전시(파트너) 포털 | `agency_requests` | 14 | 켜짐 | 2 | 20261107010000_partner_portal |
| 에이전시(파트너) 포털 | `agency_staff_invites` | 7 | 켜짐 | 4 | 20261110193000_agency_staff |
| 에이전시(파트너) 포털 | `campuses` | 11 | 켜짐 | 2 | 20261107010000_partner_portal |
| 에이전시(파트너) 포털 | `course_contents` | 11 | 켜짐 | 2 | 20261107010000_partner_portal |
| 에이전시(파트너) 포털 | `courses` | 8 | 켜짐 | 2 | 20261107010000_partner_portal |
| 에이전시(파트너) 포털 | `partner_content_items` | 16 | 켜짐 | 2 | 20261111140000_partner_content_items |
| 에이전시(파트너) 포털 | `partner_notices` | 14 | 켜짐 | 2 | 20261107010000_partner_portal |
| 에이전시(파트너) 포털 | `partner_resources` | 13 | 켜짐 | 2 | 20261107010000_partner_portal |
| 에이전시(파트너) 포털 | `partner_settings` | 4 | 켜짐 | 2 | 20261107010000_partner_portal |
| 에이전시(파트너) 포털 | `plan_downloads` | 4 | 켜짐 | 2 | 20261107010000_partner_portal |
| 에이전시(파트너) 포털 | `recommendation_rules` | 9 | 켜짐 | 2 | 20261107010000_partner_portal |
| 에이전시(파트너) 포털 | `visit_requests` | 17 | 켜짐 | 3 | 20261107010000_partner_portal |
| 강사 포털·공통 권한 | `attendance` | 11 | 켜짐 | 4 | 20261109000000_attendance |
| 강사 포털·공통 권한 | `attendance_closings` | 5 | 켜짐 | 3 | 20261109000000_attendance |
| 강사 포털·공통 권한 | `cefr_mappings` | 4 | 켜짐 | 2 | 20261108200000_teacher_portal |
| 강사 포털·공통 권한 | `class_sessions` | 13 | 켜짐 | 4 | 20261109000000_attendance |
| 강사 포털·공통 권한 | `classrooms` | 10 | 켜짐 | 3 | 20261109000000_attendance |
| 강사 포털·공통 권한 | `holidays` | 6 | 켜짐 | 4 | 20261108230000_holidays |
| 강사 포털·공통 권한 | `materials` | 14 | 켜짐 | 4 | 20261108200000_teacher_portal |
| 강사 포털·공통 권한 | `staff` | 11 | 켜짐 | 3 | 20261108200000_teacher_portal |
| 강사 포털·공통 권한 | `test_results` | 12 | 켜짐 | 4 | 20261108200000_teacher_portal |
| 강사 포털·공통 권한 | `test_types` | 11 | 켜짐 | 3 | 20261108200000_teacher_portal |
| 강사 포털·공통 권한 | `user_roles` | 5 | 켜짐 | 3 | 20261108200000_teacher_portal |
| 학생 앱·인트라넷 | `absence_requests` | 15 | 켜짐 | 3 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `airport_rides` | 10 | 켜짐 | 3 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `audit_logs` | 9 | 켜짐 | 1 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `counseling_notes` | 15 | 켜짐 | 0 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `departure_flights` | 10 | 켜짐 | 3 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `guard_accounts` | 4 | 켜짐 | 1 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `incident_reports` | 10 | 켜짐 | 3 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `internal_notice_reads` | 4 | 켜짐 | 4 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `internal_notices` | 12 | 켜짐 | 4 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `intranet_settings` | 5 | 켜짐 | 3 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `keycard_secret` | 3 | 켜짐 | 0 | 20261108170000_keycard_qr |
| 학생 앱·인트라넷 | `nonacademic_requests` | 12 | 켜짐 | 2 | 20261108140000_nonacademic_requests |
| 학생 앱·인트라넷 | `outings` | 12 | 켜짐 | 4 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `overnight_permissions` | 18 | 켜짐 | 2 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `penalties` | 14 | 켜짐 | 6 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `penalty_rules` | 5 | 켜짐 | 3 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `penalty_stages` | 3 | 켜짐 | 3 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `staff_campuses` | 2 | 켜짐 | 1 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `student_users` | 4 | 켜짐 | 1 | 20261108100000_student_intranet |
| 학생 앱·인트라넷 | `trip_signups` | 10 | 켜짐 | 2 | 20261108160000_school_trips |
| 학생 앱·인트라넷 | `trips` | 17 | 켜짐 | 4 | 20261108160000_school_trips |
| 정규화 표(학원 계정에서 적용) | `batches` | 6 | 켜짐 | 1 | 20261110110000_core_schema |
| 정규화 표(학원 계정에서 적용) | `deposits` | 17 | 켜짐 | 1 | 20261110130000_core_schema_accounting |
| 정규화 표(학원 계정에서 적용) | `enrollment_dorms` | 12 | 켜짐 | 1 | 20261110130000_core_schema_accounting |
| 정규화 표(학원 계정에서 적용) | `enrollment_extensions` | 13 | 켜짐 | 1 | 20261110110000_core_schema |
| 정규화 표(학원 계정에서 적용) | `enrollments` | 53 | 켜짐 | 1 | 20261110110000_core_schema |
| 정규화 표(학원 계정에서 적용) | `invoice_lines` | 17 | 켜짐 | 1 | 20261110130000_core_schema_accounting |
| 정규화 표(학원 계정에서 적용) | `invoice_parts` | 13 | 켜짐 | 1 | 20261110130000_core_schema_accounting |
| 정규화 표(학원 계정에서 적용) | `invoices` | 8 | 켜짐 | 1 | 20261110130000_core_schema_accounting |
| 정규화 표(학원 계정에서 적용) | `local_charges` | 14 | 켜짐 | 1 | 20261110130000_core_schema_accounting |
| 정규화 표(학원 계정에서 적용) | `point_ledger` | 10 | 켜짐 | 1 | 20261110130000_core_schema_accounting |
| 정규화 표(학원 계정에서 적용) | `students` | 15 | 켜짐 | 1 | 20261110110000_core_schema |
| 정규화 표(학원 계정에서 적용) | `vendor_balances` | 6 | 켜짐 | 1 | 20261110130000_core_schema_accounting |
| 기타 | `approval_defaults` | 3 | 켜짐 | 2 | 20261112110000_permissions_foundation |
| 기타 | `approval_grants` | 7 | 켜짐 | 3 | 20261112110000_permissions_foundation |
| 기타 | `approval_kinds` | 3 | 켜짐 | 2 | 20261112110000_permissions_foundation |
| 기타 | `course_reasons` | 13 | 켜짐 | 2 | 20261112010000_course_reasons |
| 기타 | `menu_groups` | 3 | 켜짐 | 2 | 20261112110000_permissions_foundation |
| 기타 | `price_books` | 16 | 켜짐 | 4 | 20261112170000_price_books |
| 기타 | `role_permissions` | 7 | 켜짐 | 2 | 20261112110000_permissions_foundation |
| 기타 | `visit_handlers` | 7 | 켜짐 | 3 | 20261112090000_visit_handlers |
| 기타 | `visit_request_events` | 8 | 켜짐 | 2 | 20261111220000_visit_requests_v2 |

뷰: `enrollment_periods`

## 업체 원본(legacy)

### `legacy_agencies`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_agencies_staff_read`(SELECT, authenticated)

### `legacy_agents`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_agents_staff_read`(SELECT, authenticated)

### `legacy_balances`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_balances_staff_read`(SELECT, authenticated)

### `legacy_comebacks`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_comebacks_staff_read`(SELECT, authenticated)

### `legacy_course_changes`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_course_changes_staff_read`(SELECT, authenticated)

### `legacy_deposits`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_deposits_staff_read`(SELECT, authenticated)

### `legacy_dorm_assignments`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_dorm_assignments_staff_read`(SELECT, authenticated)

### `legacy_dorm_changes`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_dorm_changes_staff_read`(SELECT, authenticated)

### `legacy_enrollments`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_enrollments_staff_read`(SELECT, authenticated)

### `legacy_extensions`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_extensions_staff_read`(SELECT, authenticated)

### `legacy_invoice_items`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_invoice_items_staff_read`(SELECT, authenticated)

### `legacy_invoice_summary`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_invoice_summary_staff_read`(SELECT, authenticated)

### `legacy_invoices`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_invoices_staff_read`(SELECT, authenticated)

### `legacy_meta`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_meta_staff_read`(SELECT, authenticated)

### `legacy_point_history`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_point_history_staff_read`(SELECT, authenticated)

### `legacy_prices`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_prices_staff_read`(SELECT, authenticated)

### `legacy_rooms`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_rooms_staff_read`(SELECT, authenticated)

### `legacy_students`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `data` | jsonb |  |  |
| `loaded_at` | timestamp with time zone |  | `now()` |

정책: `legacy_students_staff_read`(SELECT, authenticated)

## 관리자 앱

### `change_request_log`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | bigint |  |  |
| `request_id` | bigint |  |  |
| `state` | text |  |  |
| `actor` | uuid | 가능 |  |
| `at` | timestamp with time zone |  | `now()` |

정책: `change_request_log_staff_read`(SELECT, authenticated)

### `change_requests`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | bigint |  |  |
| `tr_id` | text |  |  |
| `st_id` | text |  | `''::text` |
| `kind` | text |  |  |
| `state` | text |  | `'requested'::text` |
| `source` | text |  | `'staff'::text` |
| `want` | text |  | `''::text` |
| `period_from` | date | 가능 |  |
| `period_to` | date | 가능 |  |
| `content` | text |  | `''::text` |
| `reply` | text |  | `''::text` |
| `staff_memo` | text |  | `''::text` |
| `tuition_fee` | numeric | 가능 |  |
| `local_fee` | numeric | 가능 |  |
| `created_by` | uuid | 가능 | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | 가능 |  |
| `updated_at` | timestamp with time zone |  | `now()` |
| `decided_by` | uuid | 가능 |  |
| `decided_at` | timestamp with time zone | 가능 |  |

정책: `change_requests_staff_insert`(INSERT, authenticated), `change_requests_staff_read`(SELECT, authenticated), `change_requests_staff_update`(UPDATE, authenticated)

### `staff_users`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `user_id` | uuid |  |  |
| `role` | text |  | `'admin'::text` |
| `name` | text | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |

정책: `staff_users_self_read`(SELECT, authenticated)

## 에이전시(파트너) 포털

### `agency_members`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `user_id` | uuid |  |  |
| `email` | text |  |  |
| `agency_name` | text |  |  |
| `branch` | text | 가능 |  |
| `country` | text | 가능 |  |
| `contact_name` | text | 가능 |  |
| `phone` | text | 가능 |  |
| `lang` | text |  | `'ko'::text` |
| `currency` | text |  | `'KRW'::text` |
| `status` | text |  | `'active'::text` |
| `legacy_am_id` | text | 가능 |  |
| `login_count` | integer |  | `0` |
| `last_login_at` | timestamp with time zone | 가능 |  |
| `approved_by` | uuid | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `role` | text |  | `'owner'::text` |
| `owner_id` | uuid | 가능 |  |

정책: `agency_members_staff_all`(ALL, authenticated), `members_owner_read`(SELECT, authenticated), `members_self_read`(SELECT, authenticated), `members_self_update`(UPDATE, authenticated)

### `agency_requests`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | bigint |  |  |
| `user_id` | uuid |  |  |
| `email` | text |  |  |
| `agency_name` | text |  |  |
| `branch` | text | 가능 |  |
| `country` | text | 가능 |  |
| `contact_name` | text | 가능 |  |
| `phone` | text | 가능 |  |
| `message` | text | 가능 |  |
| `status` | text |  | `'pending'::text` |
| `reviewed_by` | uuid | 가능 |  |
| `reviewed_at` | timestamp with time zone | 가능 |  |
| `review_note` | text | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |

정책: `agency_requests_staff_all`(ALL, authenticated), `requests_self_read`(SELECT, authenticated)

### `agency_staff_invites`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | bigint |  |  |
| `owner_id` | uuid |  | `auth.uid()` |
| `email` | text |  |  |
| `name` | text |  | `''::text` |
| `created_at` | timestamp with time zone |  | `now()` |
| `claimed_by` | uuid | 가능 |  |
| `claimed_at` | timestamp with time zone | 가능 |  |

정책: `agency_staff_invites_staff_all`(ALL, authenticated), `invites_owner_delete`(DELETE, authenticated), `invites_owner_insert`(INSERT, authenticated), `invites_owner_read`(SELECT, authenticated)

### `campuses`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `name` | text |  |  |
| `tagline` | text | 가능 |  |
| `status` | text |  | `'open'::text` |
| `sort` | integer |  | `0` |
| `direction` | text | 가능 |  |
| `environment` | text | 가능 |  |
| `facilities` | text | 가능 |  |
| `activities` | text | 가능 |  |
| `life` | text | 가능 |  |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `campuses_public_read`(SELECT, anon,authenticated), `campuses_staff_all`(ALL, authenticated)

### `course_contents`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `course_id` | text |  |  |
| `summary` | text | 가능 |  |
| `target` | text | 가능 |  |
| `structure` | text | 가능 |  |
| `outcomes` | text | 가능 |  |
| `media_links` | text | 가능 |  |
| `reason_learning` | text | 가능 |  |
| `reason_growth` | text | 가능 |  |
| `reason_environment` | text | 가능 |  |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | 가능 |  |

정책: `course_contents_partner_read`(SELECT, authenticated), `course_contents_staff_all`(ALL, authenticated)

### `courses`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `campus_id` | text |  |  |
| `name` | text |  |  |
| `levels` | jsonb |  | `'[]'::jsonb` |
| `sort` | integer |  | `0` |
| `status` | text |  | `'open'::text` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `display_name` | text | 가능 |  |

정책: `courses_partner_read`(SELECT, authenticated), `courses_staff_all`(ALL, authenticated)

### `partner_content_items`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `kind` | text |  |  |
| `campus` | text |  | `''::text` |
| `title` | text |  | `''::text` |
| `body` | text |  | `''::text` |
| `data` | jsonb |  | `'{}'::jsonb` |
| `i18n` | jsonb |  | `'{}'::jsonb` |
| `countries` | ARRAY |  | `'{}'::text[]` |
| `country_order` | jsonb |  | `'{}'::jsonb` |
| `status` | text |  | `'draft'::text` |
| `sort` | integer |  | `0` |
| `updated_on` | date | 가능 |  |
| `next_update` | text | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | 가능 | `auth.uid()` |

정책: `partner_content_items_partner_read`(SELECT, authenticated), `partner_content_items_staff_all`(ALL, authenticated)

### `partner_notices`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | bigint |  |  |
| `kind` | text |  | `'notice'::text` |
| `tag` | text |  | `'안내'::text` |
| `title` | text |  |  |
| `body` | text | 가능 |  |
| `target` | text | 가능 |  |
| `pinned` | boolean |  | `false` |
| `starts_on` | date | 가능 |  |
| `ends_on` | date | 가능 |  |
| `published` | boolean |  | `true` |
| `created_at` | timestamp with time zone |  | `now()` |
| `created_by` | uuid | 가능 |  |
| `countries` | ARRAY |  | `'{}'::text[]` |
| `country_order` | jsonb |  | `'{}'::jsonb` |

정책: `notices_partner_read`(SELECT, authenticated), `partner_notices_staff_all`(ALL, authenticated)

### `partner_resources`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | bigint |  |  |
| `category` | text |  |  |
| `title` | text |  |  |
| `description` | text | 가능 |  |
| `file_path` | text | 가능 |  |
| `file_name` | text | 가능 |  |
| `file_size` | bigint | 가능 |  |
| `link_url` | text | 가능 |  |
| `updated_on` | date |  | `CURRENT_DATE` |
| `created_at` | timestamp with time zone |  | `now()` |
| `created_by` | uuid | 가능 |  |
| `countries` | ARRAY |  | `'{}'::text[]` |
| `country_order` | jsonb |  | `'{}'::jsonb` |

정책: `partner_resources_staff_all`(ALL, authenticated), `resources_partner_read`(SELECT, authenticated)

### `partner_settings`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `key` | text |  |  |
| `value` | text |  | `''::text` |
| `label` | text | 가능 |  |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `partner_settings_staff_all`(ALL, authenticated), `settings_partner_read`(SELECT, authenticated)

### `plan_downloads`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | bigint |  |  |
| `member_id` | uuid |  | `auth.uid()` |
| `course_id` | text | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |

정책: `downloads_partner_insert`(INSERT, authenticated), `plan_downloads_staff_all`(ALL, authenticated)

### `recommendation_rules`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | bigint |  |  |
| `version` | text |  |  |
| `status` | text |  | `'draft'::text` |
| `note` | text | 가능 |  |
| `questions` | jsonb |  |  |
| `rules` | jsonb |  |  |
| `level_defaults` | jsonb |  | `'{}'::jsonb` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `recommendation_rules_staff_all`(ALL, authenticated), `rules_partner_read`(SELECT, authenticated)

### `visit_requests`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | bigint |  |  |
| `member_id` | uuid |  | `auth.uid()` |
| `visit_date` | date |  |  |
| `people` | integer |  |  |
| `purpose` | text | 가능 |  |
| `status` | text |  | `'received'::text` |
| `staff_note` | text | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `campus` | text | 가능 |  |
| `visit_date2` | date | 가능 |  |
| `visit_time` | text | 가능 |  |
| `purposes` | ARRAY |  | `'{}'::text[]` |
| `pickup` | text |  | `'none'::text` |
| `schedule_date` | date | 가능 |  |
| `schedule_time` | text | 가능 |  |
| `decision_reason` | text | 가능 |  |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `visit_requests_staff_all`(ALL, authenticated), `visits_partner_insert`(INSERT, authenticated), `visits_partner_read`(SELECT, authenticated)

## 강사 포털·공통 권한

### `attendance`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `session_id` | uuid |  |  |
| `student_no` | text |  |  |
| `enrollment_id` | text |  | `''::text` |
| `result` | text | 가능 |  |
| `late_min` | smallint | 가능 |  |
| `excused` | boolean |  | `false` |
| `note` | text |  | `''::text` |
| `checked_by` | uuid | 가능 |  |
| `checked_name` | text |  | `''::text` |
| `checked_at` | timestamp with time zone | 가능 |  |
| `legacy_id` | text | 가능 |  |

정책: `attendance_delete`(DELETE, authenticated), `attendance_insert`(INSERT, authenticated), `attendance_read`(SELECT, authenticated), `attendance_update`(UPDATE, authenticated)

### `attendance_closings`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `day` | date |  |  |
| `campus` | text |  |  |
| `closed_by` | uuid | 가능 | `auth.uid()` |
| `closed_name` | text |  | `''::text` |
| `closed_at` | timestamp with time zone |  | `now()` |

정책: `attendance_closings_delete`(DELETE, authenticated), `attendance_closings_insert`(INSERT, authenticated), `attendance_closings_read`(SELECT, authenticated)

### `cefr_mappings`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `test_type` | text |  |  |
| `cefr` | text |  |  |
| `min_value` | numeric |  |  |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `cefr_read`(SELECT, authenticated), `cefr_write`(ALL, authenticated)

### `class_sessions`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `day` | date |  |  |
| `start_time` | time without time zone |  |  |
| `minutes` | smallint |  | `50` |
| `campus` | text |  |  |
| `kind` | text |  | `'1'::text` |
| `subject` | text |  | `''::text` |
| `teacher_id` | uuid | 가능 |  |
| `sub_teacher_id` | uuid | 가능 |  |
| `classroom_id` | uuid | 가능 |  |
| `legacy_key` | text | 가능 |  |
| `created_by` | uuid | 가능 | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |

정책: `class_sessions_delete`(DELETE, authenticated), `class_sessions_insert`(INSERT, authenticated), `class_sessions_read`(SELECT, authenticated), `class_sessions_update`(UPDATE, authenticated)

### `classrooms`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `campus` | text |  |  |
| `num` | text |  |  |
| `kind` | text |  | `'1'::text` |
| `building` | text |  | `''::text` |
| `floor` | text |  | `''::text` |
| `capacity` | smallint | 가능 |  |
| `active` | boolean |  | `true` |
| `legacy_id` | text | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |

정책: `classrooms_insert`(INSERT, authenticated), `classrooms_read`(SELECT, authenticated), `classrooms_update`(UPDATE, authenticated)

### `holidays`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `day` | date |  |  |
| `campus` | text |  | `''::text` |
| `name` | text |  |  |
| `kind` | text |  | `'public'::text` |
| `created_by` | uuid | 가능 | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |

정책: `holidays_delete`(DELETE, authenticated), `holidays_insert`(INSERT, authenticated), `holidays_read`(SELECT, authenticated), `holidays_update`(UPDATE, authenticated)

### `materials`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `course` | text |  |  |
| `textbook` | text |  | `''::text` |
| `unit` | text |  | `''::text` |
| `kind` | text |  | `'other'::text` |
| `title` | text |  |  |
| `url` | text |  |  |
| `campus` | text |  | `''::text` |
| `sort` | integer |  | `0` |
| `student_visible` | boolean |  | `false` |
| `created_by` | uuid | 가능 | `auth.uid()` |
| `created_by_name` | text |  | `''::text` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `materials_delete`(DELETE, authenticated), `materials_insert`(INSERT, authenticated), `materials_read`(SELECT, authenticated), `materials_update`(UPDATE, authenticated)

### `staff`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `user_id` | uuid | 가능 |  |
| `kind` | text |  | `'teacher'::text` |
| `name` | text |  |  |
| `nickname` | text |  | `''::text` |
| `campus` | text |  | `''::text` |
| `legacy_id` | text | 가능 |  |
| `active` | boolean |  | `true` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `created_by` | uuid | 가능 | `auth.uid()` |

정책: `staff_insert`(INSERT, authenticated), `staff_read`(SELECT, authenticated), `staff_update`(UPDATE, authenticated)

### `test_results`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `student_no` | text |  |  |
| `enrollment_id` | text |  |  |
| `test_type` | text |  |  |
| `test_date` | date |  |  |
| `section` | text |  | `''::text` |
| `value` | numeric |  |  |
| `note` | text |  | `''::text` |
| `teacher_id` | uuid | 가능 | `auth.uid()` |
| `teacher_name` | text |  | `''::text` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `test_results_delete`(DELETE, authenticated), `test_results_insert`(INSERT, authenticated), `test_results_read`(SELECT, authenticated), `test_results_update`(UPDATE, authenticated)

### `test_types`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `code` | text |  |  |
| `name` | text |  |  |
| `course` | text |  | `''::text` |
| `scale` | text |  |  |
| `min_value` | numeric |  | `0` |
| `max_value` | numeric |  |  |
| `step` | numeric |  | `1` |
| `sections` | ARRAY |  | `'{}'::text[]` |
| `sort` | smallint |  | `0` |
| `active` | boolean |  | `true` |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `test_types_read`(SELECT, authenticated), `test_types_update`(UPDATE, authenticated), `test_types_write`(INSERT, authenticated)

### `user_roles`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `user_id` | uuid |  |  |
| `role` | text |  |  |
| `campus` | text |  | `''::text` |
| `created_at` | timestamp with time zone |  | `now()` |
| `created_by` | uuid | 가능 | `auth.uid()` |

정책: `user_roles_delete`(DELETE, authenticated), `user_roles_read`(SELECT, authenticated), `user_roles_write`(INSERT, authenticated)

## 학생 앱·인트라넷

### `absence_requests`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `student_no` | text |  |  |
| `enrollment_id` | text |  |  |
| `absence_date` | date |  |  |
| `periods` | ARRAY |  | `'{}'::smallint[]` |
| `kind` | text |  |  |
| `reason` | text |  |  |
| `status` | text |  | `'pending'::text` |
| `decided_at` | timestamp with time zone | 가능 |  |
| `decided_by` | uuid | 가능 |  |
| `staff_comment` | text | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `created_by` | uuid | 가능 | `auth.uid()` |
| `document_path` | text | 가능 |  |

정책: `absence_insert`(INSERT, authenticated), `absence_manager_read`(SELECT, authenticated), `absence_read`(SELECT, authenticated)

### `airport_rides`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `enrollment_id` | text |  |  |
| `student_no` | text |  |  |
| `decision` | text |  |  |
| `pickup_date` | date | 가능 |  |
| `pickup_time` | time without time zone | 가능 |  |
| `note` | text |  | `''::text` |
| `for_date` | date |  |  |
| `for_time` | time without time zone |  |  |
| `decided_by` | uuid | 가능 | `auth.uid()` |
| `decided_at` | timestamp with time zone |  | `now()` |

정책: `ride_read`(SELECT, authenticated), `ride_staff_update`(UPDATE, authenticated), `ride_staff_write`(INSERT, authenticated)

### `audit_logs`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | bigint |  |  |
| `at` | timestamp with time zone |  | `now()` |
| `actor_id` | uuid | 가능 |  |
| `actor_name` | text |  |  |
| `action` | text |  |  |
| `target` | text |  | `'counseling'::text` |
| `target_id` | text |  |  |
| `student_no` | text |  |  |
| `campus` | text |  |  |

정책: `audit_read`(SELECT, authenticated)

### `counseling_notes`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `student_no` | text |  |  |
| `campus` | text |  |  |
| `counsel_date` | date |  |  |
| `title` | text |  |  |
| `content` | text |  |  |
| `author_id` | uuid | 가능 |  |
| `author_name` | text |  |  |
| `follow_up_due` | date | 가능 |  |
| `follow_up_done` | boolean |  | `false` |
| `follow_up_done_at` | timestamp with time zone | 가능 |  |
| `follow_up_done_by` | text | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | text |  | `''::text` |

### `departure_flights`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `enrollment_id` | text |  |  |
| `student_no` | text |  |  |
| `depart_date` | date |  |  |
| `depart_time` | time without time zone |  |  |
| `flight` | text |  |  |
| `airport` | text |  |  |
| `needs_ride` | boolean |  | `false` |
| `note` | text |  | `''::text` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `departure_insert`(INSERT, authenticated), `departure_read`(SELECT, authenticated), `departure_update`(UPDATE, authenticated)

### `guard_accounts`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `user_id` | uuid |  |  |
| `campus` | text |  |  |
| `label` | text |  |  |
| `created_at` | timestamp with time zone |  | `now()` |

정책: `guard_accounts_read`(SELECT, authenticated)

### `incident_reports`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `student_no` | text |  |  |
| `enrollment_id` | text |  | `''::text` |
| `campus` | text |  |  |
| `kind` | text |  |  |
| `note` | text |  |  |
| `occurred_at` | timestamp with time zone |  |  |
| `reported_by` | text |  | `''::text` |
| `recorded_by` | uuid | 가능 | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |

정책: `reports_insert`(INSERT, authenticated), `reports_manager_read`(SELECT, authenticated), `reports_read`(SELECT, authenticated)

### `internal_notice_reads`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `notice_id` | uuid |  |  |
| `user_id` | uuid |  | `auth.uid()` |
| `name` | text |  |  |
| `read_at` | timestamp with time zone |  | `now()` |

정책: `notice_reads_insert`(INSERT, authenticated), `notice_reads_manager_insert`(INSERT, authenticated), `notice_reads_manager_read`(SELECT, authenticated), `notice_reads_read`(SELECT, authenticated)

### `internal_notices`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `title` | text |  |  |
| `content` | text |  |  |
| `campus` | text |  | `''::text` |
| `pinned` | boolean |  | `false` |
| `until_date` | date | 가능 |  |
| `author_id` | uuid | 가능 | `auth.uid()` |
| `author_name` | text |  |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | text |  | `''::text` |
| `roles` | ARRAY |  | `'{}'::text[]` |

정책: `notices_manager_insert`(INSERT, authenticated), `notices_manager_read`(SELECT, authenticated), `notices_manager_update`(UPDATE, authenticated), `notices_staff`(ALL, authenticated)

### `intranet_settings`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | smallint |  | `1` |
| `curfew` | time without time zone |  | `'23:00:00'::time without time zone` |
| `guards` | ARRAY |  | `'{}'::text[]` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | 가능 |  |

정책: `settings_manager_read`(SELECT, authenticated), `settings_read`(SELECT, authenticated), `settings_update`(UPDATE, authenticated)

### `keycard_secret`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | integer |  |  |
| `secret` | text |  |  |
| `created_at` | timestamp with time zone |  | `now()` |

### `nonacademic_requests`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `student_no` | text |  |  |
| `enrollment_id` | text |  |  |
| `category` | text |  |  |
| `content` | text |  |  |
| `status` | text |  | `'received'::text` |
| `staff_reply` | text | 가능 |  |
| `handled_at` | timestamp with time zone | 가능 |  |
| `handled_by` | uuid | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `created_by` | uuid | 가능 | `auth.uid()` |

정책: `nonacademic_insert`(INSERT, authenticated), `nonacademic_read`(SELECT, authenticated)

### `outings`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `student_no` | text |  |  |
| `enrollment_id` | text |  | `''::text` |
| `campus` | text |  |  |
| `out_at` | timestamp with time zone | 가능 |  |
| `out_by` | text |  | `''::text` |
| `in_at` | timestamp with time zone | 가능 |  |
| `in_by` | text |  | `''::text` |
| `recorded_by` | uuid | 가능 | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `out_via` | text | 가능 |  |
| `in_via` | text | 가능 |  |

정책: `outings_insert`(INSERT, authenticated), `outings_manager_read`(SELECT, authenticated), `outings_read`(SELECT, authenticated), `outings_return`(UPDATE, authenticated)

### `overnight_permissions`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `student_no` | text |  |  |
| `enrollment_id` | text |  |  |
| `leave_date` | date |  |  |
| `return_date` | date |  |  |
| `reason` | text |  |  |
| `status` | text |  | `'pending'::text` |
| `decided_at` | timestamp with time zone | 가능 |  |
| `decided_by` | uuid | 가능 |  |
| `staff_comment` | text | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `created_by` | uuid | 가능 | `auth.uid()` |
| `destination` | text |  | `''::text` |
| `accommodation` | text |  | `''::text` |
| `contact` | text |  | `''::text` |
| `companions` | ARRAY |  | `'{}'::text[]` |
| `guardian_consent` | boolean |  | `false` |

정책: `overnight_insert`(INSERT, authenticated), `overnight_read`(SELECT, authenticated)

### `penalties`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `student_no` | text |  |  |
| `kind` | text |  |  |
| `occurred_on` | date |  |  |
| `campus` | text |  |  |
| `basis` | text |  |  |
| `source` | text |  |  |
| `source_id` | text |  |  |
| `status` | text |  | `'pending'::text` |
| `score` | integer | 가능 |  |
| `decided_at` | timestamp with time zone | 가능 |  |
| `decided_by` | uuid | 가능 |  |
| `note` | text | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |

정책: `penalties_guard_insert`(INSERT, authenticated), `penalties_manager_absence_delete`(DELETE, authenticated), `penalties_manager_absence_insert`(INSERT, authenticated), `penalties_manager_decide`(UPDATE, authenticated), `penalties_manager_read`(SELECT, authenticated), `penalties_staff`(ALL, authenticated)

### `penalty_rules`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `code` | text |  |  |
| `name` | text |  |  |
| `score` | integer | 가능 |  |
| `approver` | text |  | `''::text` |
| `sort` | smallint |  | `0` |

정책: `rules_admin_update`(UPDATE, authenticated), `rules_manager_read`(SELECT, authenticated), `rules_staff`(SELECT, authenticated)

### `penalty_stages`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `stage` | smallint |  |  |
| `name` | text |  |  |
| `min_score` | integer | 가능 |  |

정책: `stages_admin_update`(UPDATE, authenticated), `stages_manager_read`(SELECT, authenticated), `stages_staff`(SELECT, authenticated)

### `staff_campuses`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `user_id` | uuid |  |  |
| `campus` | text |  |  |

정책: `staff_campuses_read`(SELECT, authenticated)

### `student_users`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `user_id` | uuid |  |  |
| `student_no` | text |  |  |
| `must_change_password` | boolean |  | `true` |
| `created_at` | timestamp with time zone |  | `now()` |

정책: `student_users_read`(SELECT, authenticated)

### `trip_signups`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `trip_id` | uuid |  |  |
| `student_no` | text |  |  |
| `enrollment_id` | text |  |  |
| `status` | text |  | `'applied'::text` |
| `removed_reason` | text | 가능 |  |
| `handled_at` | timestamp with time zone | 가능 |  |
| `handled_by` | uuid | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `trip_signups_manager_read`(SELECT, authenticated), `trip_signups_read`(SELECT, authenticated)

### `trips`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `campus` | text |  | `''::text` |
| `title` | text |  |  |
| `place` | text |  |  |
| `meeting` | text |  | `''::text` |
| `description` | text |  | `''::text` |
| `start_date` | date |  |  |
| `end_date` | date |  |  |
| `deadline` | date |  |  |
| `capacity` | integer |  |  |
| `cost` | integer |  | `0` |
| `status` | text |  | `'open'::text` |
| `seats_taken` | integer |  | `0` |
| `created_by` | uuid | 가능 | `auth.uid()` |
| `created_by_name` | text |  | `COALESCE(current_staff_name(), ''::text)` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `trips_insert`(INSERT, authenticated), `trips_manager_read`(SELECT, authenticated), `trips_read`(SELECT, authenticated), `trips_update`(UPDATE, authenticated)

## 정규화 표(학원 계정에서 적용)

### `batches`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `departure_date` | date | 가능 |  |
| `start_date` | date | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `is_extra` | boolean |  | `false` |

정책: `batches_staff_read`(SELECT, authenticated)

### `deposits`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `deposited_at` | timestamp with time zone | 가능 |  |
| `payer_name` | text |  | `''::text` |
| `memo` | text |  | `''::text` |
| `currency` | text |  | `''::text` |
| `amount` | numeric | 가능 |  |
| `fee` | numeric | 가능 |  |
| `amount_total` | numeric | 가능 |  |
| `confirmed` | boolean |  | `false` |
| `in_use` | boolean |  | `true` |
| `matched_count` | integer | 가능 |  |
| `matched_amount` | numeric | 가능 |  |
| `matched_currency` | text |  | `''::text` |
| `matched_agency` | text |  | `''::text` |
| `balance` | numeric | 가능 |  |
| `legacy_id` | text | 가능 |  |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `deposits_staff_read`(SELECT, authenticated)

### `enrollment_dorms`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `enrollment_id` | text |  |  |
| `dorm_name` | text |  | `''::text` |
| `dorm_short` | text |  | `''::text` |
| `dorm_type` | text |  | `''::text` |
| `campus_name` | text |  | `''::text` |
| `campus_code` | text |  | `''::text` |
| `start_date` | date | 가능 |  |
| `end_date` | date | 가능 |  |
| `weeks` | integer | 가능 |  |
| `canceled` | boolean |  | `false` |
| `legacy_id` | text | 가능 |  |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `enrollment_dorms_staff_read`(SELECT, authenticated)

### `enrollment_extensions`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `enrollment_id` | text |  |  |
| `start_date` | date | 가능 |  |
| `finish_date` | date | 가능 |  |
| `weeks` | integer | 가능 |  |
| `memo` | text |  | `''::text` |
| `registered_at` | timestamp with time zone | 가능 |  |
| `legacy_id` | text | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `price` | numeric | 가능 |  |
| `paid` | numeric | 가능 |  |
| `currency` | text |  | `''::text` |

정책: `enrollment_extensions_staff_read`(SELECT, authenticated)

### `enrollments`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `student_no` | text |  |  |
| `batch_id` | text | 가능 |  |
| `campus_code` | text |  | `''::text` |
| `dorm_campus_code` | text |  | `''::text` |
| `courses` | text |  | `''::text` |
| `dorms` | text |  | `''::text` |
| `start_date` | date | 가능 |  |
| `finish_date` | date | 가능 |  |
| `weeks` | integer | 가능 |  |
| `state` | text |  | `''::text` |
| `state_name` | text |  | `''::text` |
| `country_code` | text |  | `''::text` |
| `agency_id` | text |  | `''::text` |
| `agency_name` | text |  | `''::text` |
| `agent_id` | text |  | `''::text` |
| `agent_name` | text |  | `''::text` |
| `branch` | text |  | `''::text` |
| `deposit_state` | text |  | `''::text` |
| `deposit_due_date` | date | 가능 |  |
| `departure_date` | date | 가능 |  |
| `return_date` | date | 가능 |  |
| `pickup_type` | text |  | `''::text` |
| `pickup_place` | text |  | `''::text` |
| `room_clear` | boolean |  | `false` |
| `point_clear` | boolean |  | `false` |
| `agency_memo` | text |  | `''::text` |
| `branch_memo` | text |  | `''::text` |
| `invoiced_at` | timestamp with time zone | 가능 |  |
| `legacy_id` | text | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `currency` | text |  | `''::text` |
| `country_name` | text |  | `''::text` |
| `deposit_state_code` | text |  | `''::text` |
| `agency_name_en` | text |  | `''::text` |
| `student_memo` | text |  | `''::text` |
| `bank_memo` | text |  | `''::text` |
| `account_memo` | text |  | `''::text` |
| `branch_memo_en` | text |  | `''::text` |
| `cancel_at` | timestamp with time zone | 가능 |  |
| `cancel_memo` | text |  | `''::text` |
| `cancel_train_at` | timestamp with time zone | 가능 |  |
| `cancel_train_memo` | text |  | `''::text` |
| `postpone_at` | timestamp with time zone | 가능 |  |
| `postpone_memo` | text |  | `''::text` |
| `expel_at` | timestamp with time zone | 가능 |  |
| `expel_memo` | text |  | `''::text` |
| `pickup_flight` | text |  | `''::text` |
| `pickup_flight_num` | text |  | `''::text` |
| `pickup_arrival_at` | timestamp with time zone | 가능 |  |
| `pickup_terminal` | text |  | `''::text` |
| `pickup_remark` | text |  | `''::text` |

정책: `enrollments_staff_read`(SELECT, authenticated)

### `invoice_lines`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `enrollment_id` | text |  |  |
| `side` | text |  |  |
| `version` | integer | 가능 |  |
| `item_type` | text |  | `''::text` |
| `item_name` | text |  | `''::text` |
| `currency` | text |  | `''::text` |
| `price` | numeric | 가능 |  |
| `weeks` | integer | 가능 |  |
| `start_date` | date | 가능 |  |
| `end_date` | date | 가능 |  |
| `course_name` | text |  | `''::text` |
| `dorm_name` | text |  | `''::text` |
| `in_use` | boolean |  | `true` |
| `canceled` | boolean |  | `false` |
| `legacy_id` | text | 가능 |  |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `invoice_lines_staff_read`(SELECT, authenticated)

### `invoice_parts`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `enrollment_id` | text |  |  |
| `part_no` | text |  | `''::text` |
| `registered_at` | timestamp with time zone | 가능 |  |
| `weeks` | integer | 가능 |  |
| `start_date` | date | 가능 |  |
| `finish_date` | date | 가능 |  |
| `total` | numeric | 가능 |  |
| `paid` | numeric | 가능 |  |
| `local_total` | numeric | 가능 |  |
| `local_paid` | numeric | 가능 |  |
| `legacy_id` | text | 가능 |  |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `invoice_parts_staff_read`(SELECT, authenticated)

### `invoices`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `enrollment_id` | text |  |  |
| `currency` | text |  | `''::text` |
| `total` | numeric | 가능 |  |
| `paid` | numeric | 가능 |  |
| `local_total` | numeric | 가능 |  |
| `local_paid` | numeric | 가능 |  |
| `legacy_id` | text | 가능 |  |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `invoices_staff_read`(SELECT, authenticated)

### `local_charges`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `enrollment_id` | text |  |  |
| `charge_no` | text |  | `''::text` |
| `charge_type` | text |  | `''::text` |
| `charge_name` | text |  | `''::text` |
| `currency` | text |  | `''::text` |
| `price` | numeric | 가능 |  |
| `rest_amount` | numeric | 가능 |  |
| `payment_no` | text |  | `''::text` |
| `payment_currency` | text |  | `''::text` |
| `payment_amount` | numeric | 가능 |  |
| `paid_at` | timestamp with time zone | 가능 |  |
| `legacy_id` | text | 가능 |  |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `local_charges_staff_read`(SELECT, authenticated)

### `point_ledger`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | text |  |  |
| `enrollment_id` | text |  |  |
| `kind` | text |  | `''::text` |
| `at` | timestamp with time zone | 가능 |  |
| `points` | numeric | 가능 |  |
| `item_name` | text |  | `''::text` |
| `staff_name` | text |  | `''::text` |
| `memo` | text |  | `''::text` |
| `legacy_id` | text | 가능 |  |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `point_ledger_staff_read`(SELECT, authenticated)

### `students`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `student_no` | text |  |  |
| `name` | text |  | `''::text` |
| `last_name` | text |  | `''::text` |
| `first_name` | text |  | `''::text` |
| `birthday` | date | 가능 |  |
| `gender` | text |  | `''::text` |
| `country` | text |  | `''::text` |
| `email` | text |  | `''::text` |
| `phone` | text |  | `''::text` |
| `language` | text |  | `''::text` |
| `vip_level` | text |  | `''::text` |
| `legacy_id` | text | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `country_code` | text |  | `''::text` |

정책: `students_staff_read`(SELECT, authenticated)

### `vendor_balances`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `enrollment_id` | text |  |  |
| `cost` | numeric | 가능 |  |
| `payment` | numeric | 가능 |  |
| `extend_count` | integer | 가능 |  |
| `legacy_id` | text | 가능 |  |
| `updated_at` | timestamp with time zone |  | `now()` |

정책: `vendor_balances_staff_read`(SELECT, authenticated)

## 기타

### `approval_defaults`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `kind` | text |  |  |
| `role` | text |  |  |
| `campus_scoped` | boolean |  | `false` |

정책: `approval_defaults_admin`(ALL, authenticated), `approval_defaults_read`(SELECT, authenticated)

### `approval_grants`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `user_id` | uuid |  |  |
| `kind` | text |  |  |
| `campus` | text |  | `''::text` |
| `allow` | boolean |  |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `granted_by` | uuid | 가능 | `auth.uid()` |

정책: `approval_grants_delete`(DELETE, authenticated), `approval_grants_insert`(INSERT, authenticated), `approval_grants_read`(SELECT, authenticated)

### `approval_kinds`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `kind` | text |  |  |
| `label` | text |  |  |
| `sort` | integer |  | `0` |

정책: `approval_kinds_admin`(ALL, authenticated), `approval_kinds_read`(SELECT, authenticated)

### `course_reasons`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `course_id` | text |  |  |
| `slot` | smallint |  |  |
| `answer` | text |  | `''::text` |
| `title` | text |  |  |
| `body` | text |  | `''::text` |
| `evidence` | ARRAY |  | `'{}'::uuid[]` |
| `i18n` | jsonb |  | `'{}'::jsonb` |
| `status` | text |  | `'draft'::text` |
| `updated_on` | date | 가능 |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | 가능 | `auth.uid()` |

정책: `course_reasons_partner_read`(SELECT, authenticated), `course_reasons_staff_all`(ALL, authenticated)

### `menu_groups`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `key` | text |  |  |
| `label` | text |  |  |
| `sort` | integer |  | `0` |

정책: `menu_groups_admin`(ALL, authenticated), `menu_groups_read`(SELECT, authenticated)

### `price_books`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `version` | integer |  |  |
| `label` | text |  | `''::text` |
| `effective_from` | date |  |  |
| `status` | text |  | `'draft'::text` |
| `data` | jsonb |  |  |
| `note` | text |  | `''::text` |
| `based_on` | uuid | 가능 |  |
| `created_by` | uuid | 가능 | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `submitted_by` | uuid | 가능 |  |
| `submitted_at` | timestamp with time zone | 가능 |  |
| `decided_by` | uuid | 가능 |  |
| `decided_at` | timestamp with time zone | 가능 |  |
| `decision_note` | text |  | `''::text` |

정책: `price_books_delete`(DELETE, authenticated), `price_books_insert`(INSERT, authenticated), `price_books_read`(SELECT, authenticated), `price_books_update`(UPDATE, authenticated)

### `role_permissions`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `menu_group` | text |  |  |
| `role` | text |  |  |
| `can_view` | boolean |  | `false` |
| `can_input` | boolean |  | `false` |
| `campus_scoped` | boolean |  | `false` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | 가능 | `auth.uid()` |

정책: `role_permissions_admin`(ALL, authenticated), `role_permissions_read`(SELECT, authenticated)

### `visit_handlers`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `user_id` | uuid |  |  |
| `kind` | text |  |  |
| `country` | text |  | `''::text` |
| `campus` | text |  | `''::text` |
| `created_at` | timestamp with time zone |  | `now()` |
| `created_by` | uuid | 가능 | `auth.uid()` |

정책: `visit_handlers_admin_delete`(DELETE, authenticated), `visit_handlers_admin_insert`(INSERT, authenticated), `visit_handlers_staff_read`(SELECT, authenticated)

### `visit_request_events`

| 열 | 형식 | 비움 | 기본값 |
| --- | --- | --- | --- |
| `id` | bigint |  |  |
| `request_id` | bigint |  |  |
| `kind` | text |  |  |
| `from_status` | text | 가능 |  |
| `to_status` | text | 가능 |  |
| `note` | text | 가능 |  |
| `actor` | uuid | 가능 | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |

정책: `visit_events_staff_memo`(INSERT, authenticated), `visit_events_staff_read`(SELECT, authenticated)
