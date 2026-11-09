-- 파트너 포털 상담: 코스별 추천 조건표 v2.1(2026-11-09 센터장 승인, Change Log CL-001~CL-024)과 원칙 P4 개정을 데이터로 넣는다. 여러 번 실행해도 된다.
-- 요청 R-001: 질문·선택지·추천 조건(◎○×)·단계 정보는 코드가 아니라 데이터다. 조건표가 바뀌면 관리자 화면 '추천 규칙'에서 새 버전으로 저장한다.
-- 계산 규칙(CL-021)은 apps/partner/src/consult/engine.ts: × 하나라도 있으면 제외 → ◎2·○1 합산 → 1순위. 2순위는 1순위의 대안 코스가 후보에 남아 있으면 그 코스, 없으면 점수 2위.
--   동점은 Q1(학습 목적) ◎ 우선, 그래도 같으면 조건표 열 순서(rules.courses 순서). '둘 다 괜찮음'(Q2)은 조건표에 행이 없어 점수·제외 없음.
-- 데이터는 조건표 엑셀에서 그대로 뽑았다(손으로 옮기지 않음). 시험 apps/partner/src/consult/engine.test.ts 가 이 파일의 JSON(q·r 달러 따옴표 사이)을 읽는다.

-- 화면 표시 이름(CL-009): 내부 코스명 Senior 는 견적·DB 에 그대로, 상담·코스 소개 화면은 '1:1 맞춤 과정'
alter table public.courses add column if not exists display_name text;
update public.courses set display_name = '1:1 맞춤 과정', updated_at = now() where id = 'p-senior' and display_name is null;

-- 단계·옵션(조건표 '단계 구분', CL-005~CL-007·CL-011·CL-018~CL-020). 관리자가 단계 내용을 이미 넣은 코스는 건드리지 않는다.
-- default: Challenger ESL 세미 스파르타·IELTS 스파르타만(CL-007). TEP·Speaking Course·1:1 맞춤 과정은 기본 선택 없이 가격과 함께 고른다(CL-020).
-- IELTS Guarantee 는 스파르타 하나라 단계 선택 화면을 건너뛴다(CL-006). note 는 관리용이라 화면에 내보내지 않는다.
update public.courses set levels = $lv$[{"name":"TEP 8","lessons":"8교시","intensity":"집중","includes":"","note":"","default":false},{"name":"TEP 9","lessons":"9교시","intensity":"집중","includes":"","note":"","default":false},{"name":"TEP 10","lessons":"10교시","intensity":"집중","includes":"그룹 수업 2회 포함","note":"","default":false}]$lv$::jsonb, updated_at = now()
  where id = 'p-tep' and coalesce(levels -> 0 ->> 'lessons', '') = '' and coalesce(levels -> 0 ->> 'intensity', '') = '';
update public.courses set levels = $lv$[{"name":"STARTER","lessons":"1:1 4개","intensity":"집중","includes":"Listen · Write · Read to Speak + Speaking Presentation","note":"집중 스피킹 과정 (CL-011, CL-019)","default":false},{"name":"PRO","lessons":"1:1 5개","intensity":"집중","includes":"STARTER + Speaking Clinic","note":"단계가 오를수록 액티비티·가격 증가","default":false},{"name":"MASTER","lessons":"1:1 6개","intensity":"고강도","includes":"PRO + Speaking Mission (+ Speaking Coaching)","note":"","default":false}]$lv$::jsonb, updated_at = now()
  where id = 'p-speaking' and coalesce(levels -> 0 ->> 'lessons', '') = '' and coalesce(levels -> 0 ->> 'intensity', '') = '';
update public.courses set levels = $lv$[{"name":"Senior 3","lessons":"5교시 (1:1 정규 3 + 옵션 2)","intensity":"여유","includes":"1:1 중심","note":"화면 이름 '1:1 맞춤 과정' (CL-009, CL-018)","default":false},{"name":"Senior 4","lessons":"6교시 (1:1 정규 4 + 옵션 2)","intensity":"여유","includes":"1:1 중심","note":"","default":false}]$lv$::jsonb, updated_at = now()
  where id = 'p-senior' and coalesce(levels -> 0 ->> 'lessons', '') = '' and coalesce(levels -> 0 ->> 'intensity', '') = '';
