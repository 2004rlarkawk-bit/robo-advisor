/**
 * 사용 안내 — 수출 / 수입 탭으로 나눠 실제 화면 흐름 순서대로 설명한다.
 * 역할(화주·포워더)마다 진행 단계가 다르므로 탭 안에서 역할별로 보여준다.
 * 공통 내용(결과 화면 읽는 법, 자주 묻는 질문)은 탭 아래에 둔다.
 */
import { useState } from 'react';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { replayOnboardingTour } from './OnboardingTour';

type Props = {
  onNavigate?: (menu: string) => void;
};

type GuideTab = 'export' | 'import';

interface RoleFlow {
  role: string;
  who: string;
  steps: { title: string; desc: string }[];
}

const EXPORT_FLOWS: RoleFlow[] = [
  {
    role: '화주',
    who: '물건을 보내는 회사',
    steps: [
      { title: '거래 정보 입력', desc: '품목·거래처·거래조건을 입력해요. 가진 서류를 첨부하면 자동으로 채워져요.' },
      { title: '필요 서류 자동 생성', desc: '거래조건에 맞는 서류를 판별해 초안을 만들고 통관 규정을 검증해요.' },
      { title: '검토 · 보완', desc: '고칠 항목을 근거와 함께 알려줘요. [입력 수정]으로 바로 고칠 수 있어요.' },
      { title: '확인 · 전송', desc: '미리보기·다운로드 후 [전체 문서 전송]을 누르면 끝이에요.' },
    ],
  },
  {
    role: '포워더',
    who: '운송을 맡는 회사',
    steps: [
      { title: '원천서류 업로드', desc: '화주에게 받은 서류를 올리면 입력칸이 자동으로 채워져요.' },
      { title: 'B/L 정보 입력', desc: '운송의뢰·선복예약·컨테이너·화물명세를 확인해요.' },
      { title: 'B/L 생성', desc: '[정보 저장 및 B/L 생성]으로 선하증권 초안을 만들어요.' },
      { title: '확인 · 전송', desc: 'B/L을 확인하고 [전체 문서 전송]을 누르면 끝이에요.' },
    ],
  },
];

const IMPORT_FLOWS: RoleFlow[] = [
  {
    role: '화주',
    who: '물건을 들여오는 회사',
    steps: [
      { title: '서류 업로드 · AI 분석', desc: '해외에서 받은 C/I·P/L·B/L·C/O PDF를 올리면 AI가 값을 읽어요.' },
      { title: '리스크 점검 · HS 확정', desc: '서류끼리 값을 대조해 불일치를 짚고, 한국 HS CODE를 확정해요.' },
      { title: '세액 · 수입신고 의뢰서', desc: '예상 관세·부가세를 계산하고 의뢰서를 PDF·Word로 받아요.' },
    ],
  },
  {
    role: '포워더',
    who: '운송·통관을 맡는 회사',
    steps: [
      { title: '서류 업로드', desc: '수입 화물의 서류를 올리면 AI가 값을 정리해요.' },
      { title: '서류 확인', desc: '서류끼리 서로 다른 값을 비교 화면에서 해결해요.' },
      { title: '통관 처리', desc: '도착통지서를 첨부하고 통관 진행 상황과 예상 관세를 확인해요.' },
    ],
  },
];

/** 수출 서류 6종 — 우리가 만드는 것 / 다른 곳에서 발급받는 것 */
const EXPORT_DOCS_MADE = [
  { abbr: 'C/I', name: '상업송장', note: '거래 금액·조건' },
  { abbr: 'P/L', name: '패킹리스트', note: '포장 수량·중량·부피' },
  { abbr: 'E/D', name: '수출신고서 (초안)', note: '실제 신고는 관세사가 진행' },
];
const EXPORT_DOCS_EXTERNAL = [
  { abbr: 'B/L', name: '선하증권', note: '포워더·선사 발행' },
  { abbr: 'C/O', name: '원산지증명서', note: '상공회의소 발급' },
  { abbr: 'I/P', name: '적하보험증권', note: '보험사 발급' },
];

const IMPORT_CHECKS = ['품명', '수량', '중량', '포장 개수', '금액', '통화', 'HS CODE', 'Incoterms', '필수 서류'];

const LEGEND = [
  { tone: 'red', label: '반드시 수정', desc: '해결해야 전송할 수 있어요.' },
  { tone: 'amber', label: '보완 권장', desc: '확인하면 좋지만 그대로 진행해도 돼요.' },
  { tone: 'green', label: '생성 완료', desc: '보기·다운로드할 수 있어요.' },
  { tone: 'gray', label: '발행 대기', desc: '다른 기관이 발급하는 서류예요.' },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: '작성하다가 나가면 어떻게 되나요?',
    a: '자동으로 저장돼요. AI 통관 작업실 맨 아래 임시보관함에서 [이어서 작업]을 누르세요.',
  },
  {
    q: '지난번 거래를 다시 쓰고 싶어요.',
    a: '문서 관리에서 해당 거래의 [새 거래로 복사]를 누르면 입력값이 채워진 새 거래가 열려요.',
  },
  {
    q: '통관이 어디까지 진행됐는지 알고 싶어요.',
    a: '통관 내역 메뉴에서 신고 접수부터 출항까지 단계별로 확인할 수 있어요.',
  },
  {
    q: 'HS CODE를 몰라요.',
    a: '비워두고 품명을 구체적으로 적어주세요. 후보가 갈리면 PortAI가 선택지를 보여줘요.',
  },
  {
    q: '"반드시 수정"이 있어도 서류를 볼 수 있나요?',
    a: '초안은 미리보기·다운로드할 수 있어요. 최종 전송은 해결한 뒤에 가능해요.',
  },
];

