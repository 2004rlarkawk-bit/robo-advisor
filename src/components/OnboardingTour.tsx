/**
 * 첫 방문 가이드 투어 — 화면을 어둡게 깔고 실제 메뉴/버튼을 스포트라이트로 하나씩 짚어준다.
 * - 실제 DOM 요소를 텍스트/클래스로 찾아 하이라이트하므로 App.tsx의 요소를 수정할 필요가 없다.
 * - 통관 작업실 단계에서는 메뉴를 자동으로 눌러 작업실로 이동한 뒤, 입력 폼·생성 버튼·결과 영역을 설명한다.
 * - 대상이 화면에 없으면 잠시 기다렸다가(렌더 대기) 그래도 없으면 그 단계는 건너뛴다.
 * - 한 번 보거나 건너뛰면 localStorage에 기억해 다음부터는 뜨지 않는다.
 * - 외부 라이브러리 없이 자체 스타일만 사용한다.
 */
import { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'portai_tour_done_v1';

interface Step {
  find: () => HTMLElement | null;
  goto?: () => void; // 이 단계를 보기 전에 실행 (예: 작업실 메뉴로 이동)
  chip: string;
  title: string;
  desc: string;
}

function findMenuByText(text: string): HTMLElement | null {
  const items = Array.from(document.querySelectorAll('.menu-item')) as HTMLElement[];
  return items.find((el) => (el.textContent || '').includes(text)) || null;
}
function findButtonByText(text: string): HTMLElement | null {
  const btns = Array.from(document.querySelectorAll('button')) as HTMLElement[];
  return btns.find((el) => (el.textContent || '').includes(text)) || null;
}
function findFormCard(): HTMLElement | null {
  const titles = Array.from(document.querySelectorAll('.card-title')) as HTMLElement[];
  const t = titles.find((el) => (el.textContent || '').includes('거래 정보 입력'));
  return (t?.closest('.form-card') as HTMLElement) || null;
}
function gotoWorkspace() {
  const menu = findMenuByText('통관 작업실');
  if (menu) menu.click();
}

const STEPS: Step[] = [
  {
    find: () => findMenuByText('통관 작업실'),
    chip: 'STEP 1',
    title: '여기가 메인 작업 공간이에요',
    desc: '통관 작업실에서 거래 정보를 입력하고 서류를 만들어요. [다음]을 누르면 작업실로 들어가 볼게요.',
  },
  {
    goto: gotoWorkspace,
    find: findFormCard,
    chip: 'STEP 2',
    title: '① 거래 정보를 입력하세요',
    desc: '품목명·항구·거래조건 등을 넣어요. HS CODE는 모르면 비워두세요 — AI가 후보를 추천해줍니다.',
  },
  {
    goto: gotoWorkspace,
    find: () => findButtonByText('필요 서류 자동 생성'),
    chip: 'STEP 3',
    title: '② 버튼 하나로 서류 자동 생성',
    desc: '이 버튼을 누르면 AI 에이전트가 필요한 서류를 판별하고, 만들고, 통관 규정에 맞는지 검증해요.',
  },
  {
    goto: gotoWorkspace,
    find: () => document.querySelector('.info-card') as HTMLElement | null,
    chip: 'STEP 4',
    title: '③ 진행 상태·결과를 여기서 확인',
    desc: '입력 → 검증 → 생성 과정과 결과가 여기에 표시돼요. 오류·누락도 여기서 바로 확인·보완할 수 있어요.',
  },
  {
    find: () => findMenuByText('문서 관리'),
    chip: 'STEP 5',
    title: '저장한 거래를 여기서 관리',
    desc: '생성한 거래는 자동 저장돼요. 문서 관리에서 다시 불러오거나 복사해 재사용할 수 있어요.',
  },
  {
    find: () => findMenuByText('설정'),
    chip: 'STEP 6',
    title: '설정에서 API 키 등록',
    desc: 'AI·관세청·국세청 API 키를 넣으면 시뮬레이션 대신 실데이터로 동작해요. (없어도 모든 기능은 동작해요.)',
  },
  {
    find: () => findMenuByText('사용 안내'),
    chip: 'STEP 7',
    title: '언제든 다시 볼 수 있어요',
    desc: '헷갈리면 사용 안내 메뉴에서 이용 순서와 도움말을 다시 확인할 수 있어요. 이제 시작해볼까요?',
  },
];

interface Box { left: number; top: number; width: number; height: number; }

export default function OnboardingTour() {
  const [active, setActive] = useState(false);
  const [idx, setIdx] = useState(0);
  const [box, setBox] = useState<Box | null>(null);
  const [tick, setTick] = useState(0); // 리사이즈/스크롤 시 재계산
  const dirRef = useRef(1); // 마지막 이동 방향 (없는 단계 자동 건너뛰기용)

  // 최초 마운트: 이미 봤으면 표시 안 함. 아니면 DOM이 준비된 뒤 시작.
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY)) return;
    const t = setTimeout(() => {
      if (findMenuByText('통관 작업실')) setActive(true);
    }, 700);
    return () => clearTimeout(t);
  }, []);

  // 현재 단계 대상 위치 계산 (필요 시 이동 후 렌더될 때까지 폴링)
  useEffect(() => {
    if (!active) return;
    const step = STEPS[idx];
    if (!step) return;
    step.goto?.();

    let cancelled = false;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const locate = () => {
      if (cancelled) return;
      const el = step.find();
      if (el) {
        const r = el.getBoundingClientRect();
        setBox({ left: r.left, top: r.top, width: r.width, height: r.height });
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        return;
      }
      tries += 1;
      if (tries < 14) {
        timer = setTimeout(locate, 150); // 렌더/이동 대기
      } else {
        // 끝내 못 찾으면 진행 방향으로 자동 건너뛰기
        const n = idx + dirRef.current;
        if (n >= 0 && n < STEPS.length) setIdx(n);
        else finish();
      }
    };
    timer = setTimeout(locate, step.goto ? 250 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, idx, tick]);

  useEffect(() => {
    if (!active) return;
    const onMove = () => setTick((n) => n + 1);
    window.addEventListener('resize', onMove);
    window.addEventListener('scroll', onMove, true);
    return () => {
      window.removeEventListener('resize', onMove);
      window.removeEventListener('scroll', onMove, true);
    };
  }, [active]);

  const finish = () => {
    localStorage.setItem(STORAGE_KEY, '1');
    setActive(false);
  };
  const go = (dir: number) => {
    dirRef.current = dir;
    const n = idx + dir;
    if (n < 0 || n >= STEPS.length) finish();
    else setIdx(n);
  };

  if (!active || !box) return null;

  const step = STEPS[idx];
  const PAD = 8;
  const isFirst = idx === 0;
  const isLast = idx === STEPS.length - 1;

  // 말풍선 위치: 대상 오른쪽에 공간이 있으면 오른쪽, 없으면 아래
  const TIP_W = 300;
  const placeRight = box.left + box.width + 20 + TIP_W < window.innerWidth;
  const tipStyle: { left: number; top: number } = placeRight
    ? { left: box.left + box.width + PAD + 16, top: Math.max(12, box.top - 4) }
    : { left: Math.max(12, Math.min(box.left, window.innerWidth - TIP_W - 12)), top: box.top + box.height + PAD + 16 };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 3000 }}>
      <style>{`
        @keyframes potPop { from { opacity:0; transform:translateY(8px);} to { opacity:1; transform:none;} }
        .pot-tip button { font-family:inherit; }
      `}</style>

      {/* 클릭 차단 레이어 (투어 중 뒤쪽 앱 클릭 방지, 클릭 시 다음 단계) */}
      <div style={{ position: 'fixed', inset: 0, background: 'transparent' }} onClick={() => go(1)} />

      {/* 스포트라이트 (구멍 + 바깥 어둡게) */}
      <div
        style={{
          position: 'fixed',
          left: box.left - PAD,
          top: box.top - PAD,
          width: box.width + PAD * 2,
          height: box.height + PAD * 2,
          borderRadius: 12,
          boxShadow: '0 0 0 9999px rgba(15,23,42,0.62)',
          outline: '3px solid #fff',
          outlineOffset: 2,
          pointerEvents: 'none',
          transition: 'all .3s cubic-bezier(.4,0,.2,1)',
        }}
      />

      {/* 말풍선 */}
      <div
        className="pot-tip"
        style={{
          position: 'fixed',
          width: TIP_W,
          background: '#fff',
          borderRadius: 14,
          padding: '18px 18px 14px',
          boxShadow: '0 20px 45px -15px rgba(15,23,42,0.5)',
          animation: 'potPop .25s ease',
          ...tipStyle,
        }}
      >
        <button
          onClick={finish}
          style={{ position: 'absolute', top: 12, right: 13, border: 'none', background: 'none', color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}
        >
          건너뛰기 ✕
        </button>
        <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 800, color: '#0b57d0', background: '#e8f0fe', padding: '3px 9px', borderRadius: 999, marginBottom: 9 }}>
          {step.chip}
        </span>
        <h3 style={{ fontSize: 15.5, fontWeight: 800, margin: '0 0 6px', color: '#1e293b' }}>{step.title}</h3>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 14px', lineHeight: 1.55 }}>{step.desc}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{idx + 1} / {STEPS.length}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isFirst && (
              <button onClick={() => go(-1)} style={{ fontSize: 13, fontWeight: 700, border: 'none', background: '#f1f5f9', color: '#64748b', padding: '8px 14px', borderRadius: 8, cursor: 'pointer' }}>
                이전
              </button>
            )}
            <button onClick={() => go(1)} style={{ fontSize: 13, fontWeight: 700, border: 'none', background: '#0b57d0', color: '#fff', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}>
              {isLast ? '완료 🎉' : '다음 →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
