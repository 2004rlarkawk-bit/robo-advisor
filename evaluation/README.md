# PortAI 평가 기반 (Evaluation)

> **이 디렉터리에는 PortAI의 실제 성능 수치가 없습니다.**
> 여기에 있는 것은 평가 기준·데이터 형식·채점 스크립트이며, `examples/`의 점수는 합성 예제로 스크립트 동작만 확인한 값입니다.

관련 문서
- [BASELINE_NOTES.md](BASELINE_NOTES.md) — 현재 시스템의 코드 경로 조사
- [CLI_FEASIBILITY.md](CLI_FEASIBILITY.md) — CLI에서 분석 Edge Function을 호출할 수 있는지 조사
- [../docs/claim-audit.md](../docs/claim-audit.md) — 과장 문구 감사

---

## 1. 평가 목적

| 평가 | 질문 | 평가 단위 |
| --- | --- | --- |
| 문서 분류 | 올린 파일이 C/I·P/L·B/L·C/O 중 무엇인지 맞히는가 | 파일 1개 |
| 필드 추출 | Invoice No.·수량·총중량 등을 정확히 읽는가 | (문서 또는 거래) × 필드 1개 |
| 불일치 탐지 | 서류끼리 값이 다른 곳을 찾는가 | 거래 × 비교 항목 1개 |
| HSK 추천 | 추천 후보 안에 참조 HSK가 있는가 | 품목 1개 |
| 처리 성공률 | 분석 요청이 오류 없이 끝나는가 | 요청(파일) 1개 |

### 평가 필드 (고정 목록)

| field_key | 의미 | 기본 evaluation_mode |
| --- | --- | --- |
| `invoiceNo` | Invoice No. | `strict` |
| `invoiceDate` | Invoice Date | `date` |
| `exporter` | Exporter / Shipper | `company_relaxed` (strict 결과도 함께 보고) |
| `importer` | Importer / Buyer | `company_relaxed` (strict 결과도 함께 보고) |
| `productDescription` | 품명 | `text_relaxed` |
| `quantity` | 수량 | `numeric` |
| `quantityUnit` | 수량 단위 | `strict` |
| `totalAmount` | 총금액 | `numeric` |
| `currency` | 통화 | `strict` |
| `originCountry` | 원산지 | `text_relaxed` |
| `packageCount` | 총포장수 | `numeric` |
| `grossWeight` | 총중량 | `numeric_with_unit` |
| `loadPort` | 선적항 | `port_locode` |
| `dischargePort` | 도착항 | `port_locode` |
| `blNo` | B/L No. | `strict` |

> 현재 분석 Edge Function은 거래 전체를 합친 `extracted` 하나를 돌려줍니다(BASELINE_NOTES §1).
> 그래서 필드 추출은 두 층으로 채점합니다.
> - **거래 단위**: `document_id = trade:<trade_id>` 로 적고, 거래의 대표 정답값과 비교
> - **서류 단위**: `comparison[]`의 서류별 열(C/I·P/L·B/L·C/O)이 있는 필드만 개별 문서 ID로 비교
>
> 보고할 때는 어느 층인지 반드시 함께 적습니다.

---

## 2. 데이터 구분 (`source_kind`)

| 값 | 설명 | 보고 방법 |
| --- | --- | --- |
| `real` | 실제 수출입 서류 (비식별 처리 전 원본은 `private/`에만) | 반드시 **별도** 보고 |
| `synthetic-normal` | 팀이 만든 정상 서류 | 기본 동작 확인용 |
| `synthetic-error` | 의도적으로 불일치를 넣은 서류 | 불일치 탐지 Recall 확인용 |
| `scan-100dpi` | 위 서류를 100dpi로 변환·스캔한 저품질본 | 품질 저하 영향 확인용 |

**서로 다른 `source_kind`를 합쳐서 하나의 정확도로 발표하지 않습니다.** 합성 서류는 형식이 깨끗해 결과가 좋게 나오기 쉽습니다.

`document_quality`: `original` / `scan-150dpi` / `scan-100dpi` / `photo` / `unknown`

---

## 3. 개발 세트와 테스트 세트

`dataset_split`: `dev` / `test`

