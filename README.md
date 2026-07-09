# 🚢 PortAI — 로보 어드바이저 Agent 기반 항만 수출입 통관 자동화 서비스

> 수출입 기본 정보만 입력하면 AI 멀티 에이전트가 **필요 서류를 판단**하고, **통관·선적 문서를 자동 생성**하고, **누락·오류를 검증**해 보완사항을 안내하는 웹 서비스

**🔗 라이브 데모**: https://2004rlarkawk-bit.github.io/robo-advisor/

2026년 「스마트해운물류 × ICT 멘토링」 프로젝트 결과물입니다.

---

## 왜 만들었나

항만 수출입 통관 업무는 상업송장, 패킹리스트, 원산지증명서 등 다양한 문서를 반복 작성·검토해야 하고, 서류 누락이나 기재 오류가 통관 지연과 추가 비용으로 직결됩니다. 기존 통관 자동화 도구(Maersk Trade & Tariff Studio, Digicust, 국내 RPA)가 **완성된 문서의 검증·입력 자동화**에 집중한다면, PortAI는 **"이 거래에 어떤 서류가 필요한가"를 판단하는 단계부터** 생성 → 검증 → 피드백을 하나의 흐름으로 자동화합니다.

## 주요 기능

| 기능 | 설명 |
|---|---|
| 🤖 필요 서류 판단 | Incoterms(FOB/CIF/EXW/DDP)별 규칙 엔진이 거래 조건에 맞는 필수 서류를 판별 |
| 📄 문서 자동 생성 | 상업송장(Commercial Invoice) · 패킹리스트(Packing List) · 원산지증명서(C/O)를 HTML/PDF로 생성 |
| 🔢 HS 코드 추천·검증 | 관세청 HS부호 사전(12,469행) + Claude LLM 의미 검색 + 내장 사전 3단 폴백 |
| ✅ 규정 검증 | 필수 항목 누락, HS 코드 형식, 사업자등록번호 진위, 운송 맥락 등 룰 기반 검증 |
| 🌐 공공 API 연동 | 관세청 관세환율(과세가격 환산) · 국세청 사업자 진위확인 · UNI-PASS(관세율/화물추적) · 법제처 법령 검색 |
| 💬 AI 피드백 | 발견된 이슈를 Claude API가 실무 관점의 자연어 피드백으로 변환 (키 없으면 룰 기반 폴백) |
| 📊 데이터 분석 | 품목별·국가별 수출입 실적 차트, 거래 이력 통계 대시보드 |
| 📱 모바일 보완 안내 | 항만 현장에서 스마트폰으로 누락 항목 확인 및 보완 |

## 아키텍처

멀티 에이전트 파이프라인이 핵심입니다. 오케스트레이터가 실행 ID·타임아웃·단계별 오류를 관리하며 4개 에이전트를 순차 실행합니다.

```
사용자 입력 (TradeProfile)
        │
        ▼
┌─ OrchestratorAgent ──────────────────────────────────────┐
│                                                          │
│  1. HSCodeAgent      품목명 → HS 코드 추천/검증          │
│     └ Claude API → 관세청 HS 사전 → 내장 사전 (3단 폴백) │
│  2. DocumentAgent    필요 서류 판단 + 문서 데이터 조립   │
│     └ rulesEngine (Incoterms 규칙 매트릭스)              │
│  3. ComplianceAgent  규정 검증 + 공공 API 교차 확인      │
│     └ validatorEngine (환율·사업자·법령 연동)            │
│  4. FeedbackAgent    이슈 → 자연어 피드백                │
│     └ Claude API 또는 룰 기반 폴백                       │
│                                                          │
└──────────────────────────────────────────────────────────┘
        │
        ▼
웹 UI — 문서 미리보기 · PDF 다운로드 · 모바일 보완 안내 · 데이터 분석
```

**폴백 설계 원칙**: 모든 외부 API 호출은 실패(키 없음/CORS/네트워크) 시 시뮬레이션 데이터로 대체되며, 응답에 `source: 'api' | 'simulation'`을 표기해 UI에서 실데이터 여부를 구분합니다. 덕분에 API 키 없이도 전체 기능을 시연할 수 있습니다.

## 기술 스택

- **프론트엔드**: React 18, TypeScript, Vite
- **AI**: Claude API (HS 코드 추천, 문서 필드 자동 완성, 자연어 피드백)
- **문서 생성**: HTML 템플릿 + jsPDF/jspdf-autotable
- **공공 데이터**: 관세청 GW(data.go.kr), 국세청, UNI-PASS, 법제처 국가법령정보
- **테스트**: Vitest (에이전트 계약 · 하네스 통합 · 서비스 단위 테스트)
- **배포**: GitHub Actions → GitHub Pages 자동 배포

## 시작하기

```bash
# 요구사항: Node.js 20+
npm ci            # 의존성 설치
npm run dev       # 개발 서버 (http://localhost:5173)
npm run test      # 테스트 실행
npm run build     # 프로덕션 빌드 (tsc + vite)
```