update public.courses set levels = $lv$[{"name":"세미 스파르타","lessons":"—","intensity":"보통","includes":"","note":"ESL은 세미 스파르타 선택이 많음 (CL-007)","default":true},{"name":"스파르타","lessons":"—","intensity":"집중","includes":"","note":"","default":false}]$lv$::jsonb, updated_at = now()
  where id = 'c-esl' and coalesce(levels -> 0 ->> 'lessons', '') = '' and coalesce(levels -> 0 ->> 'intensity', '') = '';
update public.courses set levels = $lv$[{"name":"스파르타","lessons":"—","intensity":"집중","includes":"","note":"기본 옵션 스파르타 (CL-007)","default":true},{"name":"세미 스파르타","lessons":"—","intensity":"보통","includes":"","note":"","default":false}]$lv$::jsonb, updated_at = now()
  where id = 'c-ielts' and coalesce(levels -> 0 ->> 'lessons', '') = '' and coalesce(levels -> 0 ->> 'intensity', '') = '';
update public.courses set levels = $lv$[{"name":"스파르타 (단일)","lessons":"—","intensity":"집중","includes":"","note":"스파르타만 운영, 옵션 선택 없음 (CL-006)","default":true}]$lv$::jsonb, updated_at = now()
  where id = 'c-ielts-g' and coalesce(levels -> 0 ->> 'lessons', '') = '' and coalesce(levels -> 0 ->> 'intensity', '') = '';

