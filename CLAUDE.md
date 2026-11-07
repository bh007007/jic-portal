# JIC 포털 — 작업 메모

- `data/`에는 실제 학생·에이전트 개인정보가 있다. 절대 커밋하지 않고, 내용을 출력하거나 외부 서비스로 보내지 않는다. 구조(열 이름, 건수)만 다룬다.
- 데이터는 당분간 하드디스크에만 둔다(사용자 결정, 2026-11-07). Supabase 적재는 보안 점검 이후, 테스트 DB에는 가린 사본만.
- 업체 포털(jicportal.com)에서는 읽기 전용 `*_load` 조회 API만 호출한다. 구조와 주의점은 `docs/legacy-portal.md`.
- 이 PC의 PowerShell은 Windows PowerShell 5.1이다. 한글이 든 `.ps1`은 UTF-8 BOM으로 저장해야 한다. Node는 `C:\Program Files\nodejs`(v26)에 있고, 이미 열린 셸에는 PATH가 없을 수 있다. Python은 없다.
- 관리자 앱: `apps/admin` (React + Vite + TS). 로컬 API는 `apps/admin/server/localData.ts`. 실행 `npm run admin` → http://127.0.0.1:5173. 검증 `npm run admin:build`.
- 문서와 커밋 메시지는 한국어로 쓴다.