function FlowColumn({ flow }: { flow: RoleFlow }) {
  return (
    <div className="gs-flow">
      <div className="gs-flow-head">
        <span className="gs-flow-role">{flow.role}</span>
        <span className="gs-flow-who">{flow.who}</span>
      </div>
      <ol className="gs-flow-steps">
        {flow.steps.map((step, i) => (
          <li className="gs-flow-step" key={step.title}>
            <span className="gs-flow-num">{i + 1}</span>
            <div>
              <div className="gs-flow-title">{step.title}</div>
              <p className="gs-flow-desc">{step.desc}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DocList({ label, tone, docs }: { label: string; tone: 'made' | 'external'; docs: typeof EXPORT_DOCS_MADE }) {
  return (
    <div className="gs-docs-col">
      <div className="gs-docs-label">{label}</div>
      {docs.map((d) => (
        <div className="gs-doc" key={d.abbr}>
          <span className={`gs-doc-abbr ${tone}`}>{d.abbr}</span>
          <span className="gs-doc-name">{d.name}</span>
          <span className="gs-doc-note">{d.note}</span>
        </div>
      ))}
    </div>
  );
}

export default function GuidePanel({ onNavigate }: Props) {
  const [tab, setTab] = useState<GuideTab>('export');
  const flows = tab === 'export' ? EXPORT_FLOWS : IMPORT_FLOWS;

  return (
    <div className="gs-page">
      {/* 머리말 */}
      <header className="gs-hero">
        <span className="gs-hero-eyebrow">사용 안내</span>
        <h1 className="gs-hero-title">거래 정보만 입력하면,<br />서류는 PortAI가 만들어요</h1>
        <p className="gs-hero-sub">
          수출은 필요한 서류를 만들고 규정을 검증해요. 수입은 받은 서류를 대조하고 세액을 계산해요.
        </p>
        <div className="gs-cta-row">
          <button className="gs-cta" onClick={() => onNavigate?.('dashboard')}>
            지금 거래 만들기 <ArrowRight size={17} />
          </button>
          <button className="gs-cta-secondary" onClick={replayOnboardingTour}>
            <PlayCircle size={16} /> 알리미 다시 보기
          </button>
        </div>
      </header>

      {/* 수출 / 수입 */}
      <section className="gs-section">
        <div className="gs-tabs" role="tablist" aria-label="거래 유형별 사용 방법">
          <button
            role="tab"
            aria-selected={tab === 'export'}
            className={`gs-tab ${tab === 'export' ? 'active' : ''}`}
            onClick={() => setTab('export')}
          >
            수출할 때
          </button>
          <button
            role="tab"
            aria-selected={tab === 'import'}
            className={`gs-tab ${tab === 'import' ? 'active' : ''}`}
            onClick={() => setTab('import')}
          >
            수입할 때
          </button>
        </div>
        <p className="gs-tab-intro">
          {tab === 'export'
            ? 'AI 통관 작업실에서 [수출]과 내 역할을 고른 뒤 아래 순서로 진행해요.'
            : 'AI 통관 작업실에서 [수입]과 내 역할을 고른 뒤 아래 순서로 진행해요.'}
        </p>
        <div className="gs-flows">
          {flows.map((flow) => <FlowColumn key={flow.role} flow={flow} />)}
        </div>
      </section>

      {tab === 'export' ? (
        <section className="gs-section">
          <h2 className="gs-section-title">수출 서류 6종, 누가 만드나요?</h2>
          <p className="gs-section-sub">다른 곳에서 발급되는 서류는 결과 화면에 회색으로 표시돼요.</p>
          <div className="gs-docs">
            <DocList label="PortAI가 만들어요" tone="made" docs={EXPORT_DOCS_MADE} />
            <DocList label="다른 곳에서 발급돼요" tone="external" docs={EXPORT_DOCS_EXTERNAL} />
          </div>
        </section>
      ) : (
        <section className="gs-section">
          <h2 className="gs-section-title">서류끼리 무엇을 대조하나요?</h2>
          <p className="gs-section-sub">C/I·P/L·B/L에 적힌 값이 서로 맞는지 아래 항목을 확인해요.</p>
          <div className="gs-checks">
            {IMPORT_CHECKS.map((c) => <span className="gs-check" key={c}>{c}</span>)}
          </div>
        </section>
      )}

      {/* 결과 화면 읽는 법 */}
      <section className="gs-section">
        <h2 className="gs-section-title">결과 화면 읽는 법</h2>
        <div className="gs-legend">
          {LEGEND.map((l) => (
            <div className="gs-legend-item" key={l.label}>
              <span className={`gs-legend-dot ${l.tone}`} aria-hidden="true" />
              <div>
                <div className="gs-legend-label">{l.label}</div>
                <div className="gs-legend-desc">{l.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 자주 묻는 질문 */}
      <section className="gs-section">
        <h2 className="gs-section-title">FAQ · 자주 묻는 질문</h2>
        <div className="gs-faq">
          {FAQ.map((item) => (
            <details className="gs-faq-item" key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
