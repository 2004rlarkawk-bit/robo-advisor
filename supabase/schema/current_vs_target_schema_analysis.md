# 현재 스키마 대비 목표 스키마 분석

## 확인 범위와 한계

저장소에는 `supabase/schema/current_remote_schema.sql` 또는 동등한 원격 스키마 덤프가 없다. 따라서 현재 상태는 로컬 마이그레이션과 TypeScript 서비스 사용 컬럼을 교차 분석한 결과이며, 실제 Supabase 원격 스키마의 확정본은 아니다. 이번 작업에서는 Supabase에 접속하거나 SQL을 실행하지 않았다.

## 테이블별 비교

| 테이블 | 로컬에서 확인된 현재 구조 | 목표 구조 | 차이/조치 |
|---|---|---|---|
| `user_profiles` | 기반 생성 SQL은 없고, 20260713 확장 컬럼과 20260723 `company_address`, `service_role` 추가안만 존재 | 계정 식별/보안 역할 + 회사 기본정보 + 온보딩 값 + 기본 거래값 + 서비스 역할 | 원격의 기반 컬럼, RLS, 가입 트리거를 먼저 덤프해 비교해야 함 |
| `trades` | 기반 생성 SQL은 없고 `updated_at` 트리거 추가안만 존재; 서비스가 실제 기대하는 컬럼은 코드에서 확인 | `profile`, `documents`, `generated_docs`, `issues`, 상태와 생성/제출/수정 시각 | 원격 컬럼 타입과 RLS가 목표안과 같은지 확인 필요 |
| `trade_drafts` | 생성, RLS 4종, 권한, updated_at 트리거가 마이그레이션에 명시됨 | 현재 구조와 동일 | 구조 변경 불필요 |

원격 덤프가 없으므로 아래의 “현재 컬럼”은 로컬 마이그레이션 및 코드에서 확인되는 값이며, 원격 확인이 필요한 항목에는 이를 명시했다.

| 테이블 | 현재 컬럼 | 목표 컬럼 | 차이 유형 | 권장 처리 |
|---|---|---|---|---|
| `user_profiles` | `id`, `email`, `role` 추정 | 동일 | 동일(원격 확인 필요) | 원격 덤프에서 타입/NULL/FK 확인 |
| `user_profiles` | `company_name`, `business_number`, `contact_name`, `phone`, `country` | 동일 | 동일 또는 신규 추가 | 20260713 마이그레이션 적용 이력 확인 |
| `user_profiles` | 원격 DB에서 삭제됨 | 목표 구조에서도 제외 | 동일 | 코드와 신규 payload에서도 사용하지 않음 |
| `user_profiles` | `default_load_port`, `default_discharge_port`, `default_incoterm` | 동일 | 데이터 이관 필요 | 컬럼은 유지하고 한글 국가·항만 value를 영문으로 변환 |
| `user_profiles` | `company_address` 적용 여부 불명 | `company_address text` | 신규 추가 | 20260723 비파괴 추가안 적용 여부 확인 |
| `user_profiles` | `customs_clearance_code` 없음 | `customs_clearance_code text` | 신규 추가 | 선택 입력용 비파괴 컬럼 추가안 적용 필요 |
| `user_profiles` | `service_role` 적용 여부 불명 | `service_role text not null default 'integrated'` | 신규 추가/기본값 변경/NULL 조건 변경 | 컬럼과 check 제약 적용 여부 확인 |
| `trades` | `profile`, `documents`, `generated_docs`, `issues`를 서비스에서 사용 | 동일 JSONB 컬럼 | 동일(원격 확인 필요) | 원격 타입과 기본값 확인 |
| `trades` | `status`, `generated_at`, `submitted_at`, `created_at`, `updated_at` 사용 | 동일 | 동일/트리거 변경 | status check와 updated_at 트리거 확인 |
| `trades` | RLS 정의 로컬 파일 없음 | 본인 행 CRUD 정책 | 정책 변경 | 기존 정책 정의를 확인한 뒤 중복 없이 보완 |
| `trade_drafts` | `user_id`, `profile`, `created_at`, `updated_at` | 동일 | 동일 | 변경 없음 |
| `trade_drafts` | 본인 행 CRUD RLS, updated_at 트리거 | 동일 | 동일 | 기존 마이그레이션 유지 |
| `auth.users` → `user_profiles` | 기존 트리거가 있다고 코드 주석에만 명시 | 회원가입 프로필 생성 function/trigger | 트리거 변경 | 실제 함수/trigger 정의를 확보해 metadata 매핑 비교 |

## 추가/유지/제거 판정

| 구분 | 필드/객체 | 이유 |
|---|---|---|
| 신규 | `user_profiles.company_address` | 영문 회사 주소를 프로필 단일 원본으로 사용 |
| 신규 | `user_profiles.service_role` + check | 회원 기본 작업 화면 분기에 사용 |
| 제외 | 삭제된 업무설정 컬럼 | 온보딩·거래 기본값·프로필 저장에서 더 이상 사용하지 않음 |
| 유지 | `role` | 관리자/사용자 보안 역할이며 `service_role`과 별개 |
| 유지 | `documents` | 문서별 진행 상태 목록 |
| 유지 | `generated_docs` | 생성된 문서 데이터와 HTML 템플릿 |
| 제거 없음 | 모든 기존 컬럼 | 현재 코드 의존성이 있거나 원격 구조를 확정할 수 없어 비파괴 원칙 적용 |

## 제약조건과 RLS

- `service_role`, `role`, `default_incoterm`, `trades.status`는 목표 SQL에 허용값 check를 제안했다.
- 세 테이블 모두 RLS를 활성화하고 `auth.uid()`가 본인의 `id` 또는 `user_id`와 같은 행만 접근하도록 설계했다.
- 가입 시 `auth.users` metadata에서 회사명/담당자/서비스 역할을 읽어 `user_profiles`를 만드는 트리거를 목표안에 포함했다.
- 실제 원격에 동일 목적의 다른 이름 정책이나 트리거가 존재할 수 있으므로, 실행 전 `pg_policies`, `pg_trigger`, `pg_constraint`를 이름뿐 아니라 정의까지 비교해야 한다.

## 데이터 변환 제안

국가와 항만은 UI 및 신규 저장값을 영문으로 통일했다. 기존 데이터에는 다음과 같은 변환이 필요할 수 있다.

| 기존 값 예 | 목표 값 |
|---|---|
| `대한민국` | `South Korea` |
| `미국` | `United States` |
| `부산항` | `Busan Port` |
| `인천항` | `Incheon Port` |
| `로스앤젤레스항` | `Los Angeles Port` |

이 변환은 `user_profiles`의 텍스트 컬럼뿐 아니라 `trades.profile`, `trade_drafts.profile` JSON 내부에도 적용 대상이 있을 수 있다. 실제 분포를 조회한 뒤 별도 마이그레이션으로 작성해야 한다.

## 산출물

- 목표 스키마 설계 SQL: `supabase/schema/target_schema_after_ui_refactor.sql`
- UI/DB 필드 흐름: `docs/ui_db_field_analysis_after_ui_refactor.md`

목표 SQL은 실행 가능한 형태의 설계안이지만 원격 덤프가 없는 상태에서 즉시 적용하는 용도가 아니다. 원격 스키마를 확보한 뒤 충돌하는 정책/트리거/제약조건을 대조하고 실제 마이그레이션을 별도로 작성해야 한다.
