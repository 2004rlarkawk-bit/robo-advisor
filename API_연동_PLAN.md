# API 연동 PLAN — HS / 환율 / UNI-PASS

작성: 2026-07-01
담당: 팀원 3 (물류 규칙·공공 API 검증)
관련 파일: `src/services/`, `src/harness/rulesEngine.ts`, `src/harness/validatorEngine.ts`, `src/agents/HSCodeAgent.ts`

---

## Context

현재 프로토타입은 클라이언트 단독 SPA. Claude API만 `src/services/claudeService.ts`에서 호출하고, HS·환율·UNI-PASS는 시뮬레이션 데이터(`src/agents/hsCodeDict.ts`)와 하드코딩 룰만 사용 중. 실제 통관 정확도 확보를 위해 공공 API 3종을 연동해야 함:

- HS·관세율 조회 (data.go.kr / UNI-PASS)
- 환율 (한국수출입은행 / 관세청 주간 적용환율)
- 항만 입출항 (울산항만공사 — 시상 가점 포인트)

목표: `8월 룰엔진 마일스톤` 전에 키 발급 + 서비스 레이어 완성. 9월 3중 검증 단계에서 곧바로 사용 가능하도록.

---

## 1. 발급 대상 API 정리

(Notion `API` 페이지 발급 현황 동기화 — 2026-07-01 기준)

| API | 발급처 | 인증 | 응답 | 발급 소요 | 상태 | 우선순위 |
|---|---|---|---|---|---|---|
| 관세청 품목별 수출입실적 (GW) | data.go.kr | ServiceKey 쿼리 | XML/JSON | 즉시 | ✅ 신청완료 | 완료 |
| Claude API (LLM) | console.anthropic.com | x-api-key | JSON | 즉시 | ✅ 구매완료 | 완료 |
| UNI-PASS Open API | unipass.customs.go.kr | API 키 | XML/JSON | 며칠~2주 | ⚠️ **미신청 — 즉시 신청** | **CRITICAL** |
| 한국수출입은행 환율 | koreaexim.go.kr | authkey 쿼리 | JSON | 즉시 | ⬜ 미신청 | HIGH |
| 울산항만공사 / PORT-MIS | data.go.kr | ServiceKey | XML/JSON | 즉시~며칠 | ⬜ 미신청 | HIGH (가점) |
| 국세청 사업자등록 진위확인 | data.go.kr | ServiceKey | JSON | 즉시 | ⬜ 미신청 | MED |
| 법제처 국가법령정보 | open.law.go.kr | LINK형, 별도 가입 | XML | 가입 필요 | ⏸️ 스킵 (LINK형, 8월 RAG) | LOW |

**Notion 메모 인용**: 법제처는 data.go.kr에서 `[활용신청]` 없고 `[바로가기]`만 — open.law.go.kr 별도 회원가입 필요. 지금 스킵, 8월 RAG 단계에서 발급.

---

## 2. 키 보관 전략

**현재 패턴 (`claudeService.ts:14-29`)**: `localStorage.getItem('portai_claude_api_key')` — 사용자가 Settings에서 직접 입력. CORS 우회용 `anthropic-dangerous-direct-browser-access: true` 헤더 사용.

**공공 API 키 처리 결정**:

- **단기 (프로토타입 데모)**: claudeService와 동일 패턴. `localStorage` 키 6개 추가
  - `portai_unipass_key`, `portai_exim_key`, `portai_data_go_kr_key`, `portai_ulsan_port_key`, `portai_nts_business_key`, `portai_law_key`
- **장기 (실서비스)**: 백엔드(팀원 4) Express 서버 프록시 경유. `.env`에 키 격리. — **이 PLAN은 단기까지만 다룸**.

CORS: data.go.kr·koreaexim은 CORS 허용. UNI-PASS는 사례에 따라 차단 가능 → 차단 시 백엔드 프록시 필수.

---

## 3. 새 파일 — `src/services/customsApiService.ts`

`claudeService.ts` 구조 그대로 답습:

