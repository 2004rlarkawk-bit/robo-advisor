# CLAUDE.md

PortAI — AI 멀티 에이전트 기반 항만 수출입 통관 문서 자동화 서비스 (React 18 + TypeScript + Vite SPA, 백엔드 없음).

## 명령어

```bash
npm run dev       # 개발 서버 (UNI-PASS·법제처 CORS 프록시 포함)
npm run test      # vitest 전체 실행
npm run build     # tsc 타입체크 + vite 빌드 (둘 다 통과해야 함)
npm run lint      # eslint (max-warnings 0)
./git-push.sh     # 테스트 → 빌드 → 커밋 → 푸시 자동화
```

main 머지 시 GitHub Actions가 GitHub Pages로 자동 배포된다. 커밋 전 반드시 `npm run test && npm run build`를 통과시킬 것.

## 아키텍처 핵심

- **에이전트 파이프라인**: `OrchestratorAgent` → `HSCodeAgent` → `DocumentAgent` → `ComplianceAgent` → `FeedbackAgent` (src/agents/). 각 에이전트는 `Agent<I, O>` 인터페이스(src/agents/types.ts)를 구현하고 공유 `logs: AgentLog[]` 배열에 진행 로그를 push한다. 계약 타입(HSCodeResult 등)을 바꾸면 OrchestratorAgent.test.ts의 모킹도 함께 갱신할 것.
- **규칙/검증 엔진**: src/harness/ — `rulesEngine.ts`(필요 서류 판별), `validatorEngine.ts`(필수 항목·형식·공공 API 검증). Incoterms별 서류 매트릭스는 `src/agents/incotermsRules.ts`.
- **서비스 폴백 패턴**: src/services/의 모든 외부 API는 실패(키 없음/CORS/네트워크) 시 시뮬레이션 데이터로 폴백하고 결과에 `source: 'api' | 'simulation'`을 반드시 표기한다. 새 API 연동 시 이 패턴을 따를 것. 단, **인증 실패·API 오류를 "데이터 없음"으로 위장해 조용히 폴백하지 말 것** — UNI-PASS의 `ntceInfo`, 관세청 GW의 `resultCode !== '00'` 검사처럼 오류는 throw해서 console.warn에 사유를 남긴다.

## 반드시 지킬 규칙

1. **HTML 템플릿 이스케이프**: src/agents/templates/의 문서 HTML은 App에서 `dangerouslySetInnerHTML`/`innerHTML`로 렌더링된다. 템플릿 문자열에 보간되는 모든 사용자 입력·LLM 응답은 `escapeHtml`(src/agents/templates/escapeHtml.ts)을 거쳐야 한다. 예외 없음 — 빠뜨리면 저장형 XSS.
2. **NumericInput 처리**: `TradeProfile`의 숫자 필드는 `number | ''` 타입이고 빈 값은 `''`(빈 문자열)이다. `??`는 `''`를 거르지 못하므로 폴백에는 `||`를 쓸 것 (`Number(profile.grossWeight || profile.weight) || 0` 패턴).
3. **문서 간 일관성**: 인보이스·패킹리스트·C/O는 같은 profile에서 생성되므로 중량·금액·수량 계산 규칙이 서로 일치해야 한다. 사용자 입력값이 항상 추정치보다 우선한다.
4. **테스트 환경**: vitest는 node 환경에서 돌고 `localStorage`/`fetch`가 없거나 실패한다 → 서비스들은 키 없음으로 판단해 시뮬레이션 폴백을 타므로 테스트가 결정적이다. 이 특성을 깨는 전역 모킹을 추가하지 말 것.
5. **언어 컨벤션**: 코드 주석·UI 문자열·에이전트 로그는 한국어, 커밋 메시지는 영어 명령형("Fix ...", "Add ...").

## localStorage 키 (전부 평문 — 실서비스 전환 시 백엔드로 이전 예정)

`portai_claude_api_key`, `portai_settings`, `portai_saved_trades`, `portai_data_go_kr_key`, `portai_nts_business_key`, `portai_unipass_{tariff,requirement,cargo,fulfillment}`, `portai_law_oc`

## 알려진 임시 코드 (교체 대상)

- **원산지 판정**: `rulesEngine.ts`와 `validatorEngine.ts`의 `companyName.includes('산')` 분기는 시연용 임시 조건 (TODO 주석 참조). App.tsx의 `handleSolveOrigin`이 회사명에 `" (○○산)"`을 덧붙이는 것도 같은 핵. 원산지 로직 교체 시 세 곳 + harness.test를 함께 수정할 것.
- **CIF 적하보험**: validatorEngine이 CIF면 무조건 `insurance-missing`(error)을 발행하는데 해소할 입력 필드가 없어 CIF 거래는 제출 불가 상태.
- **jsPDF 한글**: 내장 helvetica 폰트에 한글 글리프가 없어 PDF 다운로드 시 한글이 깨진다. 한글 TTF 임베드 필요.
- **HS 사전 데이터**: `public/data/hsCodes.json`(1.3MB, 단일 라인)은 `관세청_HS부호_20260101.xlsx`에서 변환한 파일. 갱신 시 `[code, ko, en, qtyUnit, wtUnit, category]` 배열 형식 유지.
