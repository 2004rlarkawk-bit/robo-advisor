# 합성(synthetic) 예제 데이터

**모든 값은 가상입니다.** 회사명·Invoice No.·B/L No.는 `EXAMPLE`·`SAMPLE`·`EX-` 접두어로 만든 허구이며, 실제 거래·서류와 무관합니다.

- 목적: 정규화·채점·집계·보고서 스크립트가 의도대로 동작하는지 확인
- PDF는 없습니다(정답 CSV와 가상 예측 JSON만 있음)
- 여기서 나온 점수는 **PortAI의 실제 성능이 아닙니다**

| 파일 | 내용 |
| --- | --- |
| `documents.csv` | 거래 2건(정상 EX-T-001 / 오류 삽입 EX-T-002), 파일 7개 |
| `fields.csv` | 거래 단위 필드 정답 |
| `comparisons.csv` | 거래 × 비교 항목 정답 |
| `hsk_items.csv` | 품목 4개의 참조 HSK(가상, team_reference) |

가상 예측은 `evaluation/examples/predictions/run-1~3/`에 있습니다.
