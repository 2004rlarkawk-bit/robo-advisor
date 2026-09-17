# PortAI 평가 기준선 조사 노트

> 작성 목적: 평가 기반을 만들기 전에 **현재 시스템이 어떻게 동작하는지** 기록한다.
> 이 문서는 코드 조사 결과이며, 성능 수치를 담고 있지 않다.

## 0. 작업 시작 시점

| 항목 | 값 |
| --- | --- |
| 기준 브랜치 | `main` |
| 기준 커밋 | `b3c1099a86ced4c9c4c6bcaf3326feda21c1e22d` (Merge PR #58) |
| 작업 브랜치 | `feat/evaluation-baseline` |
| 분석 Edge Function 마지막 변경 커밋 | `166c655` (2026-09-14) — 로컬 저장소 기준. **실제 배포본과 같은지는 확인하지 못함** |
| 조사일 | 2026-09-18 |

## 1. 수입 문서 분석 (Edge Function 호출 경로)

```
ImportTradeFlow.tsx (분석 버튼)
  └ resolveImportAnalysisFiles()            ─ 업로드 파일 확보
  └ analyzeImportDocuments()                ─ src/services/importDocumentAnalysisService.ts
      └ buildImportAnalysisRequestDocuments() ─ {id, fileName, mimeType, documentType, dataUrl}
      └ supabase.functions.invoke('import-document-analysis', { body: { documents } })
          └ supabase/functions/import-document-analysis/index.ts
              └ parseDocuments()             ─ 최대 15개, 파일당 10MB, 합계 25MB, PDF/이미지
              └ analyzeWithOpenAI()          ─ OpenAI Responses API, JSON schema 강제
  └ normalizeImportAnalysisResult()          ─ 응답 정규화
  └ recommendImportHSKForItems()             ─ (화주만) HSK 추천
```

같은 분석 함수를 쓰는 다른 화면:
- `src/services/forwarderDocumentAnalysisService.ts` (포워더 수입 워크스페이스)
- `src/services/exportDocumentMatchService.ts` (수출 "내 서류 대조")

### 모델·설정 (Edge Function 환경변수)

| 설정 | 환경변수 | 코드 기본값 |
| --- | --- | --- |
| 모델 | `OPENAI_IMPORT_DOCUMENT_MODEL` → `OPENAI_MODEL` | `gpt-5.6` |
| 대체 모델 | `OPENAI_IMPORT_MODEL_FALLBACKS` (쉼표 구분) | 없음 |
| 추론 강도 | `OPENAI_IMPORT_REASONING_EFFORT` | `low` |
| 최대 출력 토큰 | (코드 고정) | 8000 |
| 인증 | `supabase/config.toml` `verify_jwt = true` | 로그인 세션 필요 |

- **실제 운영 환경변수 값은 확인하지 못했다.** 기본값과 다를 수 있으므로 측정 시 응답의 `model` 필드를 manifest에 기록해야 한다.
- 프롬프트에 **버전 번호가 없다.** 평가 시에는 `index.ts`의 프롬프트 문자열 해시(`promptHash`)로 버전을 식별하는 것을 권장한다.

### 응답 구조에서 평가에 중요한 점

1. **`classifications[]`**: 파일별 `{id, type, confidence(0~1), summary, sourceId}` → 문서 분류 평가에 그대로 쓸 수 있다.
2. **`analysis.extracted`**: 거래 전체를 **하나로 합친** 추출값이다. 서류별 값이 아니다.
   → "문서-필드 쌍" 단위의 필드 추출 평가는 현재 출력만으로는 **직접 불가능**하다.
   → 현재 가능한 평가 단위는 ① 거래 단위 합산 필드, ② `comparison[]` 표의 서류별 열(invoice / packingList / billOfLading / certificateOfOrigin).
3. **`analysis.comparison[]`**: 필드별 서류 열 + `matches` 판정.
4. **`analysis.validations[]`**: AI가 낸 불일치 목록. `values: [{documentId, value}]`.
5. **분류 힌트 편향 주의**: 요청의 `documentType`이 "사용자 사전 분류 힌트"로 프롬프트에 들어간다(`index.ts` 448행). 평가에서 정답 유형을 힌트로 넣으면 분류 정확도가 부풀려진다. **분류 평가 시 힌트는 `unknown`, 파일명은 유형을 드러내지 않게** 해야 한다.

## 2. 문서 간 대사 (불일치 판정) 경로

두 층이 섞여 있다.

| 층 | 위치 | 성격 |
| --- | --- | --- |
| AI 판정 | Edge Function 응답의 `comparison[].matches`, `validations[]` | 비결정적 (LLM) |
| 규칙 판정 | `src/services/importReconciliationRules.ts` (IR1~IR14) | 결정적 (코드) |

```
resolveImportRisks()                         ─ src/services/importRiskService.ts
  └ buildReconciliationInput(analysis, types) ─ src/services/importReconciliationEngine.ts
      └ comparison[] 행의 field 이름을 정규식(FIELD_ALIASES)으로 ImportDocFields 키에 매핑
      └ C/I 통화·총액·Incoterms는 extracted에서 보충
  └ runImportReconciliation(input)            ─ 규칙 IR1~IR14 실행
  └ assessImportRisks()                        ─ AI validations + 누락 서류 + HS 미확정 등
```

- 요청서에는 "IR1~IR10"으로 적혀 있지만, **현재 코드에는 IR11~IR14(원산지·항구·Consignee·보험금액)까지 14개 규칙**이 있다.
- 규칙 결과 상태: `pass` / `fail` / `skip`(비교할 값 없음).
- 평가 시 두 가지를 분리해서 볼 수 있다.
  - **규칙 단독 평가**: 정답 서류별 값을 `ImportReconciliationInput`으로 직접 넣고 규칙만 채점 (결정적, API 불필요)
  - **종단 평가**: Edge Function 응답 → `buildReconciliationInput` → 규칙 (추출 오류 + 필드 매핑 오류 + 규칙 오류가 합쳐짐)

## 3. HSK 추천 경로

### 수입 (화주)
```
recommendImportHSKForItems(items, onProgress)   ─ src/services/importHSCodeSuggestionService.ts
  └ recommendImportHSK(item)
      └ searchProductCandidates()   ─ hsDataService.searchHSByKeyword (public/data/hsCodes.json)
      └ retainOfficialCandidates()  ─ 공식 10자리 HSK만 유지
      └ verifiedSuggestions()
          └ suggestHSCodeFromCandidates()  ─ src/services/claudeService.ts → Edge Function 'openai-assistant'
          └ 후보 순위 + reasoning, 최대 DISPLAY_LIMIT개
```

### 수출 (화주)
```
useShipperHSCodeSuggestions → shipperHSCodeSuggestionService.ts
  └ searchHSByKeyword / lookupHSHierarchy → suggestHSCodeFromCandidates → 'openai-assistant'
  └ parseDisplayConfidence(): AI 응답 '높음'/'보통' 라벨만 사용 (퍼센트 없음)
```

## 4. 고정 신뢰도 값이 만들어지는 위치

| 위치 | 값 | 의미 |
| --- | --- | --- |
| `src/services/importHSCodeSuggestionService.ts` 175행 | `0.85` / `0.65` | AI 순위 응답의 `confidence`가 '높음'/'high'면 0.85, 아니면 0.65 |
| 같은 파일 196행 | `0.55` | AI 순위 판단 실패 시 공식 후보를 그대로 보여줄 때 |
| `src/services/importRiskService.ts` 407행 | `< 0.7` | 최고값이 0.7 미만이면 "HS Code 신뢰도 낮음" 경고 (= AI가 '높음'을 준 후보가 하나도 없음) |
| `src/components/import/ImportTradeFlow.tsx` 1290행 | 화면 표시 | `추천 신뢰도 {confidence×100}%` → **85%/65%/55%가 확률처럼 노출됨** |

→ 이 값들은 측정된 확률이 아니라 **AI 라벨을 숫자로 바꾼 것**이다. 평가 지표로 쓰면 안 된다.

## 5. UUID가 사용자 화면에 노출되는 위치

| 위치 | 내용 |
| --- | --- |
| `src/components/import/ImportAnalysisSummary.tsx` 224행 | `추출 출처: {item.sourceDocumentIds.join(', ')}` → 파일 UUID가 그대로 표시됨 |

참고 (이미 처리돼 있어 노출되지 않는 곳):
- `importRiskService.ts`의 `docNameOf()` / `sourceDocumentNames()` — 경고 카드 배지는 서류 이름으로 바꿔 표시한다.

## 6. chosenValues (사용자 선택값) 저장 경로

```
불일치 카드에서 값 선택 → applyChosenValue()    ─ src/services/importValueChoiceService.ts
분석 결과 표 직접 수정 → mergeEditedChoices()
선택 취소             → clearChosenValue()
  └ analysis.chosenValues: Record<string, string>  (키 예: "field:grossWeight", "fta:apply")
  └ ImportTradeSnapshot.analysis 안에 포함되어
      ├ saveTradeFormDraft() 임시저장 (draftCacheService)
      └ onGenerate(snapshot) 거래 저장
```

- **최종 선택값만** 저장된다. 이전 값·변경 시각·변경자·사유는 남지 않는다 (변경 이력 없음).
- 원본 서류 값(`comparison`)은 덮어쓰지 않고 따로 보존된다.

## 7. 이번 작업에서 건드리지 않은 파일 (평가 결과에 영향)

| 파일 | 이유 |
| --- | --- |
| `supabase/functions/import-document-analysis/index.ts` | 프롬프트·응답 스키마 |
| `supabase/functions/openai-assistant/index.ts` | HSK 순위 프롬프트 |
| `src/services/importDocumentAnalysisService.ts` | 요청 구성·응답 정규화 |
| `src/services/importReconciliationEngine.ts` | 필드 매핑 |
| `src/services/importReconciliationRules.ts` | IR1~IR14 규칙 |
| `src/services/importRiskService.ts` 판정 로직 | 경고 생성 조건 (문구 외 변경 없음) |
| `src/services/importHSCodeSuggestionService.ts` | HSK 후보 검색·순위·confidence 저장값 |
| `src/services/shipperHSCodeSuggestionService.ts`, `hsDataService.ts`, `claudeService.ts` | HSK 검색·AI 호출 |
| `src/services/importValueChoiceService.ts` | 선택값 저장 구조 |
| `public/data/*.json` | HS·항구 사전 |
| `supabase/migrations/*` | DB 스키마 |
