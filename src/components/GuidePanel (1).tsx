/**
 * 사용 안내 — "시작하기" 스타일. 매뉴얼(글 덩어리) 대신
 * 빠른 시작 CTA + 아이콘 스텝 카드 + 클릭 가능한 바로가기로 구성한다.
 * 메뉴 이동은 상위(App)에서 내려주는 onNavigate로 처리한다.
 */
import {
  FileText,
  Sparkles,
  CheckCircle2,
  Download,
  ArrowRight,
  LayoutDashboard,
  Layers,
  FolderKanban,
} from 'lucide-react';

type Props = {
  onNavigate?: (menu: string) => void;
};

const STEPS = [
  {
    icon: FileText,
    title: '거래 정보 입력',
    desc: '품목·항구·거래조건을 입력해요. HS CODE를 모르면 비워두면 AI가 후보를 추천합니다.',
  },
  {
    icon: Sparkles,
    title: 'AI 서류 자동 생성',
    desc: '필요한 서류를 판별하고 상업송장·패킹리스트를 만든 뒤 통관 규정에 맞는지 검증해요.',
  },
  {
    icon: CheckCircle2,
    title: '검토 · 보완',
    desc: '오류·누락은 관련 근거와 함께 짚어줘요. 그 자리에서 고치고 다시 검증할 수 있어요.',
  },
  {
    icon: Download,
    title: '문서 확인 · 활용',
    desc: '완성 서류는 미리보기·다운로드가 가능하고, 저장한 거래는 언제든 다시 열 수 있어요.',
  },
];

const SHORTCUTS: { menu: string; icon: typeof FileText; label: string; desc: string }[] = [
  { menu: 'dashboard', icon: LayoutDashboard, label: '통관 작업실', desc: '거래 입력 · 서류 생성 · 검증' },
  { menu: 'trades', icon: Layers, label: '거래 관리', desc: '진행 중 · 완료 거래 관리' },
  { menu: 'docs', icon: FolderKanban, label: '문서 관리', desc: '생성 문서 조회 · 다운로드' },
];

const TIPS = [
  'HS CODE는 품목명·재질·용도·가공 상태를 구체적으로 적을수록 더 정확한 후보를 받을 수 있어요.',
  '거래조건이 CIF면 적하보험 관련 서류가 필요할 수 있어요.',
  '원산지증명서는 상대국 FTA 협정·원산지 기준·발급 방식에 따라 필요 여부가 달라져요.',
  '선택 입력은 비워둘 수 있지만, 제출 전 자동 생성된 값은 반드시 검토하세요.',
];

export default function GuidePanel({ onNavigate }: Props) {
  return (
    <div>
      {/* 빠른 시작 히어로 */}
      <div className="gs-hero">
        <div className="gs-hero-text">
          <span className="gs-hero-eyebrow">시작하기</span>
          <h1 className="gs-hero-title">거래 정보만 입력하면, 서류는 PortAI가 만들어요</h1>
          <p className="gs-hero-sub">
            AI 에이전트가 필요한 수출입 서류를 판별·생성하고 통관 규정까지 검증합니다.
          </p>
          <button className="gs-cta" onClick={() => onNavigate?.('dashboard')}>
            지금 거래 만들기 <ArrowRight size={18} />
          </button>
        </div>
        <div className="gs-hero-badge" aria-hidden="true">
          <Sparkles size={40} />
        </div>
      </div>

      {/* 진행 흐름 */}
      <h2 className="gs-section-title">이렇게 진행돼요</h2>
      <div className="gs-steps">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          return (
            <div className="gs-step" key={step.title}>
              <div className="gs-step-ic"><Icon size={20} /></div>
              <div className="gs-step-no">STEP {i + 1}</div>
              <div className="gs-step-title">{step.title}</div>
              <p className="gs-step-desc">{step.desc}</p>
            </div>
          );
        })}
      </div>

      {/* 바로가기 (메뉴 설명 대신 클릭 가능한 카드) */}
      <h2 className="gs-section-title">바로가기</h2>
      <div className="gs-shortcuts">
        {SHORTCUTS.map((sc) => {
          const Icon = sc.icon;
          return (
            <button className="gs-shortcut" key={sc.menu} onClick={() => onNavigate?.(sc.menu)}>
              <span className="gs-shortcut-ic"><Icon size={18} /></span>
              <span className="gs-shortcut-body">
                <span className="gs-shortcut-label">{sc.label}</span>
                <span className="gs-shortcut-desc">{sc.desc}</span>
              </span>
              <ArrowRight size={16} className="gs-shortcut-arrow" />
            </button>
          );
        })}
      </div>

      {/* 팁 */}
      <h2 className="gs-section-title">알아두면 좋은 팁</h2>
      <ul className="gs-tips">
        {TIPS.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
    </div>
  );
}