```typescript
// 키 관리 (set/get/has/clear) — claudeService 패턴
export function setUnipassKey(key: string): void { ... }
export function setEximKey(key: string): void { ... }
export function setDataGoKrKey(key: string): void { ... }
export function setUlsanPortKey(key: string): void { ... }

// === HS Code 실시간 검증 (UNI-PASS) ===
export interface HSCodeLookupResult {
  code: string;          // 10자리 HSK
  description: string;
  tariffRate: number;    // %
  unit: string;
  regulationFlags: string[];  // 수출입요건 코드 (예: 식약처 인증)
}
export async function lookupHSCode(code: string): Promise<HSCodeLookupResult | null>;

// === HS Code 후보 검색 (data.go.kr 품목분류) ===
export async function searchHSCodeByKeyword(keyword: string): Promise<HSCodeSuggestion[]>;
// → HSCodeAgent.ts:32-49에서 useLLM=true·false 조건 분기에 3번째 경로로 추가

// === 환율 ===
export interface ExchangeRate {
  currency: string;      // USD, EUR, JPY...
  base: 'KRW';
  rate: number;          // 1 단위당 KRW
  effectiveDate: string; // 통관 적용일
}
export async function getCustomsExchangeRate(currency: string, date?: string): Promise<ExchangeRate>;
// 수출입은행 우선, 실패 시 관세청 주간 환율 폴백

// === 울산항 입출항 일정 ===
export interface VesselSchedule {
  vesselName: string;
  voyageNo: string;
  arrivalDate: string;
  departureDate: string;
  berth: string;
}
export async function getUlsanVesselSchedule(vesselName: string, date: string): Promise<VesselSchedule[]>;

// === 사업자등록 진위확인 ===
export async function verifyBusinessRegistration(bizNo: string): Promise<{ valid: boolean; name?: string }>;

// 시뮬레이션 폴백 — claudeService와 동일 패턴
```

---

## 4. 통합 지점 — 기존 코드 수정

### 4.1 `src/agents/HSCodeAgent.ts`
- 현재 `useLLM ? Claude : 로컬 dict` 분기 (line 33-49)
- 추가: `useUnipass` 옵션. UNI-PASS 우선 → 실패 시 Claude → 실패 시 로컬 dict
- 검증 모드(line 56-108)에서 `lookupHSCode()` 호출로 **관세율 + 규제 플래그** 반환 → `HSCodeResult` 타입 확장

### 4.2 `src/harness/rulesEngine.ts`
- 신규 함수 `determineRequiredDocumentsAsync(profile, ctx)` 추가 (기존 동기 함수 유지)
- `ctx.tariffRate` 0 초과 시 통관신고서 강제 필수
- `ctx.regulationFlags` 비어있지 않으면 인증서/허가서 항목 추가 (DocumentType 확장 필요: `'permit'`)

### 4.3 `src/harness/validatorEngine.ts`
- **환율 검증 룰 추가**: `profile.currency !== 'KRW'`일 때 인보이스 총금액 × 환율 = 원화 과세가격 자동 계산. 사용자 입력값과 5% 이상 차이 시 warning.
- **항만 일정 검증 룰 추가**: `loadPort === '울산항'`이고 `departureDate` 있으면 `getUlsanVesselSchedule()` 호출. 일치 선박 없으면 info severity로 "선적 일정 불일치" 경고.
- **사업자번호 검증 룰 (선택)**: `profile.companyName`에 사업자번호 필드 추가하면 진위확인 호출.

### 4.4 `src/types.ts`
- `TradeProfile`에 `currency?: 'KRW'|'USD'|'EUR'|'JPY'|'CNY'` 추가
- `TradeProfile`에 `vesselName?: string`, `voyageNo?: string` 추가
- `TradeProfile`에 `businessRegistrationNo?: string` 추가
- `DocumentType`에 `'permit'` 추가
- `ValidationIssue.severity`에 신규 카테고리 불필요 — 기존 error/warning/info 재사용
- `HSCodeResult`에 `tariffRate?: number`, `regulationFlags?: string[]` 추가

### 4.5 `src/harness/harness.test.ts`
- 신규 시나리오 3건:
  1. CIF·USD 인보이스 → 환율 적용 원화가격 계산 검증
  2. 울산항 출발 + 가짜 선박명 → "일정 불일치" info 경고 발생
  3. 식약처 규제 품목 HS Code 입력 → permit 서류 필수 추가됨

---

## 5. 일정

