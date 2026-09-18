# PortAI 평가 보고서

> **주의: 아래 값은 합성 예제를 이용해 평가 스크립트의 동작을 확인한 결과이며,**
> **PortAI의 실제 성능 수치가 아닙니다.**

## 실행 정보

| 항목 | 값 |
| --- | --- |
| runId | example-run-3 |
| datasetVersion | synthetic-example |
| datasetSplit | (미기록) |
| model | (미기록) |
| reasoningEffort | (미기록) |
| promptVersion | (미기록) |
| promptHash | (미기록) |
| normalizationVersion | norm-v1 |
| ruleVersion | IR1-IR14 |
| codeCommit | (미기록) |
| edgeFunctionCommit | (미기록) |
| measuredAt | (미기록) |
| repeatIndex | (미기록) |
| notes | 합성 예제 — 실제 측정 아님 |

## 채점 결과

### 문서 분류 (run: example-run-3)

| 지표 | 값 (분자/분모) |
| --- | --- |
| Classification Accuracy | 85.7% (6/7) |
| Processing Success Rate | 85.7% (6/7) |

문서 유형별

| 정답 유형 | 정확도 |
| --- | --- |
| commercial_invoice | 100.0% (2/2) |
| packing_list | 100.0% (2/2) |
| bill_of_lading | 50.0% (1/2) |
| certificate_of_origin | 100.0% (1/1) |

데이터 구분별

| source_kind | 정확도 |
| --- | --- |
| synthetic-normal | 100.0% (3/3) |
| synthetic-error | 75.0% (3/4) |

### 필드 추출 (run: example-run-3)

| 지표 | 값 (분자/분모) |
| --- | --- |
| Strict Field Accuracy | 21.1% (4/19) |
| Normalized Field Accuracy | 89.5% (17/19) |
| Missing Rate | 5.3% (1/19) |
| Wrong Extraction Rate | 5.3% (1/19) |
| 회사명 strict | 0.0% (0/3) |
| 회사명 relaxed | 100.0% (3/3) |

평가 가능 필드 19개 · 해당 없음(분모 제외) 1개 · 해당 없는 필드에 값 생성 0개 · 누락 1개 · 오추출 1개 · 정규화 norm-v1

| 필드 | strict | normalized | 누락 | 오추출 |
| --- | --- | --- | --- | --- |
| invoiceNo | 100.0% (2/2) | 100.0% (2/2) | 0 | 0 |
| invoiceDate | 0.0% (0/2) | 100.0% (2/2) | 0 | 0 |
| exporter | 0.0% (0/2) | 100.0% (2/2) | 0 | 0 |
| importer | 0.0% (0/1) | 100.0% (1/1) | 0 | 0 |
| productDescription | 0.0% (0/1) | 100.0% (1/1) | 0 | 0 |
| quantity | 50.0% (1/2) | 100.0% (2/2) | 0 | 0 |
| currency | 100.0% (1/1) | 100.0% (1/1) | 0 | 0 |
| totalAmount | 0.0% (0/1) | 100.0% (1/1) | 0 | 0 |
| grossWeight | 0.0% (0/2) | 100.0% (2/2) | 0 | 0 |
| loadPort | 0.0% (0/2) | 100.0% (2/2) | 0 | 0 |
| dischargePort | 0.0% (0/1) | 0.0% (0/1) | 0 | 1 |
| blNo | 0.0% (0/1) | 0.0% (0/1) | 1 | 0 |
| originCountry | 0.0% (0/1) | 100.0% (1/1) | 0 | 0 |

### 불일치 탐지 (run: example-run-3)

| 지표 | 값 |
| --- | --- |
| Mismatch Precision | 100.0% (3/3) |
| Mismatch Recall | 100.0% (3/3) |
| Mismatch F1 | 100.0% |

| TP | FP | FN | TN | 비교 불가(정답) | 비교 불가인데 불일치 예측 | 예측 없음 |
| --- | --- | --- | --- | --- | --- | --- |
| 3 | 0 | 0 | 6 | 2 | 0 | 0 |

### HSK 추천 (run: example-run-3)

| 지표 | 값 (분자/분모) |
| --- | --- |
| HSK Top-1 | 66.7% (2/3) |
| HSK Top-3 | 100.0% (3/3) |

추천 없음 1건 · 공식 사전에 없는 추천 코드 1개 · 10자리 아닌 추천 코드 0개 · 앞자리 일치 채점 1건

| reference_source | Top-1 | Top-3 |
| --- | --- | --- |
| team_reference | 50.0% (1/2) | 100.0% (2/2) |
| expert_review | 100.0% (1/1) | 100.0% (1/1) |

## 반복 실행 집계

### document-classification (3회)

| 지표 | 평균 | 최소 | 최대 | 실행별 분자/분모 |
| --- | --- | --- | --- | --- |
| classificationAccuracy | 90.5% | 85.7% | 100.0% | 7/7, 6/7, 6/7 |
| processingSuccessRate | 95.2% | 85.7% | 100.0% | 7/7, 7/7, 6/7 |

### field-extraction (3회)

| 지표 | 평균 | 최소 | 최대 | 실행별 분자/분모 |
| --- | --- | --- | --- | --- |
| strictFieldAccuracy | 24.6% | 21.1% | 26.3% | 5/19, 5/19, 4/19 |
| normalizedFieldAccuracy | 91.2% | 89.5% | 94.7% | 18/19, 17/19, 17/19 |
| missingRate | 1.8% | 0.0% | 5.3% | 0/19, 0/19, 1/19 |
| wrongExtractionRate | 7.0% | 5.3% | 10.5% | 1/19, 2/19, 1/19 |

### comparison (3회)

| 지표 | 평균 | 최소 | 최대 | 실행별 분자/분모 |
| --- | --- | --- | --- | --- |
| precision | 91.7% | 75.0% | 100.0% | 3/4, 2/2, 3/3 |
| recall | 88.9% | 66.7% | 100.0% | 3/3, 2/3, 3/3 |
| f1 | 88.6% | 80.0% | 100.0% | 85.7%, 80.0%, 100.0% |

### hsk (3회)

| 지표 | 평균 | 최소 | 최대 | 실행별 분자/분모 |
| --- | --- | --- | --- | --- |
| top1 | 55.6% | 33.3% | 66.7% | 2/3, 1/3, 2/3 |
| top3 | 100.0% | 100.0% | 100.0% | 3/3, 3/3, 3/3 |

실패한 실행: 0건