로컬 개발 서버는 UNI-PASS·법제처 API의 CORS 제한을 Vite 프록시(`/unipass-api`, `/law-api`)로 우회합니다. 배포판(GitHub Pages)에서는 해당 API가 시뮬레이션으로 폴백됩니다.

### API 키 설정 (선택)

키가 없어도 모든 기능이 시뮬레이션 모드로 동작합니다. 실데이터 연동을 원하면 앱의 **설정** 페이지에서 입력하세요.

| 키 | 발급처 | 활성화되는 기능 |
|---|---|---|
| Claude API | [console.anthropic.com](https://console.anthropic.com) | HS 코드 AI 추천, 문서 필드 자동 완성, AI 피드백 |
| 공공데이터포털 | [data.go.kr](https://www.data.go.kr) | 관세환율, 품목별·국가별 수출입 실적 |
| 국세청 사업자 | data.go.kr (국세청_사업자등록정보) | 사업자등록번호 진위확인 |
| UNI-PASS (4종) | [unipass.customs.go.kr](https://unipass.customs.go.kr) | 관세율 조회, 요건승인, 화물추적, 수출이행 |
| 법제처 OC | [open.law.go.kr](https://open.law.go.kr) | 근거 법령 검색 |

> ⚠️ 프로토타입 특성상 키가 브라우저 localStorage에 저장됩니다. 팀 외부에 배포판을 공유할 때는 본인 키를 입력하지 마시고, 실서비스 전환 시 백엔드 프록시로 이전할 예정입니다(로드맵 참고).

## 프로젝트 구조

```
src/
├── agents/              # 멀티 에이전트 파이프라인
│   ├── OrchestratorAgent.ts   # 파이프라인 조율 (타임아웃·오류·실행 ID)
│   ├── HSCodeAgent.ts         # HS 코드 추천/검증
│   ├── DocumentAgent.ts       # 문서 데이터 조립 + HTML 렌더링
│   ├── ComplianceAgent.ts     # 규정 검증
│   ├── FeedbackAgent.ts       # 자연어 피드백
│   ├── incotermsRules.ts      # Incoterms별 필수 서류 매트릭스
│   └── templates/             # Invoice·PL·C/O HTML 템플릿
├── harness/             # 규칙·검증 엔진
│   ├── rulesEngine.ts         # 필요 서류 판별
│   └── validatorEngine.ts     # 필수 항목·형식·공공 API 검증
├── services/            # 외부 연동 (모두 시뮬레이션 폴백 내장)
│   ├── claudeService.ts       # Claude API
│   ├── customsApiService.ts   # 관세청 GW·국세청
│   ├── unipassService.ts      # UNI-PASS 4종
│   ├── lawService.ts          # 법제처 법령
│   ├── hsDataService.ts       # HS부호 로컬 사전 (12,469행)
│   ├── pdfGenerator.ts        # jsPDF 문서 생성
│   └── storageService.ts      # localStorage 저장/통계
├── components/          # 데이터분석·문서관리·설정 패널
└── App.tsx              # 메인 UI
```

## 개발 워크플로

1. `main`에서 작업 브랜치를 만듭니다 (`feat/...`, `fix/...`, `docs/...`)
2. 커밋 전 `npm run test && npm run build`로 검증합니다 (`./git-push.sh`가 이 과정을 자동화)
3. Pull Request를 올리고 팀원 리뷰 후 머지합니다
4. `main` 머지 시 GitHub Actions가 자동으로 GitHub Pages에 배포합니다

## 로드맵 / 알려진 한계

- [ ] CIF 적하보험 이슈 해소 수단 추가 (현재는 보험 입력 필드가 없어 CIF 거래 제출 불가)
- [ ] 문서 재검증(rerunAgents) 동시 실행 가드 및 실패 알림
- [ ] jsPDF 한글 폰트 임베드 (현재 PDF에서 한글 깨짐 — HTML 미리보기는 정상)
- [ ] B/L·통관신고서 템플릿 추가 (현재 미리보기 미지원)
- [ ] 원산지 판정 로직 정식 구현 (현재 데모용 임시 분기)
- [ ] FastAPI 백엔드 도입 — API 키 서버 보관, RAG 기반 수출신고서 필드 분석(Chroma + 법령 벡터 DB)
- [ ] 사용자 인증(JWT) 및 DB 연동

## 팀

2026 스마트해운물류 × ICT 멘토링 (멘토: 문재현)

| 역할 | 담당 |
|---|---|
| 팀장 · 기획/PM | 김지민 — 요구사항 정의, FastAPI 서버 설계 |
| 프론트엔드 · UI/UX | 강보현 — 입력/문서 생성 화면, 모바일 피드백 화면 |
| 백엔드 · DB | 윤지민 — 데이터 저장 구조, 문서 생성·검토 연동 |
| AI · 데이터 분석 | 박지민 — AI Agent·LLM 연계, 서류 판단 로직 |

## 라이선스

교육·연구 목적의 멘토링 프로젝트입니다. 생성되는 문서는 프로토타입 산출물로, 실제 통관 신고에 그대로 사용할 수 없습니다.