1. **같은 거래의 C/I·P/L·B/L은 반드시 같은 세트**에 둡니다 (`trade_id` 단위로 나눔).
2. **같은 템플릿에서 만든 변형 서류**(값만 바꾼 것)는 서로 다른 세트로 나누지 않습니다. 나누면 테스트 세트가 사실상 개발 세트와 같아집니다.
3. 테스트 세트는 **기준선 측정(Baseline v1)과 최종 측정 때만** 실행합니다. 프롬프트나 정규화 규칙을 고치는 중에는 `dev`만 씁니다.
4. **결과를 본 뒤 테스트 세트의 정답·평가 모드·필드 목록을 바꾸지 않습니다.** 정답 오류가 발견되면 수정 이력을 남기고 `datasetVersion`을 올린 뒤 기준선부터 다시 잽니다.
5. 세트 분할은 측정 전에 확정하고 `manifest.json`의 `datasetVersion`으로 고정합니다.

---

## 4. 보안 원칙

이 저장소는 **공개 저장소**(GitHub Pages 배포)입니다.

| 커밋 가능 | 커밋 금지 (`evaluation/private/`, `evaluation/results/raw/` 등에만) |
| --- | --- |
| 스키마(템플릿 CSV 헤더), 채점 스크립트, 테스트 | 실제 PDF·이미지 |
| 가상 회사명으로 만든 합성 예제 | 실제 회사명·주소·담당자·연락처·사업자번호·Invoice No.가 든 CSV/JSON |
| 집계 수치만 담은 요약 보고서 (검토 후) | 실서류 분석 응답 원본, 실서류 예측 파일 |
| | `.env.evaluation.local` (계정·키) |

- 실서류 결과 원본도 **개인정보·영업정보로 취급**합니다.
- 발표·보고서에는 **집계 결과만** 사용합니다 (개별 서류 값 인용 금지).
- 합성 예제에는 `EXAMPLE`, `SAMPLE` 등이 들어간 **가상 회사명**만 씁니다.
- `.gitignore`에 `evaluation/private/`, `evaluation/results/raw/`, `.env.evaluation.local`, `**/real-documents/`, `**/real-gold/`가 등록돼 있습니다. 또한 저장소 전체에서 `*.pdf`, `*.docx`는 기본적으로 무시됩니다.

---

## 5. 반복 측정

AI 응답은 같은 입력에도 조금씩 달라집니다.

- 같은 테스트 세트를 **3회** 실행합니다 (`repeatIndex` 1~3).
- 보고: **평균, 최소, 최대, 실행별 분자/분모**, 실패한 실행 수.
- 실행마다 `manifest.json`을 남깁니다: 모델명(응답의 `model`), 추론 설정, 프롬프트 해시, 정규화 버전, 규칙 버전, 코드 커밋, Edge Function 커밋, 측정일.
- 버전 표기는 코드를 기준으로 합니다(사람이 임의로 적지 않습니다).
  - `normalizationVersion`: `scripts/evaluation/normalize.ts`의 `NORMALIZATION_VERSION` — 현재 `norm-v1`
  - `ruleVersion`: `src/services/importReconciliationRules.ts`의 규칙 id 범위 — 현재 `IR1-IR14` (규칙 14개)
  - 두 값이 코드와 어긋나면 `npm run eval:test`의 버전 일치 테스트가 실패합니다.
- **확인하지 못한 값은 빈 문자열**로 둡니다. 추측한 모델 버전을 적지 않습니다.
- v1과 v2 차이가 3회 범위(최소~최대) 안이면 "개선"이라고 말하지 않습니다.

---

## 6. 파일럿 평가의 한계

- 20~30건 규모의 결과는 **제품 전체 성능을 대표하지 않습니다.** 품목·양식·언어·스캔 품질이 바뀌면 결과가 크게 달라질 수 있습니다.
- 발표·보고서 표현:
  - ✅ "내부 파일럿 데이터셋을 대상으로 핵심 기능의 성능을 정량 평가하였다."
  - ✅ "제한된 평가 데이터셋을 이용한 1차 실험 결과이다."
  - ❌ "PortAI의 실제 정확도는 95%이다."
  - ❌ "모든 무역서류에서 95%의 정확도를 보장한다."
