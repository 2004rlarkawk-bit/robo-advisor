# CLI로 수입 문서 분석을 호출할 수 있는가

결론: **구조상 가능하지만, 이번 작업에서는 인증정보가 없어 실제 호출하지 않았다.** `npm run eval:probe`는 `.env.evaluation.local`이 없으면 호출 없이 안내만 출력하고 종료(코드 0)하는 것까지 확인했다.

## 호출 경로

| 항목 | 값 |
|---|---|
| 엔드포인트 | `POST {SUPABASE_URL}/functions/v1/import-document-analysis` |
| 인증 | `supabase/config.toml` → `verify_jwt = true` — **로그인한 사용자 세션의 access token(JWT)** 필요 |
| 앱의 호출 방식 | `supabase.functions.invoke('import-document-analysis')` (로그인 세션 토큰 자동 첨부) |
| 모델 설정 | `OPENAI_IMPORT_DOCUMENT_MODEL` → `OPENAI_MODEL` → 기본 `gpt-5.6`, reasoning 기본 `low` (운영 환경값은 확인 불가) |
| 분류 힌트 | 요청의 `documentType`이 분류 결과에 영향을 주므로 평가 때는 `unknown`으로 보낸다 |

publishable(anon) 키는 JWT가 아니므로 그것만으로는 `verify_jwt`를 통과하지 못한다. 반드시 테스트 계정으로 로그인해 받은 세션 토큰을 써야 한다. **service role 키는 쓰지 않는다.**

## 필요한 환경 변수 (`.env.evaluation.local`, git 무시됨)

```
EVAL_SUPABASE_URL=
EVAL_SUPABASE_PUBLISHABLE_KEY=
EVAL_TEST_EMAIL=            # 평가 전용 테스트 계정 (자동 생성하지 않음)
EVAL_TEST_PASSWORD=
EVAL_PROBE_CONFIRM=single-synthetic-call
EVAL_PROBE_FILE=            # 선택. evaluation/fixtures/synthetic/ 아래 파일만 허용. 없으면 가상 PDF 생성
```

## 막힌 지점

1. 저장소에 `.env.evaluation.local`과 평가용 테스트 계정이 없다 → 호출 단계는 건너뜀.
2. 운영 Supabase 프로젝트밖에 없다면, 호출 시 스토리지·로그 등에 흔적이 남을 수 있다. 백엔드 담당 팀원과 확인이 필요하다.
3. Edge Function 응답의 `extracted`는 거래 단위로 병합된 1개 객체라, 문서별 필드 정답과 1:1 비교가 안 된다 → 평가는 `trade:<id>` 단위로 설계했다(`evaluation/README.md`).
4. OpenAI 응답은 실행마다 달라질 수 있다 → 같은 입력 3회 반복 후 평균·최소·최대로 보고한다.

## probe 스크립트의 안전장치

- `.env.evaluation.local`만 읽는다. 값이 하나라도 없거나 `EVAL_PROBE_CONFIRM`이 정확하지 않으면 호출하지 않는다.
- 한 번 실행에 **정확히 1회** 호출, 반복·병렬 호출 없음.
- 입력은 가상 문자열로 만든 PDF 또는 `evaluation/fixtures/synthetic/` 아래 파일만.
- 응답 원본은 `evaluation/results/raw/`(git 무시)에만 저장. 호출 후 로그아웃.

## 실행 순서 (인증정보가 준비된 뒤)

1. 백엔드 담당자에게 평가 전용 테스트 계정 발급 요청(가능하면 개발용 Supabase 프로젝트).
2. `.env.evaluation.local` 작성 → `npm run eval:probe` 1회 실행 → `evaluation/results/raw/probe-*.json` 구조 확인.
3. 구조가 맞으면 응답을 `evaluation/README.md`의 예측 JSON 형식으로 변환하는 어댑터를 추가(현재 미구현).

## 대안: 앱 안 DEV 평가 화면

CLI 인증이 어렵다면, 이미 로그인된 브라우저 세션에서 동작하는 DEV 전용 화면(`IS_DEV_TEST_ENABLED`일 때만)을 만들어 합성 문서를 올리고 응답 JSON을 내려받는 방식도 가능하다. 인증 문제는 사라지지만 반복 실행 자동화는 어렵다. 이번 작업 범위에는 포함하지 않았다.
