/**
 * 사용 안내 페이지 — 처음 사용하는 사람을 위한 이용 흐름·메뉴·팁 정리.
 * 정적 콘텐츠만 렌더링하며 앱 상태에 의존하지 않는다.
 */

const USAGE_STEPS = [
  {
    title: '회원가입 · 로그인',
    desc: '이메일로 가입하면 첫 로그인 때 회사 정보(회사명·사용 목적·업종)를 설정합니다. 여기 입력한 값은 거래 입력과 문서에 기본값으로 쓰입니다.',
  },
  {
    title: '거래 정보 입력',
    desc: '통관 작업실에서 품목명·항구·거래조건 등을 입력합니다. 위쪽의 서류 탭(상업송장, 패킹리스트 등)을 누르면 그 서류에 실제로 반영되는 항목만 보여 필요한 것만 채울 수 있습니다. HS CODE는 모르면 비워두세요 — AI가 후보를 추천합니다.',
  },
  {
    title: '필요 서류 자동 생성',
    desc: '[필요 서류 자동 생성]을 누르면 AI 에이전트가 거래에 필요한 서류를 판별하고, 문서를 만들고, 통관 규정에 맞는지 검증합니다. 오른쪽 박스에서 입력 → 검증 → 생성 진행 상태를 볼 수 있습니다.',
  },
  {
    title: '검토 · 보완',
    desc: '검증에서 발견된 오류·누락(중량 미입력, HS CODE 오류 등)은 [검토 및 입력 보완 안내]의 카드에서 바로 수정하고 재검증할 수 있습니다. 각 지적에는 관세법 등 법적 근거가 함께 표시됩니다.',
  },
  {
    title: '문서 확인 · 활용',
    desc: '완성된 문서는 미리보기·다운로드할 수 있고, 거래는 자동 저장되어 문서 관리에서 다시 불러오거나 복사해 재사용할 수 있습니다.',
  },
];

const MENU_GUIDE = [
  { name: '통관 작업실', desc: '거래 정보를 입력하고 서류를 생성·검증하는 메인 작업 공간입니다.' },
  { name: '문서 관리', desc: '저장된 거래 목록을 보고 불러오기·복사할 수 있습니다.' },
  { name: '데이터 분석', desc: '관세청 통계 기반의 수출입 데이터 시각화를 제공합니다.' },
  { name: '프로필 관리', desc: '회사 정보와 기본 거래 설정(선적항·도착항·Incoterms)을 수정합니다.' },
  { name: '설정', desc: 'AI(LLM)·관세청·국세청 등 API 키를 등록하면 시뮬레이션 대신 실데이터로 동작합니다.' },
];

const TIPS = [
  'API 키가 없어도 모든 기능이 시뮬레이션 모드로 동작합니다. 실데이터가 필요할 때만 설정에서 키를 등록하세요.',
  '거래조건이 CIF면 적하보험증권이 필수 서류로 추가됩니다.',
  '원산지증명서(C/O)는 수출 거래에서만 필요 서류로 잡힙니다.',
  '헤더 왼쪽의 접기 버튼(⫤)으로 사이드바를 접으면 작업 공간을 더 넓게 쓸 수 있습니다.',
  '선택 입력 항목은 비워두면 AI가 자동 생성하거나 기본값을 사용하므로, 필수 항목만 채워도 서류가 만들어집니다.',
];

export default function GuidePanel() {
  return (
    <div>
      <div className="page-heading">
        <h1 className="page-title">사용 안내</h1>
        <p className="page-subtitle">PortAI로 수출입 서류를 만드는 과정을 5단계로 정리했습니다.</p>
      </div>

      <div className="form-card" style={{ marginBottom: 16 }}>
        <h2 className="card-title" style={{ marginBottom: 20 }}>이용 순서</h2>
        <div className="guide-step-list">
          {USAGE_STEPS.map((step, i) => (
            <div className="guide-step" key={step.title}>
              <div className="col-number">{i + 1}</div>
              <div className="guide-step-body">
                <div className="guide-step-title">{step.title}</div>
                <p className="info-desc">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="form-card" style={{ marginBottom: 16 }}>
        <h2 className="card-title" style={{ marginBottom: 16 }}>메뉴 안내</h2>
        <div className="guide-menu-grid">
          {MENU_GUIDE.map(menu => (
            <div className="guide-menu-item" key={menu.name}>
              <div className="guide-step-title">{menu.name}</div>
              <p className="info-desc">{menu.desc}</p>
            </div>
          ))}
        </div>
        <p className="info-desc" style={{ marginTop: 12 }}>
          거래 관리·통관 내역 메뉴는 준비 중인 기능입니다.
        </p>
      </div>

      <div className="form-card">
        <h2 className="card-title" style={{ marginBottom: 16 }}>알아두면 좋은 팁</h2>
        <ul className="guide-tip-list">
          {TIPS.map(tip => (
            <li key={tip} className="info-desc">{tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}