| 주차 | 작업 | 담당 |
|---|---|---|
| 7월 1주차 | **UNI-PASS 즉시 신청 (오늘)** — Notion 6월 1주차 데드라인 이미 경과, 심사 2주 흡수해야 8월 룰엔진 안 밀림. 수출입은행/울산항/국세청 동시 신청(즉시 발급) | 팀원 3 |
| 7월 2주차 | `customsApiService.ts` 골격 + 시뮬레이션 폴백 작성, Settings 페이지에 키 입력 UI 추가 | 팀원 3 + 팀원 1 (UI) |
| 7월 3주차 | HS·환율 실호출 통합. CORS 차단 시 팀원 4와 백엔드 프록시 결정 | 팀원 3 + 팀원 4 |
| 7월 4주차 | rulesEngine/validatorEngine 룰 추가, 테스트 시나리오 작성 | 팀원 3 |
| 8월 1주차 | 울산항 API 연동 + harness.test.ts 통과 확인 | 팀원 3 |

---

## 6. 리스크

- **UNI-PASS 심사 지연**: 2주 가능 → 7월 1주차 신청 누락 시 8월 룰엔진 마일스톤 지연. **6월 말 이미 신청 완료 상태 확인 필요**.
- **CORS 차단**: UNI-PASS·울산항이 브라우저 호출 차단 시 백엔드 프록시 필수. 팀원 4의 Express 서버 일정 의존.
- **HS Code 정확도**: UNI-PASS 응답이 키워드 부정확 시 빈값. Claude/로컬 dict 폴백 체인 필수 — `claudeService.ts:106-112` 시뮬레이션 폴백 패턴 그대로 따름.
- **환율 정합성**: 수출입은행 vs 관세청 주간 환율 불일치 가능. 통관 기준은 관세청 주간 → UNI-PASS 환율 우선, 수출입은행은 참고용.

---

## 7. 검증 방법

```bash
npm run test         # harness.test.ts 신규 시나리오 PASS
npm run dev          # localhost 실호출 — Settings에 키 입력 후 거래 입력
```

End-to-end 체크리스트:
- [ ] Settings 페이지에서 6개 키 입력·저장
- [ ] 품목 "아이패드" 입력 → UNI-PASS HS 후보 + 관세율 표시
- [ ] CIF·USD 100,000 인보이스 → 원화 과세가격 자동 환산
- [ ] 울산항 + 가짜 선박명 → info 경고 노출
- [ ] 식약처 규제 HS → permit 서류 카드 추가

---

## 8. 팀원 2 (AI 에이전트) 연계 작업

Notion `API` 페이지 팀원 2 TODO 4단계 — 본 PLAN의 customsApiService와 병렬 진행 필요:

1. **`.env`에 Claude 키 심기**: 팀원 4 발급 키 받아 로컬 `.env` 등록, 통신 확인
2. **HS Code 프롬프트 튜닝** (`claudeService.ts:83-113` `suggestHSCode`): 6~10자리 코드 3개를 완벽한 JSON으로만 반환하도록 프롬프트 강화. UNI-PASS 응답 없을 때 폴백 품질이 곧 사용자 경험.
3. **Feedback 프롬프트 고도화** (`claudeService.ts:116-144` `generateContextualFeedback`, `FeedbackAgent.ts`): "중량 누락" → "관세사 관점에서 세관 반려 회피하려면 패킹리스트 중량 kg 단위 통일, CIF는 매도인이 적하보험증권 발행" 식 전문가 톤
4. **`useLLM=false` 제거** (`HSCodeAgent.ts:33`, `FeedbackAgent.ts`): 시뮬레이션 분기 삭제 → 무조건 실 API 호출. UNI-PASS·환율 연동 완료 후 시행.

→ 4번이 본 PLAN customsApiService 완성 의존. 팀원 2·3 sync 필수.

---

## 9. 본 PLAN 범위 외

- 백엔드 프록시 서버 (팀원 4 책임 — `process.env` 기반 키 격리)
- RAG 법령DB (8월 별도 PLAN)
- Supabase 연동 (별도 PLAN)
- pgvector 벡터 검색 (별도 PLAN)
- 실무 무역서류 샘플 수집 (팀원 1 — KITA, KOTRA, DHL/FedEx, UNI-PASS 자료실)