- 수치를 쓸 때는 **분자/분모와 데이터 구분을 함께** 적습니다. 예: "필드 추출 정규화 정확도 342/386 (합성 정상 서류, 거래 단위, 3회 평균)"
- HSK `reference_source`가 `team_reference`뿐이면 "정답" 대신 **"참조 HSK"** 라고 부릅니다.

---

## 7. 지표 계산식

분모가 0이면 값은 `null`이고, 보고서에는 `N/A`로 표시합니다 (NaN 금지).

| 지표 | 계산 |
| --- | --- |
| **Classification Accuracy** | 예측 유형 = 정답 유형인 파일 수 ÷ 채점 대상 파일 수 |
| **Processing Success Rate** | 오류 없이 예측이 나온 파일 수 ÷ 요청한 파일 수 |
| **Strict Field Accuracy** | 공백 앞뒤 제거 후 문자열이 완전히 같은 필드 수 ÷ 평가 가능 필드 수 |
| **Normalized Field Accuracy** | `evaluation_mode` 규칙으로 정규화 후 같은 필드 수 ÷ 평가 가능 필드 수 |
| **Missing Rate** | 예측값이 없거나 빈 값인 필드 수 ÷ 평가 가능 필드 수 |
| **Wrong Extraction Rate** | 값은 있지만 정규화 후에도 다른 필드 수 ÷ 평가 가능 필드 수 |
| **Mismatch Precision** | TP ÷ (TP + FP) |
| **Mismatch Recall** | TP ÷ (TP + FN) |
| **Mismatch F1** | 2 × P × R ÷ (P + R) |
| **HSK Top-1** | 1순위 후보 = 참조 HSK인 품목 수 ÷ 참조 HSK가 있는 품목 수 |
| **HSK Top-3** | 상위 3개 후보 안에 참조 HSK가 있는 품목 수 ÷ 참조 HSK가 있는 품목 수 |

### 평가 가능 필드
- `is_applicable = true`인 행만 분모에 넣습니다.
- `is_applicable = false`(그 문서에 원래 없는 필드)는 분모에서 빼고, 예측값이 있으면 **"없는 필드에 값 생성"** 으로 따로 셉니다.

### 불일치 탐지 혼동행렬 (양성 = `mismatch`)

| 정답 \ 예측 | mismatch | match | not_comparable / 예측 없음 |
| --- | --- | --- | --- |
| mismatch | TP | FN | FN |
| match | FP | TN | TN (단, "비교 불가 예측"으로 따로 셈) |
| not_comparable | 분모 제외, "비교 불가인데 불일치 예측"으로 셈 | 분모 제외 | 분모 제외 |

일치 항목이 훨씬 많으므로 **단순 정확도는 보고하지 않고** Precision·Recall·F1을 보고합니다.

### HSK 비교
- 숫자만 남겨 비교합니다 (`6201.20-1000` = `6201201000`).
- 참조 HSK가 10자리면 10자리 완전 일치, 6자리 이하면 앞자리 일치로 판정하고 결과에 `prefix` 모드임을 표시합니다.
- 공식 HSK 사전(`public/data/hsCodes.json`)에 없는 10자리 추천 코드는 따로 셉니다.

---

## 8. 정규화 규칙 (normalizationVersion `norm-v1`)

구현: [`scripts/evaluation/normalize.ts`](../scripts/evaluation/normalize.ts)

| evaluation_mode | 같다고 보는 경우 | 다르다고 보는 경우 |
| --- | --- | --- |
| `strict` | 앞뒤 공백 제거 후 완전 일치 | 대소문자·구두점 차이 |
| `text_relaxed` | 대소문자·연속 공백·구두점 차이 | 단어가 다름 |
| `numeric` | `550` = `550.00` = `550 KG`, `1,250` = `1250.00` (단위 무시, 숫자만) | 숫자 값이 다름 |
| `numeric_with_unit` | strict: 숫자와 단위가 모두 같음 / normalized: `KG↔MT`, `G↔KG` 환산 후 같음 | 단위를 알 수 없거나 환산 후 다름 |
| `date` | `2026-09-30` = `30 SEP 2026` = `SEP. 30, 2026` = `2026/09/30` | 연·월·일 중 하나라도 없음 (임의로 채우지 않음) |
| `company_strict` | 앞뒤 공백 제거 후 완전 일치 | 표기 차이 |
| `company_relaxed` | 대소문자·공백·구두점, `CO., LTD.`=`CO LTD`, `CORPORATION`=`CORP` | 핵심 회사명이 다름 |
| `port_locode` | UN/LOCODE로 **정확히** 풀리는 경우 같은 코드 (`Busan` = `Busan Port` = `BUSAN, KOREA` = `KRPUS`) | 오타 추정(fuzzy)은 일치로 보지 않음 |