-- 추천 조건표 v2.1 승인본(같은 버전이 있으면 넣지 않는다)
insert into public.recommendation_rules (version, status, note, questions, rules, level_defaults)
select 'V2.1', 'approved', '코스별 추천 조건표 v2.1 · 2026-11-09 센터장 승인 · Change Log CL-001~CL-024',
$q$[
 {
  "id": "purpose",
  "label": "학생의 학습 목적은 무엇인가요?",
  "short": "학습 목적",
  "options": [
   [
    "conversation",
    "영어회화 향상"
   ],
   [
    "basics",
    "영어 기초 다지기"
   ],
   [
    "ielts",
    "IELTS 점수 달성"
   ],
   [
    "toeic",
    "TOEIC 점수 달성"
   ],
   [
    "business",
    "업무·비즈니스 영어"
   ],
   [
    "tep",
    "테마별 관심 영어 향상 (TEP)"
   ],
   [
    "wh",
    "워킹홀리데이 준비"
   ],
   [
    "travel",
    "여행·생활 영어"
   ]
  ]
 },
 {
  "id": "focus",
  "label": "연수에서 무엇을 더 중요하게 생각하나요?",
  "short": "중시하는 것",
  "options": [
   [
    "study",
    "공부에 집중 (스파르타, Challenger 중심)"
   ],
   [
    "speaking",
    "말하기와 다양한 경험 (세미 스파르타, Premium 중심)"
   ],
   [
    "both",
    "둘 다 괜찮음"
   ]
  ]
 },
 {
  "id": "level",
  "label": "현재 영어 수준은 어느 정도인가요?",
  "short": "현재 수준",
  "options": [
   [
    "A1",
    "A1 입문"
   ],
   [
    "A2",
    "A2 초급"
   ],
   [
    "B1",
    "B1 중급"
   ],
   [
    "B2",
    "B2 중상급"
   ],
   [
    "C1",
    "C1 이상 고급"
   ],
   [
    "unknown",
    "잘 모름 → 레벨 간단 확인"
   ]
  ]
 },
 {
  "id": "weeks",
  "label": "연수 기간은 얼마나 되나요?",
  "short": "연수 기간",
  "options": [
   [
    "4",
    "4주"
   ],
   [
    "8",
    "8주"
   ],
   [
    "12",
    "12주"
   ],
   [
    "16",
    "16주 이상"
   ]
  ]
 },
 {
  "id": "age",
  "label": "학생의 연령대는 어떻게 되나요?",
  "short": "연령대",
  "options": [
   [
    "18",
    "18–29세"
   ],
   [
    "30",
    "30–39세"
   ],
   [
    "40",
    "40–49세"
   ],
   [
    "50",
    "50세 이상"
   ]
  ]
 }
]$q$::jsonb,
$r${
 "model": "score",
 "source": "코스별 추천 조건표 v2.1 (2026-11-09 센터장 승인, Change Log CL-001~CL-024)",
 "intro": "JIC는 만 18세 이상 성인 과정입니다. 주니어·가족 캠프는 별도 과정입니다.",
 "points": {
  "◎": 2,
  "○": 1
 },
 "level_check": {
  "question": "level",
  "unknown": "unknown",
  "note": "추정 레벨입니다. 최종 반은 입학 테스트로 정해집니다.",
  "items": [
   {
    "label": "영어로 자기소개를 할 수 있나요?",
    "options": [
     "거의 못 한다",
     "간단한 문장으로 할 수 있다",
     "자연스럽게 할 수 있다"
    ]
   },
   {
    "label": "상대가 영어로 말하면 얼마나 알아듣나요?",
    "options": [
     "거의 못 알아듣는다",
     "천천히 말하면 알아듣는다",
     "보통 속도도 대부분 알아듣는다"
    ]
   },
   {
    "label": "영어로 내 의견을 말할 수 있나요?",
    "options": [
     "어렵다",
     "짧게는 말할 수 있다",
     "이유를 들어 설명할 수 있다"
    ]
   }
  ],
  "bands": [
   {
    "min": 0,
    "max": 1,
    "level": "A1"
   },
   {
    "min": 2,
    "max": 3,
    "level": "A2"
   },
   {
    "min": 4,
    "max": 4,
    "level": "B1"
   },
   {
    "min": 5,
    "max": 6,
    "level": "B2"
   }
  ]
 },
 "courses": [
  {
   "course": "p-esl",
   "marks": {
    "purpose": {
     "conversation": "◎",
     "basics": "◎",
     "ielts": "×",
     "toeic": "×",
     "business": "×",
     "tep": "×",
     "wh": "×",
     "travel": "◎"
    },
    "focus": {
     "study": "×",
     "speaking": "◎"
    },
    "level": {
     "A1": "◎",
     "A2": "◎",
     "B1": "○",
     "B2": "×",
     "C1": "×"
    },
    "weeks": {
     "4": "◎",
     "8": "○",
     "12": "○",
     "16": "○"
    },
    "age": {
     "18": "○",
     "30": "○",
     "40": "◎",
     "50": "◎"
    }
   },
   "min_weeks": 4,
   "weeks": 8,
   "alt": "p-speaking",
   "alt_when": "수준이 높을 때",
   "prereq": null,
   "prereq_weeks": null,
   "status": "운영 중",
   "visible": true,
   "approval": "승인",
   "note": "시니어들은 스룹수업 1회가 있으니 시니어수업으로 추천"
  },
  {
   "course": "p-tep",
   "marks": {
    "purpose": {
     "conversation": "◎",
     "basics": "○",
     "ielts": "×",
     "toeic": "×",
     "business": "×",
     "tep": "◎",
     "wh": "×",
     "travel": "×"
    },
    "focus": {
     "study": "×",
     "speaking": "◎"
    },
    "level": {
     "A1": "○",
     "A2": "◎",
     "B1": "◎",
     "B2": "◎",
     "C1": "×"
    },
    "weeks": {
     "4": "◎",
     "8": "○",
     "12": "○",
     "16": "○"
    },
    "age": {
     "18": "◎",
     "30": "◎",
     "40": "◎",
     "50": "○"
    }
   },
   "min_weeks": 4,
   "weeks": 8,
   "alt": "p-speaking",
   "alt_when": "수준이 높을 때",
   "prereq": "p-esl",
   "prereq_weeks": 4,
   "status": "운영 중",
   "visible": true,
   "approval": "승인",
   "note": "그룹 수업 2회 포함",
   "compare": "p-senior"
  },
  {
   "course": "p-speaking",
   "marks": {
    "purpose": {
     "conversation": "◎",
     "basics": "○",
     "ielts": "×",
     "toeic": "×",
     "business": "○",
     "tep": "○",
     "wh": "○",
     "travel": "○"
    },
    "focus": {
     "study": "◎",
     "speaking": "◎"
    },
    "level": {
     "A1": "○",
     "A2": "◎",
     "B1": "◎",
     "B2": "◎",
     "C1": "◎"
    },
    "weeks": {
     "4": "◎",
     "8": "◎",
     "12": "◎",
     "16": "◎"
    },
    "age": {
     "18": "◎",
     "30": "◎",
     "40": "○",
     "50": "○"
    }
   },
   "min_weeks": 4,
   "weeks": 8,
   "alt": "p-esl",
   "alt_when": "수준이 낮을 때",
   "prereq": "p-esl",
   "prereq_weeks": 4,
   "status": "운영 중",
   "visible": true,
   "approval": "승인",
   "note": "STARTER 1:1 4개 · PRO 1:1 5개 · MASTER 1:1 6개, 액티비티 참여 필수"
  },
  {
   "course": "p-wh",
   "marks": {
    "purpose": {
     "conversation": "×",
     "basics": "×",
     "ielts": "×",
     "toeic": "×",
     "business": "×",
     "tep": "×",
     "wh": "◎",
     "travel": "×"
    },
    "focus": {
     "study": "×",
     "speaking": "◎"
    },
    "level": {
     "A1": "×",
     "A2": "×",
     "B1": "○",
     "B2": "◎",
     "C1": "◎"
    },
    "weeks": {
     "4": "◎",
     "8": "◎",
     "12": "○",
     "16": "×"
    },
    "age": {
     "18": "◎",
     "30": "○",
     "40": "×",
     "50": "×"
    }
   },
   "min_weeks": 4,
   "weeks": 8,
   "alt": "p-speaking",
   "alt_when": "목적이 일부만 맞을 때",
   "prereq": "p-esl",
   "prereq_weeks": 4,
   "status": "운영 중",
   "visible": true,
   "approval": "승인",
   "note": "프레젠테이션 포함"
  },
  {
   "course": "p-toeic",
   "marks": {
    "purpose": {
     "conversation": "×",
     "basics": "×",
     "ielts": "×",
     "toeic": "◎",
     "business": "×",
     "tep": "×",
     "wh": "×",
     "travel": "×"
    },
    "focus": {
     "study": "×",
     "speaking": "◎"
    },
    "level": {
     "A1": "×",
     "A2": "○",
     "B1": "◎",
     "B2": "◎",
     "C1": "◎"
    },
    "weeks": {
     "4": "◎",
     "8": "◎",
     "12": "○",
     "16": "×"
    },
    "age": {
     "18": "◎",
     "30": "◎",
     "40": "×",
     "50": "×"
    }
   },
   "min_weeks": 4,
   "weeks": 8,
   "alt": "c-ielts",
   "alt_when": "목적이 일부만 맞을 때",
   "prereq": "p-esl",
   "prereq_weeks": 4,
   "status": "운영 중",
   "visible": true,
   "approval": "승인",
   "note": "목적에 따라 아이엘츠 추천"
  },
  {
   "course": "p-business",
   "marks": {
    "purpose": {
     "conversation": "×",
     "basics": "×",
     "ielts": "×",
     "toeic": "×",
     "business": "◎",
     "tep": "×",
     "wh": "×",
     "travel": "×"
    },
    "focus": {
     "study": "×",
     "speaking": "◎"
    },
    "level": {
     "A1": "×",
     "A2": "×",
     "B1": "○",
     "B2": "◎",
     "C1": "◎"
    },
    "weeks": {
     "4": "◎",
     "8": "◎",
     "12": "○",
     "16": "×"
    },
    "age": {
     "18": "○",
     "30": "◎",
     "40": "◎",
     "50": "○"
    }
   },
   "min_weeks": 4,
   "weeks": 8,
   "alt": "p-speaking",
   "alt_when": "목적이 일부만 맞을 때",
   "prereq": "p-esl",
   "prereq_weeks": 4,
   "status": "운영 중",
   "visible": true,
   "approval": "승인",
   "note": "프레젠테이션 포함"
  },
  {
   "course": "p-senior",
   "marks": {
    "purpose": {
     "conversation": "◎",
     "basics": "◎",
     "ielts": "×",
     "toeic": "×",
     "business": "×",
     "tep": "×",
     "wh": "×",
     "travel": "×"
    },
    "focus": {
     "study": "×",
     "speaking": "◎"
    },
    "level": {
     "A1": "◎",
     "A2": "◎",
     "B1": "◎",
     "B2": "○",
     "C1": "×"
    },
    "weeks": {
     "4": "◎",
     "8": "◎",
     "12": "◎",
     "16": "◎"
    },
    "age": {
     "18": "×",
     "30": "×",
     "40": "○",
     "50": "◎"
    }
   },
   "min_weeks": 4,
   "weeks": 12,
   "alt": "p-speaking",
   "alt_when": "수준이 높을 때",
   "prereq": null,
   "prereq_weeks": null,
   "status": "운영 중",
   "visible": true,
   "approval": "승인",
   "note": "시니어들은 1:1 수업을 선호. 하루 5·6교시 (1:1 정규 3·4 + 옵션 2)",
   "compare": "p-tep"
  },
  {
   "course": "c-ielts",
   "marks": {
    "purpose": {
     "conversation": "○",
     "basics": "×",
     "ielts": "◎",
     "toeic": "×",
     "business": "×",
     "tep": "×",
     "wh": "×",
     "travel": "×"
    },
    "focus": {
     "study": "◎",
     "speaking": "○"
    },
    "level": {
     "A1": "×",
     "A2": "×",
     "B1": "◎",
     "B2": "◎",
     "C1": "◎"
    },
    "weeks": {
     "4": "○",
     "8": "◎",
     "12": "◎",
     "16": "◎"
    },
    "age": {
     "18": "◎",
     "30": "○",
     "40": "×",
     "50": "×"
    }
   },
   "min_weeks": 4,
   "weeks": 12,
   "alt": "c-esl",
   "alt_when": "수준이 낮을 때",
   "prereq": "c-esl",
   "prereq_weeks": 4,
   "status": "운영 중",
   "visible": true,
   "approval": "승인",
   "note": null
  },
  {
   "course": "c-ielts-g",
   "marks": {
    "purpose": {
     "conversation": "×",
     "basics": "×",
     "ielts": "○",
     "toeic": "×",
     "business": "×",
     "tep": "×",
     "wh": "×",
     "travel": "×"
    },
    "focus": {
     "study": "◎",
     "speaking": "×"
    },
    "level": {
     "A1": "×",
     "A2": "×",
     "B1": "◎",
     "B2": "◎",
     "C1": "◎"
    },
    "weeks": {
     "4": "○",
     "8": "◎",
     "12": "◎",
     "16": "◎"
    },
    "age": {
     "18": "◎",
     "30": "○",
     "40": "×",
     "50": "×"
    }
   },
   "min_weeks": 4,
   "weeks": 12,
   "alt": "c-ielts",
   "alt_when": "수준이 낮을 때",
   "prereq": "c-ielts",
   "prereq_weeks": 4,
   "status": "운영 중",
   "visible": true,
   "approval": "승인",
   "note": null
  },
  {
   "course": "c-esl",
   "marks": {
    "purpose": {
     "conversation": "◎",
     "basics": "◎",
     "ielts": "×",
     "toeic": "×",
     "business": "×",
     "tep": "×",
     "wh": "×",
     "travel": "○"
    },
    "focus": {
     "study": "○",
     "speaking": "◎"
    },
    "level": {
     "A1": "◎",
     "A2": "◎",
     "B1": "○",
     "B2": "○",
     "C1": "×"
    },
    "weeks": {
     "4": "◎",
     "8": "◎",
     "12": "○",
     "16": "×"
    },
    "age": {
     "18": "◎",
     "30": "○",
     "40": "○",
     "50": "○"
    }
   },
   "min_weeks": 4,
   "weeks": 8,
   "alt": "c-ielts",
   "alt_when": "더 집중해서 공부하고 싶을 때",
   "prereq": null,
   "prereq_weeks": null,
   "status": "운영 중",
   "visible": true,
   "approval": "승인",
   "note": null
  }
 ]
}$r$::jsonb,
'{}'::jsonb
where not exists (select 1 from public.recommendation_rules where version = 'V2.1');
