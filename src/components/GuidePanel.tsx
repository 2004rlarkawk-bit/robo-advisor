/**
 * 사용 안내 페이지 — 처음 사용하는 사람을 위한 이용 흐름·메뉴·팁 정리.
 * 정적 콘텐츠만 렌더링하며 앱 상태에 의존하지 않는다.
 */

const USAGE_STEPS = [
  {
    title: '회원가입 · 로그인',
    desc: '이메일로 가입하면 첫 로그인 때 회사 정보를 설정합니다. 여기 입력한 값은 거래 입력과 문서에 기본값으로 사용됩니다.',
  },
  {
    title: '거래 정보 입력',
    desc: '통관 작업실에서 품목명·항구·거래조건 등을 입력합니다. 위쪽의 서류 탭(상업송장, 패킹리스트 등)을 누르면 해당 서류에 실제로 반영되는 항목만 볼 수 있습니다. HS CODE를 모르면 비워두세요. AI가 후보를 추천합니다.',
  },
  {
    title: '필요 서류 자동 생성',
    desc: '[필요 서류 자동 생성]을 누르면 AI 에이전트가 거래에 필요한 서류를 판별하고 문서를 생성한 뒤 통관 규정에 맞는지 검증합니다. 오른쪽 영역에서 입력 → 검증 → 생성 진행 상태를 확인할 수 있습니다.',
  },
  {
    title: '검토 · 보완',
    desc: '검증에서 발견된 오류나 누락 사항은 [검토 및 입력 보완 안내]에서 확인할 수 있습니다. 필요한 정보를 수정한 뒤 다시 검증할 수 있으며, 각 지적 사항에는 관련 근거가 함께 표시됩니다.',
  },
  {
    title: '문서 확인 · 활용',
    desc: '완성된 문서는 미리보기와 다운로드가 가능하며, 저장된 거래는 거래 관리 또는 문서 관리에서 다시 확인하거나 복사해 재사용할 수 있습니다.',
  },
];

const MENU_GUIDE = [
  {
    name: '통관 작업실',
    desc: '거래 정보를 입력하고 필요한 서류를 생성·검증하는 메인 작업 공간입니다.',
  },
  {
    name: '거래 관리',
    desc: '작성 중이거나 완료된 거래를 확인하고 이어서 작성하거나 새 거래로 복사할 수 있습니다.',
  },
  {
    name: '문서 관리',
    desc: '생성된 최종 문서를 조회하고 미리보기 또는 다운로드할 수 있습니다.',
  },
  {
    name: '데이터 분석',
    desc: '관세청 통계 기반의 수출입 데이터 시각화를 제공합니다.',
  },
  {
    name: '프로필 관리',
    desc: '회사 정보와 기본 거래 설정(선적항·도착항·Incoterms 등)을 수정합니다.',
  },
  {
    name: '설정',
    desc: '서비스 연결 상태와 환경 설정을 확인할 수 있습니다.',
  },
];

const TIPS = [
  'HS CODE는 품목명, 재질, 용도, 가공 상태를 구체적으로 입력할수록 더 정확한 후보를 받을 수 있습니다.',
  '거래조건이 CIF인 경우 적하보험 관련 서류가 필요할 수 있습니다.',
  '원산지증명서는 상대국과의 FTA 협정, 품목의 원산지 기준 및 발급 방식에 따라 필요 여부가 달라질 수 있습니다.',
  '헤더 왼쪽의 접기 버튼(⫤)으로 사이드바를 접으면 작업 공간을 더 넓게 사용할 수 있습니다.',
  '선택 입력 항목은 비워둘 수 있지만, 실제 문서 제출 전에는 자동 생성된 값을 반드시 검토해야 합니다.',
];

export default function GuidePanel() {
  return (
    <div>
      <div className="page-heading">
        <h1 className="page-title">사용 안내</h1>
        <p className="page-subtitle">
          PortAI로 수출입 서류를 만드는 과정을 5단계로 정리했습니다.
        </p>
      </div>

      <div
        className="form-card"
        style={{ marginBottom: 16 }}
      >
        <h2
          className="card-title"
          style={{ marginBottom: 20 }}
        >
          이용 순서
        </h2>

        <div className="guide-step-list">
          {USAGE_STEPS.map((step, index) => (
            <div
              className="guide-step"
              key={step.title}
            >
              <div className="col-number">
                {index + 1}
              </div>

              <div className="guide-step-body">
                <div className="guide-step-title">
                  {step.title}
                </div>

                <p className="info-desc">
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="form-card"
        style={{ marginBottom: 16 }}
      >
        <h2
          className="card-title"
          style={{ marginBottom: 16 }}
        >
          메뉴 안내
        </h2>

        <div className="guide-menu-grid">
          {MENU_GUIDE.map(menu => (
            <div
              className="guide-menu-item"
              key={menu.name}
            >
              <div className="guide-step-title">
                {menu.name}
              </div>

              <p className="info-desc">
                {menu.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="form-card">
        <h2
          className="card-title"
          style={{ marginBottom: 16 }}
        >
          알아두면 좋은 팁
        </h2>

        <ul className="guide-tip-list">
          {TIPS.map(tip => (
            <li
              key={tip}
              className="info-desc"
            >
              {tip}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}