품명은 추가로 `strict` / `punctuation_relaxed` / `core_text_contains` 세 가지를 따로 계산할 수 있습니다. **LLM 의미 유사도로 정답을 판정하지 않습니다.**

---

## 9. 파일 형식

### 정답 (templates/)

| 파일 | 내용 |
| --- | --- |
| `documents.csv` | 파일별 정답 유형, 거래 ID, 세트, 데이터 구분, 품질 |
| `fields.csv` | (문서 또는 `trade:<id>`) × 필드별 정답값·평가 모드·적용 여부 |
| `comparisons.csv` | 거래 × 비교 항목별 정답 (match / mismatch / not_comparable) |
| `hsk_items.csv` | 품목별 참조 HSK와 출처 (`actual_declaration` > `official_case` > `expert_review` > `team_reference`) |
| `manifest.json` | 실행 정보 |

### 예측 (채점 스크립트 입력, JSON)

```jsonc
// 분류
{ "runId": "...", "documents": [{ "document_id": "D-001", "predicted_type": "commercial_invoice", "error": null }] }
// 필드
{ "runId": "...", "fields": [{ "document_id": "trade:T-001", "field_key": "quantity", "predicted_value": "1,500 PCS" }] }
// 불일치
{ "runId": "...", "comparisons": [{ "trade_id": "T-001", "field_key": "grossWeight", "predicted_result": "mismatch" }] }
// HSK (후보는 추천 순서대로)
{ "runId": "...", "items": [{ "item_id": "I-001", "candidates": ["6201201000", "6201409010"] }] }
```

---

## 10. 명령어

| 명령 | 하는 일 |
| --- | --- |
| `npm run eval:test` | 정규화·채점 스크립트 단위 테스트 |
| `npm run eval:example` | 합성 예제로 4개 채점 스크립트 실행 → `evaluation/examples/reports/` |
| `npm run eval:aggregate -- <요약 JSON…>` | 여러 실행 결과의 평균·최소·최대 |
| `npm run eval:report -- <요약 디렉터리> [--synthetic-example]` | Markdown 보고서 생성 |
| `npm run eval:probe` | CLI에서 분석 Edge Function 1회 호출 가능 여부 확인 (환경변수 없으면 안내 후 종료) |

개별 채점:
```bash
npx tsx scripts/evaluation/score-document-classification.ts --gold <documents.csv> --pred <pred.json> --out <summary.json>
npx tsx scripts/evaluation/score-field-extraction.ts --gold <fields.csv> --pred <pred.json> --out <summary.json>
npx tsx scripts/evaluation/score-comparison.ts --gold <comparisons.csv> --pred <pred.json> --out <summary.json>
npx tsx scripts/evaluation/score-hsk.ts --gold <hsk_items.csv> --pred <pred.json> --out <summary.json> [--hs-codes public/data/hsCodes.json]
```

---

## 11. 실제 기준선(Baseline v1) 측정 순서

1. 평가 필드·정규화·정답 기준을 팀에서 확정 (이 문서)
2. `evaluation/private/`에 정답 CSV 작성, `dev`/`test` 분할 확정
3. `datasetVersion` 부여
4. CLI 또는 DEV 평가 화면으로 **테스트 세트 3회** 실행 → 원본 응답은 `results/raw/`
5. 응답 → 예측 JSON 변환 → 채점 → `results/summary/`
6. `eval:aggregate`, `eval:report`
7. 수치 발표 시 §6 표현 규칙 준수
